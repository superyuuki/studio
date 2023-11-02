// This Source Code Form is subject to the terms of the Mozilla Public
// License, v2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/

import * as R from "ramda";
import { PlotViewport } from "@foxglove/studio-base/components/TimeBasedChart/types";
import { PlotPath, DatasetsByPath, TypedDataSet, TypedData } from "../internalTypes";
import { EmptyPlotData, PlotData } from "../plotData";
import { lookupIndices, getTypedLength } from "@foxglove/studio-base/components/Chart/datasets";
import { concatTyped, sliceTyped, resolveTypedIndices } from "../datasets";
import { getTypedBounds } from "@foxglove/studio-base/components/TimeBasedChart/useProvider";
import { Bounds1D } from "@foxglove/studio-base/components/TimeBasedChart/types";
import { downsampleLTTB } from "@foxglove/studio-base/components/TimeBasedChart/lttb";

type PathMap<T> = Map<PlotPath, T>;

type SourceState = {
  cursor: number;
  chunkSize: number;
  numPoints: number;
  dataset: TypedDataSet | undefined;
};
type PathState = {
  blocks: SourceState;
  current: SourceState;
  dataset: TypedDataSet | undefined;
};

const initSource = (): SourceState => ({
  cursor: 0,
  chunkSize: 0,
  numPoints: 0,
  dataset: undefined,
});

const initPath = (): PathState => ({
  blocks: initSource(),
  current: initSource(),
  dataset: undefined,
});

export type Downsampled = {
  isValid: boolean;
  // the viewport when we started accumulating downsampled data
  view: PlotViewport | undefined;
  paths: PathMap<PathState>;
  data: PlotData;
};

export function initDownsampled(): Downsampled {
  return {
    isValid: false,
    view: undefined,
    paths: new Map(),
    data: EmptyPlotData,
  };
}

const downsampleDataset = (data: TypedData[], numPoints: number): TypedData[] | undefined => {
  const lookup = lookupIndices(data);
  const indices = downsampleLTTB(
    (index) => {
      const offsets = lookup(index);
      if (offsets == undefined) {
        return undefined;
      }

      const slice = data[offsets[0]];
      if (slice == undefined) {
        return undefined;
      }

      const {
        x: { [offsets[1]]: x },
        y: { [offsets[1]]: y },
      } = slice;
      if (x == undefined || y == undefined) {
        return undefined;
      }
      return [x, y];
    },
    getTypedLength(data),
    numPoints,
  );
  if (indices == undefined) {
    return undefined;
  }
  const resolved = resolveTypedIndices(data, indices);
  if (resolved == undefined) {
    return undefined;
  }

  return resolved;
};

const concatDataset = (a: TypedDataSet, b: TypedDataSet): TypedDataSet => ({
  ...a,
  data: concatTyped(a.data, b.data),
});

function updateSource(
  path: PlotPath,
  raw: TypedDataSet | undefined,
  viewportRange: number,
  maxPoints: number,
  state: SourceState,
): SourceState {
  const { cursor: oldCursor, dataset: previous, chunkSize, numPoints } = state;
  if (raw == undefined) {
    return initSource();
  }

  const newCursor = getTypedLength(raw.data);
  if (newCursor === oldCursor) {
    return state;
  }

  const newData = sliceTyped(raw.data, oldCursor);
  const newBounds = getTypedBounds([{ data: newData }]);
  if (newBounds == undefined) {
    return state;
  }

  const newRange = getBoundsRange(newBounds.x);

  // We haven't generated data yet, cannot use chunkSize
  // Only proceed if we have enough data
  if (previous == undefined || chunkSize === 0) {
    const proportion = newRange / viewportRange;

    // We don't have enough data to guess what our bucket size should be; just
    // send the full dataset since it's not much right now
    if (proportion < 0.05) {
      return state;
    }

    const numPoints = Math.min(Math.floor((newRange / viewportRange) * maxPoints), maxPoints);

    const downsampled = downsampleDataset(newData, numPoints);
    if (downsampled == undefined) {
      return state;
    }

    return {
      ...state,
      cursor: newCursor,
      chunkSize: newCursor,
      numPoints: numPoints,
      dataset: {
        ...raw,
        data: downsampled,
      },
    };
  }

  const numNewPoints = newCursor - oldCursor;
  if (numNewPoints < chunkSize) {
    // revisit this?
    return state;
  }

  const downsampled = downsampleDataset(sliceTyped(newData, 0, chunkSize), numPoints);
  if (downsampled == undefined) {
    return state;
  }

  // We go around again and consume all the data we can
  return updateSource(path, raw, viewportRange, maxPoints, {
    ...state,
    cursor: oldCursor + chunkSize,
    dataset: concatDataset(previous, { data: downsampled }),
  });
}

