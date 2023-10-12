// This Source Code Form is subject to the terms of the Mozilla Public
// License, v2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/

import * as R from "ramda";

import { fromSec } from "@foxglove/rostime";
import { Immutable } from "@foxglove/studio";
import { MessageEvent, Topic } from "@foxglove/studio-base/players/types";
import { RosDatatypes, OptionalMessageDefinition } from "@foxglove/studio-base/types/RosDatatypes";

import { initAccumulated } from "./accumulate";
import { initProcessor, initClient } from "./state";
import { Client, State } from "./types";
import { datumToTyped } from "../datasets";
import { PlotParams, PlotPath, Messages } from "../internalTypes";
import { PlotData, getMetadata } from "../plotData";

export const CLIENT_ID = "foobar";
export const FAKE_TOPIC = "/foo";
export const FAKE_PATH = `${FAKE_TOPIC}.data`;
export const FAKE_SCHEMA = "foo/Bar";
export const FAKE_TOPICS: readonly Topic[] = [
  {
    name: FAKE_TOPIC,
    schemaName: FAKE_SCHEMA,
  },
];
export const FAKE_DATATYPES: Immutable<RosDatatypes> = new Map<
  string,
  OptionalMessageDefinition
>().set(FAKE_SCHEMA, {
  definitions: [{ name: "data", type: "float64", isArray: false }],
});

export const FAKE_METADATA = getMetadata(FAKE_TOPICS, FAKE_DATATYPES);

export const createMessageEvents = (
  topic: string,
  schemaName: string,
  count: number,
): MessageEvent[] =>
  R.range(0, count).map(
    (i): MessageEvent => ({
      topic,
      schemaName,
      receiveTime: fromSec(i),
      message: {
        data: i,
      },
      sizeInBytes: 0,
    }),
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
 * Turn a list of signal paths into a full PlotParams.
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

/**
 * Initialize a PlotData with fake data for the given `path`.
 */
export const createData = (path: PlotPath, count: number): PlotData => {
  return {
    datasets: [
      [
        path,
        {
          data: [
            datumToTyped(
              R.range(0, count).map((v) => ({
                x: v,
                y: v,
                receiveTime: fromSec(v),
              })),
            ),
          ],
        },
      ],
    ],
    bounds: {
      x: { min: 0, max: 0 },
      y: { min: 0, max: 0 },
    },
    pathsWithMismatchedDataLengths: [],
  };
};

/**
 * Create a Client that plots all of the given message paths.
 */
export const createClient = (...paths: string[]): Client => {
  if (paths.length === 0) {
    return initClient(CLIENT_ID, undefined);
  }

  const params = createParams(...paths);
  return {
    ...initClient(CLIENT_ID, undefined),
    params,
    blocks: initAccumulated(),
    current: initAccumulated(),
  };
};

/**
 * Creates a State with a single Client that plots all of the given message
 * paths.
 */
export const createState = (...paths: string[]): State => ({
  ...initProcessor(),
  clients: [createClient(...paths)],
});

/**
 * Fill a client with plot data.
 */
export const populateData = (count: number, state: State): State => ({
  ...state,
  clients: state.clients.map((client) => ({
    ...client,
    blocks: createData(createPath(FAKE_PATH), count),
    current: createData(createPath(FAKE_PATH), count),
  })),
});
