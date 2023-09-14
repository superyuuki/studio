// This Source Code Form is subject to the terms of the Mozilla Public
// License, v2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/

import { Add16Filled, ArrowLeft16Filled, Dismiss12Regular } from "@fluentui/react-icons";
import { TabsList, Tab, TabProps, Tabs, buttonClasses, tabClasses } from "@mui/base";
import { ClickAwayListener, IconButton, InputBase, inputBaseClasses } from "@mui/material";
import {
  ChangeEventHandler,
  FocusEventHandler,
  KeyboardEvent,
  KeyboardEventHandler,
  useCallback,
  useState,
} from "react";
import textMetrics from "text-metrics";
import { makeStyles } from "tss-react/mui";

import Stack from "@foxglove/studio-base/components/Stack";
import { Script } from "@foxglove/studio-base/panels/NodePlayground/script";
import { UserNode, UserNodes } from "@foxglove/studio-base/types/panels";
import { fonts } from "@foxglove/studio-base/util/sharedStyleConstants";

const MAX_TAB_WIDTH = 120;
const MIN_ACTIVE_TAB_WIDTH = 40;
const MIN_OTHER_TAB_WIDTH = 14;

type ToolbarClasses = "action" | "unsavedIcon" | "deleteIcon";

let textMeasure: undefined | textMetrics.TextMeasure;

const fontFamily = fonts.SANS_SERIF;
const fontSize = "12px";

function measureText(text: string): number {
  if (textMeasure == undefined) {
    textMeasure = textMetrics.init({ fontFamily, fontSize });
  }
  return textMeasure.width(text) + 3;
}

const useStyles = makeStyles<void, ToolbarClasses>()((theme, _params, classes) => {
  const prefersDarkMode = theme.palette.mode === "dark";
  return {
    input: {
      font: "inherit",

      [`.${inputBaseClasses.input}`]: {
        padding: 0,
      },
    },
    tab: {
      fontSize: theme.typography.body2.fontSize,
      fontWeight: theme.typography.body2.fontWeight,
      minWidth: MIN_OTHER_TAB_WIDTH,
      minHeight: 30,
      color: "inherit",
      cursor: "pointer",
      gap: theme.spacing(1),
      backgroundColor: "transparent",
      padding: theme.spacing(0.75, 1.5),
      border: "none",
      borderRadius: 0,
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",

      ":hover": {
        backgroundColor: theme.palette.action.hover,

        [`.${classes.action}`]: { visibility: "visible" },
      },
      ":focus-visible": {
        outline: `1px solid ${theme.palette.primary.main}`,
        outlineOffset: -1,

        [`.${classes.action}`]: { visibility: "visible" },
      },
      [`&.${tabClasses.selected}`]: {
        backgroundColor: theme.palette.background[prefersDarkMode ? "default" : "paper"],

        [`.${classes.action}`]: { visibility: "visible" },
      },
      [`&.${buttonClasses.disabled}`]: {
        opacity: 0.5,
        cursor: "not-allowed",
      },
    },
    tabs: {
      backgroundColor: theme.palette.background[prefersDarkMode ? "paper" : "default"],
      overflow: "auto",
      maxWidth: "100%",
    },
    tabsList: {
      display: "flex",
    },
    action: {
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      marginRight: theme.spacing(-0.5),
      visibility: "hidden",

      [`.${classes.unsavedIcon}`]: { display: "none" },
    },
    unsaved: {
      visibility: "visible",

      [`.${classes.unsavedIcon}`]: { display: "block" },
      [`.${classes.deleteIcon}`]: { display: "none" },
    },
    deleteIcon: {
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
    },
    unsavedIcon: {
      color: theme.palette.text.secondary,
    },
  };
});

type ToolbarTabProps = TabProps & {
  isNodeSaved: boolean;
  deleteNode: (id: string) => void;
  setUserNodes: (nodes: Partial<UserNodes>) => void;
  selectedNode?: UserNode;
  selectedNodeId?: string;
  nodes: UserNodes;
  label: string;
  value: string;
  tabCount: number;
};

