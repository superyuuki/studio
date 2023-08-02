// This Source Code Form is subject to the terms of the Mozilla Public
// License, v2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/

import {
  AddSquare20Regular,
  // SubtractSquare20Regular,
  ChevronRight16Filled,
  ChevronRight16Regular,
  ChevronDown16Filled,
  ChevronDown16Regular,
} from "@fluentui/react-icons";
import ClearIcon from "@mui/icons-material/Clear";
import DragIndicatorIcon from "@mui/icons-material/DragIndicator";
import SearchIcon from "@mui/icons-material/Search";
import {
  IconButton,
  List,
  ListItem,
  ListItemText,
  Skeleton,
  TextField,
  Typography,
  listItemButtonClasses,
  listItemIconClasses,
  listItemSecondaryActionClasses,
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
import Stack from "@foxglove/studio-base/components/Stack";
import { PlayerPresence } from "@foxglove/studio-base/players/types";
import { Topic } from "@foxglove/studio-base/src/players/types";
import { fonts } from "@foxglove/studio-base/util/sharedStyleConstants";

const useStyles = makeStyles<void, "action" | "gridCell">()((theme, _params, classes) => ({
  appBar: {
    top: 0,
    zIndex: theme.zIndex.appBar,
    padding: theme.spacing(0.5),
    position: "sticky",
    backgroundColor: theme.palette.background.paper,
  },
  grid: {
    display: "grid",
    gridTemplateColumns: "30px minmax(auto, 1fr) minmax(auto, 1fr) auto",
    overflow: "hidden",
  },
  topicRow: {
    display: "contents",
  },
  fieldRow: {
    display: "contents",
    position: "relative",
    overflow: "hidden",

    [`.${classes.gridCell}`]: {
      backgroundColor: theme.palette.action.hover,
    },
    [`:not(:hover) .${classes.action}`]: {
      visibility: "hidden",
    },
    [`:hover > .${classes.gridCell}`]: {
      backgroundColor: theme.palette.action.focus,
    },
  },
  complexRow: {
    [`:hover > .${classes.gridCell}`]: {
      backgroundColor: theme.palette.action.hover,
    },
  },
  gridCell: {
    display: "flex",
    borderBottom: `1px solid ${theme.palette.divider}`,
    padding: theme.spacing(0.5),
    alignItems: "center",

    "&:nth-last-of-type(1)": {
      justifyContent: "flex-end",
    },
  },
  expandButton: {
    justifyContent: "center",
  },
  topicInfo: {
    gridColumn: "span 2",
    display: "flex",
    flexDirection: "column",
    alignItems: "flex-start",
    paddingInlineStart: 0,
    overflow: "hidden",
  },
  fieldName: {},
  fieldType: {},
  action: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    position: "sticky",
    right: 0,
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
      marginRight: theme.spacing(1),
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
}));

const selectPlayerPresence = ({ playerState }: MessagePipelineContext) => playerState.presence;
const selectSortedTopics = ({ sortedTopics }: MessagePipelineContext) => sortedTopics;
const selectDatatypes = ({ datatypes }: MessagePipelineContext) => datatypes;

function TopicListItem({
  topic,
  datatypes,
  fieldDefinitions,
  positions,
  filterText,
}: {
  topic: Topic;
  datatypes?: ReadonlyMap<string, { definitions: MessageDefinitionField[] }>;
  fieldDefinitions?: readonly MessageDefinitionField[];
  positions: Set<number>;
  filterText: string;
}): JSX.Element {
  const { classes, cx, theme } = useStyles();
  const [expanded, setExpanded] = useState<boolean>(false);
  const [hovered, setHovered] = useState<boolean>(false);

  const handleMouseEnter = () => setHovered(true);
  const handleMouseLeave = () => setHovered(false);

  const expandIcon = useMemo(() => {
    if (expanded) {
      return hovered ? <ChevronDown16Filled /> : <ChevronDown16Regular />;
    }
    return hovered ? <ChevronRight16Filled /> : <ChevronRight16Regular />;
  }, [expanded, hovered]);

  return (
    <>
      <div
        key={topic.name}
        className={classes.topicRow}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        onClick={() => setExpanded(!expanded)}
      >
        <div className={cx(classes.gridCell, classes.expandButton)}>{expandIcon}</div>

        <div className={cx(classes.gridCell, classes.topicInfo)}>
          <Typography variant="body2" noWrap title={topic.name}>
            <HighlightChars str={topic.name} indices={positions} />
            {topic.aliasedFromName && (
              <Typography variant="caption" className={classes.aliasedTopicName}>
                from {topic.aliasedFromName}
              </Typography>
            )}
          </Typography>
          <Typography
            variant="caption"
            fontFamily={fonts.MONOSPACE}
            color="text.secondary"
            noWrap
            title={topic.schemaName}
          >
            {topic.schemaName != undefined ? (
              <HighlightChars
                str={topic.schemaName}
                indices={positions}
                offset={topic.name.length + 1}
              />
            ) : (
              "—"
            )}
          </Typography>
        </div>

        <Stack className={classes.gridCell} style={{ alignItems: "flex-end" }}>
          <Typography
            variant="caption"
            color="text.secondary"
            data-topic={topic.name}
            data-topic-stat="count"
            align="right"
            noWrap
          >
            &mdash;
          </Typography>
          <Typography
            variant="caption"
            color="text.secondary"
            data-topic={topic.name}
            data-topic-stat="frequency"
            align="right"
            noWrap
          >
            &mdash;
          </Typography>
        </Stack>
      </div>

      {expanded &&
        fieldDefinitions?.map((field) => (
          <Fragment key={field.name}>
            <div
              className={cx(classes.fieldRow, {
                [classes.complexRow]: field.isComplex === true,
              })}
            >
              {field.isComplex === true && (
                <div className={cx(classes.gridCell, classes.expandButton)}>
                  <AddSquare20Regular />
                </div>
              )}
              <div
                className={cx(classes.gridCell, classes.fieldName)}
                style={
                  field.isComplex !== true
                    ? {
                        gridColumn: "span 2",
                        paddingInlineStart: 8,
                      }
                    : undefined
                }
              >
                <HighlightChars str={field.name} indices={positions} />
              </div>
              <div
                className={cx(classes.gridCell, classes.fieldType)}
                style={
                  field.isComplex === true
                    ? {
                        gridColumn: "span 2",
                        justifyContent: "flex-start",
                      }
                    : undefined
                }
              >
                <Typography
                  variant="caption"
                  fontFamily={fonts.MONOSPACE}
                  color="text.secondary"
                  noWrap
                  title={topic.schemaName}
                >
                  {field.type}
                  {field.isArray === true ? "[]" : ""}
                </Typography>
              </div>
              {field.isComplex !== true && (
                <div className={classes.gridCell}>
                  <div className={classes.action}>
                    <DragIndicatorIcon />
                  </div>
                </div>
              )}
            </div>
            {field.isComplex === true &&
              datatypes?.get(field.type)?.definitions.map((subField) => (
                <div className={classes.fieldRow} key={subField.name}>
                  <div className={cx(classes.gridCell, classes.expandButton)}>
                    {subField.isComplex === true && <AddSquare20Regular />}
                  </div>
                  <div className={cx(classes.gridCell, classes.fieldName)}>
                    <HighlightChars str={subField.name} indices={positions} />
                  </div>
                  <div className={cx(classes.gridCell, classes.fieldType)}>
                    <Typography
                      variant="caption"
                      fontFamily={fonts.MONOSPACE}
                      color="text.secondary"
                      noWrap
                      title={topic.schemaName}
                    >
                      {subField.type}
                      {subField.isArray === true ? "[]" : ""}
                    </Typography>
                  </div>
                  <div className={classes.gridCell}>
                    <div className={classes.action}>
                      {subField.isComplex !== true && <DragIndicatorIcon />}
                    </div>
                  </div>
                </div>
              ))}
          </Fragment>
        ))}
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
      new Fzf(topics, {
        fuzzy: filterText.length > 2 ? "v2" : false,
        sort: true,
        selector: (item) => [item.name, item.schemaName].join("|"),
      }).find(filterText),
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
        <div className={classes.grid}>
          {filteredTopics.map(({ item: topic, positions }) => {
            return (
              <MemoTopicListItem
                key={topic.name}
                datatypes={datatypes}
                filterText={filterText}
                fieldDefinitions={datatypes.get(topic.schemaName ?? "")?.definitions}
                topic={topic}
                positions={positions}
              />
            );
          })}
        </div>
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
