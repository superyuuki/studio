// This Source Code Form is subject to the terms of the Mozilla Public
// License, v2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/

import { DismissCircle12Filled, Search16Filled } from "@fluentui/react-icons";
import { Fade, IconButton, TextField, Tooltip, Typography, useTheme } from "@mui/material";
import { Instance } from "@popperjs/core";
import { Fzf, FzfResultItem } from "fzf";
import { clamp, orderBy } from "lodash";
import { useCallback, useRef, useState, useMemo, useEffect, Dispatch, SetStateAction } from "react";
import { useLatest } from "react-use";
import tc, { ColorInput } from "tinycolor2";
import { makeStyles } from "tss-react/mui";
import { v4 as uuidv4 } from "uuid";

import {
  subtract as subtractTimes,
  add as addTimes,
  toSec,
  fromSec,
  Time,
} from "@foxglove/rostime";
import AutoSizingCanvas from "@foxglove/studio-base/components/AutoSizingCanvas";
import EmptyState from "@foxglove/studio-base/components/EmptyState";
import { FzfHighlightChars } from "@foxglove/studio-base/components/FzfHighlightChars";
import {
  MessagePipelineContext,
  useMessagePipeline,
} from "@foxglove/studio-base/components/MessagePipeline";
import PlaybackBarHoverTicks from "@foxglove/studio-base/components/PlaybackControls/PlaybackBarHoverTicks";
import { PlaybackControlsTooltipContent } from "@foxglove/studio-base/components/PlaybackControls/PlaybackControlsTooltipContent";
import Slider from "@foxglove/studio-base/components/PlaybackControls/Slider";
import Stack from "@foxglove/studio-base/components/Stack";
import {
  useClearHoverValue,
  useSetHoverValue,
} from "@foxglove/studio-base/context/TimelineInteractionStateContext";
import { PlayerPresence, TopicStats } from "@foxglove/studio-base/players/types";
import { Topic } from "@foxglove/studio-base/src/players/types";
import { expandedLineColors } from "@foxglove/studio-base/util/plotColors";
import { fonts } from "@foxglove/studio-base/util/sharedStyleConstants";

const useStyles = makeStyles()((theme) => ({
  marker: {
    backgroundColor: theme.palette.action.active,
    position: "absolute",
    height: "100%",
    borderRadius: 1,
    width: 2,
    zIndex: theme.zIndex.appBar,
  },
  root: {
    position: "relative",
    borderTop: `1px solid ${theme.palette.divider}`,
    backgroundColor: theme.palette.background.default,
  },
  statusBar: {
    backgroundColor: theme.palette.background.paper,
    borderBlock: `1px solid ${theme.palette.divider}`,
    cursor: "ns-resize",
  },
  textField: {
    width: 220,
  },
  startAdornment: {
    display: "flex",
  },
}));

const ROW_HEIGHT = 50;

const DRAWER_HEIGHT_MIN = 100;
const DRAWER_HEIGHT_MAX = 2044;

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

type TopicWithStats = Topic & Partial<TopicStats>;

const topicToFzfResult = (item: TopicWithStats) =>
  ({
    item,
    score: 0,
    positions: new Set<number>(),
    start: 0,
    end: 0,
  } as FzfResultItem<TopicWithStats>);

const selectSortedTopics = ({ sortedTopics }: MessagePipelineContext) => sortedTopics;
const selectStartTime = (ctx: MessagePipelineContext) => ctx.playerState.activeData?.startTime;
const selectCurrentTime = (ctx: MessagePipelineContext) => ctx.playerState.activeData?.currentTime;
const selectEndTime = (ctx: MessagePipelineContext) => ctx.playerState.activeData?.endTime;
const selectPresence = (ctx: MessagePipelineContext) => ctx.playerState.presence;

type Props = {
  onSeek: (seekTo: Time) => void;
};

