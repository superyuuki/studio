// This Source Code Form is subject to the terms of the Mozilla Public
// License, v2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/

import avro, { ParseOptions } from "avro-js";

import { MessageDefinition, MessageDefinitionField } from "@foxglove/message-definition";

import { MessageDefinitionMap, ParsedChannel } from "./types";

/**
 * Parse a Avro schema and produce datatypes and a deserializer function.
 */
export function parseAvroSchema(schemaName: string, schemaData: Uint8Array): ParsedChannel {
  const avroSchema = JSON.parse(new TextDecoder().decode(schemaData)) as unknown;

  // Setup a shared registry to populate via avro.parse() calls
  // We will populate the registry either from a single schema or from an array of schemas
  const registry: ParseOptions["registry"] = {};

  // Parse supports a single schema object or an array of objects. Technically in avro an array of
  // schemas indicates a union type, but mcap defines arrays as separate record schemas.
  avro.parse(avroSchema, { registry });

  // Grab the entry schema from the registry to build the datatypes
  const avroType = registry[schemaName];
  if (!avroType) {
    throw new Error(`Could not find type "${schemaName}" in types registry.`);
  }

  if (!(avroType instanceof avro.types.RecordType)) {
    throw new Error(
      `Type "${schemaName}" is not a record type. Only record types are supported at the top level.`,
    );
  }

  const deserialize: ParsedChannel["deserialize"] = (data: ArrayBufferView) => {
    return avroType.fromBuffer(Buffer.from(data.buffer, data.byteOffset, data.byteLength));
  };

  const datatypes: MessageDefinitionMap = new Map();
  registerRecordType(avroType, datatypes);

  return { deserialize, datatypes };
}

/**
 * Register a RecordType into the definition registry.
 *
 * This function will recursively register the provided record type and its fields into the
 * definition registry.
 */
function registerRecordType(
  record: avro.RecordType,
  definitionRegistry: MessageDefinitionMap,
): void {
  // All records must have a full name so they can be entered into the registry
  const fullName = record.getName();
  if (!fullName) {
    throw new Error("invariant: RecordType without a name");
  }

  // skip re-registering if the registry already has this name to support the
  // recursive references avro feature
  if (definitionRegistry.has(fullName)) {
    return;
  }

  const definition: MessageDefinition = {
    name: fullName,
    definitions: [],
  };

  const fields = record.getFields();
  for (const field of fields) {
    const fieldName = field.getName();
    const fieldType = field.getType();

    const definitionField = typeToDefinitionField(fieldName, fieldType);
    definition.definitions.push(definitionField);

    // Fields may contain definitions for other records so we register those as well
    if (fieldType instanceof avro.types.ArrayType) {
      const itemType = fieldType.getItemsType();
      if (itemType instanceof avro.types.RecordType) {
        registerRecordType(itemType, definitionRegistry);
      }
    } else if (fieldType instanceof avro.types.RecordType) {
      registerRecordType(fieldType, definitionRegistry);
    }
  }

  definitionRegistry.set(fullName, definition);
}

function getStudioTypeForPrimitiveType(type: string): string {
  switch (type) {
    case "boolean":
      return "bool";
    case "int":
      return "int32";
    case "long":
      return "int64";
    case "float":
      return "float32";
    case "double":
      return "float64";
    case "bytes":
      return "uint8";
    case "string":
      return "string";
  }

  throw new Error(`unknown primitive type: ${type}`);
}

function typeToDefinitionField(name: string, type: avro.Type): MessageDefinitionField {
  // The avro type is the builtin set of avro types
  const avroType = type.getName(true);

  if (type instanceof avro.types.ArrayType) {
    const itemType = type.getItemsType();
    const itemDefinition = typeToDefinitionField("-", itemType);

    return {
      name,
      type: itemDefinition.type,
      isArray: true,
      isComplex: itemDefinition.isComplex,
    };
  } else if (type instanceof avro.types.RecordType) {
    const itemName = type.getName();
    if (!itemName) {
      throw new Error(`invariant: missing item name for field: ${name}`);
    }

    return {
      name,
      type: itemName,
      isComplex: true,
    };
  } else if (type instanceof avro.types.UnionType) {
    throw new Error("union type is not supported");
  } else if (type instanceof avro.types.MapType) {
    throw new Error("map type is not supported");
  } else if (type instanceof avro.types.EnumType) {
    throw new Error("enum type is not supported");
  } else if (type instanceof avro.types.FixedType) {
    throw new Error("fixed type is not supported");
  } else if (type instanceof avro.types.BytesType) {
    // bytes are represented as an array of uint8
    return {
      name,
      type: "uint8",
      isComplex: false,
      isArray: true,
    };
  }

  return {
    name,
    type: getStudioTypeForPrimitiveType(avroType),
    isComplex: false,
  };
}
