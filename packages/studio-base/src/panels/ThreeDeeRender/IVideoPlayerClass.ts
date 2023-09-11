// This Source Code Form is subject to the terms of the Mozilla Public
// License, v2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/

import EventEmitter from "eventemitter3";

import { CompressedVideo } from "@foxglove/studio-base/panels/ThreeDeeRender/renderables/Images/ImageTypes";

export interface IVideoPlayerClass {
  isSupported(): boolean;
  isVideoKeyframe(frameMsg: CompressedVideo): boolean;
  getVideoDecoderConfig(frameMsg: CompressedVideo): VideoDecoderConfig | undefined;
  new (): IVideoPlayer;
}

export interface IVideoPlayer extends EventEmitter {
  init(decoderConfig: VideoDecoderConfig): Promise<void>;
  isInitialized(): boolean;
  decoderConfig(): VideoDecoderConfig | undefined;
  codedSize(): { width: number; height: number } | undefined;
  decode(
    data: Uint8Array,
    timestampMicros: number,
    type: "key" | "delta",
  ): Promise<VideoFrame | undefined>;
  resetForSeek(): void;
  close(): void;
}
