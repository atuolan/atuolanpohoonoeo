export type JsonSchemaType = "object" | "string" | "number" | "integer" | "boolean" | "array";

export interface JsonSchema {
  type?: JsonSchemaType;
  enum?: unknown[];
  required?: string[];
  properties?: Record<string, JsonSchema>;
  items?: JsonSchema;
  additionalProperties?: boolean;
  description?: string;
}

export type JsonSchemaValidationResult<T = unknown> =
  | { ok: true; value: T }
  | { ok: false; error: string };

function typeMatches(type: JsonSchemaType, value: unknown): boolean {
  switch (type) {
    case "object": return typeof value === "object" && value !== null && !Array.isArray(value);
    case "array": return Array.isArray(value);
    case "string": return typeof value === "string";
    case "number": return typeof value === "number" && Number.isFinite(value);
    case "integer": return typeof value === "number" && Number.isInteger(value);
    case "boolean": return typeof value === "boolean";
  }
}

function validate(schema: JsonSchema, value: unknown, path: string): string | undefined {
  if (schema.type && !typeMatches(schema.type, value)) {
    return `${path} must be ${schema.type}`;
  }
  if (schema.enum && !schema.enum.some((candidate) => Object.is(candidate, value))) {
    return `${path} must be one of the allowed values`;
  }
  if (schema.type === "object" || schema.properties || schema.required) {
    if (!typeMatches("object", value)) return `${path} must be object`;
    const object = value as Record<string, unknown>;
    for (const key of schema.required ?? []) {
      if (!(key in object)) return `${path}.${key} is required`;
    }
    const properties = schema.properties ?? {};
    if (schema.additionalProperties === false) {
      for (const key of Object.keys(object)) {
        if (!(key in properties)) return `${path}.${key} is not allowed`;
      }
    }
    for (const [key, child] of Object.entries(properties)) {
      if (key in object) {
        const error = validate(child, object[key], `${path}.${key}`);
        if (error) return error;
      }
    }
  }
  if (schema.type === "array" && schema.items) {
    for (let i = 0; i < (value as unknown[]).length; i++) {
      const error = validate(schema.items, (value as unknown[])[i], `${path}[${i}]`);
      if (error) return error;
    }
  }
  return undefined;
}

export function validateJsonSchema<T = unknown>(schema: JsonSchema, value: T): JsonSchemaValidationResult<T> {
  const error = validate(schema, value, "$" );
  return error ? { ok: false, error } : { ok: true, value };
}
