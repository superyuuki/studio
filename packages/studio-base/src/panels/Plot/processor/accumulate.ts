// This Source Code Form is subject to the terms of the Mozilla Public
// License, v2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/

import { PlotParams, PointData, PlotDataItem, BasePlotPath } from "../internalTypes";
import { PlotData, EmptyPlotData, appendPlotData, buildPlotData } from "../plotData";

type Cursors = Record<string, number>;
export type Accumulated = {
  cursors: Cursors;
  data: PlotData;
};

function getPathData(data: PointData, path: BasePlotPath): PlotDataItem[] | undefined {
  return data[path.value];
}

export function buildPlot(params: PlotParams, data: PointData): PlotData {
  const { paths, invertedTheme, startTime, xAxisPath, xAxisVal } = params;
  return buildPlotData({
    invertedTheme,
    paths: paths.map((path) => [path, getPathData(data, path)]),
    startTime,
    xAxisPath,
    xAxisData: xAxisPath != undefined ? getPathData(data, xAxisPath) : undefined,
    xAxisVal,
  });
}

export function initAccumulated(topics: readonly string[]): Accumulated {
  const cursors: Cursors = {};
  for (const topic of topics) {
    cursors[topic] = 0;
  }

  return {
    cursors,
    data: EmptyPlotData,
  };
}

export function getNewData(
  cursors: Cursors,
  data: PointData,
): [newCursors: Cursors, newData: PointData] {
  const newCursors: Cursors = {};
  const newData: PointData = {};

  for (const [path, cursor] of Object.entries(cursors)) {
    newCursors[path] = data[path]?.length ?? cursor;
    newData[path] = data[path]?.slice(cursor) ?? [];
  }

  return [newCursors, newData];
}

export function accumulate(
  previous: Accumulated,
  params: PlotParams,
  data: PointData,
): Accumulated {
  const { cursors: oldCursors, data: oldData } = previous;
  const [newCursors, newData] = getNewData(oldCursors, data);

  return {
    cursors: newCursors,
    data: appendPlotData(oldData, buildPlot(params, newData)),
  };
}