function ToolbarTab(props: ToolbarTabProps): JSX.Element {
  const {
    label,
    isNodeSaved,
    deleteNode,
    className,
    value,
    children: _children,
    setUserNodes,
    selectedNodeId,
    selectedNode,
    nodes,
    tabCount,
    ...other
  } = props;
  const { classes, cx } = useStyles();
  const [editMode, setEditMode] = useState(false);
  const [title, setTitle] = useState(label);

  const onBlur: FocusEventHandler<HTMLInputElement> = useCallback(() => {
    setEditMode(false);
  }, [setEditMode]);

  const onClickAway = useCallback(() => {
    setEditMode(false);
  }, [setEditMode]);

  const onChange: ChangeEventHandler<HTMLInputElement> = useCallback(
    (event) => {
      const name = event.target.value;
      setTitle(name);
      setUserNodes({
        ...nodes,
        [selectedNodeId]: { ...selectedNode, name },
      });
    },
    [nodes, selectedNode, selectedNodeId, setUserNodes],
  );

  const onDoubleClick = useCallback(() => {
    setEditMode(true);
  }, []);

  const onFocus: FocusEventHandler<HTMLInputElement> = useCallback((event) => {
    event.target.select();
  }, []);

  const onKeyDown: KeyboardEventHandler<HTMLInputElement> = useCallback(
    (event: KeyboardEvent) => {
      if (event.key === "Enter" || event.key === "Escape" || event.key === "Tab") {
        setEditMode(false);
      }
      event.stopPropagation();
    },
    [setEditMode],
  );

  const minWidth = editMode
    ? `calc(${[
        `max(${MIN_ACTIVE_TAB_WIDTH}px`,
        `min(
          ${Math.ceil(measureText(title) + 30)}px,
          ${MAX_TAB_WIDTH}px, 100% - ${MIN_OTHER_TAB_WIDTH * (tabCount - 1)}px
        )`,
      ].join(",")})`
    : MIN_OTHER_TAB_WIDTH;

  return (
    <ClickAwayListener onClickAway={onClickAway}>
      <Tab
        {...other}
        onDoubleClick={onDoubleClick}
        className={cx(className, classes.tab)}
        value={value}
        style={{ minWidth }}
      >
        {editMode ? (
          <InputBase
            onBlur={onBlur}
            onChange={onChange}
            onFocus={onFocus}
            onKeyDown={onKeyDown}
            value={title}
            className={classes.input}
          />
        ) : (
          label
        )}
        <div className={cx(classes.action, { [classes.unsaved]: !isNodeSaved })}>
          <div
            role="button"
            className={classes.deleteIcon}
            onClick={(event) => {
              event.stopPropagation();
              deleteNode(value);
            }}
          >
            <Dismiss12Regular />
          </div>
          <svg viewBox="0 0 12 12" height="12" width="12" className={classes.unsavedIcon}>
            <circle fill="currentColor" cx={6} cy={6} r={3} />
          </svg>
        </div>
      </Tab>
    </ClickAwayListener>
  );
}

type ToolbarProps = {
  isNodeSaved: boolean;
  nodes: UserNodes;
  selectedNode?: UserNode;
  selectedNodeId?: string;
  scriptBackStack: Script[];
  addNewNode: () => void;
  deleteNode: (id: string) => void;
  goBack: () => void;
  selectNode: (id: string) => void;
  setUserNodes: (nodes: Partial<UserNodes>) => void;
};

export function Toolbar(props: ToolbarProps): JSX.Element {
  const {
    isNodeSaved,
    nodes,
    selectedNodeId,
    scriptBackStack,
    addNewNode,
    deleteNode,
    goBack,
    selectNode,
    selectedNode,
    setUserNodes,
  } = props;
  const { classes } = useStyles();

  return (
    <Stack direction="row" alignItems="center">
      {scriptBackStack.length > 1 && (
        <IconButton title="Go back" data-testid="go-back" size="small" onClick={goBack}>
          <ArrowLeft16Filled />
        </IconButton>
      )}
      <Tabs
        className={classes.tabs}
        value={selectedNodeId}
        onChange={(_event, newValue) => {
          selectNode(newValue as string);
        }}
      >
        <TabsList className={classes.tabsList}>
          {Object.keys(nodes).map((nodeId) => (
            <ToolbarTab
              key={nodeId}
              value={nodeId}
              isNodeSaved={isNodeSaved}
              deleteNode={deleteNode}
              label={nodes[nodeId]?.name ?? ""}
              selectedNode={selectedNode}
              selectedNodeId={selectedNodeId}
              setUserNodes={setUserNodes}
              nodes={nodes}
              tabCount={Object.keys(nodes).length}
            />
          ))}
        </TabsList>
      </Tabs>
      {/* {selectedNodeId != undefined && selectedNode && (
              <div style={{ position: "relative" }}>
                <Input
                  className={classes.input}
                  size="small"
                  disableUnderline
                  placeholder="script name"
                  value={inputTitle}
                  disabled={!currentScript || currentScript.readOnly}
                  onChange={(ev) => {
                    const newNodeName = ev.target.value;
                    setInputTitle(newNodeName);
                    setUserNodes({
                      ...userNodes,
                      [selectedNodeId]: { ...selectedNode, name: newNodeName },
                    });
                  }}
                  inputProps={{ spellCheck: false, style: inputStyle }}
                />
                {!isNodeSaved && <div className={classes.unsavedDot}></div>}
              </div>
            )} */}
      <IconButton
        title="New node"
        data-testid="new-node"
        size="small"
        onClick={() => {
          addNewNode();
        }}
      >
        <Add16Filled />
      </IconButton>
    </Stack>
  );
}
