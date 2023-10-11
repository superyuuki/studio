// This Source Code Form is subject to the terms of the Mozilla Public
// License, v2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/

import { initAccumulated, accumulate } from "./accumulate";
import { rebuildClient, mapClients, noEffects, findClient, mutateClient } from "./state";
import { State, StateAndEffects } from "./types";
import { PlotData } from "../plotData";

export function addBlock(id: string, data: PlotData, state: State): StateAndEffects {
  const client = findClient(state, id);
  if (client == undefined) {
    return noEffects(state);
  }

  return [
    mutateClient(state, id, { ...client, blocks: accumulate(client.blocks, data) }),
    [rebuildClient(id)],
  ];
}

export function clearBlock(id: string, state: State): StateAndEffects {
  const client = findClient(state, id);
  if (client == undefined) {
    return noEffects(state);
  }

  return [mutateClient(state, id, { ...client, blocks: initAccumulated() }), [rebuildClient(id)]];
}

export function addCurrent(id: string, data: PlotData, state: State): StateAndEffects {
  const client = findClient(state, id);
  if (client == undefined) {
    return noEffects(state);
  }

  return [
    mutateClient(state, id, { ...client, current: accumulate(client.current, data) }),
    [rebuildClient(id)],
  ];
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
        current: initAccumulated(),
      },
      [rebuildClient(client.id)],
    ];
  })(newState);
}
