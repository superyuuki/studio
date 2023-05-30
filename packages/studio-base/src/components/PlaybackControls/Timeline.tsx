// This Source Code Form is subject to the terms of the Mozilla Public
// License, v2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/

import { Divider, Typography, useTheme } from "@mui/material";
import { FzfResultItem } from "fzf";
import { useCallback, useMemo, Dispatch, SetStateAction } from "react";
import tc, { ColorInput } from "tinycolor2";
import { makeStyles } from "tss-react/mui";

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

const useStyles = makeStyles()((theme) => ({
  topic: {
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
    flex: "none",
    justifyContent: "center",
    padding: theme.spacing(1),
    borderBottom: `1px solid ${theme.palette.divider}`,
    backgroundColor: theme.palette.background.paper,
    height: ROW_HEIGHT,
  },
}));

enum schemaMapping {
  "diagnostic_msgs/DiagnosticArray" = 0,
  "foxglove_msgs/ImageMarkerArray" = 1,
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
  "geometry_msgs/PoseStamped" = 7,
}

const selectStartTime = (ctx: MessagePipelineContext) => ctx.playerState.activeData?.startTime;
const selectEndTime = (ctx: MessagePipelineContext) => ctx.playerState.activeData?.endTime;

const backgroundColor = ({
  color,
  prefersDarkMode,
}: {
  prefersDarkMode: boolean;
  color: ColorInput;
}) => (prefersDarkMode ? tc(color).darken(35).toString() : tc(color).lighten(15).toString());

const foregroundColor = ({
  color,
  prefersDarkMode,
}: {
  prefersDarkMode: boolean;
  color: ColorInput;
}) => (prefersDarkMode ? tc(color).toString() : tc(color).darken(20).toString());

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
  const { classes } = useStyles();
  const theme = useTheme();
  const prefersDarkMode = theme.palette.mode === "dark";

  const pathStrings = useMemo(() => topics.map(({ item: { name } }) => name), [topics]);

  const startTime = useMessagePipeline(selectStartTime);
  const endTime = useMessagePipeline(selectEndTime);
  const duration = toSec(subtractTimes(endTime!, startTime!));

  const itemsByPath = useMessagesByPath(pathStrings);

  const drawCallback = useCallback(
    (ctx: CanvasRenderingContext2D, width: number, _height: number) => {
      topics.map(({ item: topic }, idx) => {
        ctx.fillStyle = backgroundColor({
          color: expandedLineColors[schemaMapping[topic.schemaName]]!,
          prefersDarkMode,
        });
        ctx.fillRect(0, ROW_HEIGHT * idx, width, ROW_HEIGHT);

        const canvasOffsets: number[] | undefined = itemsByPath[topic.name]?.map(
          ({ messageEvent }) =>
            (toSec(subtractTimes(messageEvent.receiveTime, startTime!)) / duration) * width - 1,
        );

        canvasOffsets?.map((x) => {
          ctx.beginPath();
          ctx.lineWidth = 1;
          ctx.strokeStyle = foregroundColor({
            color: expandedLineColors[schemaMapping[topic.schemaName]]!,
            prefersDarkMode,
          });
          ctx.moveTo(x, ROW_HEIGHT * idx);
          ctx.lineTo(x, ROW_HEIGHT * idx + ROW_HEIGHT);
          ctx.stroke();
        });

        ctx.beginPath();
        ctx.lineWidth = 2;
        ctx.strokeStyle = foregroundColor({
          color: expandedLineColors[schemaMapping[topic.schemaName]]!,
          prefersDarkMode,
        });
        ctx.moveTo(0, ROW_HEIGHT * idx + ROW_HEIGHT);
        ctx.lineTo(width, ROW_HEIGHT * idx + ROW_HEIGHT);
        ctx.stroke();
      });

      ctx.save();
    },
    [duration, itemsByPath, prefersDarkMode, startTime, topics],
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

        <Stack fullWidth>
          {topics.map(({ item: topic, positions }, idx) => (
            <div className={classes.topic} key={`${idx}.${topic.name}`}>
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
            </div>
          ))}
        </Stack>
      </Stack>
    </>
  );
}
