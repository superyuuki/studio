// This Source Code Form is subject to the terms of the Mozilla Public
// License, v2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/

// checkParse is a helper function that does the actual asserting
/* eslint jest/expect-expect: ["error", { "assertFunctionNames": ["checkParse"] }] */

import { MessageDefinition } from "@foxglove/message-definition";

import { parseAvroSchema } from "./parseAvroSchema";

function checkParse(
  name: string,
  inputSchema: unknown,
  expectedRegistry: Record<string, MessageDefinition>,
): void {
  const result = parseAvroSchema(name, new TextEncoder().encode(JSON.stringify(inputSchema)));
  expect(result.datatypes).toEqual(new Map(Object.entries(expectedRegistry)));
}

describe("parseAvroSchema", () => {
  it("parses a valid single object schema", () => {
    checkParse(
      "AvroPrimitives",
      {
        name: "AvroPrimitives",
        type: "record",
        fields: [
          { name: "str", type: "string" },
          { name: "int", type: "int" },
          { name: "long", type: "long" },
          { name: "boolean", type: "boolean" },
          { name: "float", type: "float" },
          { name: "double", type: "double" },
          { name: "bytes", type: "bytes" },
        ],
      },
      {
        AvroPrimitives: {
          name: "AvroPrimitives",
          definitions: [
            { isComplex: false, name: "str", type: "string" },
            { isComplex: false, name: "int", type: "int32" },
            { isComplex: false, name: "long", type: "int64" },
            { isComplex: false, name: "boolean", type: "bool" },
            { isComplex: false, name: "float", type: "float32" },
            { isComplex: false, name: "double", type: "float64" },
            { isComplex: false, isArray: true, name: "bytes", type: "uint8" },
          ],
        },
      },
    );
  });

  it("parses an array of primitives", () => {
    checkParse(
      "AvroArrayPrimitives",
      {
        name: "AvroArrayPrimitives",
        type: "record",
        fields: [{ name: "strings", type: { type: "array", items: "string" } }],
      },
      {
        AvroArrayPrimitives: {
          name: "AvroArrayPrimitives",
          definitions: [{ isComplex: false, isArray: true, name: "strings", type: "string" }],
        },
      },
    );
  });

  it("parses an array of records", () => {
    checkParse(
      "AvroArrayComplex",
      {
        name: "AvroArrayComplex",
        type: "record",
        fields: [
          {
            name: "points",
            type: {
              type: "array",
              items: {
                type: "record",
                name: "foxglove.Point2d",
                fields: [
                  { name: "x", type: "float" },
                  { name: "y", type: "float" },
                ],
              },
            },
          },
        ],
      },
      {
        "foxglove.Point2d": {
          name: "foxglove.Point2d",
          definitions: [
            { isComplex: false, name: "x", type: "float32" },
            { isComplex: false, name: "y", type: "float32" },
          ],
        },
        AvroArrayComplex: {
          name: "AvroArrayComplex",
          definitions: [
            { isComplex: true, isArray: true, name: "points", type: "foxglove.Point2d" },
          ],
        },
      },
    );
  });

  it("parses nested records", () => {
    checkParse(
      "MyRecord",
      {
        name: "MyRecord",
        type: "record",
        fields: [
          {
            name: "point",
            type: {
              type: "record",
              name: "foxglove.Point2d",
              fields: [
                { name: "x", type: "float" },
                { name: "y", type: "float" },
              ],
            },
          },
        ],
      },
      {
        MyRecord: {
          name: "MyRecord",
          definitions: [{ isComplex: true, name: "point", type: "foxglove.Point2d" }],
        },
        "foxglove.Point2d": {
          name: "foxglove.Point2d",
          definitions: [
            { isComplex: false, name: "x", type: "float32" },
            { isComplex: false, name: "y", type: "float32" },
          ],
        },
      },
    );
  });

  it("parses array of schemas", () => {
    checkParse(
      "MyRecord",
      [
        {
          type: "record",
          name: "foxglove.Point2d",
          fields: [
            { name: "x", type: "float" },
            { name: "y", type: "float" },
          ],
        },
        {
          name: "MyRecord",
          type: "record",
          fields: [
            {
              name: "point",
              type: "foxglove.Point2d",
            },
          ],
        },
      ],
      {
        MyRecord: {
          name: "MyRecord",
          definitions: [{ isComplex: true, name: "point", type: "foxglove.Point2d" }],
        },
        "foxglove.Point2d": {
          name: "foxglove.Point2d",
          definitions: [
            { isComplex: false, name: "x", type: "float32" },
            { isComplex: false, name: "y", type: "float32" },
          ],
        },
      },
    );
  });
});
