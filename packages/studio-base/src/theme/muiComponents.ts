// This Source Code Form is subject to the terms of the Mozilla Public
// License, v2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/

import {
  alpha,
  CSSInterpolation,
  Fade,
  Theme,
  dividerClasses,
  listClasses,
  listItemClasses,
  buttonClasses,
} from "@mui/material";
import { CSSProperties } from "react";
import tinycolor from "tinycolor2";

type MuiLabComponents = {
  MuiFocusVisible?: {
    styleOverrides?: {
      root?: CSSProperties;
    };
  };
  MuiToggleButton?: {
    styleOverrides?: {
      root?: CSSProperties;
      label?: CSSInterpolation;
    };
  };
  MuiToggleButtonGroup?: {
    styleOverrides?: {
      root?: CSSProperties;
    };
  };
};

export default function muiComponents(theme: Theme): Theme["components"] & MuiLabComponents {
  const prefersDarkMode = theme.palette.mode === "dark";

  return {
    MuiCssBaseline: {
      styleOverrides: {
        "@global": {
          svg: {
            display: "block",
            maxWidth: "100%",
          },
        },
      },
    },
    MuiAlert: {
      styleOverrides: {
        icon: {
          padding: theme.spacing(0.75, 0),
        },
      },
    },
    MuiAvatar: {
      defaultProps: {
        variant: "rounded",
      },
      styleOverrides: {
        colorDefault: {
          color: "currentColor",
          backgroundColor: theme.palette.action.hover,
        },
      },
    },
    MuiAutocomplete: {
      styleOverrides: {
        root: {
          ".MuiInputBase-root. .MuiAutocomplete-input.MuiInputBase-input": {
            padding: theme.spacing(1, 1.25),
          },
          ".MuiInputBase-root.MuiInputBase-sizeSmall": {
            paddingTop: 0,
            paddingBottom: 0,

            ".MuiAutocomplete-input.MuiInputBase-inputSizeSmall": {
              padding: theme.spacing(0.5, 1),
            },
          },
          ".MuiInputBase-root .MuiAutocomplete-endAdornment": {
            marginRight: theme.spacing(-0.5),
          },
        },
        endAdornment: {
          // top: `calc(50% - ${theme.spacing(1.5)})`,
        },
      },
    },
    MuiFab: {
      defaultProps: {
        color: "inherit",
      },
      styleOverrides: {
        root: {
          boxShadow: theme.shadows[2],
        },
        colorInherit: {
          backgroundColor: theme.palette.background.paper,
        },
      },
    },
    MuiFormControl: {
      defaultProps: {
        variant: "standard",
      },
    },
    MuiBadge: {
      styleOverrides: {
        badge: {
          height: 16,
          minWidth: 16,
          padding: theme.spacing(0, 0.25),
        },
      },
    },
    MuiButton: {
      defaultProps: {
        disableElevation: true,
      },
      styleOverrides: {
        containedInherit: {
          backgroundColor: theme.palette.action.focus,
        },
        sizeSmall: {
          [`&.${buttonClasses.text}`]: {
            fontSize: "0.6875rem",
          },
          [`&.${buttonClasses.contained}`]: {
            fontSize: "0.6875rem",
          },
          [`&.${buttonClasses.outlined}`]: {
            fontSize: "0.6875rem",
          },
        },
        sizeLarge: {
          [`&.${buttonClasses.text}`]: {
            fontSize: "0.875rem",
          },
          [`&.${buttonClasses.contained}`]: {
            fontSize: "0.875rem",
          },
          [`&.${buttonClasses.outlined}`]: {
            fontSize: "0.875rem",
          },
        },
      },
    },
    MuiButtonBase: {
      defaultProps: {
        disableRipple: true,
      },
      styleOverrides: {
        root: {
          transition: "none",
        },
      },
    },
    MuiCard: {
      defaultProps: {
        variant: "outlined",
        square: false,
      },
    },
    MuiCardActionArea: {
      defaultProps: {
        disableRipple: true,
      },
      styleOverrides: {
        focusHighlight: {
          transition: "none",
        },
      },
    },
    MuiCardContent: {
      styleOverrides: {
        root: {
          "&:last-child": {
            paddingBottom: theme.spacing(2),
          },
        },
      },
    },
    MuiCardHeader: {
      defaultProps: {
        titleTypographyProps: {
          variant: "h3",
        },
      },
      styleOverrides: {
        action: {
          alignSelf: undefined,
          marginTop: undefined,
          marginRight: undefined,
        },
      },
    },
    MuiCheckbox: {
      defaultProps: {
        disableRipple: true,
      },
    },
    MuiFormLabel: {
      styleOverrides: {
        root: {
          marginBottom: theme.spacing(0.5),
        },
      },
    },
    MuiTextField: {
      defaultProps: {
        InputLabelProps: {
          shrink: false,
          sx: {
            position: "relative",
            transform: "none",
            marginBottom: 0.5,
          },
        },
      },
    },
    MuiFilledInput: {
      defaultProps: {
        disableUnderline: true,
      },
      styleOverrides: {
        input: {
          height: theme.typography.pxToRem(20),
          fontSize: theme.typography.body1.fontSize,
          padding: theme.spacing(1, 1.25),
        },
        inputSizeSmall: {
          fontSize: theme.typography.body2.fontSize,
          padding: theme.spacing(0.75, 1),
        },
        root: {
          borderRadius: theme.shape.borderRadius,
          transition: "none",

          "&.Mui-focused": {
            backgroundColor: theme.palette.action.focus,
          },
          "&.Mui-disabled": {
            opacity: 0.5,
          },
          ".MuiAutocomplete-root &": {
            paddingTop: 0,
          },
        },
      },
    },
    MuiDialog: {
      defaultProps: {
        PaperProps: {
          elevation: 4,
        },
      },
      styleOverrides: {
        root: {
          ".MuiBackdrop-root": {
            backgroundColor: alpha(theme.palette.common.black, 0.4),
          },
        },
        paper: {
          // Prevent dialog from going underneath window title bar controls on Windows
          maxHeight: `calc(100% - 2 * (env(titlebar-area-height, ${theme.spacing(
            2,
          )}) + ${theme.spacing(2)}))`,
        },
      },
    },
    MuiDialogActions: {
      styleOverrides: {
        root: {
          padding: theme.spacing(3),
        },
      },
    },
    MuiDialogContent: {
      styleOverrides: {
        root: {
          ...theme.typography.body1,

          "& + .MuiDialogActions-root": {
            paddingTop: 0,
          },
        },
      },
    },
    MuiDialogTitle: {
      styleOverrides: {
        root: {
          ...theme.typography.h4,
          fontWeight: 600,
        },
      },
    },
    MuiFocusVisible: {
      styleOverrides: {
        root: {
          borderRadius: theme.shape.borderRadius,
        },
      },
    },
    MuiIconButton: {
      defaultProps: {
        centerRipple: false,
        disableRipple: true,
      },
      styleOverrides: {
        root: {
          borderRadius: theme.shape.borderRadius,

          ".root-span": {
            display: "flex",
          },
          "&:hover": {
            backgroundColor: theme.palette.action.hover,
          },
        },
      },
    },
    MuiInput: {
      styleOverrides: {
        input: {
          fontSize: theme.typography.body1.fontSize,
          padding: theme.spacing(1, 1.25),
        },
        inputSizeSmall: {
          fontSize: theme.typography.body2.fontSize,
          padding: theme.spacing(0.75, 1),
        },
      },
    },
    MuiInputBase: {
      styleOverrides: {
        adornedEnd: {
          "&.MuiInputBase-sizeSmall": {
            paddingRight: theme.spacing(1),
          },
          svg: {
            flex: "none",
          },
        },
        adornedStart: {
          "&.MuiInputBase-sizeSmall": {
            paddingLeft: theme.spacing(1),

            "& .MuiSelect-select": {
              paddingRight: `${theme.spacing(2)} !important`,
            },
          },
          svg: {
            flex: "none",
          },
        },
        input: {
          fontSize: theme.typography.body1.fontSize,
        },
        inputSizeSmall: {
          fontSize: theme.typography.body2.fontSize,
        },
        root: {
          "&.MuiInput-root": {
            marginTop: 0,
          },
        },
      },
    },
    MuiInputLabel: {
      defaultProps: {
        shrink: true,
        variant: "standard",
        sx: { position: "relative" },
      },
    },
    MuiLink: {
      defaultProps: {
        color: prefersDarkMode ? "secondary" : "primary",
      },
      styleOverrides: {
        root: {
          cursor: "pointer",
        },
      },
    },
    MuiListSubheader: {
      styleOverrides: {
        root: {
          lineHeight: theme.spacing(4),
        },
      },
    },
    MuiListItemButton: {},
    MuiListItemText: {
      styleOverrides: {
        dense: {
          marginTop: theme.spacing(0.25),
          marginBottom: theme.spacing(0.25),
        },
      },
    },
    MuiMenu: {
      defaultProps: {
        TransitionComponent: Fade,
      },
      styleOverrides: {
        paper: {
          borderRadius: theme.shape.borderRadius,
          backgroundColor: theme.palette.background.menu,
        },
        list: {
          ...theme.typography.body1,

          [`&.${listClasses.dense}`]: {
            ...theme.typography.body2,
          },
          [`.${listItemClasses.root} + .${dividerClasses.root}`]: {
            marginTop: theme.spacing(1),
            marginBottom: theme.spacing(1),
          },
        },
      },
    },
    MuiMenuItem: {
      defaultProps: {
        disableRipple: true,
      },
      styleOverrides: {
        root: {
          minHeight: 32,
        },
      },
    },
    MuiOutlinedInput: {
      styleOverrides: {
        input: {
          fontSize: theme.typography.body1.fontSize,
          padding: theme.spacing(1, 1.25),
        },
        inputSizeSmall: {
          fontSize: theme.typography.body2.fontSize,
          padding: theme.spacing(0.75, 1),
        },
      },
      defaultProps: {
        notched: false,
      },
    },
    MuiSelect: {
      defaultProps: {
        variant: "outlined",
      },
      styleOverrides: {
        select: {
          "&.MuiInputBase-input": {
            paddingTop: theme.spacing(1),
            paddingBottom: theme.spacing(1),
          },
          "&.MuiInputBase-inputSizeSmall": {
            paddingTop: theme.spacing(0.625),
            paddingBottom: theme.spacing(0.625),
          },
        },
      },
    },
    MuiPaper: {
      defaultProps: {
        elevation: 2,
        square: true,
      },
      styleOverrides: {
        elevation: {
          backgroundImage: "none !important",
        },
      },
    },
    MuiPopover: {
      defaultProps: {
        marginThreshold: 8,
      },
    },
    MuiRadio: {
      defaultProps: {
        disableRipple: true,
        size: "small",
      },
    },
    MuiTab: {
      styleOverrides: {
        root: {
          opacity: 0.8,

          "&.Mui-selected": {
            opacity: 1,
          },

          "&:not(.Mui-selected):hover": {
            opacity: 1,
            color: theme.palette.text.primary,
          },
        },
        selected: {},
      },
    },
    MuiTabs: {
      styleOverrides: {
        vertical: {
          ".MuiTabs-indicator": {
            left: 0,
            right: "auto",
          },
        },
      },
    },
    MuiTableCell: {
      styleOverrides: {
        stickyHeader: {
          backgroundColor: theme.palette.background.paper,
        },
      },
    },
    MuiToggleButton: {
      defaultProps: {
        disableRipple: true,
      },
      styleOverrides: {
        root: {
          "&:active": {
            backgroundColor: alpha(
              theme.palette.text.primary,
              theme.palette.action.activatedOpacity,
            ),
          },
          "&.Mui-selected:active": {
            backgroundColor: alpha(
              theme.palette.primary.main,
              theme.palette.action.selectedOpacity + theme.palette.action.activatedOpacity,
            ),
          },
        },
        sizeSmall: {
          fontSize: "0.6875rem",
        },
        sizeLarge: {
          fontSize: "0.875rem",
        },
      },
    },
    MuiToolbar: {
      styleOverrides: {
        root: {
          justifyContent: "space-between",
        },
      },
    },
    MuiTooltip: {
      defaultProps: {
        arrow: true,
        TransitionComponent: Fade,
      },
      styleOverrides: {
        arrow: {
          color: tinycolor(theme.palette.grey[700]).setAlpha(0.92).toRgbString(),
          backdropFilter: "blur(3px)",
        },
        tooltip: {
          backgroundColor: tinycolor(theme.palette.grey[700]).setAlpha(0.92).toRgbString(),
          backdropFilter: "blur(3px)",
          fontWeight: "normal",
          fontSize: theme.typography.caption.fontSize,
        },
      },
    },
    MuiTypography: {
      defaultProps: {
        // Remap typography variants to be <div> elements to
        // avoid triggering react's validateDOMNesting error
        variantMapping: {
          h1: "div",
          h2: "div",
          h3: "div",
          h4: "div",
          h5: "div",
          h6: "div",
          subtitle1: "div",
          subtitle2: "div",
          body1: "div",
          body2: "div",
          inherit: "div",
        },
      },
    },
  };
}
