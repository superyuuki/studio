// This Source Code Form is subject to the terms of the Mozilla Public
// License, v2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/

import {
  DismissCircle12Filled,
  Search12Filled,
  ZoomIn16Regular,
  ZoomOut16Regular,
} from "@fluentui/react-icons";
import { Button, IconButton, Link, Slider, TextField, sliderClasses } from "@mui/material";
import { Instance } from "@popperjs/core";
import { Fzf, FzfResultItem } from "fzf";
import { clamp, orderBy } from "lodash";
import { useCallback, useRef, useState, useMemo } from "react";
import { makeStyles } from "tss-react/mui";

import { Time } from "@foxglove/rostime";
import EmptyState from "@foxglove/studio-base/components/EmptyState";
import {
  MessagePipelineContext,
  useMessagePipeline,
} from "@foxglove/studio-base/components/MessagePipeline";
import { Timeline } from "@foxglove/studio-base/components/PlaybackControls/Timeline";
import Stack from "@foxglove/studio-base/components/Stack";
import { PlayerPresence, TopicStats } from "@foxglove/studio-base/players/types";
import { Topic } from "@foxglove/studio-base/src/players/types";

const useStyles = makeStyles()((theme) => ({
  root: {
    position: "relative",
    borderTop: `1px solid ${theme.palette.divider}`,
    backgroundColor: theme.palette.background.default,
  },
  statusBar: {
    backgroundColor: theme.palette.background.paper,
    borderBlock: `1px solid ${theme.palette.divider}`,
  },
  dragHandle: {
    cursor: "ns-resize",
  },
  textField: {
    width: 220,
  },
  startAdornment: {
    display: "flex",
  },
  clearIcon: {
    fontSize: 12,

    "svg:not(.MuiSvgIcon-root)": {
      fontSize: "1em",
      height: "1em",
      width: "1em",
    },
  },
  resetButton: {
    padding: theme.spacing(0.5, 0.75),
  },
  slider: {
    [`.${sliderClasses.thumb}`]: {
      ":hover": {
        boxShadow: "none",
      },
      [`&.${sliderClasses.focusVisible}`]: {
        boxShadow: "none",
      },
    },
  },
}));

const DRAWER_HEIGHT_MIN = 100;
const DRAWER_HEIGHT_MAX = 2044;

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
const selectPresence = (ctx: MessagePipelineContext) => ctx.playerState.presence;

export function TimelineDrawer(props: { onSeek: (seekTo: Time) => void }): JSX.Element {
  const { onSeek } = props;
  const { classes } = useStyles();

  const [zoom, setZoom] = useState<number>(1);
  const [drawerHeight, setDrawerHeight] = useState(200);
  const [filterText, setFilterText] = useState<string>("");

  const handleZoom = (_event: Event, newValue: number | number[]) => {
    setZoom(newValue as number);
  };

  const playerPresence = useMessagePipeline(selectPresence);

  const [hoverStamp, setHoverStamp] = useState<Time | undefined>();

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
      event.stopPropagation();
      event.currentTarget.setPointerCapture(event.pointerId);
      dragStart.current = { x: event.clientX, y: event.clientY, height: drawerHeight };
    },
    [drawerHeight],
  );

  const dragHandleUp = useCallback((event: React.PointerEvent) => {
    event.currentTarget.releasePointerCapture(event.pointerId);
  }, []);

  return (
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
        className={classes.statusBar}
      >
        <Stack padding={1}>
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
                  <Search12Filled fontSize="small" />
                </label>
              ),
              endAdornment: filterText && (
                <IconButton
                  className={classes.clearIcon}
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
        <Stack
          flex="auto"
          className={classes.dragHandle}
          onPointerDown={dragHandleDown}
          onPointerMove={dragHandleMove}
          onPointerUp={dragHandleUp}
        />
        <Stack direction="row" alignItems="center" gap={2} padding={1}>
          {zoom > 1 && (
            <Button className={classes.resetButton} onClick={() => setZoom(1)}>
              Reset
            </Button>
          )}
          <ZoomOut16Regular style={{ flex: "none" }} />
          <div style={{ width: 140 }}>
            <Slider
              className={classes.slider}
              size="small"
              value={zoom}
              min={1}
              max={5}
              step={0.5}
              onChange={handleZoom}
            />
          </div>
          <ZoomIn16Regular style={{ flex: "none" }} />
        </Stack>
      </Stack>
      {filteredTopics.length > 0 ? (
        <Timeline
          topics={orderBy(filteredTopics, (topic) => topic.item.schemaName, ["desc"])}
          onSeek={onSeek}
          setHoverStamp={setHoverStamp}
          hoverStamp={hoverStamp}
          zoom={zoom}
        />
      ) : (
        <EmptyState>
          {playerPresence === PlayerPresence.PRESENT && filterText
            ? `No topics or datatypes matching \n “${filterText}” `
            : "No topics available. "}
          {filterText && (
            <Link color="primary" onClick={() => setFilterText("")}>
              Clear filters
            </Link>
          )}
          {playerPresence === PlayerPresence.RECONNECTING && "Waiting for connection"}
        </EmptyState>
      )}
    </Stack>
  );
}
