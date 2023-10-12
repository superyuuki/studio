// This Source Code Form is subject to the terms of the Mozilla Public
// License, v2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/

import { getPathData } from "./accumulate";
import { FAKE_METADATA, createPath } from "./testing";

describe("getPathData", () => {
  it("ignores invalid path", () => {
    const pathData = getPathData(FAKE_METADATA, {}, {}, createPath("你好"));
    expect(pathData).toEqual([]);
  });
});