function updatePath(
  path: PlotPath,
  blockData: TypedDataSet | undefined,
  currentData: TypedDataSet | undefined,
  viewportRange: number,
  maxPoints: number,
  state: PathState,
): PathState {
  const { blocks, current } = state;
  const newState: PathState = {
    ...state,
    blocks: updateSource(path, blockData, viewportRange, maxPoints, blocks),
    current: updateSource(path, currentData, viewportRange, maxPoints, current),
  };

  return {
    ...newState,
    dataset: newState.blocks.dataset ?? newState.current.dataset,
  };
}

const getBoundsRange = ({ max, min }: Bounds1D): number => Math.abs(max - min);

const MAX_POINTS = 3_000;

const getScale = ({ width, height, bounds: { x, y } }: PlotViewport): { x: number; y: number } => ({
  x: (x.max - x.min) / width,
  y: (y.max - y.min) / height,
});

const ZOOM_THRESHOLD_PERCENT = 0.2;

function getResetViewport(oldViewport: PlotViewport, newViewport: PlotViewport): boolean {
  const { x: oldX, y: oldY } = getScale(oldViewport);
  const { x: newX, y: newY } = getScale(newViewport);

  return (
    Math.abs(newX / oldX - 1) > ZOOM_THRESHOLD_PERCENT ||
    Math.abs(newY / oldY - 1) > ZOOM_THRESHOLD_PERCENT
  );
}

export function partialDownsample(
  view: PlotViewport,
  blocks: PlotData,
  current: PlotData,
  downsampled: Downsampled,
): Downsampled {
  const blockPaths = [...blocks.datasets.keys()];
  const currentPaths = [...current.datasets.keys()];
  const paths = blockPaths.length > currentPaths.length ? blockPaths : currentPaths;
  // if derivative or sort by header, we can't
  // downsample on the fly

  const {
    bounds: { x: viewBounds },
  } = downsampled.view ?? view;
  const {
    bounds: { x: blockBounds },
  } = blocks;
  const {
    bounds: { x: currentBounds },
  } = current;

  const haveBlockData = blockBounds.max != Number.MIN_SAFE_INTEGER;

  // We cannot do a partial downsample if current data is discontinuous with block data
  if (
    haveBlockData &&
    currentBounds.min != Number.MAX_SAFE_INTEGER &&
    currentBounds.min > blockBounds.max
  ) {
    return initDownsampled();
  }

  const { view: downsampledView, data: previous, paths: oldPaths } = downsampled;

  const didViewportChange =
    downsampledView != undefined ? getResetViewport(downsampledView, view) : false;
  if (didViewportChange) {
    console.log("viewport broke");
    return partialDownsample(view, blocks, current, initDownsampled());
  }

  const numDatasets = Math.max(blocks.datasets.size, current.datasets.size);
  // We don't have any data
  if (numDatasets === 0) {
    return downsampled;
  }

  // The "maximum" number of buckets each dataset can have
  const pointsPerDataset = MAX_POINTS / numDatasets;

  // Check whether this dataset has gotten too big
  const numPreviousPoints = R.pipe(
    R.map((dataset: TypedDataSet) => getTypedLength(dataset.data)),
    R.sum,
  )([...previous.datasets.values()]);
  const didExceedMax = previous.datasets.size > 0 && numPreviousPoints > MAX_POINTS * 1.2;
  if (didExceedMax) {
    return partialDownsample(view, blocks, current, initDownsampled());
  }

  // can only add to partial result if data:
  // a. contiguous
  // b. still in viewport

  const viewportRange = getBoundsRange(viewBounds);
  const newPaths: PathMap<PathState> = new Map();
  const newDatasets: DatasetsByPath = new Map();
  for (const path of paths) {
    const oldState = oldPaths.get(path) ?? initPath();
    const newState = updatePath(
      path,
      blocks.datasets.get(path),
      current.datasets.get(path),
      viewportRange,
      pointsPerDataset,
      oldState,
    );
    newPaths.set(path, newState);

    const { dataset } = newState;
    if (dataset != undefined) {
      newDatasets.set(path, dataset);
    }
  }

  return {
    ...downsampled,
    data: {
      ...blocks,
      datasets: newDatasets,
    },
    paths: newPaths,
    view: downsampled.view ?? view,
    isValid: true,
  };
}
