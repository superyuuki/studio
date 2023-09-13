// This Source Code Form is subject to the terms of the Mozilla Public
// License, v2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/

import { Add20Regular, ArrowLeft20Regular, Dismiss12Regular } from "@fluentui/react-icons";
import { TabsList, Tab, Tabs, buttonClasses, tabClasses } from "@mui/base";
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
    deleteIcon: {},
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

export function Toolbar({
  isNodeSaved,
  nodes,
  selectedNodeId,
  scriptBackStack,
  addNewNode,
  deleteNode,
  goBack,
  selectNode,
}: ToolbarProps): JSX.Element {
  const { classes, cx } = useStyles();

  return (
    <Stack direction="row" alignItems="center">
      {scriptBackStack.length > 1 && (
        <IconButton title="Go back" data-testid="go-back" size="small" onClick={goBack}>
          <ArrowLeft20Regular />
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
            <Tab className={classes.tab} key={nodeId} value={nodeId}>
              {nodes[nodeId]?.name ?? ""}
              <div className={cx(classes.action, { [classes.unsaved]: !isNodeSaved })}>
                <Dismiss12Regular
                  className={classes.deleteIcon}
                  onClick={() => {
                    deleteNode(nodeId);
                  }}
                />
                <svg viewBox="0 0 12 12" height="12" width="12" className={classes.unsavedIcon}>
                  <circle fill="currentColor" cx={6} cy={6} r={3} />
                </svg>
              </div>
            </Tab>
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
        <Add20Regular />
      </IconButton>
    </Stack>
  );
}
