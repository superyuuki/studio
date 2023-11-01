// This Source Code Form is subject to the terms of the Mozilla Public
// License, v2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/

import * as R from "ramda";
import { PlotViewport } from "@foxglove/studio-base/components/TimeBasedChart/types";
import { PlotPath, DatasetsByPath, TypedDataSet } from "../internalTypes";
import { mapDatasets, EmptyPlotData, appendPlotData, PlotData } from "../plotData";
import { lookupIndices, getTypedLength } from "@foxglove/studio-base/components/Chart/datasets";
import { sliceTyped, resolveTypedIndices } from "../datasets";
import { getTypedBounds } from "@foxglove/studio-base/components/TimeBasedChart/useProvider";
import { Bounds1D } from "@foxglove/studio-base/components/TimeBasedChart/types";
import { downsampleLTTB } from "@foxglove/studio-base/components/TimeBasedChart/lttb";

type DatasetCursors = Map<PlotPath, number>;

export type Downsampled = {
  isValid: boolean;
  // the viewport when we started accumulating downsampled data
  view: PlotViewport | undefined;
  blocks: DatasetCursors;
  current: DatasetCursors;
  data: PlotData;
};

export function initDownsampled(): Downsampled {
  const cursors = new Map();

  return {
    isValid: false,
    view: undefined,
    blocks: new Map(cursors),
    current: new Map(cursors),
    data: EmptyPlotData,
  };
}

// Get only the new data that has been added since `oldCursors`.
function getNewData(
  oldCursors: DatasetCursors,
  data: PlotData,
): [newCursors: DatasetCursors, newData: PlotData] {
  const newCursors = new Map(oldCursors);
  const newDatasets: DatasetsByPath = new Map();
  for (const [path, dataset] of data.datasets.entries()) {
    const { data: typed } = dataset;
    const length = getTypedLength(typed);
    const old = oldCursors.get(path);
    if (old === length) {
      continue;
    }

    newCursors.set(path, length);
    newDatasets.set(
      path,
      old != undefined
        ? {
            ...dataset,
            data: sliceTyped(typed, old),
          }
        : dataset,
    );
  }

  return [
    newCursors,
    {
      ...data,
      bounds: getTypedBounds([...newDatasets.values()]) ?? data.bounds,
      datasets: newDatasets,
    },
  ];
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

  const {
    view: downsampledView,
    data: previous,
    blocks: oldBlocks,
    current: oldCurrent,
  } = downsampled;
  const [newBlocks, blockData] = getNewData(oldBlocks, blocks);
  const [newCurrent, currentData] = getNewData(oldCurrent, current);
  const data = haveBlockData ? blockData : currentData;
  const numDatasets = data.datasets.size;

  const didViewportChange =
    downsampledView != undefined ? getResetViewport(downsampledView, view) : false;
  if (didViewportChange) {
    return partialDownsample(view, blocks, current, initDownsampled());
  }

  // We don't have any new data
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

  const viewportRange = getBoundsRange(viewBounds);
  const newDatasets = mapDatasets((dataset) => {
    const newBounds = getTypedBounds([dataset]);
    if (newBounds == undefined) {
      return dataset;
    }

    const numBuckets = Math.floor((getBoundsRange(newBounds.x) / viewportRange) * pointsPerDataset);
    const { data } = dataset;
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
      numBuckets,
    );
    if (indices == undefined) {
      return dataset;
    }
    const resolved = resolveTypedIndices(dataset.data, indices);
    if (resolved == undefined) {
      return dataset;
    }

    return {
      ...dataset,
      data: resolved,
    };
  }, data.datasets);

  const newData = {
    ...data,
    datasets: newDatasets,
  };

  // can only add to partial result if data:
  // a. contiguous
  // b. still in viewport

  return {
    ...downsampled,
    view: downsampled.view ?? view,
    isValid: true,
    blocks: newBlocks,
    current: newCurrent,
    data: appendPlotData(previous, newData),
  };
}
