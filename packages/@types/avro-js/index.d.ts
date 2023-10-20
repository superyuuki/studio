// This Source Code Form is subject to the terms of the Mozilla Public
// License, v2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/

// https://github.com/apache/avro/blob/main/lang/js/doc/API.md

declare module "avro-js" {
  type AvroType =
    | "array"
    | "boolean"
    | "bytes"
    | "double"
    | "enum"
    | "error"
    | "fixed"
    | "float"
    | "int"
    | "long"
    | "map"
    | "null"
    | "record"
    | "request"
    | "string"
    | "union";

  class Type {
    public fromBuffer(buffer: Buffer): unknown;

    /**
     * Returns type's fully qualified name if it exists, undefined otherwise.
     *
     * @param noRef Return built-in names (e.g. 'record', 'map', 'boolean') rather than user-specified references.
     */
    // eslint-disable-next-line @foxglove/no-boolean-parameters
    public getName(noRef?: boolean): string | undefined;
    // eslint-disable-next-line @foxglove/no-boolean-parameters
    public getName(noRef: true): AvroType;
  }

  class BooleanType extends Type {}
  class BytesType extends Type {}
  class DoubleType extends Type {}
  class FloatType extends Type {}
  class IntType extends Type {}
  class LongType extends Type {}
  class NullType extends Type {}
  class StringType extends Type {}

  class RecordType extends Type {
    /** Returns a copy of the array of fields contained in this record. */
    public getFields(): Field[];
  }

  class ArrayType extends Type {
    /** The type of the array's items.*/
    public getItemsType(): Type;
  }

  class MapType extends Type {}
  class EnumType extends Type {}
  class FixedType extends Type {}
  class UnionType extends Type {}

  type PrimitiveType =
    | DoubleType
    | BooleanType
    | BytesType
    | FloatType
    | IntType
    | LongType
    | NullType
    | StringType;
  type ComplexType = RecordType | ArrayType | MapType | EnumType | FixedType | UnionType;

  type Registry = Record<string, PrimitiveType | ComplexType>;

  class Field {
    public getName(): string;
    public getType(): PrimitiveType | ComplexType;
  }

  export type ParseOptions = {
    namespace?: string;
    registry?: Registry;
  };

  export function parse(schema: unknown, options?: ParseOptions): void;

  const types = {
    BooleanType,
    BytesType,
    DoubleType,
    FloatType,
    IntType,
    LongType,
    NullType,
    StringType,
    RecordType,
    ArrayType,
    EnumType,
    FixedType,
    MapType,
    UnionType,
  };
  export const types;
}
