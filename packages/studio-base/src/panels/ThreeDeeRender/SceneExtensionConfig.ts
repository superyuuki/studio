// This Source Code Form is subject to the terms of the Mozilla Public
// License, v2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/

import { ImageMode } from "@foxglove/studio-base/panels/ThreeDeeRender/renderables/ImageMode/ImageMode";
import { Images } from "@foxglove/studio-base/panels/ThreeDeeRender/renderables/Images";
import { Markers } from "@foxglove/studio-base/panels/ThreeDeeRender/renderables/Markers";
import { PublishSettings } from "@foxglove/studio-base/panels/ThreeDeeRender/renderables/PublishSettings";

import { IRenderer } from "./IRenderer";
import { SceneExtension } from "./SceneExtension";
import { MeasurementTool } from "./renderables/MeasurementTool";
import { PublishClickTool } from "./renderables/PublishClickTool";
import { InterfaceMode } from "./types";

export type SceneExtensionConfig = {
  reserved: ReservedSceneExtensionConfig;
  extensionsById: Record<AvailableNames, ExtensionOverride<SceneExtension>>;
};
/** Reserved because the Renderer has members that reference them specifically */

export type ReservedSceneExtensionConfig = {
  imageMode: ExtensionOverride<ImageMode>;
  measurementTool: ExtensionOverride<MeasurementTool>;
  publishClickTool: ExtensionOverride<PublishClickTool>;
  //   cameraHandler: ExtensionOverride<ICameraHandler>;
};

export type ExtensionOverride<ExtensionType extends SceneExtension> = {
  init: (renderer: IRenderer) => ExtensionType;
  /** Which interfaceModes this extension is supported in. If undefined, will default to both '3d' and 'image' modes */
  supportedModes?: InterfaceMode[];
};

type ReservedNames = keyof ReservedSceneExtensionConfig;
type AvailableNames = Exclude<string, ReservedNames>;

export const DEFAULT_SCENE_EXTENSION_CONFIG: SceneExtensionConfig = {
  reserved: {
    imageMode: {
      init: (renderer: IRenderer) => new ImageMode(renderer),
    },
    measurementTool: {
      init: (renderer: IRenderer) => new MeasurementTool(renderer),
    },
    publishClickTool: {
      init: (renderer: IRenderer) => new PublishClickTool(renderer),
    },
  },
  extensionsById: {
    [Images.extensionId]: {
      init: (renderer: IRenderer) => new Images(renderer),
      supportedModes: ["image"],
    },
    [Markers.extensionId]: {
      init: (renderer: IRenderer) => new Markers(renderer),
    },
    [PublishSettings.extensionId]: {
      init: (renderer: IRenderer) => new PublishSettings(renderer),
      supportedModes: ["3d"],
    },
  },
};
