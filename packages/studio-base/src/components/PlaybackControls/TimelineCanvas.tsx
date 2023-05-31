// This Source Code Form is subject to the terms of the Mozilla Public
// License, v2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/

// This Source Code Form is subject to the terms of the Mozilla Public
// License, v2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/

import { FzfResultItem } from "fzf";
import { mergeWith } from "lodash";
import { memo, useCallback, useMemo } from "react";
import tc, { ColorInput } from "tinycolor2";
import { makeStyles } from "tss-react/mui";

import { subtract as subtractTimes, toSec } from "@foxglove/rostime";
import { useBlocksByTopic } from "@foxglove/studio-base/PanelAPI";
import { MessageBlock } from "@foxglove/studio-base/PanelAPI/useBlocksByTopic";
import AutoSizingCanvas from "@foxglove/studio-base/components/AutoSizingCanvas";
import {
  MessagePipelineContext,
  useMessagePipeline,
} from "@foxglove/studio-base/components/MessagePipeline";
import {
  TIMELINE_ROW_HEIGHT,
  TIMELINE_SIDEBAR_WITDH,
} from "@foxglove/studio-base/components/PlaybackControls/Timeline";
import { Topic } from "@foxglove/studio-base/src/players/types";
import { expandedLineColors } from "@foxglove/studio-base/util/plotColors";
import { toolsColorScheme } from "@foxglove/studio-base/util/toolsColorScheme";

const useStyles = makeStyles()({
  canvasWrapper: {
    top: 0,
    right: 0,
    left: TIMELINE_SIDEBAR_WITDH,
    position: "absolute",
  },
});

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

const backgroundColor = ({ color, darkMode }: { darkMode: boolean; color: ColorInput }) =>
  darkMode ? tc(color).darken(35).toString() : tc(color).lighten(15).toString();

const foregroundColor = ({ color, darkMode }: { darkMode: boolean; color: ColorInput }) =>
  darkMode ? tc(color).toString() : tc(color).darken(20).toString();

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

type BaseProps = {
  topics: readonly FzfResultItem<Topic>[];
  darkMode: boolean;
};

const TimelineCanvasBase = memo<BaseProps>(function TimelineCanvasBase(props: BaseProps) {
  const { darkMode, topics } = props;

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
          darkMode,
        });
        ctx.fillRect(0, TIMELINE_ROW_HEIGHT * idx, width, TIMELINE_ROW_HEIGHT);

        const canvasOffsets: number[] | undefined = flatBlocks[topic.name]?.map(
          (messageEvent) =>
            (toSec(subtractTimes(messageEvent.receiveTime, startTime!)) / duration) * width - 1,
        );

        canvasOffsets?.map((x) => {
          ctx.beginPath();
          ctx.lineWidth = 1;
          ctx.strokeStyle = foregroundColor({
            color: colorForSchema(topic.schemaName),
            darkMode,
          });
          ctx.moveTo(x, TIMELINE_ROW_HEIGHT * idx);
          ctx.lineTo(x, TIMELINE_ROW_HEIGHT * idx + TIMELINE_ROW_HEIGHT);
          ctx.stroke();
        });

        ctx.beginPath();
        ctx.lineWidth = 2;
        ctx.strokeStyle = foregroundColor({
          color: colorForSchema(topic.schemaName),
          darkMode,
        });
        ctx.moveTo(0, TIMELINE_ROW_HEIGHT * idx + TIMELINE_ROW_HEIGHT);
        ctx.lineTo(width, TIMELINE_ROW_HEIGHT * idx + TIMELINE_ROW_HEIGHT);
        ctx.stroke();
      });

      ctx.save();
    },
    [duration, flatBlocks, darkMode, startTime, topics],
  );

  return <AutoSizingCanvas draw={drawCallback} />;
});

export function TimelineCanvas(props: {
  topics: readonly FzfResultItem<Topic>[];
  zoom: number;
}): JSX.Element {
  const { topics, zoom } = props;
  const { classes, theme } = useStyles();
  const darkMode = theme.palette.mode === "dark";

  return (
    <div
      className={classes.canvasWrapper}
      style={{
        height: topics.length * TIMELINE_ROW_HEIGHT,
        width: `calc(${100 * zoom}% - 300px)`,
      }}
    >
      <TimelineCanvasBase darkMode={darkMode} topics={topics} />
    </div>
  );
}
