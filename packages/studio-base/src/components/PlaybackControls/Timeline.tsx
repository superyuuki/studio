// This Source Code Form is subject to the terms of the Mozilla Public
// License, v2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/

import { Paper, Typography, useTheme } from "@mui/material";
import { FzfResultItem } from "fzf";
import { mergeWith } from "lodash";
import { Dispatch, SetStateAction, useCallback, useMemo } from "react";
import tc, { ColorInput } from "tinycolor2";
import { makeStyles } from "tss-react/mui";

import { Time, subtract as subtractTimes, toSec } from "@foxglove/rostime";
import { useBlocksByTopic } from "@foxglove/studio-base/PanelAPI";
import { MessageBlock } from "@foxglove/studio-base/PanelAPI/useBlocksByTopic";
import AutoSizingCanvas from "@foxglove/studio-base/components/AutoSizingCanvas";
import { FzfHighlightChars } from "@foxglove/studio-base/components/FzfHighlightChars";
import {
  MessagePipelineContext,
  useMessagePipeline,
} from "@foxglove/studio-base/components/MessagePipeline";
import { TimelineScrubber } from "@foxglove/studio-base/components/PlaybackControls/TimelineScrubber";
import Stack from "@foxglove/studio-base/components/Stack";
import { Topic } from "@foxglove/studio-base/src/players/types";
import { expandedLineColors } from "@foxglove/studio-base/util/plotColors";
import { fonts } from "@foxglove/studio-base/util/sharedStyleConstants";
import { toolsColorScheme } from "@foxglove/studio-base/util/toolsColorScheme";

const ROW_HEIGHT = 48;
const SIDEBAR_WITDH = 300;

const useStyles = makeStyles()((theme) => ({
  canvasWrapper: {
    top: 0,
    right: 0,
    left: SIDEBAR_WITDH,
    position: "absolute",
  },
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
  sidebar: {
    display: "flex",
    flexDirection: "column",
    left: 0,
    position: "sticky",
    width: SIDEBAR_WITDH,
    zIndex: theme.zIndex.appBar,
  },
}));

const SchemaMappings = [
  "diagnostic_msgs/DiagnosticArray",
  "foxglove_msgs/ImageMarkerArray",
  "nav_msgs/OccupancyGrid",
  "nav_msgs/Odometry",
  "sensor_msgs/CameraInfo",
  "sensor_msgs/CompressedImage",
  "sensor_msgs/Imu",
  "sensor_msgs/NavSatFix",
  "sensor_msgs/PointCloud2",
  "tf2_msgs/TFMessage",
  "visualization_msgs/ImageMarker",
  "visualization_msgs/MarkerArray",
  "geometry_msgs/PoseStamped",
] as const;

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

function colorForSchema(schema: undefined | string) {
  const index = SchemaMappings.findIndex((sch) => sch === schema);
  return (
    (index === -1 ? expandedLineColors[0] : expandedLineColors[index]) ??
    toolsColorScheme.blue.medium
  );
}

function flattenBlocks(blocks: readonly MessageBlock[]) {
  return blocks.reduce((acc, block) => mergeWith(acc, block, (a, b) => (a ?? []).concat(b)), {});
}

export function Timeline({
  zoom,
  topics = [],
  hoverStamp,
  setHoverStamp,
  onSeek,
}: {
  zoom: number;
  topics?: FzfResultItem<Topic>[];
  hoverStamp?: Time;
  setHoverStamp: Dispatch<SetStateAction<Time | undefined>>;
  onSeek: (seekTo: Time) => void;
}): JSX.Element {
  const { classes } = useStyles();
  const theme = useTheme();
  const prefersDarkMode = theme.palette.mode === "dark";

  const topicNames = useMemo(() => topics.map(({ item: { name } }) => name), [topics]);

  const startTime = useMessagePipeline(selectStartTime);
  const endTime = useMessagePipeline(selectEndTime);
  const duration = toSec(subtractTimes(endTime!, startTime!));

  const blocks = useBlocksByTopic(topicNames);

  const flatBlocks = useMemo(() => flattenBlocks(blocks), [blocks]);

  const drawCallback = useCallback(
    (ctx: CanvasRenderingContext2D, width: number, _height: number) => {
      topics.map(({ item: topic }, idx) => {
        ctx.fillStyle = backgroundColor({
          color: colorForSchema(topic.schemaName),
          prefersDarkMode,
        });
        ctx.fillRect(0, ROW_HEIGHT * idx, width, ROW_HEIGHT);

        const canvasOffsets: number[] | undefined = flatBlocks[topic.name]?.map(
          (messageEvent) =>
            (toSec(subtractTimes(messageEvent.receiveTime, startTime!)) / duration) * width - 1,
        );

        canvasOffsets?.map((x) => {
          ctx.beginPath();
          ctx.lineWidth = 1;
          ctx.strokeStyle = foregroundColor({
            color: colorForSchema(topic.schemaName),
            prefersDarkMode,
          });
          ctx.moveTo(x, ROW_HEIGHT * idx);
          ctx.lineTo(x, ROW_HEIGHT * idx + ROW_HEIGHT);
          ctx.stroke();
        });

        ctx.beginPath();
        ctx.lineWidth = 2;
        ctx.strokeStyle = foregroundColor({
          color: colorForSchema(topic.schemaName),
          prefersDarkMode,
        });
        ctx.moveTo(0, ROW_HEIGHT * idx + ROW_HEIGHT);
        ctx.lineTo(width, ROW_HEIGHT * idx + ROW_HEIGHT);
        ctx.stroke();
      });

      ctx.save();
    },
    [duration, flatBlocks, prefersDarkMode, startTime, topics],
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
          className={classes.canvasWrapper}
          style={{
            height: topics.length * ROW_HEIGHT,
            width: `calc(${100 * zoom}% - 300px)`,
          }}
        >
          <AutoSizingCanvas draw={drawCallback} />
        </div>

        <TimelineScrubber
          onSeek={onSeek}
          hoverStamp={hoverStamp}
          setHoverStamp={setHoverStamp}
          sidebarWidth={SIDEBAR_WITDH}
          height={topics.length * ROW_HEIGHT}
          zoom={zoom}
        />

        <Paper className={classes.sidebar}>
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
        </Paper>
      </Stack>
    </>
  );
}
