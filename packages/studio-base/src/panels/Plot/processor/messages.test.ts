// This Source Code Form is subject to the terms of the Mozilla Public
// License, v2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/

import { Immutable } from "@foxglove/studio";
import { init } from "./state";
import { Topic } from "@foxglove/studio-base/players/types";
import { RosDatatypes, OptionalMessageDefinition } from "@foxglove/studio-base/types/RosDatatypes";
import { FAKE_TOPIC, FAKE_SCHEMA } from "./testing";
import { receiveMetadata } from "./messages";

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
