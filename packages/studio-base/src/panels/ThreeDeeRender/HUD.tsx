// This Source Code Form is subject to the terms of the Mozilla Public
// License, v2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/

import * as React from "react";
import { makeStyles } from "tss-react/mui";

import { IRenderer } from "@foxglove/studio-base/panels/ThreeDeeRender/IRenderer";

import { HUDItem } from "./HUDManager";
import { useRendererProperty } from "./RendererContext";

const useStyles = makeStyles()((theme) => ({
  hud: {
    position: "absolute",
    alignContent: "center",
    top: 0,
    padding: theme.spacing(1),
    border: "1px solid black",
    background: "grey",
    select: "none",
  },
}));

type HUDProps = {
  renderer?: IRenderer;
};

export function HUD(props: HUDProps): React.ReactElement {
  const { classes } = useStyles();
  const hudItems: HUDItem[] = useRendererProperty(
    "hudItems",
    "hudItemsChanged",
    () => [],
    props.renderer,
  );
  return (
    <div className={classes.hud}>
      <div>Hud Items</div>
      {hudItems.map((item, index) => (
        <div key={index}>{item.message}</div>
      ))}
    </div>
  );
}
