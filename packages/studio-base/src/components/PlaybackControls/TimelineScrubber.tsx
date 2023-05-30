// This Source Code Form is subject to the terms of the Mozilla Public
// License, v2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/
import { Fade, Tooltip } from "@mui/material";
import { Instance } from "@popperjs/core";
import {
  useCallback,
  useRef,
  useState,
  useEffect,
  Dispatch,
  SetStateAction,
  CSSProperties,
} from "react";
import { useLatest } from "react-use";
import { makeStyles } from "tss-react/mui";
import { v4 as uuidv4 } from "uuid";

import {
  subtract as subtractTimes,
  add as addTimes,
  toSec,
  fromSec,
  Time,
} from "@foxglove/rostime";
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

const useStyles = makeStyles()((theme) => ({
  marker: {
    backgroundColor: theme.palette.action.active,
    position: "absolute",
    height: "100%",
    borderRadius: 1,
    width: 2,
    zIndex: theme.zIndex.appBar,
  },
}));

const selectStartTime = (ctx: MessagePipelineContext) => ctx.playerState.activeData?.startTime;
const selectCurrentTime = (ctx: MessagePipelineContext) => ctx.playerState.activeData?.currentTime;
const selectEndTime = (ctx: MessagePipelineContext) => ctx.playerState.activeData?.endTime;

export function TimelineScrubber({
  height,
  zoom,
  onSeek,
  hoverStamp,
  setHoverStamp,
  sidebarWidth,
}: {
  zoom: number;
  height: CSSProperties["height"];
  sidebarWidth: number;
  hoverStamp?: Time;
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

  const popperRef = React.useRef<Instance>(ReactNull);

  const positionRef = React.useRef({ x: 0, y: 0 });

  const handlePointerMove = (event: React.PointerEvent) => {
    positionRef.current = { x: event.clientX, y: event.clientY };

    if (popperRef.current != undefined) {
      void popperRef.current.update();
    }
  };

  return (
    <Tooltip
      title={hoverStamp != undefined ? <PlaybackControlsTooltipContent stamp={hoverStamp} /> : ""}
      placement="top"
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
              // Offset popper to hug the track better.
              offset: [0, 0],
            },
          },
        ],
        anchorEl: {
          getBoundingClientRect: () => {
            return new DOMRect(
              positionRef.current.x,
              hoverElRef.current?.getBoundingClientRect().y ?? 0,
              0,
              0,
            );
          },
        },
      }}
    >
      <Stack
        position="absolute"
        flex="auto"
        style={{
          top: 0,
          right: 0,
          bottom: 0,
          left: sidebarWidth,
          height,
          minHeight: "100%",
          width: `calc(${zoom * 100}% - ${sidebarWidth}px)`,
        }}
        ref={hoverElRef}
        onPointerMove={handlePointerMove}
      >
        <Slider
          disabled={min == undefined || max == undefined}
          fraction={fraction}
          onHoverOver={onHoverOver}
          onHoverOut={onHoverOut}
          onChange={onChange}
          renderSlider={renderSlider}
        />
        <PlaybackBarHoverTicks fullHeight componentId={hoverComponentId} />
      </Stack>
    </Tooltip>
  );
}