export function TimelineDrawer(props: Props): JSX.Element {
  const { onSeek } = props;
  const { classes } = useStyles();

  const [drawerHeight, setDrawerHeight] = useState(200);
  const [filterText, setFilterText] = useState<string>("");

  const playerPresence = useMessagePipeline(selectPresence);

  const [hoverStamp, setHoverStamp] = useState<Time | undefined>();

  // const loading =
  //   playerPresence === PlayerPresence.INITIALIZING || playerPresence === PlayerPresence.BUFFERING;

  const topics = useMessagePipeline(selectSortedTopics);

  const filteredTopics: FzfResultItem<Topic>[] = useMemo(
    () =>
      filterText
        ? new Fzf(topics, {
            fuzzy: filterText.length > 2 ? "v2" : false,
            sort: true,
            selector: (item) => `${item.name}|${item.schemaName}`,
          }).find(filterText)
        : topics.map((item) => topicToFzfResult(item)),
    [filterText, topics],
  );

  const dragStart = useRef({ x: 0, y: 0, height: 0 });
  const popperRef = useRef<Instance>(ReactNull);
  const positionRef = useRef({ x: 0, y: 0 });

  const handlePointerMove = useCallback((event: React.PointerEvent) => {
    positionRef.current = { x: event.clientX, y: event.clientY };

    if (popperRef.current != undefined) {
      void popperRef.current.update();
    }
  }, []);

  const dragHandleMove = useCallback((event: React.PointerEvent) => {
    if (event.buttons !== 1) {
      // https://developer.mozilla.org/en-US/docs/Web/API/Pointer_events#determining_button_states
      return;
    }
    const delta = event.clientY - dragStart.current.y;
    const newHeight = clamp(dragStart.current.height - delta, DRAWER_HEIGHT_MIN, DRAWER_HEIGHT_MAX);
    setDrawerHeight(newHeight);
  }, []);

  const dragHandleDown = useCallback(
    (event: React.PointerEvent) => {
      event.currentTarget.setPointerCapture(event.pointerId);
      dragStart.current = { x: event.clientX, y: event.clientY, height: drawerHeight };
    },
    [drawerHeight],
  );

  const dragHandleUp = useCallback((event: React.PointerEvent) => {
    event.currentTarget.releasePointerCapture(event.pointerId);
  }, []);

  return (
    <Tooltip
      title={hoverStamp != undefined ? <PlaybackControlsTooltipContent stamp={hoverStamp} /> : ""}
      placement="top"
      arrow={false}
      disableInteractive
      TransitionComponent={Fade}
      TransitionProps={{ timeout: 0 }}
      PopperProps={{
        popperRef,
        modifiers: [
          {
            name: "computeStyles",
            options: {
              gpuAcceleration: false, // Fixes hairline seam on arrow in chrome.
            },
          },
          {
            name: "offset",
            options: {
              offset: [0, -10], // Offset popper to hug the track better.
            },
          },
        ],
        anchorEl: {
          getBoundingClientRect: () => {
            return new DOMRect(positionRef.current.x, positionRef.current.y, 0, 0);
          },
        },
      }}
    >
      <Stack
        onPointerMove={handlePointerMove}
        className={classes.root}
        style={{ height: drawerHeight }}
        overflow="hidden"
        position="relative"
      >
        <Stack
          flex="none"
          direction="row"
          justifyContent="space-between"
          padding={1}
          className={classes.statusBar}
          onPointerDown={dragHandleDown}
          onPointerMove={dragHandleMove}
          onPointerUp={dragHandleUp}
        >
          <TextField
            id="topic-filter"
            variant="filled"
            className={classes.textField}
            disabled={playerPresence !== PlayerPresence.PRESENT}
            onChange={(event) => setFilterText(event.target.value)}
            value={filterText}
            placeholder="Filter by topic or datatype…"
            InputProps={{
              size: "small",
              startAdornment: (
                <label htmlFor="topic-filter" className={classes.startAdornment}>
                  <Search16Filled fontSize="small" />
                </label>
              ),
              endAdornment: filterText && (
                <IconButton
                  size="small"
                  title="Clear search"
                  onClick={() => setFilterText("")}
                  edge="end"
                >
                  <DismissCircle12Filled fontSize="small" />
                </IconButton>
              ),
            }}
          />
        </Stack>
        {filteredTopics.length > 0 ? (
          <Timeline
            topics={orderBy(filteredTopics, (topic) => topic.item.schemaName, ["desc"])}
            onSeek={onSeek}
            setHoverStamp={setHoverStamp}
          />
        ) : (
          <EmptyState>
            {playerPresence === PlayerPresence.PRESENT && filterText
              ? `No topics or datatypes matching \n “${filterText}”`
              : "No topics available. "}
            {playerPresence === PlayerPresence.RECONNECTING && "Waiting for connection"}
          </EmptyState>
        )}
      </Stack>
    </Tooltip>
  );
}

