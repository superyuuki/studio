// This Source Code Form is subject to the terms of the Mozilla Public
// License, v2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/

import { StoryObj } from "@storybook/react";

import { Vector3, FrameTransform, LineType, SceneUpdate } from "@foxglove/schemas";
import { MessageEvent } from "@foxglove/studio";
import { Topic } from "@foxglove/studio-base/players/types";
import PanelSetup from "@foxglove/studio-base/stories/PanelSetup";
import { xyzrpyToPose } from "@foxglove/studio-base/panels/ThreeDeeRender/transforms";

import { QUAT_IDENTITY, rad2deg, makeColor } from "./common";
import useDelayedFixture from "./useDelayedFixture";
import ThreeDeePanel from "../index";

export default {
  title: "panels/ThreeDeeRender",
  component: ThreeDeePanel,
};

export const LargerTransform: StoryObj = {
  render: function Story() {
    const topics: Topic[] = [
      { name: "transforms", schemaName: "foxglove.FrameTransform" },
      { name: "scene", schemaName: "foxglove.SceneUpdate" },
    ];

    const origin: Vector3 = { x: 4000000, y: 4000000, z: 4000000 };

    const tf1: MessageEvent<FrameTransform> = {
      topic: "transforms",
      receiveTime: { sec: 10, nsec: 0 },
      message: {
        timestamp: { sec: 0, nsec: 0 },
        parent_frame_id: "map",
        child_frame_id: "root",
        translation: origin,
        rotation: QUAT_IDENTITY,
      },
      schemaName: "foxglove.FrameTransform",
      sizeInBytes: 0,
    };

    const scene1: MessageEvent<SceneUpdate> = {
      topic: "scene",
      receiveTime: { sec: 10, nsec: 0 },
      message: {
        deletions: [],
        entities: [
          {
            timestamp: { sec: 0, nsec: 0 },
            frame_id: "map",
            id: "entity1",
            lifetime: { sec: 0, nsec: 0 },
            frame_locked: true,
            metadata: [],
            arrows: [],
            cubes: [],
            spheres: [],
            cylinders: [],
            lines: [
              {
                type: LineType.LINE_STRIP,
                pose: xyzrpyToPose([0, 0, 0], [0, 0, 0]),
                thickness: 0.05,
                scale_invariant: false,
                points: new Array(10).fill(0).map((_, i, { length }) => ({
                  x: origin.x + (0.25 * Math.cos((2 * Math.PI * i) / length)),
                  y: origin.y + (0.25 * Math.sin((2 * Math.PI * i) / length)),
                  z: origin.z,
                })),
                color: makeColor("#7995fb", 0.8),
                colors: [],
                indices: [],
              },
            ],
            triangles: [],
            texts: [],
            models: [],
          },
        ],
      },
      schemaName: "foxglove.SceneUpdate",
      sizeInBytes: 0,
    };

    const fixture = useDelayedFixture({
      topics,
      frame: {
        transforms: [tf1],
        scene: [scene1],
      },
      capabilities: [],
      activeData: {
        currentTime: { sec: 0, nsec: 0 },
      },
    });

    return (
      <PanelSetup fixture={fixture}>
        <ThreeDeePanel
          overrideConfig={{
            followTf: "root",
            layers: {
              grid: {
                layerId: "foxglove.Grid",
                position: [origin.x, origin.y, -0.25],
              },
            },
            cameraState: {
              distance: 3,
              perspective: true,
              phi: rad2deg(1),
              targetOffset: [0, 0, 0],
              thetaOffset: rad2deg(0),
              fovy: rad2deg(0.75),
              near: 0.01,
              far: 5000,
              target: [origin.x, origin.y, origin.z],
              targetOrientation: [0, 0, 0, 1],
            },
            topics: {
              "scene": { visible: true },
            },
          }}
        />
      </PanelSetup>
    );
  },

  parameters: { colorScheme: "dark" },
};
