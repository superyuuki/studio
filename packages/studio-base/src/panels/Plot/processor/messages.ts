// This Source Code Form is subject to the terms of the Mozilla Public
// License, v2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/

import * as R from "ramda";

import { Immutable } from "@foxglove/studio";
import { Topic, MessageEvent } from "@foxglove/studio-base/players/types";
import { RosDatatypes } from "@foxglove/studio-base/types/RosDatatypes";

import { initAccumulated, accumulate, buildPlot } from "./accumulate";
import {
  State,
  StateAndEffects,
  Client,
  SideEffects,
  rebuildClient,
  sendData,
  mapClients,
  noEffects,
  keepEffects,
} from "./state";
import { PointData } from "../internalTypes";
import { isSingleMessage } from "../params";
import { getMetadata } from "../plotData";

export function receiveMetadata(
  topics: readonly Topic[],
  datatypes: Immutable<RosDatatypes>,
  state: State,
): State {
  return {
    ...state,
    metadata: getMetadata(topics, datatypes),
  };
}

export function evictCache(state: State): State {
  const { clients, blocks, current } = state;
  const paths = R.pipe(
    R.chain(({ paths: clientPaths }: Client) => clientPaths),
    R.uniq,
  )(clients);

  return {
    ...state,
    blocks: R.pick(paths, blocks),
    current: R.pick(paths, current),
  };
}

export function addBlock(data: PointData, resetPaths: string[], state: State): StateAndEffects {
  const { blocks } = state;
  const paths = R.keys(data);

  const newState: State = {
    ...state,
    blocks: R.pipe(
      // Remove data for any topics that have been reset
      R.omit(resetPaths),
      // Merge the new block into the existing blocks
      (newBlocks) => R.mergeWith(R.concat, newBlocks, data),
    )(blocks),
  };

  return mapClients((client, { blocks: newBlocks }): [Client, SideEffects] => {
    const { id, params } = client;
    const relevantPaths = R.intersection(paths, client.paths);
    const shouldReset = R.intersection(relevantPaths, resetPaths).length > 0;
    if (params == undefined || isSingleMessage(params) || relevantPaths.length === 0) {
      return [client, []];
    }

    return [
      {
        ...client,
        blocks: accumulate(shouldReset ? initAccumulated(client.paths) : client.blocks, params, newBlocks),
      },
      [rebuildClient(id)],
    ];
  })(newState);
}

export function addCurrent(events: readonly MessageEvent[], state: State): StateAndEffects {
  const { current: oldCurrent } = state;
  const newState: State = {
    ...state,
    current: R.pipe(
      R.groupBy((v: MessageEvent) => v.topic),
      R.mergeWith(R.concat, oldCurrent),
    )(events),
  };

  return R.pipe(
    mapClients((client): [Client, SideEffects] => {
      const { current } = newState;
      const { id, params } = client;
      if (params == undefined) {
        return noEffects(client);
      }

      if (isSingleMessage(params)) {
        const plotData = buildPlot(
          params,
          R.map((messages) => messages.slice(-1), current),
        );
        return [client, [sendData(id, plotData)]];
      }

      return [
        {
          ...client,
          current: accumulate(client.current, params, current),
        },
        [rebuildClient(id)],
      ];
    }),
    keepEffects(evictCache),
  )(newState);
}

export function clearCurrent(state: State): StateAndEffects {
  const newState = {
    ...state,
    current: {},
  };

  return mapClients((client) => {
    return [
      {
        ...client,
        current: initAccumulated(client.paths),
      },
      [rebuildClient(client.id)],
    ];
  })(newState);
}
