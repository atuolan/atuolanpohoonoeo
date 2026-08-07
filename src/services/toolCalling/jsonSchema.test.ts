import { describe, expect, it } from "vitest";
import { validateJsonSchema, type JsonSchema } from "./jsonSchema";

describe("validateJsonSchema", () => {
  const schema: JsonSchema = {
    type: "object",
    properties: {
      name: { type: "string" },
      age: { type: "integer", enum: [18, 21, 30] },
      active: { type: "boolean" },
      tags: { type: "array", items: { type: "string" } },
    },
    required: ["name", "age"],
    additionalProperties: false,
  };

  it("validates object types and required fields", () => {
    expect(validateJsonSchema(schema, { name: "A", age: 21 })).toEqual({ ok: true, value: { name: "A", age: 21 } });
    expect(validateJsonSchema(schema, { age: 21 })).toMatchObject({ ok: false });
  });

  it("rejects wrong types and enum values", () => {
    expect(validateJsonSchema(schema, { name: "A", age: "21" })).toMatchObject({ ok: false });
    expect(validateJsonSchema(schema, { name: "A", age: 19 })).toMatchObject({ ok: false });
  });

  it("rejects unknown fields when additionalProperties is false", () => {
    expect(validateJsonSchema(schema, { name: "A", age: 21, nope: true })).toMatchObject({ ok: false });
  });

  it("validates arrays and primitive schemas", () => {
    expect(validateJsonSchema({ type: "number" }, 1.5).ok).toBe(true);
    expect(validateJsonSchema({ type: "array", items: { type: "boolean" } }, [true, false]).ok).toBe(true);
    expect(validateJsonSchema({ type: "string" }, null).ok).toBe(false);
  });
});
