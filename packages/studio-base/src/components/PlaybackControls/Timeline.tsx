// This Source Code Form is subject to the terms of the Mozilla Public
// License, v2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/

import { Typography, useTheme } from "@mui/material";
import { FzfResultItem } from "fzf";
import { useCallback, useMemo, Dispatch, SetStateAction } from "react";
import tc, { ColorInput } from "tinycolor2";

import { subtract as subtractTimes, toSec, Time } from "@foxglove/rostime";
import AutoSizingCanvas from "@foxglove/studio-base/components/AutoSizingCanvas";
import { FzfHighlightChars } from "@foxglove/studio-base/components/FzfHighlightChars";
import useMessagesByPath from "@foxglove/studio-base/components/MessagePathSyntax/useMessagesByPath";
import {
  MessagePipelineContext,
  useMessagePipeline,
} from "@foxglove/studio-base/components/MessagePipeline";
import { TimelineScrubber } from "@foxglove/studio-base/components/PlaybackControls/TimelineScrubber";
import Stack from "@foxglove/studio-base/components/Stack";
import { Topic } from "@foxglove/studio-base/src/players/types";
import { expandedLineColors } from "@foxglove/studio-base/util/plotColors";
import { fonts } from "@foxglove/studio-base/util/sharedStyleConstants";

const ROW_HEIGHT = 48;

enum schemaMapping {
  "diagnostic_msgs/DiagnosticArray" = 0,
  "foxglove_msgs/ImageMarkerArray" = 1,
  "geometry_msgs/PoseStamped" = 2,
  "nav_msgs/OccupancyGrid" = 3,
  "nav_msgs/Odometry" = 3,
  "sensor_msgs/CameraInfo" = 4,
  "sensor_msgs/CompressedImage" = 4,
  "sensor_msgs/Imu" = 4,
  "sensor_msgs/NavSatFix" = 4,
  "sensor_msgs/PointCloud2" = 4,
  "tf2_msgs/TFMessage" = 5,
  "visualization_msgs/ImageMarker" = 6,
  "visualization_msgs/MarkerArray" = 6,
}

const selectStartTime = (ctx: MessagePipelineContext) => ctx.playerState.activeData?.startTime;
const selectEndTime = (ctx: MessagePipelineContext) => ctx.playerState.activeData?.endTime;

export function Timeline({
  topics = [],
  hoverStamp,
  setHoverStamp,
  onSeek,
}: {
  topics?: FzfResultItem<Topic>[];
  hoverStamp?: Time;
  setHoverStamp: Dispatch<SetStateAction<Time | undefined>>;
  onSeek: (seekTo: Time) => void;
}): JSX.Element {
  const theme = useTheme();

  const pathStrings = useMemo(() => topics.map(({ item: { name } }) => name), [topics]);

  const startTime = useMessagePipeline(selectStartTime);
  const endTime = useMessagePipeline(selectEndTime);
  const duration = toSec(subtractTimes(endTime!, startTime!));

  const itemsByPath = useMessagesByPath(pathStrings);

  const drawCallback = useCallback(
    (ctx: CanvasRenderingContext2D, width: number, _height: number) => {
      const augmentColor = (color: ColorInput) => {
        const colorMode = theme.palette.mode === "dark" ? "darken" : "lighten";
        const threshold = theme.palette.mode === "dark" ? 40 : 20;

        return tc(color)[colorMode](threshold).toString();
      };

      topics.map(({ item: topic }, idx) => {
        ctx.fillStyle = augmentColor(expandedLineColors[schemaMapping[topic.schemaName]]!);
        ctx.fillRect(0, ROW_HEIGHT * idx, width, ROW_HEIGHT);

        const canvasOffsets: number[] | undefined = itemsByPath[topic.name]?.map(
          ({ messageEvent }) =>
            (toSec(subtractTimes(messageEvent.receiveTime, startTime!)) / duration) * width,
        );

        if (canvasOffsets != undefined) {
          for (const x of canvasOffsets) {
            ctx.beginPath();
            ctx.strokeStyle = tc(expandedLineColors[schemaMapping[topic.schemaName]])
              .setAlpha(1)
              .toString();
            ctx.moveTo(x, ROW_HEIGHT * idx);
            ctx.lineTo(x, ROW_HEIGHT * idx + ROW_HEIGHT);
            ctx.stroke();
          }
        }
      });

      topics.map((_, idx) => {
        ctx.strokeStyle = theme.palette.background.default;
        ctx.strokeRect(0, ROW_HEIGHT * idx, width, ROW_HEIGHT);
      });

      ctx.save();
    },
    [
      duration,
      itemsByPath,
      startTime,
      theme.palette.background.default,
      theme.palette.mode,
      topics,
    ],
  );

  return (
    <>
      <Stack
        direction="row"
        fullWidth
        flex="auto"
        position="relative"
        overflow="auto"
        justifyContent="flex-start"
      >
        <div
          style={{
            inset: "0 0 auto 300px",
            position: "absolute",
            height: topics.length * ROW_HEIGHT,
          }}
        >
          <AutoSizingCanvas draw={drawCallback} />
        </div>

        <TimelineScrubber
          onSeek={onSeek}
          hoverStamp={hoverStamp}
          setHoverStamp={setHoverStamp}
          drawerWidth={300}
          height={topics.length * ROW_HEIGHT}
        />

        <div>
          {topics.map(({ item: topic, positions }, idx) => (
            <Stack
              overflow="hidden"
              flex="none"
              key={`${idx}.${topic.name}`}
              justifyContent="center"
              padding={1}
              style={{
                width: 300,
                borderBottom: `1px solid ${theme.palette.divider}`,
                boxSizing: "border-box",
                height: ROW_HEIGHT,
              }}
            >
              <Typography variant="caption">
                <FzfHighlightChars str={topic.name} indices={positions} />
              </Typography>
              <Typography variant="caption" fontFamily={fonts.MONOSPACE} color="text.secondary">
                {topic.schemaName != undefined && (
                  <FzfHighlightChars
                    str={topic.schemaName}
                    indices={positions}
                    offset={topic.name.length + 1}
                  />
                )}
              </Typography>
            </Stack>
          ))}
        </div>
      </Stack>
    </>
  );
}
