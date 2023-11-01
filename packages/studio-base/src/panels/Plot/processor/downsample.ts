// This Source Code Form is subject to the terms of the Mozilla Public
// License, v2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/

import { PlotViewport } from "@foxglove/studio-base/components/TimeBasedChart/types";
import { PlotPath, DatasetsByPath } from "../internalTypes";
import { mapDatasets, EmptyPlotData, appendPlotData, PlotData } from "../plotData";
import { lookupIndices, getTypedLength } from "@foxglove/studio-base/components/Chart/datasets";
import { sliceTyped, resolveTypedIndices } from "../datasets";
import { getTypedBounds } from "@foxglove/studio-base/components/TimeBasedChart/useProvider";
import { Bounds1D } from "@foxglove/studio-base/components/TimeBasedChart/types";
import { downsampleLTTB } from "@foxglove/studio-base/components/TimeBasedChart/lttb";

type DatasetCursors = Map<PlotPath, number>;

export type Downsampled = {
  isValid: boolean;
  blocks: DatasetCursors;
  current: DatasetCursors;
  data: PlotData;
};

export function initDownsampled(): Downsampled {
  const cursors = new Map();

  return {
    isValid: false,
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
  } = view;
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

  const { data: previous, blocks: oldBlocks, current: oldCurrent } = downsampled;
  const [newBlocks, blockData] = getNewData(oldBlocks, blocks);
  const [newCurrent, currentData] = getNewData(oldCurrent, current);
  const data = haveBlockData ? blockData : currentData;
  const numDatasets = data.datasets.size;

  // We don't have any new data
  if (numDatasets === 0) {
    return downsampled;
  }

  // The "maximum" number of buckets each dataset can have
  const pointsPerDataset = 7_500 / numDatasets;
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
    isValid: true,
    blocks: newBlocks,
    current: newCurrent,
    data: appendPlotData(previous, newData),
  };
}
