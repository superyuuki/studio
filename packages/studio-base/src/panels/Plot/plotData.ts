// This Source Code Form is subject to the terms of the Mozilla Public
// License, v2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/

import * as _ from "lodash-es";
import * as R from "ramda";

import { Immutable } from "@foxglove/studio";
import { Time } from "@foxglove/rostime";
import { Immutable as Im } from "@foxglove/studio";
import { iterateTyped, getTypedLength } from "@foxglove/studio-base/components/Chart/datasets";
import { RosPath } from "@foxglove/studio-base/components/MessagePathSyntax/constants";
import { getMessagePathDataItems } from "@foxglove/studio-base/components/MessagePathSyntax/useCachedGetMessagePathDataItems";
import { ProviderState } from "@foxglove/studio-base/components/TimeBasedChart/types";
import { getTypedBounds } from "@foxglove/studio-base/components/TimeBasedChart/useProvider";
import {
  getDatasetsFromMessagePlotPath,
  concatTyped,
  mergeTyped,
} from "@foxglove/studio-base/panels/Plot/datasets";
import { Topic, MessageEvent } from "@foxglove/studio-base/players/types";
import { Bounds, makeInvertedBounds, unionBounds } from "@foxglove/studio-base/types/Bounds";
import { Range } from "@foxglove/studio-base/util/ranges";
import { getTimestampForMessage } from "@foxglove/studio-base/util/time";
import { enumValuesByDatatypeAndField } from "@foxglove/studio-base/util/enums";
import { messagePathStructures } from "@foxglove/studio-base/components/MessagePathSyntax/messagePathsForDatatype";
import { RosDatatypes } from "@foxglove/studio-base/types/RosDatatypes";

import { resolveTypedIndices, derivative } from "./datasets";
import {
  DatasetsByPath,
  PlotDataItem,
  BasePlotPath,
  PlotPath,
  PlotXAxisVal,
  isReferenceLinePlotPathType,
  MetadataEnums,
  TypedData,
  TypedDataSet,
  Messages,
  createTimeArray,
  Datapoints,
} from "./internalTypes";
import * as maps from "./maps";

/**
 * Plot data bundles datasets with precomputed bounds and paths with mismatched data
 * paths. It's used to contain data from blocks and currentFrame segments and eventually
 * is merged into a single object and passed to the chart components.
 */
export type PlotData = {
  bounds: Bounds;
  datasets: DatasetsByPath;
  pathsWithMismatchedDataLengths: string[];
};

export type StateHandler = (state: Im<PlotData> | undefined) => void;

export const EmptyData: TypedData = Object.freeze({
  receiveTime: [],
  value: [],
  x: new Float32Array(0),
  y: new Float32Array(0),
});

export const EmptyPlotData: PlotData = Object.freeze({
  bounds: makeInvertedBounds(),
  datasets: new Map(),
  pathsWithMismatchedDataLengths: [],
});

/**
 * Find the earliest and latest times of messages in data, for all messages and per-path.
 * Assumes invidual ranges of messages are already sorted by receiveTime.
 */
function findXRanges(data: Im<PlotData>): {
  all: Range;
  byPath: Record<string, Range>;
} {
  const byPath: Record<string, Range> = {};
  let start = Number.MAX_SAFE_INTEGER;
  let end = Number.MIN_SAFE_INTEGER;
  for (const [path, dataset] of data.datasets) {
    const thisPath = (byPath[path.value] = {
      start: Number.MAX_SAFE_INTEGER,
      end: Number.MIN_SAFE_INTEGER,
    });
    const { data: subData } = dataset;
    const resolved = resolveTypedIndices(subData as TypedData[], [
      0,
      getTypedLength(subData as TypedData[]) - 1,
    ])?.[0];

    thisPath.start = Math.min(thisPath.start, resolved?.x[0] ?? Number.MAX_SAFE_INTEGER);
    thisPath.end = Math.max(
      thisPath.end,
      resolved?.x[resolved.x.length - 1] ?? Number.MIN_SAFE_INTEGER,
    );
    start = Math.min(start, thisPath.start);
    end = Math.max(end, thisPath.end);
  }

  return { all: { start, end }, byPath };
}

export function mapDatasets(
  map: (dataset: TypedDataSet, path: PlotPath) => TypedDataSet,
  datasets: DatasetsByPath,
): DatasetsByPath {
  const result: DatasetsByPath = new Map();
  for (const [path, dataset] of datasets.entries()) {
    result.set(path, map(dataset, path));
  }

  return result;
}

