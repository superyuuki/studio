// This Source Code Form is subject to the terms of the Mozilla Public
// License, v2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/

import { init, initClient, State, rebuildClient } from "./state";
import {
  unregister,
  register,
  refreshClient,
  receiveVariables,
  updateParams,
  updateView,
} from "./clients";
import { DATA_PATH, CLIENT_ID, createState, createParams } from "./testing";
import { PlotViewport } from "@foxglove/studio-base/components/TimeBasedChart/types";

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
    expect(effects).toEqual([rebuildClient(CLIENT_ID)]);
  });
});

describe("updateParams", () => {
  it("ignores missing id", () => {
    const before = createState();
    const [after] = updateParams("123", createParams(), before);
    expect(after.clients[0]).toEqual(before.clients[0]);
  });
  it("updates client", () => {
    const before = createState("/foo.bar");
    const params = createParams("/some.test");
    const [after, effects] = updateParams(CLIENT_ID, params, before);
    expect(after.clients[0]?.params).not.toEqual(before.clients[0]?.params);
    expect(after.clients[0]?.topics).toEqual(["/some"]);
    expect(effects).toEqual([rebuildClient(CLIENT_ID)]);
  });
});

describe("updateView", () => {
  const view: PlotViewport = {
    width: 0,
    height: 0,
    bounds: {
      x: { min: 0, max: 0 },
      y: { min: 0, max: 0 },
    },
  };
  it("ignores missing id", () => {
    const before = createState();
    const [after] = updateView("123", view, before);
    expect(after.clients[0]).toEqual(before.clients[0]);
  });
  it("updates client", () => {
    const before = createState("/foo.bar");
    const [after, effects] = updateView(CLIENT_ID, view, before);
    expect(after.clients[0]?.view).toEqual(view);
    expect(effects).toEqual([rebuildClient(CLIENT_ID)]);
  });
});

describe("register", () => {
  it("ignores missing params", () => {
    const [after, effects] = register(CLIENT_ID, undefined, init());
    expect(after.clients.length).toEqual(1);
    expect(effects).toEqual([]);
  });
  it("updates the client's params after registration", () => {
    const [after, effects] = register(CLIENT_ID, createParams(DATA_PATH), init());
    expect(after.clients.length).toEqual(1);
    expect(effects).toEqual([rebuildClient(CLIENT_ID)]);
  });
});

describe("unregister", () => {
  it("removes an existing client", () => {
    const after = unregister(CLIENT_ID, createState());
    expect(after.clients.length).toEqual(0);
  });
});
