// This Source Code Form is subject to the terms of the Mozilla Public
// License, v2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/

import { Meta, StoryObj } from "@storybook/react";
import { userEvent, within } from "@storybook/testing-library";
import { noop } from "lodash";

import { ToolbarTab } from "@foxglove/studio-base/panels/Tab/ToolbarTab";

export default {
  title: "panels/Tab/ToolbarTab",
  component: ToolbarTab,
  args: {
    hidden: false,
    highlight: undefined,
    innerRef: undefined,
    isActive: false,
    isDragging: false,
    actions: {
      addTab: noop,
      removeTab: noop,
      selectTab: noop,
      setTabTitle: noop,
    },
    tabCount: 1,
    tabIndex: 0,
    tabTitle: "Tab Title",
  },
  decorators: [
    (Story) => (
      <div style={{ margin: 8 }}>
        <Story />
      </div>
    ),
  ],
} as Meta<typeof ToolbarTab>;

export const Default: StoryObj = {};

export const ActiveWithCloseIcon: StoryObj = {
  args: { isActive: true, tabCount: 3 },
};

export const ActiveWithoutCloseIcon: StoryObj = {
  args: { isActive: true, tabCount: 1 },
};

export const Hidden: StoryObj = {
  args: { hidden: true },
};

export const Highlight: StoryObj = {
  args: { highlight: "before" },
};

export const Dragging: StoryObj = {
  args: { isDragging: true },
};

export const Editing: StoryObj = {
  args: {
    isActive: true,
  },
  play: async ({ canvasElement }) => {
    const user = userEvent.setup();
    const canvas = within(canvasElement);
    const tabs = await canvas.findAllByText("Tab Title");

    for (const tab of tabs) {
      await user.click(tab);
      await user.keyboard("Rename Tab");
    }
  },
};
