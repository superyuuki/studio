// This Source Code Form is subject to the terms of the Mozilla Public
// License, v2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/

import { Bounds1D, PlotViewport } from "@foxglove/studio-base/components/TimeBasedChart/types";

import { shouldResetViewport, updateSource, initSource, updatePath, initPath } from "./downsample";
import { createPath, createDataset, FAKE_PATH } from "./testing";

const createBounds = (min: number, max: number): Bounds1D => ({
  min,
  max,
});

const createViewport = (width: number, height: number, min: number, max: number): PlotViewport => ({
  width,
  height,
  bounds: {
    x: { min, max },
    y: { min, max },
  },
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

describe("updatePath", () => {
  it("returns a partial view", () => {
    const before = initPath();
    const after = updatePath(
      createPath(FAKE_PATH),
      createDataset(100),
      undefined,
      createBounds(0, 50),
      MAX_POINTS,
      before,
    );
    expect(after.isPartial).toEqual(true);
  });

  it("goes back to non-partial when viewport expands", () => {
    const before = updatePath(
      createPath(FAKE_PATH),
      createDataset(100),
      undefined,
      createBounds(0, 50),
      MAX_POINTS,
      initPath(),
    );
    const after = updatePath(
      createPath(FAKE_PATH),
      createDataset(100),
      undefined,
      createBounds(0, 110),
      MAX_POINTS,
      before,
    );
    expect(after.isPartial).toEqual(false);
  });

  it("ignores current data when block data exceeds it", () => {
    const before = initPath();
    const after = updatePath(
      createPath(FAKE_PATH),
      FAKE_DATASET,
      createDataset(2),
      createBounds(0, 15),
      MAX_POINTS,
      before,
    );
    expect(after.current).toEqual(initSource());
  });

  it("updates both data sources", () => {
    const before = initPath();
    const after = updatePath(
      createPath(FAKE_PATH),
      FAKE_DATASET,
      createDataset(15),
      createBounds(0, 15),
      MAX_POINTS,
      before,
    );
    expect(after.current.cursor).toEqual(15);
    expect(after.blocks.cursor).toEqual(10);
  });
});

describe("shouldResetViewport", () => {
  it("do nothing if missing old viewport", () => {
    expect(
      shouldResetViewport([], undefined, createViewport(800, 600, 0, 120), createBounds(0, 100)),
    ).toEqual(false);
  });

  it("ignore partial paths that have no data", () => {
    expect(
      shouldResetViewport(
        [
          {
            ...initPath(),
            isPartial: true,
          },
        ],
        createViewport(800, 600, 0, 120),
        createViewport(800, 600, 0, 120),
        createBounds(0, 100),
      ),
    ).toEqual(false);
  });

  it("should reset if partial viewport changed", () => {
    expect(
      shouldResetViewport(
        [
          {
            ...initPath(),
            dataset: createDataset(20),
            isPartial: true,
          },
        ],
        createViewport(800, 600, 0, 20),
        createViewport(800, 600, 20, 40),
        createBounds(0, 100),
      ),
    ).toEqual(true);
  });

  it("should reset if zoomed", () => {
    expect(
      shouldResetViewport(
        [],
        createViewport(800, 600, 0, 20),
        createViewport(800, 600, 0, 40),
        createBounds(0, 100),
      ),
    ).toEqual(true);
  });
});
