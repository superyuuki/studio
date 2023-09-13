// This Source Code Form is subject to the terms of the Mozilla Public
// License, v2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/

import { ParseChannelOptions } from "@mcap/support";

import { MessageDefinition } from "@foxglove/message-definition";
import protobufjs from "@foxglove/protobufjs";

export const parseChannelOptions: ParseChannelOptions = {
  protobuf: {
    processRootType(root) {
      // Modify the definition of google.protobuf.Timestamp and Duration so they are interpreted as
      // {sec: number, nsec: number}, compatible with the rest of Studio. The standard Protobuf types
      // use different names (`seconds` and `nanos`), and `seconds` is an `int64`, which would be
      // deserialized as a bigint by default.
      const fixTimeType = (
        type: protobufjs.ReflectionObject | null /* eslint-disable-line no-restricted-syntax */,
      ) => {
        if (!type || !(type instanceof protobufjs.Type)) {
          return;
        }
        type.setup(); // ensure the original optimized toObject has been created
        const prevToObject = type.toObject; // eslint-disable-line @typescript-eslint/unbound-method
        const newToObject: typeof prevToObject = (message, options) => {
          const result = prevToObject.call(type, message, options);
          const { seconds, nanos } = result as { seconds: bigint; nanos: number };
          if (typeof seconds !== "bigint" || typeof nanos !== "number") {
            return result;
          }
          if (seconds > BigInt(Number.MAX_SAFE_INTEGER)) {
            throw new Error(
              `Timestamps with seconds greater than 2^53-1 are not supported (found seconds=${seconds}, nanos=${nanos})`,
            );
          }
          return { sec: Number(seconds), nsec: nanos };
        };
        type.toObject = newToObject;
      };

      fixTimeType(root.lookup(".google.protobuf.Timestamp"));
      fixTimeType(root.lookup(".google.protobuf.Duration"));
      return root;
    },

    processMessageDefinitions(definitions) {
      // Rename the fields of google.protobuf.Timestamp and google.protobuf.Duration to match the
      // rest of Studio.
      const fixTimeType = (def: MessageDefinition | undefined) => {
        if (!def) {
          return;
        }
        for (const field of def.definitions) {
          if (field.name === "seconds") {
            field.name = "sec";
            field.type = "int32";
          } else if (field.name === "nanos") {
            field.name = "nsec";
            field.type = "int32";
          }
        }
      };

      fixTimeType(definitions.get("google.protobuf.Timestamp"));
      fixTimeType(definitions.get("google.protobuf.Duration"));
      return definitions;
    },
  },
};
