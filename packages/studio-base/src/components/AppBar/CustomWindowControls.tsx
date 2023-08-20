// This Source Code Form is subject to the terms of the Mozilla Public
// License, v2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/

import CheckBoxOutlineBlankIcon from "@mui/icons-material/CheckBoxOutlineBlank";
import CloseIcon from "@mui/icons-material/Close";
import FilterNoneIcon from "@mui/icons-material/FilterNone";
import MinimizeIcon from "@mui/icons-material/Minimize";
import { IconButton } from "@mui/material";
import { makeStyles } from "tss-react/mui";

import Stack from "@foxglove/studio-base/components/Stack";

export type CustomWindowControlsProps = {
  showCustomWindowControls?: boolean;
  isMaximized?: boolean;
  onMinimizeWindow?: () => void;
  onMaximizeWindow?: () => void;
  onUnmaximizeWindow?: () => void;
  onCloseWindow?: () => void;
};

const useStyles = makeStyles()((theme) => ({
  iconButton: {
    padding: theme.spacing(0.5),
  },
  closeButton: {
    ":hover": {
      backgroundColor: theme.palette.error.main,
    },
  },
}));

export function CustomWindowControls({
  isMaximized = false,
  onMinimizeWindow,
  onMaximizeWindow,
  onUnmaximizeWindow,
  onCloseWindow,
}: Omit<CustomWindowControlsProps, "showCustomWindowControls">): JSX.Element {
  const { classes, cx } = useStyles();
  return (
    <Stack alignItems="center" direction="row" gap={1} paddingX={1}>
      <IconButton
        size="small"
        color="inherit"
        onClick={onMinimizeWindow}
        data-testid="win-minimize"
        className={classes.iconButton}
      >
        <MinimizeIcon fontSize="inherit" />
      </IconButton>

      <IconButton
        size="small"
        color="inherit"
        onClick={isMaximized ? onUnmaximizeWindow : onMaximizeWindow}
        data-testid="win-maximize"
        className={classes.iconButton}
      >
        {isMaximized ? (
          <FilterNoneIcon fontSize="inherit" />
        ) : (
          <CheckBoxOutlineBlankIcon fontSize="inherit" />
        )}
      </IconButton>

      <IconButton
        className={cx(classes.closeButton, classes.iconButton)}
        size="small"
        color="inherit"
        onClick={onCloseWindow}
        data-testid="win-close"
      >
        <CloseIcon fontSize="inherit" />
      </IconButton>
    </Stack>
  );
}
