// This Source Code Form is subject to the terms of the Mozilla Public
// License, v2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/

import * as _ from "lodash-es";
import * as R from "ramda";

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
import { RosDatatypes } from "@foxglove/studio-base/types/RosDatatypes";
import { enumValuesByDatatypeAndField } from "@foxglove/studio-base/util/enums";
import { messagePathStructures } from "@foxglove/studio-base/components/MessagePathSyntax/messagePathsForDatatype";

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
} from "./internalTypes";

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
  value: [],
  x: new Float32Array(0),
  y: new Float32Array(0),
});

export const EmptyPlotData: PlotData = Object.freeze({
  bounds: makeInvertedBounds(),
  datasets: [],
  pathsWithMismatchedDataLengths: [],
});

/**
 * Find the earliest and latest times of messages in data, for all messages and per-path.
 * Assumes invidual ranges of messages are already sorted by receiveTime.
 */
function findXRanges(data: Im<PlotData>): Range {
  let start = Number.MAX_SAFE_INTEGER;
  let end = Number.MIN_SAFE_INTEGER;
  for (const [, dataset] of data.datasets) {
    const { data: subData } = dataset;
    const thisPath = {
      start: Number.MAX_SAFE_INTEGER,
      end: Number.MIN_SAFE_INTEGER,
    };
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

  return { start, end };
}

export function mapDatasets(
  map: (dataset: TypedDataSet, path: PlotPath) => TypedDataSet,
  datasets: DatasetsByPath,
): DatasetsByPath {
  return datasets.map(([path, dataset]) => [path, map(dataset, path)]);
}

export function getMetadata(topics: readonly Topic[], datatypes: Im<RosDatatypes>): MetadataEnums {
  return {
    topics,
    datatypes,
    enumValues: enumValuesByDatatypeAndField(datatypes),
    structures: messagePathStructures(datatypes),
  };
}

function mergeDatasets(
  a: DatasetsByPath,
  b: DatasetsByPath,
  map: (aData: TypedDataSet, bData: TypedDataSet) => TypedDataSet,
): DatasetsByPath {
  const toMerge = R.pipe(
    R.chain((pathData: [PlotPath, TypedDataSet]): [PlotPath, TypedDataSet, TypedDataSet][] => {
      const [path, data] = pathData;
      const other = R.find(([v]) => R.equals(path, v), b);
      if (other == undefined) {
        return [];
      }

      const [, otherData] = other;
      return [[path, data, otherData]];
    }),
  )(a);

  const mergedPaths = toMerge.map(([path]) => path);
  return [
    ...toMerge.map(([path, aData, bData]): [PlotPath, TypedDataSet] => [path, map(aData, bData)]),
    ...a.filter(([path]) => R.find(R.equals(path), mergedPaths) == undefined),
    ...b.filter(([path]) => R.find(R.equals(path), mergedPaths) == undefined),
  ];

  return a;
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
    datasets: mergeDatasets(a.datasets, b.datasets, (aVal, bVal) => {
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
    datasets: mergeDatasets(a.datasets, b.datasets, (aSet, bSet) => ({
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
  const rangeA = findXRanges(a);
  const rangeB = findXRanges(b);
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

type PathData = [PlotPath, PlotDataItem[] | undefined];
export function buildPlotData(
  args: Im<{
    invertedTheme?: boolean;
    paths: PathData[];
    startTime: Time;
    xAxisPath?: BasePlotPath;
    xAxisData: PlotDataItem[] | undefined;
    xAxisVal: PlotXAxisVal;
  }>,
): PlotData {
  const { paths, startTime, xAxisVal, xAxisPath, xAxisData, invertedTheme } = args;
  const bounds: Bounds = makeInvertedBounds();
  const pathsWithMismatchedDataLengths: string[] = [];
  const datasets: DatasetsByPath = [];
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

      datasets.push([path, res.dataset]);
    }
  }

  return {
    bounds,
    datasets,
    pathsWithMismatchedDataLengths,
  };
}

export function resolvePath(
  metadata: MetadataEnums,
  messages: readonly MessageEvent[],
  path: RosPath,
): PlotDataItem[] {
  const { structures, enumValues } = metadata;
  const topics = R.indexBy((topic) => topic.name, metadata.topics);

  return R.chain((message: MessageEvent): PlotDataItem[] => {
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
}

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
  for (const [, dataset] of data.datasets) {
    datasets.push(dataset);
  }

  return {
    bounds,
    data: {
      datasets,
    },
  };
}
