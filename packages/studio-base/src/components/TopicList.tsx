// This Source Code Form is subject to the terms of the Mozilla Public
// License, v2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/

import {
  AddSquare20Regular,
  ReOrderDotsVertical20Filled,
  SubtractSquare20Regular,
} from "@fluentui/react-icons";
import ClearIcon from "@mui/icons-material/Clear";
import DragIndicatorIcon from "@mui/icons-material/DragIndicator";
import SearchIcon from "@mui/icons-material/Search";
import {
  Box,
  Collapse,
  Divider,
  IconButton,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Skeleton,
  SvgIcon,
  TextField,
  Typography,
  listItemButtonClasses,
  listItemClasses,
  listItemIconClasses,
  listItemSecondaryActionClasses,
  listItemTextClasses,
  outlinedInputClasses,
} from "@mui/material";
import { Fzf, FzfResultItem } from "fzf";
import { Fragment, useMemo, useState } from "react";
import { makeStyles } from "tss-react/mui";

import { MessageDefinitionField } from "@foxglove/message-definition";
import { DirectTopicStatsUpdater } from "@foxglove/studio-base/components/DirectTopicStatsUpdater";
import EmptyState from "@foxglove/studio-base/components/EmptyState";
import { HighlightChars } from "@foxglove/studio-base/components/HighlightChars";
import {
  MessagePipelineContext,
  useMessagePipeline,
} from "@foxglove/studio-base/components/MessagePipeline";
import { PlayerPresence, TopicStats } from "@foxglove/studio-base/players/types";
import { Topic } from "@foxglove/studio-base/src/players/types";
import { fonts } from "@foxglove/studio-base/util/sharedStyleConstants";

type TopicWithStats = Topic & Partial<TopicStats>;

const topicToFzfResult = (item: TopicWithStats) =>
  ({
    item,
    score: 0,
    positions: new Set<number>(),
    start: 0,
    end: 0,
  } as FzfResultItem<TopicWithStats>);

const useStyles = makeStyles()((theme) => ({
  appBar: {
    top: 0,
    zIndex: theme.zIndex.appBar,
    padding: theme.spacing(0.5),
    position: "sticky",
    backgroundColor: theme.palette.background.paper,
  },
  listItem: {
    [`.${listItemButtonClasses.root}`]: {
      paddingInline: 12,
    },
    [`.${listItemSecondaryActionClasses.root}`]: {
      marginRight: theme.spacing(-1),
    },
    [`.${listItemIconClasses.root}`]: {
      minWidth: "auto",
      marginRight: theme.spacing(1.5),
    },
  },
  textField: {
    [`.${outlinedInputClasses.notchedOutline}`]: {
      border: "none",
    },
  },
  aliasedTopicName: {
    color: theme.palette.primary.main,
    display: "block",
    textAlign: "start",
  },
  startAdornment: {
    display: "flex",
  },
}));

const selectPlayerPresence = ({ playerState }: MessagePipelineContext) => playerState.presence;
const selectSortedTopics = ({ sortedTopics }: MessagePipelineContext) => sortedTopics;
const selectDatatypes = ({ datatypes }: MessagePipelineContext) => datatypes;

