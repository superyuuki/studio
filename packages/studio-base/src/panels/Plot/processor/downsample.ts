// This Source Code Form is subject to the terms of the Mozilla Public
// License, v2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/

import { PlotPath, DatasetsByPath } from "../internalTypes";
import { EmptyPlotData, PlotData } from "../plotData";
import { getTypedLength } from "@foxglove/studio-base/components/Chart/datasets";
import { sliceTyped } from "../datasets";
import { getTypedBounds } from "@foxglove/studio-base/components/TimeBasedChart/useProvider";

type DatasetCursors = Map<PlotPath, number>;

export type Downsampled = {
  isValid: boolean;
  blocks: DatasetCursors;
  current: DatasetCursors;
  data: PlotData;
};

export function initDownsampled(paths: PlotPath[]): Downsampled {
  const cursors = new Map();
  for (const path of paths) {
    cursors.set(path, 0);
  }

  return {
    isValid: false,
    blocks: new Map(cursors),
    current: new Map(cursors),
    data: EmptyPlotData,
  };
}

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

export function partialDownsample(
  blocks: PlotData,
  current: PlotData,
  downsampled: Downsampled,
): Downsampled {
  // if derivative or sort by header, we can't
  // downsample on the fly

  const { blocks: oldBlocks, current: oldCurrent } = downsampled;
  const [newBlocks, blockData] = getNewData(oldBlocks, blocks);
  const [newCurrent, currentData] = getNewData(oldCurrent, current);
  console.log(newBlocks, blockData, newCurrent, currentData);

  // get diff for new data
  // four scenarios:
  // 1. current data alone grew
  // 2. block data alone grew
  // 3. both grew
  // 4. neither grew

  // can only add to partial result if data:
  // a. contiguous
  // b. still in viewport

  return {
    ...downsampled,
    blocks: newBlocks,
    current: newCurrent,
  };
}
