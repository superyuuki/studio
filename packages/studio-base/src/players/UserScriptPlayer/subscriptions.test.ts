// This Source Code Form is subject to the terms of the Mozilla Public
// License, v2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/

import { SubscribePayload } from "@foxglove/studio-base/players/types";

import { remapVirtualSubscriptions, getPreloadTypes } from "./subscriptions";

describe("getPreloadTypes", () => {
  it("leave a partial subscription in place", () => {
    expect(
      getPreloadTypes([
        {
          topic: "/test",
          preloadType: "partial",
        },
      ]),
    ).toEqual({
      "/test": {
        topic: "/test",
        preloadType: "partial",
      },
    });
  });

  it("upgrades to a full subscription from partial", () => {
    expect(
      getPreloadTypes([
        {
          topic: "/test",
          preloadType: "full",
        },
        {
          topic: "/test",
          preloadType: "partial",
        },
      ]),
    ).toEqual({
      "/test": {
        topic: "/test",
        preloadType: "full",
      },
    });
  });
});

describe("remapVirtualSubscriptions", () => {
  const call = (
    subscriptions: SubscribePayload[],
    inputsByOutputTopic: Record<string, readonly string[]>,
  ) => remapVirtualSubscriptions(subscriptions, new Map(Object.entries(inputsByOutputTopic)));

  it("ignores unrelated subscriptions", () => {
    expect(
      call(
        [
          {
            topic: "/real",
          },
        ],
        {},
      ),
    ).toEqual([
      {
        topic: "/real",
      },
    ]);
  });

  it("ignores virtual topics without inputs", () => {
    expect(
      call(
        [
          {
            topic: "/output",
          },
        ],
        {
          "/output": [],
        },
      ),
    ).toEqual([]);
  });

  it("upgrades to a full subscription from partial", () => {
    expect(
      call(
        [
          {
            topic: "/output",
            preloadType: "full",
          },
          {
            topic: "/output",
            preloadType: "partial",
          },
        ],
        {
          "/output": ["/input"],
        },
      ),
    ).toEqual([
      {
        topic: "/input",
        preloadType: "full",
      },
      {
        topic: "/input",
        preloadType: "partial",
      },
    ]);
  });

  it("remaps and upgrades subscriptions with fields to output to a whole-message input subscription", () => {
    expect(
      call(
        [
          {
            topic: "/output",
            fields: ["one", "two"],
          },
        ],
        {
          "/output": ["/input"],
        },
      ),
    ).toEqual([
      {
        topic: "/input",
        preloadType: "partial",
      },
    ]);
  });

  it("maps output to input with fields and leaves other input sub as is", () => {
    expect(
      call(
        [
          {
            topic: "/output",
            fields: ["one", "two"],
          },
          {
            topic: "/input",
            fields: ["one", "two"],
          },
        ],
        {
          "/output": ["/input2"],
        },
      ),
    ).toEqual([
      {
        topic: "/input2",
        preloadType: "partial",
      },
      {
        topic: "/input",
        fields: ["one", "two"],
      },
    ]);
  });

  it("maps output to input with fields and leaves other input sub as is. Does not deduplicate so that underlying player can perform backfill on any new subscriptions.", () => {
    expect(
      call(
        [
          {
            topic: "/output",
            fields: ["one", "two"],
          },
          {
            topic: "/input",
            fields: ["one", "two"],
          },
        ],
        {
          "/output": ["/input"],
        },
      ),
    ).toEqual([
      {
        topic: "/input",
        preloadType: "partial",
      },
      {
        topic: "/input",
        fields: ["one", "two"],
      },
    ]);
  });
});
