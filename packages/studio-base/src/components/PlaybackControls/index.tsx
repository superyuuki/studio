// This Source Code Form is subject to the terms of the Mozilla Public
// License, v2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/
//
// This file incorporates work covered by the following copyright and
// permission notice:
//
//   Copyright 2018-2021 Cruise LLC
//
//   This source code is licensed under the Apache License, Version 2.0,
//   found at http://www.apache.org/licenses/LICENSE-2.0
//   You may not use this file except in compliance with the License.

import {
  Pause20Filled,
  Pause20Regular,
  Play20Filled,
  Play20Regular,
  Next20Filled,
  Next20Regular,
  Previous20Filled,
  Previous20Regular,
  Info24Regular,
  ArrowRepeatAll20Regular,
  ArrowRepeatAllOff20Regular,
} from "@fluentui/react-icons";
import { Collapse, Tooltip } from "@mui/material";
import { useCallback, useMemo, useState } from "react";
import { makeStyles } from "tss-react/mui";

import { compare, Time } from "@foxglove/rostime";
import { AppSetting } from "@foxglove/studio-base/AppSetting";
import { CreateEventDialog } from "@foxglove/studio-base/components/CreateEventDialog";
import { DataSourceInfoView } from "@foxglove/studio-base/components/DataSourceInfoView";
import EventIcon from "@foxglove/studio-base/components/EventIcon";
import EventOutlinedIcon from "@foxglove/studio-base/components/EventOutlinedIcon";
import HoverableIconButton from "@foxglove/studio-base/components/HoverableIconButton";
import KeyListener from "@foxglove/studio-base/components/KeyListener";
import {
  MessagePipelineContext,
  useMessagePipeline,
} from "@foxglove/studio-base/components/MessagePipeline";
import PlaybackSpeedControls from "@foxglove/studio-base/components/PlaybackSpeedControls";
import Stack from "@foxglove/studio-base/components/Stack";
import { TimelineDrawer } from "@foxglove/studio-base/components/TimelineDrawer";
import { useCurrentUser } from "@foxglove/studio-base/context/CurrentUserContext";
import { EventsStore, useEvents } from "@foxglove/studio-base/context/EventsContext";
import {
  useWorkspaceStore,
  WorkspaceContextStore,
} from "@foxglove/studio-base/context/Workspace/WorkspaceContext";
import { useWorkspaceActions } from "@foxglove/studio-base/context/Workspace/useWorkspaceActions";
import { useAppConfigurationValue } from "@foxglove/studio-base/hooks";
import { Player, PlayerPresence } from "@foxglove/studio-base/players/types";

import PlaybackTimeDisplay from "./PlaybackTimeDisplay";
import { RepeatAdapter } from "./RepeatAdapter";
import Scrubber from "./Scrubber";
import { jumpSeek, DIRECTION } from "./sharedHelpers";

const useStyles = makeStyles()((theme) => ({
  root: {
    display: "flex",
    flexDirection: "column",
    padding: theme.spacing(1),
    position: "sticky",
    bottom: 0,
    backgroundColor: theme.palette.background.paper,
    borderTop: `1px solid ${theme.palette.divider}`,
    zIndex: 100000,
  },
  popper: {
    "&[data-popper-placement*=top] .MuiTooltip-tooltip": {
      margin: theme.spacing(0.5, 0.5, 0.75),
    },
  },
  dataSourceInfoButton: {
    cursor: "default",
  },
}));

const selectPresence = (ctx: MessagePipelineContext) => ctx.playerState.presence;
const selectEventsSupported = (store: EventsStore) => store.eventsSupported;
const selectPlaybackRepeat = (store: WorkspaceContextStore) => store.playbackControls.repeat;

