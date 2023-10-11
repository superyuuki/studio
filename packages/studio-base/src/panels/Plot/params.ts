// This Source Code Form is subject to the terms of the Mozilla Public
// License, v2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/
import * as R from "ramda";

import { PlotParams, BasePlotPath, PlotPath } from "./internalTypes";

export function getPathID(path: PlotPath): string {
  return `${path.value}:${path.timestampMethod}:${path.color}:${path.label}`;
}

export function getPaths(paths: readonly PlotPath[], xAxisPath?: BasePlotPath): string[] {
  return R.chain(
    (path: BasePlotPath | undefined): string[] => {
      if (path == undefined) {
        return [];
      }

      return [path.value];
    },
    [xAxisPath, ...paths],
  );
}

export function isSingleMessage(params: PlotParams): boolean {
  const { xAxisVal } = params;
  return xAxisVal === "currentCustom" || xAxisVal === "index";
}

export function getParamPaths(params: PlotParams): readonly string[] {
  return R.uniq(getPaths(params.paths, params.xAxisPath));
}
