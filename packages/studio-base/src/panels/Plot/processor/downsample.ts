// This Source Code Form is subject to the terms of the Mozilla Public
// License, v2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/

import * as R from "ramda";

import {
  iterateTyped,
  lookupIndices,
  getTypedLength,
} from "@foxglove/studio-base/components/Chart/datasets";
import { downsampleLTTB } from "@foxglove/studio-base/components/TimeBasedChart/lttb";
import { PlotViewport } from "@foxglove/studio-base/components/TimeBasedChart/types";
import { Bounds1D } from "@foxglove/studio-base/components/TimeBasedChart/types";

import { concatTyped, mergeTyped, getXBounds, sliceTyped, resolveTypedIndices } from "../datasets";
import { PlotPath, DatasetsByPath, TypedDataSet, TypedData } from "../internalTypes";
import { EmptyPlotData, PlotData } from "../plotData";

type PathMap<T> = Map<PlotPath, T>;

type SourceState = {
  cursor: number;
  chunkSize: number;
  numBuckets: number;
  dataset: TypedDataSet | undefined;
};
type PathState = {
  blocks: SourceState;
  current: SourceState;
  dataset: TypedDataSet | undefined;
  isPartial: boolean;
};

export const initSource = (): SourceState => ({
  cursor: 0,
  chunkSize: 0,
  numBuckets: 0,
  dataset: undefined,
});

export const initPath = (): PathState => ({
  blocks: initSource(),
  current: initSource(),
  dataset: undefined,
  isPartial: false,
});

export type Downsampled = {
  isValid: boolean;
  // the viewport when we started accumulating downsampled data
  view: PlotViewport | undefined;
  paths: PathMap<PathState>;
  data: PlotData;
};

export const initDownsampled = (): Downsampled => {
  return {
    isValid: false,
    view: undefined,
    paths: new Map(),
    data: EmptyPlotData,
  };
};

