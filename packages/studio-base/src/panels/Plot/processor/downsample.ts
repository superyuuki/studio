// This Source Code Form is subject to the terms of the Mozilla Public
// License, v2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/

import * as R from "ramda";

import {
  iterateTyped,
  fastFindIndices,
  getTypedLength,
} from "@foxglove/studio-base/components/Chart/datasets";
import {
  downsampleScatter,
  downsampleTimeseries,
} from "@foxglove/studio-base/components/TimeBasedChart/downsample";
import { downsampleLTTB } from "@foxglove/studio-base/components/TimeBasedChart/lttb";
import { PlotViewport, Bounds1D } from "@foxglove/studio-base/components/TimeBasedChart/types";

import {
  derivative,
  concatTyped,
  mergeTyped,
  getXBounds,
  sliceTyped,
  resolveTypedIndices,
} from "../datasets";
import { PlotPath, DatasetsByPath, TypedDataSet, TypedData } from "../internalTypes";
import { EmptyPlotData, PlotData, sortDataByHeaderStamp } from "../plotData";

type PathMap<T> = Map<PlotPath, T>;

// SourceState represents the downsample state of a signal from a signal
// source--current or blocks.
type SourceState = {
  // The number of data points we have downsampled
  cursor: number;
  // The minimum number of points we need in order to downsample
  chunkSize: number;
  // The number of buckets (points) this source has used so far
  numBuckets: number;
  // The downsampled dataset for this source
  dataset: TypedDataSet | undefined;
};