export function TimelineScrubber({
  height,
  onSeek,
  setHoverStamp,
  drawerWidth,
}: {
  height: number;
  drawerWidth: number;
  setHoverStamp: Dispatch<SetStateAction<Time | undefined>>;
  onSeek: (seekTo: Time) => void;
}): JSX.Element {
  const { classes } = useStyles();
  const [hoverComponentId] = useState<string>(() => uuidv4());
  const hoverElRef = useRef<HTMLDivElement>(ReactNull);

  const startTime = useMessagePipeline(selectStartTime);
  const currentTime = useMessagePipeline(selectCurrentTime);
  const endTime = useMessagePipeline(selectEndTime);

  const setHoverValue = useSetHoverValue();

  const latestStartTime = useLatest(startTime);
  const latestEndTime = useLatest(endTime);

  const onChange = useCallback(
    (fraction: number) => {
      if (!latestStartTime.current || !latestEndTime.current) {
        return;
      }
      onSeek(
        addTimes(
          latestStartTime.current,
          fromSec(fraction * toSec(subtractTimes(latestEndTime.current, latestStartTime.current))),
        ),
      );
    },
    [onSeek, latestEndTime, latestStartTime],
  );

  const clearHoverValue = useClearHoverValue();

  const onHoverOut = useCallback(() => {
    clearHoverValue(hoverComponentId);
  }, [clearHoverValue, hoverComponentId]);

  // Clean up the hover value when we are unmounted -- important for storybook.
  useEffect(() => onHoverOut, [onHoverOut]);

  const onHoverOver = useCallback(
    (fraction: number) => {
      if (!latestStartTime.current || !latestEndTime.current || hoverElRef.current == undefined) {
        return;
      }
      const duration = toSec(subtractTimes(latestEndTime.current, latestStartTime.current));
      const timeFromStart = fromSec(fraction * duration);
      setHoverStamp(addTimes(latestStartTime.current, timeFromStart));
      setHoverValue({
        componentId: hoverComponentId,
        type: "PLAYBACK_SECONDS",
        value: toSec(timeFromStart),
      });
    },
    [hoverComponentId, latestEndTime, latestStartTime, setHoverStamp, setHoverValue],
  );

  const renderSlider = useCallback(
    (val?: number) => {
      if (val == undefined) {
        return undefined;
      }
      return <div className={classes.marker} style={{ left: `${val * 100}%` }} />;
    },
    [classes.marker],
  );

  const min = startTime && toSec(startTime);
  const max = endTime && toSec(endTime);
  const fraction =
    currentTime && startTime && endTime
      ? toSec(subtractTimes(currentTime, startTime)) / toSec(subtractTimes(endTime, startTime))
      : undefined;

  return (
    <Stack
      position="absolute"
      flex="auto"
      style={{ top: 0, right: 0, bottom: 0, left: drawerWidth, height }}
      // ref={hoverElRef}
    >
      <Slider
        disabled={min == undefined || max == undefined}
        fraction={fraction}
        onHoverOver={onHoverOver}
        onHoverOut={onHoverOut}
        onChange={onChange}
        renderSlider={renderSlider}
      />
      <PlaybackBarHoverTicks componentId={hoverComponentId} />
    </Stack>
  );
}

export function Timeline({
  topics = [],
  setHoverStamp,
  onSeek,
}: {
  topics?: FzfResultItem<Topic>[];
  setHoverStamp: Dispatch<SetStateAction<Time | undefined>>;
  onSeek: (seekTo: Time) => void;
}): JSX.Element {
  const theme = useTheme();
  const positionRef = useRef({ x: 0, y: 0 });

  const handlePointerMove = useCallback((event: React.PointerEvent) => {
    positionRef.current = { x: event.clientX, y: event.clientY };
  }, []);

  const drawCallback = useCallback(
    (ctx: CanvasRenderingContext2D, width: number, _height: number) => {
      const augmentColor = (color: ColorInput) => {
        const colorMode = theme.palette.mode === "dark" ? "darken" : "lighten";
        const threshold = theme.palette.mode === "dark" ? 35 : 5;

        return tc(color)[colorMode](threshold).toString();
      };

      topics.map(({ item: topic }, idx) => {
        if (topic.schemaName != undefined) {
          ctx.fillStyle = augmentColor(expandedLineColors[schemaMapping[topic.schemaName]]!);
          ctx.fillRect(0, ROW_HEIGHT * idx, width, ROW_HEIGHT);

          ctx.strokeStyle = theme.palette.background.default;
          ctx.strokeRect(0, ROW_HEIGHT * idx, width, ROW_HEIGHT);
        }
      });
      ctx.save();
    },
    [theme, topics],
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
          setHoverStamp={setHoverStamp}
          drawerWidth={300}
          height={topics.length * ROW_HEIGHT}
        />

        <div onPointerMove={handlePointerMove}>
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
              <Typography variant="body2">
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
