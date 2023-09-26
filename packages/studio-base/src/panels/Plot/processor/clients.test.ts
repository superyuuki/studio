// This Source Code Form is subject to the terms of the Mozilla Public
// License, v2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/

import { init, initClient, State, rebuildClient } from "./state";
import { refreshClient, receiveVariables } from "./clients";
import { DATA_PATH, CLIENT_ID, createState } from "./testing";

describe("refreshClient", () => {
  it("ignores client without params", () => {
    const client = initClient(CLIENT_ID, undefined);
    const initial: State = { ...init(), clients: [client] };
    const [newClient, effects] = refreshClient(client, initial);
    expect(newClient).toEqual(client);
    expect(effects).toEqual([]);
  });

  it("regenerates plots and triggers a rebuild", () => {
    const initial = createState(DATA_PATH);
    const {
      clients: [client],
    } = initial;
    if (client == undefined) {
      throw new Error("client missing somehow");
    }
    const [newClient, effects] = refreshClient(client, initial);
    expect(effects).toEqual([rebuildClient(client.id)]);
    // we aren't testing accumulate(); just check whether the reference changed
    expect(newClient.blocks).not.toEqual(client.blocks);
    expect(newClient.current).not.toEqual(client.current);
  });
});

describe("receiveVariables", () => {
  const vars = {
    foo: "bar",
  };
  it("does nothing when client does not use variables", () => {
    const before = createState(DATA_PATH);
    const [after] = receiveVariables(vars, before);
    expect(after.clients[0]).toEqual(before.clients[0]);
  });
  it("refreshes the client when it does use variables", () => {
    const before = createState(`/topic.field[:]{id==$foo}`);
    const [after, effects] = receiveVariables(vars, before);
    expect(after.clients[0]).not.toEqual(before.clients[0]);
    expect(effects).toEqual([rebuildClient(after.clients[0]?.id ?? "")]);
  });
});