// PathState represents the downsample state for a single signal, including the
// merged state of both sources.
type PathState = {
  blocks: SourceState;
  current: SourceState;
  dataset: TypedDataSet | undefined;
  // Whether the viewport contains only a portion of the dataset, which is
  // downsampled independently
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
  // Indicates that this dataset can be sent to the rendering thread
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

// This is the desired number of data points for each plot across all signals
// and data sources. Beyond this threshold, ChartJS can no longer render at
// 60FPS.
//
// Since the total number of buckets is an estimate and can be wrong, we may
// actually end up with more points than this, but we reset when the number of
// points in a plot exceeds MAX_POINTS.
const DESIRED_POINTS = 3_000;
const MAX_POINTS = DESIRED_POINTS * 1.2;

// This factor is used for two related things:
// * When the viewport's x-axis shrinks or grows by this amount (as a
//   proportion of the previous viewport) since the last downsample, we
//   redownsample.
// * When the viewport's x-axis moves by this amount in either direction, we
//   redownsample.
const ZOOM_RESET_FACTOR = 0.2;

const downsampleDataset = (
  data: TypedData[],
  numPoints: number,
  startBucket?: number,
): TypedData[] | undefined => {
  const indices = downsampleLTTB(data, getTypedLength(data), numPoints, startBucket);
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

  let min = +Infinity;
  let max = -Infinity;
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

/**
 * Get the ratio of one unit in viewport space to the number of pixels it
 * occupies.
 */
const getScale = ({ width, height, bounds: { x, y } }: PlotViewport): { x: number; y: number } => ({
  x: (x.max - x.min) / width,
  y: (y.max - y.min) / height,
});

const isPartialState = (state: PathState) => state.isPartial;

const findPointBinary = (
  lookup: ReturnType<typeof fastFindIndices>,
  data: TypedData[],
  start: number,
  end: number,
  value: number,
): number | undefined => {
  if (start >= end) {
    return start;
  }

  const mid = Math.trunc((start + end) / 2);
  const pivotLocation = lookup(mid);
  if (pivotLocation == undefined) {
    return undefined;
  }

  const pivot = data[pivotLocation[0]]?.x[pivotLocation[1]];
  if (pivot == undefined) {
    return undefined;
  }

  if (value === pivot) {
    return mid;
  }

  return value < pivot
    ? findPointBinary(lookup, data, start, mid - 1, value)
    : findPointBinary(lookup, data, mid + 1, end, value);
};

/**
 * Get the portion of TypedData[] that falls within `bounds`.
 */
const sliceBounds = (data: TypedData[], bounds: Bounds1D): TypedData[] => {
  const lookup = fastFindIndices(data);
  const length = getTypedLength(data);
  const start = findPointBinary(lookup, data, 0, length, bounds.min);
  const end = findPointBinary(lookup, data, 0, length, bounds.max);
  if (start == undefined) {
    return data;
  }

  return sliceTyped(data, start, end);
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

const isDerivative = (path: PlotPath): boolean => path.value.endsWith(".@derivative");
const isHeaderStamp = (path: PlotPath): boolean => path.timestampMethod === "headerStamp";
const noop: (data: TypedData[]) => TypedData[] = R.identity;

const applyTransforms = (data: TypedData[], path: PlotPath): TypedData[] =>
  R.pipe(
    isDerivative(path) ? derivative : noop,
    isHeaderStamp(path) ? sortDataByHeaderStamp : noop,
  )(data);

type SourceParams = {
  raw: TypedDataSet | undefined;
  view: PlotViewport;
  viewBounds: Bounds1D;
  maxPoints: number;
  // We do not decide on a number of buckets until after we have enough data to
  // fill this proportion of the viewport.
  minSize: number; // [0..1]
};

/**
 * updateSource processes new points for one path and one source (either block
 * or current data), doing a partial downsample of any new points.
 */
export function updateSource(
  path: PlotPath,
  params: SourceParams,
  state: SourceState,
): SourceState {
  const { raw, view, viewBounds, maxPoints, minSize } = params;
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
    return updateSource(path, params, initSource());
  }
  if (newCursor === oldCursor) {
    return state;
  }

  // We cannot downsample incrementally in these two scenarios, so we have to
  // fall back to doing it on every iteration.
  // 1. If the path uses `@derivative`, we need to calculate the derivative at
  // each point in the dataset. In order to avoid doing that from scratch every
  // time, we need to store the result of that calculation, which this state
  // machine currently cannot handle.
  // 2. When a path uses header stamps, we must sort the data points by their
  // header stamps before we can present them. This means that new points can
  // appear out-of-order and must be merged correctly into an existing, sorted
  // dataset that we hold on to, similar to what we would have to do for
  // derivatives.
  //
  // Both present serious drawbacks for memory, since we would have to store an
  // additional copy of the entire dataset with these transformations applied.
  if (isDerivative(path) || isHeaderStamp(path)) {
    const downsampled = downsampleDataset(applyTransforms(raw.data, path), maxPoints);
    if (downsampled == undefined) {
      return state;
    }
    return {
      ...initSource(),
      dataset: {
        ...raw,
        data: downsampled,
      },
    };
  }

  // The LTTB downsampling algorithm only works for series plots, not scatter
  // plots. We must fall back to using our existing downsampleScatter
  // algorithm.
  if (path.showLine === false) {
    const indices = downsampleScatter(iterateTyped(raw.data), view);
    const resolved = resolveTypedIndices(raw.data, indices);
    if (resolved == undefined) {
      return {
        ...initSource(),
        dataset: raw,
      };
    }

    return {
      ...initSource(),
      dataset: {
        ...raw,
        data: resolved,
      },
    };
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
      // Before we can infer a reasonable bucket size, we still want to show
      // data, so we fall back to the previous algorithm
      const indices = downsampleTimeseries(iterateTyped(raw.data), view);
      const resolved = resolveTypedIndices(raw.data, indices);
      if (resolved == undefined) {
        return state;
      }

      return {
        ...state,
        dataset: {
          ...raw,
          pointRadius: 0,
          data: resolved,
        },
      };
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
        pointRadius: 0,
        data: downsampled,
      },
    };
  }

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
  const numNewPoints = newCursor - oldCursor;
  if (numNewPoints >= chunkSize) {
    // the `chunkSize` is also the upper bound for the number of points we
    // process in one go (again to maintain similar visual density)
    const downsampled = downsampleDataset(sliceTyped(newData, 0, chunkSize), numBuckets);
    if (downsampled == undefined) {
      return state;
    }

    // we go around again and consume all the data we can
    return updateSource(path, params, {
      ...state,
      cursor: oldCursor + chunkSize,
      dataset: concatDataset(previous, { ...previous, data: downsampled }),
    });
  }

  const numOldPoints = chunkSize - numNewPoints;
  const rawStart = newCursor - chunkSize;
  const pointsPerBucket = Math.trunc(chunkSize / numBuckets);
  const lastRawBucket = Math.max(
    (numOldPoints - (numOldPoints % pointsPerBucket)) / pointsPerBucket - 2,
    0,
  );
  const downsampled = downsampleDataset(sliceTyped(raw.data, rawStart), numBuckets, lastRawBucket);
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

type PathParameters = {
  blockData: TypedDataSet | undefined;
  currentData: TypedDataSet | undefined;
  view: PlotViewport;
  viewBounds: Bounds1D;
  maxPoints: number;
};

/**
 * When the dataset is only partially visible, we cut off the occluded portions
 * and downsample what's left.
 */
function updatePartialView(path: PlotPath, params: PathParameters, state: PathState): PathState {
  const { blockData, currentData, viewBounds, maxPoints } = params;
  const data = sliceBounds(mergeTyped(blockData?.data ?? [], currentData?.data ?? []), viewBounds);
  const numSliced = getTypedLength(data);
  if (numSliced <= maxPoints) {
    return {
      ...state,
      isPartial: true,
      dataset: {
        ...blockData,
        // pointRadius will be default
        data,
      },
    };
  }

  const downsampled = downsampleDataset(applyTransforms(data, path), maxPoints);
  if (downsampled == undefined) {
    return state;
  }

  return {
    ...state,
    isPartial: true,
    dataset: {
      ...blockData,
      pointRadius: 0,
      data: downsampled,
    },
  };
}

/**
 * Update the state of a single plot path by observing how block and current
 * data have changed and downsampling the new data as necessary. Both data
 * sources (block and current) are updated independently with updateSource.
 */
export function updatePath(path: PlotPath, params: PathParameters, state: PathState): PathState {
  const { blockData, currentData, view, viewBounds, maxPoints } = params;
  const { blocks, current, isPartial } = state;
  const combinedBounds = getVisibleBounds(blockData, currentData);
  if (combinedBounds != undefined) {
    // When the user's viewport ends before the end of the dataset, we only
    // show the data that is immediately visible and do not need to
    // incrementally downsample.
    const { min, max } = viewBounds;
    if (max !== min && max < combinedBounds.max) {
      return updatePartialView(path, params, state);
    }

    // If we're not partial anymore, we need to start over
    if (isPartial) {
      return updatePath(path, params, initPath());
    }
  }

  const newBlocks = updateSource(
    path,
    { raw: blockData, view, viewBounds, maxPoints, minSize: 0.05 },
    blocks,
  );

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

  const newCurrent = updateSource(
    path,
    { raw: currentData, view, viewBounds, maxPoints, minSize: 0 },
    current,
  );
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

/**
 * shouldResetViewport determines whether the viewport needs to be updated (and
 * thus whether downsampling should rerun.)
 */
export function shouldResetViewport(
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
        const innerStart = pathBounds.min + maxRange * ZOOM_RESET_FACTOR;
        const innerEnd = pathBounds.min + maxRange * (1 - ZOOM_RESET_FACTOR);

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
  const didZoom = Math.abs(newX / oldX - 1) > ZOOM_RESET_FACTOR;

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

/**
 * updateDownsample efficiently produces a downsampled dataset fit for
 * rendering by keeping track of the ways in which the user's viewport, block
 * data, and current data change.
 */
export function updateDownsample(
  view: PlotViewport,
  blocks: PlotData,
  current: PlotData,
  downsampled: Downsampled,
): Downsampled {
  const blockPaths = [...blocks.datasets.keys()];
  const currentPaths = [...current.datasets.keys()];
  const paths = blockPaths.length > currentPaths.length ? blockPaths : currentPaths;

  const stableView = downsampled.view ?? view;
  const {
    bounds: { x: viewBounds },
  } = stableView;
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
  if (numDatasets === 0) {
    return {
      ...initDownsampled(),
      // An empty plot is valid in this scenario, and should be rendered
      isValid: true,
    };
  }

  // The "maximum" number of buckets each dataset can have
  const pointsPerDataset = DESIRED_POINTS / numDatasets;

  // Check whether this dataset has gotten too big
  const numPreviousPoints = R.pipe(
    R.map((dataset: TypedDataSet) => getTypedLength(dataset.data)),
    R.sum,
  )([...previous.datasets.values()]);
  const didExceedMax = previous.datasets.size > 0 && numPreviousPoints > MAX_POINTS;
  if (didExceedMax) {
    return updateDownsample(view, blocks, current, initDownsampled());
  }

  const newPaths: PathMap<PathState> = new Map();
  const newDatasets: DatasetsByPath = new Map();
  for (const path of paths) {
    if (!path.enabled) {
      continue;
    }
    const oldState = oldPaths.get(path) ?? initPath();
    const newState = updatePath(
      path,
      {
        blockData: blocks.datasets.get(path),
        currentData: current.datasets.get(path),
        view: stableView,
        viewBounds,
        maxPoints: pointsPerDataset,
      },
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
