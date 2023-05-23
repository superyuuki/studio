// This Source Code Form is subject to the terms of the Mozilla Public
// License, v2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/

import { Fzf, FzfResultItem } from "fzf";
import { clamp } from "lodash";
import { useCallback, useRef, useState } from "react";
import { useMemo } from "react";
import { makeStyles } from "tss-react/mui";

import AutoSizingCanvas from "@foxglove/studio-base/components/AutoSizingCanvas";
import {
  MessagePipelineContext,
  useMessagePipeline,
} from "@foxglove/studio-base/components/MessagePipeline";
import Stack from "@foxglove/studio-base/components/Stack";
import { TopicStats } from "@foxglove/studio-base/players/types";
import { Topic } from "@foxglove/studio-base/src/players/types";

const useStyles = makeStyles()((theme) => ({
  root: {
    position: "relative",
    borderTop: `1px solid ${theme.palette.divider}`,
    backgroundColor: theme.palette.background.default,
  },
  canvasWrapper: {
    flex: "auto",
  },
  dragHandle: {
    userSelect: "none",
    borderTop: `1px solid ${theme.palette.divider}`,
    cursor: "ns-resize",
    width: "100%",
    position: "sticky",
    top: 0,
    zIndex: theme.zIndex.appBar,
    marginBottom: theme.spacing(-1),
    height: theme.spacing(1),

    ":hover": {
      borderTopWidth: 2,
    },
  },
}));

const ROW_HEIGHT = 60;
const DRAWER_HEIGHT_MIN = 100;
const DRAWER_HEIGHT_MAX = 800;

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

export function Timeline(): JSX.Element {
  const { classes } = useStyles();

  const [drawerHeight, setDrawerHeight] = useState(200);
  const [filterText, setFilterText] = useState<string>("");

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

  const drawCallback = useCallback(
    (ctx: CanvasRenderingContext2D, width: number, height: number) => {
      filteredTopics.map((topic, idx) => {
        ctx.fillStyle = "lime";
        ctx.fillRect(0, ROW_HEIGHT * idx, 100, ROW_HEIGHT * (idx + 1));
      });
    },
    [filteredTopics],
  );

  const dragStart = useRef({ x: 0, y: 0, height: 0 });

  const handlePointerMove = useCallback((event: React.PointerEvent) => {
    if (event.buttons !== 1) {
      // https://developer.mozilla.org/en-US/docs/Web/API/Pointer_events#determining_button_states
      return;
    }
    const delta = event.clientY - dragStart.current.y;
    const newHeight = clamp(dragStart.current.height - delta, DRAWER_HEIGHT_MIN, DRAWER_HEIGHT_MAX);
    setDrawerHeight(newHeight);
  }, []);

  const handlePointerDown = useCallback(
    (event: React.PointerEvent) => {
      event.currentTarget.setPointerCapture(event.pointerId);
      dragStart.current = { x: event.clientX, y: event.clientY, height: drawerHeight };
    },
    [drawerHeight],
  );

  const handlePointerUp = useCallback((event: React.PointerEvent) => {
    event.currentTarget.releasePointerCapture(event.pointerId);
  }, []);

  return (
    <Stack className={classes.root} style={{ height: drawerHeight }}>
      <div
        className={classes.dragHandle}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
      />
      <div className={classes.canvasWrapper}>
        <AutoSizingCanvas draw={drawCallback} />
      </div>
    </Stack>
  );
}
