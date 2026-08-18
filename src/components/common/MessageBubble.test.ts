// @ts-expect-error Node types are not part of the app tsconfig.
import { readFileSync } from "node:fs";
// @ts-expect-error Node types are not part of the app tsconfig.
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  fileURLToPath(new URL("./MessageBubble.vue", import.meta.url)),
  "utf8",
);

describe("MessageBubble TTS regeneration action", () => {
  it("declares and emits the regenerate voice event", () => {
    expect(source).toContain('(e: "regenerateVoice", id: string): void;');
    expect(source).toContain('emit("regenerateVoice", props.id);');
  });

  it("renders the action only in the AI menu branch", () => {
    expect(source).toContain("function handleRegenerateVoice()");
    expect(source).toContain('@click="handleRegenerateVoice"');
    expect(source).toContain("<span>重新生成語音</span>");

    const aiBranch = source.indexOf('<template v-if="!isUser">');
    const action = source.indexOf("重新生成語音");
    expect(aiBranch).toBeGreaterThanOrEqual(0);
    expect(action).toBeGreaterThan(aiBranch);
  });
});