function TopicListItem({
  topic,
  datatype,
  positions,
  filterText,
}: {
  topic: Topic;
  dataype?: MessageDefinitionField;
  positions: Set<number>;
  filterText: string;
}): JSX.Element {
  const { classes, theme } = useStyles();
  const [expanded, setExpanded] = useState<boolean>(false);

  return (
    <>
      <ListItem
        className={classes.listItem}
        divider
        key={topic.name}
        secondaryAction={
          <div>
            <Typography
              variant="caption"
              color="text.secondary"
              data-topic={topic.name}
              data-topic-stat="count"
              align="right"
              display="block"
            >
              &mdash;
            </Typography>
            <Typography
              variant="caption"
              color="text.secondary"
              data-topic={topic.name}
              data-topic-stat="frequency"
              align="right"
            >
              &mdash;
            </Typography>
          </div>
        }
      >
        <ListItemIcon onClick={() => setExpanded(!expanded)}>
          {datatype.length > 1 ? (
            expanded ? (
              <SubtractSquare20Regular style={{ marginLeft: -6 }} />
            ) : (
              <AddSquare20Regular style={{ marginLeft: -6 }} />
            )
          ) : (
            <SvgIcon style={{ marginLeft: -6 }} />
          )}
        </ListItemIcon>
        <ListItemText
          primary={
            <>
              <HighlightChars str={topic.name} indices={positions} />
              {topic.aliasedFromName && (
                <Typography variant="caption" className={classes.aliasedTopicName}>
                  from {topic.aliasedFromName}
                </Typography>
              )}
            </>
          }
          primaryTypographyProps={{ noWrap: true, title: topic.name }}
          secondary={
            topic.schemaName == undefined ? (
              "—"
            ) : (
              <HighlightChars
                str={topic.schemaName}
                indices={positions}
                offset={topic.name.length + 1}
              />
            )
          }
          secondaryTypographyProps={{
            variant: "caption",
            fontFamily: fonts.MONOSPACE,
            noWrap: true,
            title: topic.schemaName,
          }}
          style={{ marginRight: "48px" }}
        />
      </ListItem>
      {datatype.length > 1 && (
        <Collapse in={expanded} timeout={0}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "36px max-content 1fr 36px",
              backgroundColor: theme.palette.background.default,
            }}
          >
            {datatype.map((field) => {
              return (
                <Box
                  key={field.name}
                  sx={{
                    display: "contents",
                    ":not(:hover) > :nth-last-of-type(1) svg": {
                      visibility: "hidden",
                    },
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      borderBottom: `1px solid ${theme.palette.divider}`,
                      ...theme.typography.body2,
                    }}
                  >
                    {field.isComplex && <AddSquare20Regular />}
                  </div>
                  <div
                    style={{
                      paddingInline: 6,
                      paddingBlock: 6,
                      fontWeight: "bold",
                      borderBottom: `1px solid ${theme.palette.divider}`,
                      ...theme.typography.body2,
                      fontWeight: 500,
                    }}
                  >
                    {field.name}
                  </div>
                  <div
                    style={{
                      paddingInline: 12,
                      paddingBlock: 6,
                      borderBottom: `1px solid ${theme.palette.divider}`,
                      ...theme.typography.body2,
                    }}
                  >
                    {field.type}
                  </div>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      borderBottom: `1px solid ${theme.palette.divider}`,
                      ...theme.typography.body2,
                    }}
                  >
                    {!field.isComplex && <DragIndicatorIcon color="disabled" />}
                  </div>
                </Box>
              );
            })}
          </div>
        </Collapse>
      )}
    </>
  );
}

const MemoTopicListItem = React.memo(TopicListItem);

export function TopicList(): JSX.Element {
  const { classes, cx } = useStyles();
  const [filterText, setFilterText] = useState<string>("");

  const playerPresence = useMessagePipeline(selectPlayerPresence);
  const topics = useMessagePipeline(selectSortedTopics);
  const datatypes = useMessagePipeline(selectDatatypes);

  console.log({ datatypes });

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

  if (playerPresence === PlayerPresence.NOT_PRESENT) {
    return <EmptyState>No data source selected</EmptyState>;
  }

  if (playerPresence === PlayerPresence.ERROR) {
    return <EmptyState>An error occurred</EmptyState>;
  }

  if (playerPresence === PlayerPresence.INITIALIZING) {
    return (
      <>
        <header className={classes.appBar}>
          <TextField
            disabled
            className={classes.textField}
            fullWidth
            placeholder="Waiting for data..."
            InputProps={{
              size: "small",
              startAdornment: <SearchIcon fontSize="small" />,
            }}
          />
        </header>
        <List key="loading" dense disablePadding>
          {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15].map((i) => (
            <ListItem className={cx(classes.listItem, "loading")} divider key={i}>
              <ListItemText
                primary={<Skeleton animation={false} width="20%" />}
                secondary={<Skeleton animation="wave" width="55%" />}
                secondaryTypographyProps={{ variant: "caption" }}
              />
            </ListItem>
          ))}
        </List>
      </>
    );
  }

  return (
    <>
      <header className={classes.appBar}>
        <TextField
          id="topic-filter"
          variant="filled"
          disabled={playerPresence !== PlayerPresence.PRESENT}
          onChange={(event) => setFilterText(event.target.value)}
          value={filterText}
          className={classes.textField}
          fullWidth
          placeholder="Filter by topic or schema name…"
          InputProps={{
            size: "small",
            startAdornment: (
              <label className={classes.startAdornment} htmlFor="topic-filter">
                <SearchIcon fontSize="small" />
              </label>
            ),
            endAdornment: filterText && (
              <IconButton
                size="small"
                title="Clear filter"
                onClick={() => setFilterText("")}
                edge="end"
              >
                <ClearIcon fontSize="small" />
              </IconButton>
            ),
          }}
        />
      </header>

      {filteredTopics.length > 0 ? (
        <List key="topics" dense disablePadding>
          {filteredTopics.map(({ item: topic, positions }) => {
            return (
              <MemoTopicListItem
                key={topic.name}
                filterText={filterText}
                datatype={datatypes.get(topic.schemaName ?? "")?.definitions}
                topic={topic}
                positions={positions}
              />
            );
          })}
        </List>
      ) : (
        <EmptyState>
          {playerPresence === PlayerPresence.PRESENT && filterText
            ? `No topics or datatypes matching \n “${filterText}”`
            : "No topics available. "}
          {playerPresence === PlayerPresence.RECONNECTING && "Waiting for connection"}
        </EmptyState>
      )}
      <DirectTopicStatsUpdater interval={6} />
    </>
  );
}