const downsampleDataset = (
  data: TypedData[],
  numPoints: number,
  startBucket?: number,
): TypedData[] | undefined => {
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
    startBucket,
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

const getLastPoint = (data: TypedData[]): [x: number, y: number] | undefined => {
  const lastSlice = data[data.length - 1];
  if (lastSlice == undefined) {
    return undefined;
  }

  const x = lastSlice.x[lastSlice.x.length - 1];
  const y = lastSlice.y[lastSlice.y.length - 1];
  if (x == undefined || y == undefined) {
    return undefined;
  }
  return [x, y];
};

const combineBounds = (bounds: Bounds1D[]): Bounds1D | undefined => {
  if (bounds.length === 0) {
    return undefined;
  }

  let min = Number.MAX_SAFE_INTEGER;
  let max = Number.MIN_SAFE_INTEGER;
  for (const bound of bounds) {
    const { min: dataMin, max: dataMax } = bound;
    min = Math.min(dataMin, min);
    max = Math.max(dataMax, max);
  }

  return { min, max };
};

const getPlotBounds = (data: PlotData): Bounds1D | undefined => {
  const { datasets } = data;

  if (datasets.size === 0) {
    return undefined;
  }

  return R.pipe(
    R.chain((dataset: TypedDataSet) => {
      const bounds = getXBounds(dataset.data);
      if (bounds == undefined) {
        return [];
      }
      return [bounds];
    }),
    combineBounds,
  )([...datasets.values()]);
};

const getBoundsRange = ({ max, min }: Bounds1D): number => Math.abs(max - min);

const MAX_POINTS = 3_000;

/**
 * Get the visual scale of the `PlotViewport`, or the ratio of a point in
 * viewport space to pixels.
 */
const getScale = ({ width, height, bounds: { x, y } }: PlotViewport): { x: number; y: number } => ({
  x: (x.max - x.min) / width,
  y: (y.max - y.min) / height,
});

const ZOOM_THRESHOLD_PERCENT = 0.2;

const isPartialState = (state: PathState) => state.isPartial;

/**
 * Get the portion of TypedData[] that falls within `bounds`.
 */
const sliceBounds = (data: TypedData[], bounds: Bounds1D): TypedData[] => {
  let start = -1;
  let end = -1;
  for (const { index, x } of iterateTyped(data)) {
    if (x > bounds.min && start === -1) {
      start = index;
    }
    if (x >= bounds.max && end === -1) {
      end = index;
      break;
    }
  }

  return sliceTyped(data, start, end === -1 ? undefined : end);
};

const getVisibleBounds = (
  blockData: TypedDataSet | undefined,
  currentData: TypedDataSet | undefined,
): Bounds1D | undefined => {
  if (blockData == undefined || currentData == undefined) {
    if (blockData != undefined) {
      return getXBounds(blockData.data);
    }

    if (currentData != undefined) {
      return getXBounds(currentData.data);
    }

    return undefined;
  }

  const blockBounds = getXBounds(blockData.data);
  const currentBounds = getXBounds(currentData.data);
  if (blockBounds == undefined || currentBounds == undefined) {
    return undefined;
  }

  return combineBounds([blockBounds, currentBounds]);
};

/**
 * updateSource processes new points for one path and one source (either block
 * or current data), doing a partial downsample of any new points.
 */
export function updateSource(
  path: PlotPath,
  raw: TypedDataSet | undefined,
  viewBounds: Bounds1D,
  maxPoints: number,
  minSize: number,
  state: SourceState,
): SourceState {
  const viewportRange = getBoundsRange(viewBounds);
  const { cursor: oldCursor, dataset: previous, chunkSize, numBuckets } = state;
  if (raw == undefined) {
    return initSource();
  }

  const newCursor = getTypedLength(raw.data);
  if (newCursor === 0) {
    return initSource();
  }
  // the input data regressed for some reason, handle this gracefully
  if (newCursor < oldCursor) {
    return updateSource(path, raw, viewBounds, maxPoints, minSize, initSource());
  }
  if (newCursor === oldCursor) {
    return state;
  }

  const newData = sliceTyped(raw.data, oldCursor);
  const newBounds = getXBounds(newData);
  if (newBounds == undefined) {
    return state;
  }

  // we wait around until we have greater than `minSize` data so that we can
  // guess how much of the visual range the full plot might occupy
  //
  // this is just a guess, but mostly works, and if the plot gets too dense we
  // will downsample again anyway
  const newRange = getBoundsRange(newBounds);
  if (previous == undefined || chunkSize === 0) {
    const proportion = newRange / viewportRange;
    if (proportion < minSize) {
      return state;
    }

    const bestGuessBuckets = Math.min(
      Math.floor((newRange / viewportRange) * maxPoints),
      maxPoints,
    );
    const downsampled = downsampleDataset(newData, bestGuessBuckets);
    if (downsampled == undefined) {
      return state;
    }

    return {
      ...state,
      cursor: newCursor,
      chunkSize: newCursor,
      numBuckets: bestGuessBuckets,
      dataset: {
        ...raw,
        data: downsampled,
      },
    };
  }

  const numNewPoints = newCursor - oldCursor;
  // in order for the downsampled signal to maintain the same visual density
  // over the entire plot, the number of points we downsample needs to stay the
  // same; this is what `chunkSize` does.
  //
  // most of the time, however, we receive new points in quantities far smaller
  // than `chunkSize`, so to get around this (but still retain visual density)
  // we reuse raw points that already exist in the dataset and start our
  // downsample a few buckets _before_ the points we're adding. this is because
  // the point we choose for each bucket depends on the point we chose in the
  // previous bucket, and so on.
  //
  // we then append any new _downsampled_ points to our accumulated downsampled
  // dataset.
  if (numNewPoints < chunkSize) {
    const numOldPoints = chunkSize - numNewPoints;
    const rawStart = newCursor - numOldPoints;
    const pointsPerBucket = Math.trunc(chunkSize / numBuckets);
    const lastRawBucket = Math.max(
      (numOldPoints - (numOldPoints % pointsPerBucket)) / pointsPerBucket - 2,
      0,
    );
    const downsampled = downsampleDataset(
      concatTyped(sliceTyped(raw.data, rawStart), newData),
      numBuckets,
      lastRawBucket,
    );
    const lastPoint = getLastPoint(previous.data);
    if (downsampled == undefined || lastPoint == undefined) {
      return state;
    }

    const [lastX] = lastPoint;
    let firstNew = -1;
    for (const { index, x } of iterateTyped(downsampled)) {
      if (x > lastX) {
        firstNew = index;
        break;
      }
    }
    if (firstNew === -1) {
      return state;
    }

    return {
      ...state,
      cursor: newCursor,
      dataset: {
        ...previous,
        data: concatTyped(previous.data, sliceTyped(downsampled, firstNew)),
      },
    };
  }

  // the `chunkSize` is also the upper bound for the number of points we
  // process in one go (again to maintain similar visual density)
  const downsampled = downsampleDataset(sliceTyped(newData, 0, chunkSize), numBuckets);
  if (downsampled == undefined) {
    return state;
  }

  // we go around again and consume all the data we can
  return updateSource(path, raw, viewBounds, maxPoints, minSize, {
    ...state,
    cursor: oldCursor + chunkSize,
    dataset: concatDataset(previous, { data: downsampled }),
  });
}

function resolveDataset(
  blocks: TypedDataSet | undefined,
  current: TypedDataSet | undefined,
): TypedDataSet | undefined {
  if (blocks == undefined && current == undefined) {
    return undefined;
  }

  if (blocks != undefined && current != undefined) {
    return {
      ...blocks,
      data: mergeTyped(blocks.data, current.data),
    };
  }

  if (blocks != undefined) {
    return blocks;
  }

  if (current != undefined) {
    return current;
  }

  return undefined;
}

function updatePartialView(
  blockData: TypedDataSet | undefined,
  currentData: TypedDataSet | undefined,
  viewBounds: Bounds1D,
  maxPoints: number,
  state: PathState,
): PathState {
  const data = sliceBounds(mergeTyped(blockData?.data ?? [], currentData?.data ?? []), viewBounds);
  const downsampled = downsampleDataset(data, maxPoints);
  if (downsampled == undefined) {
    return state;
  }

  return {
    ...state,
    isPartial: true,
    dataset: {
      ...blockData,
      data: downsampled,
    },
  };
}

export function updatePath(
  path: PlotPath,
  blockData: TypedDataSet | undefined,
  currentData: TypedDataSet | undefined,
  viewBounds: Bounds1D,
  maxPoints: number,
  state: PathState,
): PathState {
  const { blocks, current, isPartial } = state;
  const newBlocks = updateSource(path, blockData, viewBounds, maxPoints, 0.05, blocks);

  const combinedBounds = getVisibleBounds(blockData, currentData);
  if (combinedBounds != undefined) {
    if (viewBounds.max < combinedBounds.max) {
      return updatePartialView(blockData, currentData, viewBounds, maxPoints, state);
    }

    // If we're not partial anymore, we need to start over
    if (isPartial) {
      return updatePath(path, blockData, currentData, viewBounds, maxPoints, initPath());
    }
  }

  // Skip computing current entirely if block data is bigger than it
  if (blockData != undefined && currentData != undefined) {
    const blockBounds = getXBounds(blockData.data);
    const currentBounds = getXBounds(currentData.data);

    if (blockBounds != undefined && currentBounds != undefined) {
      const canSkipCurrent = blockBounds.max >= currentBounds.max;
      if (canSkipCurrent) {
        return {
          ...state,
          current: initSource(),
          blocks: newBlocks,
          dataset: newBlocks.dataset,
        };
      }
    }
  }

  const newCurrent = updateSource(path, currentData, viewBounds, maxPoints, 0, current);
  const newState: PathState = {
    ...state,
    blocks: newBlocks,
    current: newCurrent,
  };

  return {
    ...newState,
    dataset: resolveDataset(newBlocks.dataset, newCurrent.dataset),
  };
}

function shouldResetViewport(
  pathStates: PathState[],
  oldViewport: PlotViewport | undefined,
  newViewport: PlotViewport,
  dataBounds: Bounds1D | undefined,
): boolean {
  if (oldViewport == undefined) {
    return false;
  }

  const havePartial = R.any(isPartialState, pathStates);
  if (havePartial) {
    const {
      bounds: { x: viewBounds },
    } = newViewport;
    return R.pipe(
      R.filter(isPartialState),
      R.any(({ dataset }: PathState) => {
        if (dataset == undefined) {
          return false;
        }

        const pathBounds = getXBounds(dataset.data);
        if (pathBounds == undefined) {
          return false;
        }

        const maxRange = pathBounds.max - pathBounds.min;
        const innerStart = pathBounds.min + maxRange * ZOOM_THRESHOLD_PERCENT;
        const innerEnd = pathBounds.min + maxRange * (1 - ZOOM_THRESHOLD_PERCENT);

        return (
          viewBounds.min < pathBounds.min ||
          viewBounds.min > innerStart ||
          viewBounds.max > pathBounds.max ||
          viewBounds.max < innerEnd
        );
      }),
    )(pathStates);
  }

  const { x: oldX } = getScale(oldViewport);
  const { x: newX } = getScale(newViewport);
  const didZoom = Math.abs(newX / oldX - 1) > ZOOM_THRESHOLD_PERCENT;

  const {
    bounds: { x: newBounds },
  } = newViewport;
  if (
    didZoom &&
    dataBounds != undefined &&
    newBounds.min <= dataBounds.min &&
    newBounds.max >= dataBounds.max
  ) {
    return false;
  }

  return didZoom;
}

export function updateDownsample(
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
  const { view: downsampledView, data: previous, paths: oldPaths } = downsampled;

  const previousBounds = getPlotBounds(previous);
  const pathStates = R.chain((path) => {
    const state = oldPaths.get(path);
    if (state == undefined) {
      return [];
    }
    return [state];
  }, paths);
  if (shouldResetViewport(pathStates, downsampledView, view, previousBounds)) {
    return updateDownsample(view, blocks, current, initDownsampled());
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
    return updateDownsample(view, blocks, current, initDownsampled());
  }

  // can only add to partial result if data:
  // a. contiguous
  // b. still in viewport

  const newPaths: PathMap<PathState> = new Map();
  const newDatasets: DatasetsByPath = new Map();
  for (const path of paths) {
    const oldState = oldPaths.get(path) ?? initPath();
    const newState = updatePath(
      path,
      blocks.datasets.get(path),
      current.datasets.get(path),
      viewBounds,
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
