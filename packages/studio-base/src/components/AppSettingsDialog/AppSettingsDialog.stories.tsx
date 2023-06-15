// This Source Code Form is subject to the terms of the Mozilla Public
// License, v2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/

import { Meta, StoryFn, StoryObj } from "@storybook/react";
import { screen, userEvent } from "@storybook/testing-library";
import { range } from "lodash";

import { ExtensionInfo, ExtensionLoader } from "@foxglove/studio-base";
import ExtensionMarketplaceContext, {
  ExtensionMarketplace,
} from "@foxglove/studio-base/context/ExtensionMarketplaceContext";
import ExtensionCatalogProvider from "@foxglove/studio-base/providers/ExtensionCatalogProvider";
import WorkspaceContextProvider from "@foxglove/studio-base/providers/WorkspaceContextProvider";

import { AppSettingsDialog } from "./AppSettingsDialog";

const installedExtensions: ExtensionInfo[] = range(1, 10).map((index) => ({
  id: "publisher.storyextension",
  name: "privatestoryextension",
  qualifiedName: "storyextension",
  displayName: `Private Extension Name ${index + 1}`,
  description: "Private extension sample description",
  publisher: "Private Publisher",
  homepage: "https://foxglove.dev/",
  license: "MIT",
  version: `1.${index}`,
  keywords: ["storybook", "testing"],
  namespace: index % 2 === 0 ? "local" : "org",
}));

const marketplaceExtensions: ExtensionInfo[] = [
  {
    id: "publisher.storyextension",
    name: "storyextension",
    qualifiedName: "storyextension",
    displayName: "Extension Name",
    description: "Extension sample description",
    publisher: "Publisher",
    homepage: "https://foxglove.dev/",
    license: "MIT",
    version: "1.2.10",
    keywords: ["storybook", "testing"],
  },
];

const MockExtensionLoader: ExtensionLoader = {
  namespace: "local",
  getExtensions: async () => installedExtensions,
  loadExtension: async (_id: string) => "",
  installExtension: async (_foxeFileData: Uint8Array) => {
    throw new Error("MockExtensionLoader cannot install extensions");
  },
  uninstallExtension: async (_id: string) => undefined,
};

const MockExtensionMarketplace: ExtensionMarketplace = {
  getAvailableExtensions: async () => marketplaceExtensions,
  getMarkdown: async (url: string) => `# Markdown
Mock markdown rendering for URL [${url}](${url}).`,
};

function Wrapper(StoryComponent: StoryFn): JSX.Element {
  return (
    <WorkspaceContextProvider>
      <ExtensionCatalogProvider loaders={[MockExtensionLoader]}>
        <ExtensionMarketplaceContext.Provider value={MockExtensionMarketplace}>
          <StoryComponent />
        </ExtensionMarketplaceContext.Provider>
      </ExtensionCatalogProvider>
    </WorkspaceContextProvider>
  );
}

export default {
  title: "components/AppSettingsDialog",
  component: AppSettingsDialog,
  args: {
    open: true,
  },
  parameters: { colorScheme: "light" },
  decorators: [Wrapper],
} as Meta<typeof AppSettingsDialog>;

type Story = StoryObj<typeof AppSettingsDialog>;

export const Default: Story = {};

export const DefaultChinese: Story = {
  parameters: { forceLanguage: "zh" },
};

export const DefaultJapanese: Story = {
  parameters: { forceLanguage: "ja" },
};

export const ChangingLanguage: Story = {
  play: async () => {
    const input = await screen.findByText("English", { exact: false });
    userEvent.click(input);

    userEvent.keyboard("中文");
    const item = await screen.findByText("中文", { exact: false });
    userEvent.click(item);
  },
};

export const General: Story = {
  args: { activeTab: "general" },
};

export const GeneralChinese: Story = {
  ...General,
  parameters: { forceLanguage: "zh" },
};

export const GeneralJapanese: Story = {
  ...General,
  parameters: { forceLanguage: "ja" },
};

export const Privacy: Story = {
  args: { activeTab: "privacy" },
};

export const PrivacyChinese: Story = {
  ...Privacy,
  parameters: { forceLanguage: "zh" },
};

export const PrivacyJapanese: Story = {
  ...Privacy,
  parameters: { forceLanguage: "ja" },
};

export const Extensions: Story = {
  args: { activeTab: "extensions" },
};

export const ExtensionsChinese: Story = {
  ...Extensions,
  parameters: { forceLanguage: "zh" },
};

export const ExtensionsJapanese: Story = {
  ...Extensions,
  parameters: { forceLanguage: "ja" },
};

export const Experimental: Story = {
  args: { activeTab: "experimental-features" },
};

export const ExperimentalChinese: Story = {
  ...Experimental,
  parameters: { forceLanguage: "zh" },
};

export const ExperimentalJapanese: Story = {
  ...Experimental,
  parameters: { forceLanguage: "ja" },
};

export const About: Story = {
  args: { activeTab: "about" },
};

export const AboutChinese: Story = {
  ...About,
  parameters: { forceLanguage: "zh" },
};

export const AboutJapanese: Story = {
  ...About,
  parameters: { forceLanguage: "ja" },
};
