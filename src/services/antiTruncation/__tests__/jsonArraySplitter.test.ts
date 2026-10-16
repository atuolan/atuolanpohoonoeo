import { describe, expect, it } from "vitest";
import { JsonArraySplitter, flattenJsonElement } from "../jsonArraySplitter";

describe("JsonArraySplitter", () => {
  it("splits elements across chunks and reports completion", () => {
    const splitter = new JsonArraySplitter();
    expect(splitter.push('[{"a":1},{"b":')).toEqual(['{"a":1}']);
    expect(splitter.complete).toBe(false);
    expect(splitter.push('"}"}]')).toEqual(['{"b":"}"}']);
    expect(splitter.complete).toBe(true);
  });

  it("returns the unfinished tail on finish", () => {
    const splitter = new JsonArraySplitter();
    splitter.push('[{"a":1},{"b":2');
    expect(splitter.finish()).toBe('{"b":2');
  });

  it("flattens an element onto one line", () => {
    expect(flattenJsonElement('{\n  "a": 1\n}')).toBe('{"a":1}');
    expect(flattenJsonElement('{"a":\n')).toBe('{"a": ');
  });
});
