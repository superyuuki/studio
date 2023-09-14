// This Source Code Form is subject to the terms of the Mozilla Public
// License, v2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/

import { Add16Filled, ArrowLeft16Filled, Dismiss12Regular } from "@fluentui/react-icons";
import { TabsList, Tab, TabProps, Tabs, buttonClasses, tabClasses } from "@mui/base";
import { IconButton } from "@mui/material";
import { makeStyles } from "tss-react/mui";

import Stack from "@foxglove/studio-base/components/Stack";
import { Script } from "@foxglove/studio-base/panels/NodePlayground/script";
import { UserNodes } from "@foxglove/studio-base/types/panels";

type ToolbarClasses = "action" | "unsavedIcon" | "deleteIcon";

const useStyles = makeStyles<void, ToolbarClasses>()((theme, _params, classes) => {
  const prefersDarkMode = theme.palette.mode === "dark";
  return {
    tab: {
      minWidth: 120,
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

type ToolbarProps = {
  isNodeSaved: boolean;
  nodes: UserNodes;
  selectedNodeId?: string;
  scriptBackStack: Script[];
  addNewNode: () => void;
  deleteNode: (id: string) => void;
  goBack: () => void;
  selectNode: (id: string) => void;
};

type ToolbarTabProps = TabProps & {
  isNodeSaved: boolean;
  deleteNode: (id: string) => void;
  label: string;
  value: string;
};

function ToolbarTab(props: ToolbarTabProps): JSX.Element {
  const { label, isNodeSaved, deleteNode, className, value, children: _children, ...other } = props;
  const { classes, cx } = useStyles();

  return (
    <Tab {...other} className={cx(className, classes.tab)} value={value}>
      {label}
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
  );
}

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
