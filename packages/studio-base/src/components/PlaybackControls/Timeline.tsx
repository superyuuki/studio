// This Source Code Form is subject to the terms of the Mozilla Public
// License, v2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/

import { Paper, Typography } from "@mui/material";
import { FzfResultItem } from "fzf";
import { Dispatch, SetStateAction } from "react";
import { makeStyles } from "tss-react/mui";

import { Time } from "@foxglove/rostime";
import { FzfHighlightChars } from "@foxglove/studio-base/components/FzfHighlightChars";
import { TimelineCanvas } from "@foxglove/studio-base/components/PlaybackControls/TimelineCanvas";
import { TimelineScrubber } from "@foxglove/studio-base/components/PlaybackControls/TimelineScrubber";
import Stack from "@foxglove/studio-base/components/Stack";
import { Topic } from "@foxglove/studio-base/src/players/types";
import { fonts } from "@foxglove/studio-base/util/sharedStyleConstants";

export const TIMELINE_ROW_HEIGHT = 48;
export const TIMELINE_SIDEBAR_WITDH = 300;

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
    height: TIMELINE_ROW_HEIGHT,
  },
  sidebar: {
    display: "flex",
    flexDirection: "column",
    left: 0,
    position: "sticky",
    width: TIMELINE_SIDEBAR_WITDH,
    zIndex: theme.zIndex.appBar,
  },
}));

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
        <TimelineCanvas zoom={zoom} topics={topics} />

        <TimelineScrubber
          onSeek={onSeek}
          hoverStamp={hoverStamp}
          setHoverStamp={setHoverStamp}
          sidebarWidth={TIMELINE_SIDEBAR_WITDH}
          height={topics.length * TIMELINE_ROW_HEIGHT}
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
