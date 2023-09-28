// This Source Code Form is subject to the terms of the Mozilla Public
// License, v2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/

import * as R from "ramda";
import { init, initClient, Client, State } from "./state";
import { PlotParams, PlotPath, Messages, TypedDataSet } from "../internalTypes";
import { fromSec } from "@foxglove/rostime";
import { MessageEvent } from "@foxglove/studio-base/players/types";
import { PlotData } from "../plotData";
import { datumToTyped } from "../datasets";
import { getParamTopics } from "../params";
import { initAccumulated } from "./accumulate";

export const CLIENT_ID = "foobar";
export const FAKE_TOPIC = "/foo";
export const FAKE_PATH = `${FAKE_TOPIC}.data`;
export const FAKE_SCHEMA = "foo/Bar";

export const createMessageEvents = (
  topic: string,
  schemaName: string,
  count: number,
): MessageEvent[] =>
  R.map(
    (i): MessageEvent => ({
      topic,
      schemaName,
      receiveTime: fromSec(i),
      message: {
        data: i,
      },
      sizeInBytes: 0,
    }),
    R.range(0, count),
  );

export const createMessages = (topic: string, schemaName: string, count: number): Messages => ({
  [topic]: createMessageEvents(topic, schemaName, count),
});

export const createPath = (path: string): PlotPath => ({
  value: path,
  enabled: true,
  timestampMethod: "receiveTime",
});

/**
 * createParams turns a list of signal paths into a full PlotParams.
 */
export const createParams = (...paths: string[]): PlotParams => ({
  startTime: fromSec(0),
  paths: paths.map(createPath),
  invertedTheme: false,
  xAxisVal: "timestamp",
  followingViewWidth: undefined,
  minXValue: undefined,
  maxXValue: undefined,
  minYValue: undefined,
  maxYValue: undefined,
});

export const createData = (path: PlotPath, count: number): PlotData => {
  const datasets = new Map<PlotPath, TypedDataSet>();
  datasets.set(path, {
    data: [
      datumToTyped(
        R.range(0, count).map((v) => ({
          x: v,
          y: v,
          receiveTime: fromSec(v),
        })),
      ),
    ],
  });
  return {
    datasets,
    bounds: {
      x: { min: 0, max: 0 },
      y: { min: 0, max: 0 },
    },
    pathsWithMismatchedDataLengths: [],
  };
};

/**
 * createClient creates a Client that plots all of the given message paths.
 */
export const createClient = (...paths: string[]): Client => {
  if (paths.length === 0) {
    return initClient(CLIENT_ID, undefined);
  }

  const params = createParams(...paths);
  const topics = getParamTopics(params);

  return {
    ...initClient(CLIENT_ID, undefined),
    params,
    topics,
    blocks: initAccumulated(topics),
    current: initAccumulated(topics),
  };
};

/**
 * createState creates a State with a single Client that plots all of the
 * given message paths.
 */
export const createState = (...paths: string[]): State => ({
  ...init(),
  clients: [createClient(...paths)],
});