export default function PlaybackControls(props: {
  play: NonNullable<Player["startPlayback"]>;
  pause: NonNullable<Player["pausePlayback"]>;
  seek: NonNullable<Player["seekPlayback"]>;
  playUntil?: Player["playUntil"];
  isPlaying: boolean;
  getTimeInfo: () => { startTime?: Time; endTime?: Time; currentTime?: Time };
}): JSX.Element {
  const { play, pause, seek, isPlaying, getTimeInfo, playUntil } = props;
  const presence = useMessagePipeline(selectPresence);
  const [enableNewTopNav = false] = useAppConfigurationValue<boolean>(AppSetting.ENABLE_NEW_TOPNAV);
  const [showDetailedPlaybackBar = false, setShowDetailedPlaybackBar] =
    useAppConfigurationValue<boolean>(AppSetting.SHOW_DETAILED_PLAYBACK_BAR);

  const { classes, cx } = useStyles();
  const repeat = useWorkspaceStore(selectPlaybackRepeat);
  const [createEventDialogOpen, setCreateEventDialogOpen] = useState(false);
  const { currentUser } = useCurrentUser();
  const eventsSupported = useEvents(selectEventsSupported);

  const {
    playbackControlActions: { setRepeat },
  } = useWorkspaceActions();

  const toggleRepeat = useCallback(() => {
    setRepeat((old) => !old);
  }, [setRepeat]);

  const togglePlayPause = useCallback(() => {
    if (isPlaying) {
      pause();
    } else {
      const { startTime: start, endTime: end, currentTime: current } = getTimeInfo();
      // if we are at the end, we need to go back to start
      if (current && end && start && compare(current, end) >= 0) {
        seek(start);
      }
      play();
    }
  }, [isPlaying, pause, getTimeInfo, play, seek]);

  const seekForwardAction = useCallback(
    (ev?: KeyboardEvent) => {
      const { currentTime } = getTimeInfo();
      if (!currentTime) {
        return;
      }

      // If playUntil is available, we prefer to use that rather than seek, which performs a jump
      // seek.
      //
      // Playing forward up to the desired seek time will play all messages to the panels which
      // mirrors the behavior panels would expect when playing without stepping. This behavior is
      // important for some message types which convey state information.
      //
      // i.e. Skipping coordinate frame messages may result in incorrectly rendered markers or
      // missing markers altogther.
      const targetTime = jumpSeek(DIRECTION.FORWARD, currentTime, ev);

      if (playUntil) {
        playUntil(targetTime);
      } else {
        seek(targetTime);
      }
    },
    [getTimeInfo, playUntil, seek],
  );

  const seekBackwardAction = useCallback(
    (ev?: KeyboardEvent) => {
      const { currentTime } = getTimeInfo();
      if (!currentTime) {
        return;
      }
      seek(jumpSeek(DIRECTION.BACKWARD, currentTime, ev));
    },
    [getTimeInfo, seek],
  );

  const keyDownHandlers = useMemo(
    () => ({
      " ": togglePlayPause,
      ArrowLeft: (ev: KeyboardEvent) => {
        seekBackwardAction(ev);
      },
      ArrowRight: (ev: KeyboardEvent) => {
        seekForwardAction(ev);
      },
    }),
    [seekBackwardAction, seekForwardAction, togglePlayPause],
  );

  const toggleCreateEventDialog = useCallback(() => {
    pause();
    setCreateEventDialogOpen((open) => !open);
  }, [pause]);

  const disableControls = presence === PlayerPresence.ERROR;

  return (
    <>
      <RepeatAdapter play={play} seek={seek} repeatEnabled={repeat} />
      <KeyListener global keyDownHandlers={keyDownHandlers} />
      <Collapse in={showDetailedPlaybackBar} unmountOnExit>
        {showDetailedPlaybackBar && <TimelineDrawer onSeek={seek} />}
      </Collapse>
      <div className={classes.root}>
        {!showDetailedPlaybackBar && <Scrubber onSeek={seek} />}
        <Stack direction="row" alignItems="center" flex={1} gap={1} overflowX="auto">
          <Stack direction="row" flex={1} gap={0.5}>
            {currentUser && eventsSupported && (
              <HoverableIconButton
                size="small"
                title="Create event"
                icon={<EventOutlinedIcon />}
                activeIcon={<EventIcon />}
                onClick={toggleCreateEventDialog}
              />
            )}
            {enableNewTopNav && (
              <>
                <Tooltip
                  classes={{ popper: classes.popper }}
                  title={
                    <Stack paddingY={0.75}>
                      <DataSourceInfoView disableSource />
                    </Stack>
                  }
                >
                  <HoverableIconButton
                    className={cx({ "Mui-disabled": presence !== PlayerPresence.PRESENT })}
                    size="small"
                    icon={<Info24Regular />}
                  />
                </Tooltip>
                <HoverableIconButton
                  className={classes.dataSourceInfoButton}
                  onClick={async () => await setShowDetailedPlaybackBar(!showDetailedPlaybackBar)}
                  disabled={presence !== PlayerPresence.PRESENT}
                  size="small"
                  color={showDetailedPlaybackBar ? "primary" : "inherit"}
                  icon={
                    <svg viewBox="0 0 24 24">
                      <path
                        d="m18.61,4.13H5.11c-1.79,0-3.25,1.46-3.25,3.25v9.5c0,1.79,1.46,3.25,3.25,3.25h13.5c1.79,0,3.25-1.46,3.25-3.25V7.38c0-1.79-1.46-3.25-3.25-3.25Zm-6.38,6.33h1.47v3.33h-1.47v-3.33Zm-8.88,0h1.47v3.33h-1.47v-3.33Zm3.69,8.17h-1.94c-.97,0-1.75-.78-1.75-1.75v-1.58h3.69v3.33Zm0-4.83h-1.47v-3.33h1.47v3.33Zm4.44,4.83h-3.69v-3.33h3.69v3.33Zm-3.69-4.83v-3.33h1.47v3.33h-1.47Zm3.69,0h-1.47v-3.33h1.47v3.33Zm0-4.83H3.36v-1.58c0-.97.78-1.75,1.75-1.75h6.38v3.33Zm4.44,9.67h-3.69v-3.33h3.69v3.33Zm0-4.83h-1.47v-3.33h1.47v3.33Zm4.44,3.08c0,.97-.78,1.75-1.75,1.75h-1.94v-3.33h3.69v1.58Zm-3.69-3.08v-3.33h1.47v3.33h-1.47Zm3.69,0h-1.47v-3.33h1.47v3.33Zm0-4.83h-8.12v-3.33h6.38c.97,0,1.75.78,1.75,1.75v1.58Z"
                        fill="currentColor"
                      />
                    </svg>
                  }
                />
              </>
            )}
            <PlaybackTimeDisplay onSeek={seek} onPause={pause} />
          </Stack>
          <Stack direction="row" alignItems="center" gap={1}>
            <HoverableIconButton
              disabled={disableControls}
              size="small"
              title="Seek backward"
              icon={<Previous20Regular />}
              activeIcon={<Previous20Filled />}
              onClick={() => seekBackwardAction()}
            />
            <HoverableIconButton
              disabled={disableControls}
              size="small"
              title={isPlaying ? "Pause" : "Play"}
              onClick={togglePlayPause}
              icon={isPlaying ? <Pause20Regular /> : <Play20Regular />}
              activeIcon={isPlaying ? <Pause20Filled /> : <Play20Filled />}
            />
            <HoverableIconButton
              disabled={disableControls}
              size="small"
              title="Seek forward"
              icon={<Next20Regular />}
              activeIcon={<Next20Filled />}
              onClick={() => seekForwardAction()}
            />
          </Stack>
          <Stack direction="row" flex={1} alignItems="center" justifyContent="flex-end" gap={0.5}>
            <HoverableIconButton
              size="small"
              title="Loop playback"
              color={repeat ? "primary" : "inherit"}
              onClick={toggleRepeat}
              icon={repeat ? <ArrowRepeatAll20Regular /> : <ArrowRepeatAllOff20Regular />}
            />
            <PlaybackSpeedControls />
          </Stack>
        </Stack>
        {createEventDialogOpen && eventsSupported && (
          <CreateEventDialog onClose={toggleCreateEventDialog} />
        )}
      </div>
    </>
  );
}