/**
 * Appends new PlotData to existing PlotData. Assumes there are no time overlaps between
 * the two items.
 */
export function appendPlotData(a: PlotData, b: PlotData): PlotData {
  if (a === EmptyPlotData) {
    return b;
  }

  if (b === EmptyPlotData) {
    return a;
  }

  return {
    ...a,
    bounds: unionBounds(a.bounds, b.bounds),
    datasets: maps.merge(a.datasets, b.datasets, (aVal, bVal) => {
      return {
        ...aVal,
        data: concatTyped(aVal.data, bVal.data),
      };
    }),
  };
}

/**
 * Merge two PlotData objects into a single PlotData object, discarding any
 * overlapping messages between the two items. Assumes they represent
 * non-contiguous segments of a chart.
 */
function mergePlotData(a: PlotData, b: PlotData): PlotData {
  if (a === EmptyPlotData) {
    return b;
  }

  if (b === EmptyPlotData) {
    return a;
  }

  return {
    ...a,
    bounds: unionBounds(a.bounds, b.bounds),
    datasets: maps.merge(a.datasets, b.datasets, (aSet, bSet) => ({
      ...aSet,
      data: mergeTyped(aSet.data, bSet.data),
    })),
  };
}

/**
 * Sort by start time, then end time, so that folding from the left gives us
 * the right consolidated interval.
 */
function compare(a: Im<PlotData>, b: Im<PlotData>): number {
  const rangeA = findXRanges(a).all;
  const rangeB = findXRanges(b).all;
  const startCompare = rangeA.start - rangeB.start;
  return startCompare !== 0 ? startCompare : rangeA.end - rangeB.end;
}

/**
 * Reduce multiple PlotData objects into a single PlotData object, concatenating messages
 * for each path after trimming messages that overlap between items.
 */
export function reducePlotData(data: PlotData[]): PlotData {
  const sorted = data.slice().sort(compare);

  const reduced = sorted.reduce((acc, item) => {
    if (_.isEmpty(acc)) {
      return item;
    }
    return mergePlotData(acc, item);
  }, EmptyPlotData);

  return reduced;
}

type PathData = [PlotPath, Datapoints[] | undefined];
export function buildPlotData(args: {
  invertedTheme?: boolean;
  paths: PathData[];
  startTime: Time;
  xAxisPath?: BasePlotPath;
  xAxisData: Datapoints[] | undefined;
  xAxisVal: PlotXAxisVal;
}): PlotData {
  const { paths, startTime, xAxisVal, xAxisPath, xAxisData, invertedTheme } = args;
  const bounds: Bounds = makeInvertedBounds();
  const pathsWithMismatchedDataLengths: string[] = [];
  const datasets: DatasetsByPath = new Map();
  for (const [index, [path, data]] of paths.entries()) {
    const xRanges = xAxisData;
    const yRanges = data ?? [];
    if (!path.enabled) {
      continue;
    } else if (!isReferenceLinePlotPathType(path)) {
      const res = getDatasetsFromMessagePlotPath({
        path,
        yAxisRanges: yRanges,
        index,
        startTime,
        xAxisVal,
        xAxisRanges: xRanges,
        xAxisPath,
        invertedTheme,
      });

      if (res.hasMismatchedData) {
        pathsWithMismatchedDataLengths.push(path.value);
      }

      const pathBounds = getTypedBounds([res.dataset]);
      if (pathBounds == undefined) {
        continue;
      }

      bounds.x.min = Math.min(bounds.x.min, pathBounds.x.min);
      bounds.x.max = Math.max(bounds.x.max, pathBounds.x.max);
      bounds.y.min = Math.min(bounds.y.min, pathBounds.y.min);
      bounds.y.max = Math.max(bounds.y.max, pathBounds.y.max);

      datasets.set(path, res.dataset);
    }
  }

  return {
    bounds,
    datasets,
    pathsWithMismatchedDataLengths,
  };
}

export function getMetadata(
  topics: readonly Topic[],
  datatypes: Immutable<RosDatatypes>,
): MetadataEnums {
  return {
    topics,
    datatypes,
    enumValues: enumValuesByDatatypeAndField(datatypes),
    structures: messagePathStructures(datatypes),
  };
}

