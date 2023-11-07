// This Source Code Form is subject to the terms of the Mozilla Public
// License, v2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/

import { updateSource, initSource } from "./downsample";
import { createPath, createDataset, FAKE_PATH } from "./testing";
import { Bounds1D } from "@foxglove/studio-base/components/TimeBasedChart/types";

const createBounds = (min: number, max: number): Bounds1D => ({
  min,
  max,
});

const FAKE_BOUNDS = createBounds(0, 100);
const MAX_POINTS = 1024;
const MIN_SIZE = 0.05;

const FAKE_DATASET = createDataset(10);
const EMPTY_DATASET = createDataset(0);

describe("updateSource", () => {
  it("ignores missing raw data", () => {
    const result = updateSource(
      createPath(FAKE_PATH),
      undefined,
      FAKE_BOUNDS,
      MAX_POINTS,
      MIN_SIZE,
      // we want to ensure it returns a new, initialized source
      {
        ...initSource(),
        cursor: 999,
      },
    );

    expect(result).toEqual(initSource());
  });

  it("ignores an unchanged cursor", () => {
    const before = {
      ...initSource(),
      cursor: 10,
    };
    const after = updateSource(
      createPath(FAKE_PATH),
      createDataset(10),
      FAKE_BOUNDS,
      MAX_POINTS,
      MIN_SIZE,
      before,
    );

    expect(after).toEqual(before);
  });

  it("resets when the dataset becomes empty", () => {
    const before = {
      ...initSource(),
      cursor: 10,
    };
    const after = updateSource(
      createPath(FAKE_PATH),
      EMPTY_DATASET,
      FAKE_BOUNDS,
      MAX_POINTS,
      MIN_SIZE,
      before,
    );

    expect(after).toEqual(initSource());
  });

  it("resets and recalculates when the dataset shrinks", () => {
    const before = {
      ...initSource(),
      cursor: 20,
    };
    const after = updateSource(
      createPath(FAKE_PATH),
      FAKE_DATASET,
      FAKE_BOUNDS,
      MAX_POINTS,
      MIN_SIZE,
      before,
    );
    expect(after.cursor).toEqual(10);
  });

  it("waits for enough data to guess chunkSize", () => {
    const initial = initSource();
    const first = updateSource(
      createPath(FAKE_PATH),
      createDataset(1),
      FAKE_BOUNDS,
      MAX_POINTS,
      MIN_SIZE,
      initial,
    );
    expect(first).toEqual(initial);
    expect(first.dataset).toEqual(undefined);

    const second = updateSource(
      createPath(FAKE_PATH),
      createDataset(50),
      FAKE_BOUNDS,
      MAX_POINTS,
      MIN_SIZE,
      initial,
    );
    expect(second.cursor).toEqual(50);
    expect(second.numBuckets).not.toEqual(0);
    expect(second.chunkSize).not.toEqual(0);
  });

  it("incorporates new points smaller than chunkSize", () => {
    const before = updateSource(
      createPath(FAKE_PATH),
      FAKE_DATASET,
      FAKE_BOUNDS,
      MAX_POINTS,
      MIN_SIZE,
      initSource(),
    );
    const after = updateSource(
      createPath(FAKE_PATH),
      createDataset(11), // ie less than the chunk size
      FAKE_BOUNDS,
      MAX_POINTS,
      MIN_SIZE,
      before,
    );
    expect(after.cursor).toEqual(11);
  });

  it("incorporates new points greater than chunkSize", () => {
    const before = updateSource(
      createPath(FAKE_PATH),
      FAKE_DATASET,
      FAKE_BOUNDS,
      MAX_POINTS,
      MIN_SIZE,
      initSource(),
    );
    const after = updateSource(
      createPath(FAKE_PATH),
      createDataset(100),
      FAKE_BOUNDS,
      MAX_POINTS,
      MIN_SIZE,
      before,
    );
    expect(after.cursor).toEqual(100);
  });
});
