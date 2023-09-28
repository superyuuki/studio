// This Source Code Form is subject to the terms of the Mozilla Public
// License, v2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/

import { Immutable } from "@foxglove/studio";
import { init, rebuildClient, State } from "./state";
import { Topic } from "@foxglove/studio-base/players/types";
import { RosDatatypes, OptionalMessageDefinition } from "@foxglove/studio-base/types/RosDatatypes";
import {
  createParams,
  createClient,
  createMessages,
  createState,
  FAKE_PATH,
  CLIENT_ID,
  FAKE_TOPIC,
  FAKE_SCHEMA,
} from "./testing";
import { addBlock, receiveMetadata, evictCache } from "./messages";

const FAKE_TOPICS: readonly Topic[] = [
  {
    name: FAKE_TOPIC,
    schemaName: FAKE_SCHEMA,
  },
];

const FAKE_DATATYPES: Immutable<RosDatatypes> = new Map<string, OptionalMessageDefinition>().set(
  FAKE_SCHEMA,
  {
    definitions: [{ name: "data", type: "float64", isArray: false }],
  },
);

describe("receiveMetadata", () => {
  it("updates metadata", () => {
    const before = init();
    const after = receiveMetadata(FAKE_TOPICS, FAKE_DATATYPES, before);
    expect(after.metadata).not.toEqual(before);
  });
});

describe("evictCache", () => {
  it("removes unused topics", () => {
    const after = evictCache({
      ...createState("/foo.bar"),
      blocks: {
        "/bar.baz": [],
      },
    });
    expect(Object.entries(after.blocks).length).toEqual(0);
  });
});

describe("addBlock", () => {
  it("resets the requested topics", () => {
    const [after] = addBlock({}, [FAKE_TOPIC], {
      ...init(),
      blocks: {
        [FAKE_TOPIC]: [],
      },
    });
    expect(Object.entries(after.blocks).length).toEqual(0);
  });
  it("concatenates messages", () => {
    const [after] = addBlock(createMessages(FAKE_TOPIC, FAKE_SCHEMA, 1), [], {
      ...init(),
      blocks: createMessages(FAKE_TOPIC, FAKE_SCHEMA, 1),
    });
    expect(after.blocks[FAKE_TOPIC]?.length).toEqual(2);
  });
  it("ignores client without params", () => {
    const before = {
      ...init(),
      clients: [createClient()],
    };
    const [after, effects] = addBlock({}, [], before);
    expect(after.clients[0]).toEqual(before.clients[0]);
    expect(effects.length).toEqual(0);
  });
  it("ignores client with single message params", () => {
    const before: State = {
      ...init(),
      clients: [
        {
          ...createClient(),
          params: {
            ...createParams(FAKE_PATH),
            xAxisVal: "index",
          },
        },
      ],
    };
    const [after, effects] = addBlock({}, [], before);
    expect(after.clients[0]).toEqual(before.clients[0]);
    expect(effects.length).toEqual(0);
  });
  it("ignores client with no related topics", () => {
    const before: State = createState("/bar.baz");
    const [after, effects] = addBlock(createMessages(FAKE_TOPIC, FAKE_SCHEMA, 1), [], before);
    expect(after.clients[0]).toEqual(before.clients[0]);
    expect(effects.length).toEqual(0);
  });
  it("builds plot data for client", () => {
    const before: State = receiveMetadata(FAKE_TOPICS, FAKE_DATATYPES, createState(FAKE_PATH));
    const [after, effects] = addBlock(createMessages(FAKE_TOPIC, FAKE_SCHEMA, 1), [], before);
    expect(effects).toEqual([rebuildClient(CLIENT_ID)]);
    expect(after.clients[0]?.blocks).not.toEqual(before.clients[0]?.blocks);
  });
});