export function resolvePath(
  metadata: MetadataEnums,
  messages: readonly MessageEvent[],
  path: RosPath,
): Datapoints | undefined {
  const { structures, enumValues } = metadata;
  // TODO(cfoust): 10/02/23 this should not be here
  const topics = R.indexBy((topic) => topic.name, metadata.topics);
  const plotDataItems = R.chain((message: MessageEvent): PlotDataItem[] => {
    const items = getMessagePathDataItems(message, path, topics, structures, enumValues);
    if (items == undefined) {
      return [];
    }

    return [
      {
        queriedData: items,
        receiveTime: message.receiveTime,
        headerStamp: getTimestampForMessage(message.message),
      },
    ];
  }, messages);

  if (plotDataItems.length === 0) {
    return undefined;
  }

  const haveHeaderStamp = plotDataItems[0]?.headerStamp != undefined;
  const { length: numItems } = plotDataItems;
  const numPoints = R.pipe(
    R.map((v: PlotDataItem) => v.queriedData.length),
    R.sum,
  )(plotDataItems);
  const result: Datapoints = {
    index: new Int16Array(numItems),
    receiveTime: createTimeArray(numItems),
    ...(haveHeaderStamp ? { headerStamp: createTimeArray(numItems) } : {}),

    value: new Float32Array(numPoints),
  };

  let pointIndex = 0;
  for (let i = 0; i < numItems; i++) {
    const item = plotDataItems[i];
    if (item == undefined) {
      continue;
    }

    result.index[i] = pointIndex;
    result.receiveTime.sec[i] = item.receiveTime.sec;
    result.receiveTime.nsec[i] = item.receiveTime.nsec;

    const headerStamp = result.headerStamp;
    if (headerStamp != undefined) {
      headerStamp.sec[i] = item.headerStamp?.sec ?? 0;
      headerStamp.nsec[i] = item.headerStamp?.nsec ?? 0;
    }

    for (const point of item.queriedData) {
      // TODO(cfoust): 10/03/23 handle Time
      result.value[pointIndex] = Number(point.value);
      pointIndex++;
    }
  }

  return result;
}

/**
 * buildResolver is a partially curried version of resolvePath.
 */
export const buildResolver =
  (metadata: MetadataEnums, path: RosPath) =>
  (messages: Messages): Datapoints | undefined => {
    const topicMessages = messages[path.topicName];
    if (topicMessages == undefined) {
      return undefined;
    }
    return resolvePath(metadata, topicMessages, path);
  };

const createPlotMapping =
  (map: (dataset: TypedDataSet, path: PlotPath) => TypedDataSet) =>
  (data: PlotData): PlotData => ({
    ...data,
    datasets: mapDatasets(map, data.datasets),
  });

/**
 * Applies the @derivative modifier to the dataset. This has to be done on the complete
 * dataset, not calculated incrementally.
 */
export const applyDerivativeToPlotData = createPlotMapping((dataset, path) => {
  if (!path.value.endsWith(".@derivative")) {
    return dataset;
  }

  return {
    ...dataset,
    data: derivative(dataset.data),
  };
});

/**
 * Sorts datsets by header stamp, which at this point in the processing chain is the x value of each point.
 * This has to be done on the complete dataset, not point by point.
 *
 * Messages are provided in receive time order but header stamps might be out of order
 * This would create zig-zag lines connecting the wrong points. Sorting the header stamp values (x)
 * results in the datums being in the correct order for connected lines.
 *
 * An example is when messages at the same receive time have different header stamps. The receive
 * time ordering is undefined (could be different for different data sources), but the header stamps
 * still need sorting so the plot renders correctly.
 */
export const sortPlotDataByHeaderStamp = createPlotMapping((dataset: TypedDataSet, path) => {
  if (path.timestampMethod !== "headerStamp") {
    return dataset;
  }

  const indices: [index: number, timestamp: number][] = [];
  for (const datum of iterateTyped(dataset.data)) {
    indices.push([datum.index, datum.x]);
  }

  indices.sort(([, ax], [, bx]) => ax - bx);

  const resolved = resolveTypedIndices(
    dataset.data,
    indices.map(([index]) => index),
  );

  if (resolved == undefined) {
    return dataset;
  }

  return {
    ...dataset,
    data: resolved,
  };
});

export function getProvidedData(data: PlotData): ProviderState<TypedData[]> {
  const { bounds } = data;
  const datasets = [];
  for (const dataset of data.datasets.values()) {
    datasets.push(dataset);
  }

  return {
    bounds,
    data: {
      datasets,
    },
  };
}
