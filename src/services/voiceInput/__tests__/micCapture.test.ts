import { describe, expect, it } from "vitest";
import { classifyMicError } from "@/services/voiceInput/micCapture";

describe("classifyMicError", () => {
  it.each([
    ["NotAllowedError", "denied"],
    ["SecurityError", "denied"],
    ["NotFoundError", "notFound"],
    ["OverconstrainedError", "notFound"],
    ["NotReadableError", "busy"],
    ["AbortError", "busy"],
    ["SomethingElse", "busy"],
  ])("%s → %s", (name, reason) => {
    expect(classifyMicError({ name, message: "x" }).reason).toBe(reason);
  });
});
