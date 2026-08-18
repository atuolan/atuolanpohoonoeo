# Message TTS Regeneration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an AI-message-only long-press action that regenerates that message's MiniMax voice, including messages that never had TTS audio.

**Architecture:** Reuse `useChatTTS` and its existing `processMessageTTS` pipeline. Add a dedicated `regenerateMessageTTS(messageId)` wrapper for eligibility checks, duplicate-request locking, source selection, and rollback; wire a new `regenerateVoice` event through `MessageBubble` and `ChatScreen`.

**Tech Stack:** Vue 3 `<script setup>`, TypeScript, Vitest, MiniMax TTS API, existing `cleanTTSTags` / `parseTTSSegments` utilities.

## Global Constraints

- The action is visible only for AI messages; user messages must not render it.
- MiniMax must be enabled for the current chat and have an API key before an API request is made.
- Prefer `ttsRawContent`; fall back to `content` when no TTS source exists.
- Reuse the existing MiniMax settings, prompt contract, segment parser, URL persistence, and chat save path.
- Preserve previous audio if a manual regeneration fails.

---

### Task 1: Add pure TTS source and eligibility helpers

**Files:**
- Create: `src/utils/messageTTS.ts`
- Test: `src/utils/messageTTS.test.ts`

**Interfaces:**
- Produces `getMessageTTSSource(message: { content: string; ttsRawContent?: string }): string`.
- Produces `canRegenerateMessageTTS(message: { role: "user" | "ai" | "system"; content: string }): boolean`.

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, expect, it } from "vitest";
import { canRegenerateMessageTTS, getMessageTTSSource } from "./messageTTS";

describe("message TTS helpers", () => {
  it("prefers the raw TTS source when present", () => {
    expect(getMessageTTSSource({ content: "顯示文字", ttsRawContent: "原始(laughs)" })).toBe("原始(laughs)");
  });

  it("falls back to message content", () => {
    expect(getMessageTTSSource({ content: "普通文字" })).toBe("普通文字");
  });

  it("allows only non-empty AI messages", () => {
    expect(canRegenerateMessageTTS({ role: "ai", content: "一句話" })).toBe(true);
    expect(canRegenerateMessageTTS({ role: "user", content: "一句話" })).toBe(false);
    expect(canRegenerateMessageTTS({ role: "ai", content: "   " })).toBe(false);
  });
});
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run: `npx vitest run src/utils/messageTTS.test.ts`

Expected: FAIL because `src/utils/messageTTS.ts` does not exist.

- [ ] **Step 3: Implement the minimal helpers**

```ts
export function getMessageTTSSource(message: { content: string; ttsRawContent?: string }): string {
  return message.ttsRawContent?.trim() || message.content.trim();
}

export function canRegenerateMessageTTS(message: { role: "user" | "ai" | "system"; content: string }): boolean {
  return message.role === "ai" && message.content.trim().length > 0;
}
```

- [ ] **Step 4: Run the focused test and verify it passes**

Run: `npx vitest run src/utils/messageTTS.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/utils/messageTTS.ts src/utils/messageTTS.test.ts
git commit -m "test: define message TTS regeneration eligibility"
```

### Task 2: Extend `useChatTTS` with manual regeneration and rollback

**Files:**
- Modify: `src/composables/useChatTTS.ts`
- Test: `src/composables/useChatTTS.test.ts`

**Interfaces:**
- Consumes the helpers from Task 1 and the existing `settingsStore`, `messages`, and `saveChat` context.
- Produces `regenerateMessageTTS(messageId: string): Promise<{ success: boolean; reason?: string }>`.

- [ ] **Step 1: Write failing tests for guards, source selection, and rollback**

Create `src/composables/useChatTTS.test.ts` with a minimal `ref` context and mocked `@/api/MiniMaxTTSApi`:

```ts
it("blocks manual regeneration when chat TTS is disabled", async () => {
  const api = { minimaxTTS: { apiKey: "key" } };
  const { regenerateMessageTTS } = useChatTTS({ messages: ref([aiMessage]), chatMinimaxTTSEnabled: ref(false), showChatSettingsMenu: ref(false), settingsStore: api, saveChat: vi.fn() });
  await expect(regenerateMessageTTS(aiMessage.id)).resolves.toEqual({ success: false, reason: "disabled" });
});

it("uses content when an AI message has no previous TTS source", async () => {
  vi.mocked(synthesizeSpeech).mockResolvedValue({ success: true, audioUrl: "data:audio/mp3;base64,new" });
  const { regenerateMessageTTS } = useChatTTS({ messages: ref([aiMessage]), chatMinimaxTTSEnabled: ref(true), showChatSettingsMenu: ref(false), settingsStore: { minimaxTTS: { apiKey: "key" } }, saveChat: vi.fn() });
  await regenerateMessageTTS(aiMessage.id);
  expect(vi.mocked(synthesizeSpeech)).toHaveBeenCalledWith("沒有標記的句子", expect.anything(), expect.anything());
});

it("restores the previous audio when regeneration fails", async () => {
  const message = { ...aiMessage, ttsRawContent: "舊原文", ttsAudioUrl: "data:audio/mp3;base64,old", ttsSegments: [{ emotion: "neutral", speed: 1, text: "舊原文", clean: "舊原文", audioUrl: "data:audio/mp3;base64,old" }] };
  vi.mocked(synthesizeSpeech).mockResolvedValue({ success: false, error: "failed" });
  const { regenerateMessageTTS } = useChatTTS({ messages: ref([message]), chatMinimaxTTSEnabled: ref(true), showChatSettingsMenu: ref(false), settingsStore: { minimaxTTS: { apiKey: "key" } }, saveChat: vi.fn() });
  await regenerateMessageTTS(message.id);
  expect(message.ttsAudioUrl).toBe("data:audio/mp3;base64,old");
});
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run: `npx vitest run src/composables/useChatTTS.test.ts`

Expected: FAIL because `regenerateMessageTTS` is not returned by the composable.

- [ ] **Step 3: Implement the minimal production behavior**

In `useChatTTS.ts`:

1. Change `processMessageTTS` to return `Promise<boolean>` while keeping existing callers valid.
2. Add a `Set<string>` lock for in-flight manual regenerations.
3. In `regenerateMessageTTS`, validate chat toggle, API key, message existence/role/content, and duplicate lock.
4. Snapshot `ttsRawContent`, `ttsAudioUrl`, and a deep copy of `ttsSegments`; call `processMessageTTS(messageId, getMessageTTSSource(message), { force: true })`.
5. Restore the snapshot when the forced call returns `false` or throws; release the lock in `finally`.
6. Return stable reason codes for UI toast handling.

- [ ] **Step 4: Run focused composable tests**

Run: `npx vitest run src/composables/useChatTTS.test.ts src/utils/messageTTS.test.ts`

Expected: PASS with rollback and duplicate-request coverage.

- [ ] **Step 5: Commit**

```bash
git add src/composables/useChatTTS.ts src/composables/useChatTTS.test.ts
git commit -m "feat: support manual message TTS regeneration"
```

### Task 3: Add the AI-only long-press menu action and wire ChatScreen

**Files:**
- Modify: `src/components/common/MessageBubble.vue`
- Modify: `src/components/screens/ChatScreen.vue`

**Interfaces:**
- `MessageBubble` emits `(e: "regenerateVoice", id: string): void` and renders the action inside the `!isUser` menu branch.
- `ChatScreen` handles `@regenerate-voice` by invoking `regenerateMessageTTS` and showing one-line toast feedback.

- [ ] **Step 1: Add static menu contract assertions**

Create `src/components/common/MessageBubble.test.ts` that reads the SFC source with `fs.readFileSync` and asserts the `regenerateVoice` emit, `handleRegenerateVoice` handler, `@click` binding, and the `v-if="!isUser"` placement are present. This repository does not include Vue Test Utils, so the runtime behavior is verified through the composable tests and the Vue compiler.

- [ ] **Step 2: Implement the menu event**

Add `regenerateVoice` to `defineEmits`, add `handleRegenerateVoice()` with the same 800ms menu-open guard used by other actions, and render:

```vue
<button class="menu-item" @click="handleRegenerateVoice">
  <span>重新生成語音</span>
</button>
```

inside the existing `v-if="!isUser"` menu branch.

- [ ] **Step 3: Wire the screen handler**

Expose `regenerateMessageTTS` from `useChatTTS`, add `onMessageRegenerateVoice`, bind `@regenerate-voice`, and map reason codes to existing `showToast`:

```ts
const result = await regenerateMessageTTS(messageId);
if (result.success) showToast("語音已重新生成");
else if (result.reason === "disabled") showToast("請先開啟 MiniMax 語音生成");
else if (result.reason === "missing-api-key") showToast("請先設定 MiniMax API Key");
else if (result.reason === "duplicate") return;
else showToast("語音生成失敗，請重試");
```

- [ ] **Step 4: Run type-check and focused tests**

Run: `npm run type-check` and `npx vitest run src/utils/messageTTS.test.ts src/composables/useChatTTS.test.ts`.

Expected: PASS with no Vue template or event type errors.

- [ ] **Step 5: Commit**

```bash
git add src/components/common/MessageBubble.vue src/components/screens/ChatScreen.vue
git commit -m "feat: add message long-press regenerate voice action"
```

### Task 4: Full verification and independent review

**Files:**
- No new production files.

- [ ] **Step 1: Run the full test suite**

Run: `npm run test`

Expected: all Vitest tests pass.

- [ ] **Step 2: Run the production build**

Run: `npm run build`

Expected: `vue-tsc` and Vite build complete successfully.

- [ ] **Step 3: Inspect the final diff**

Run: `git diff HEAD~3..HEAD --check` and `git status --short`.

Expected: no whitespace errors and only the planned files changed.

- [ ] **Step 4: Request independent review**

Send the final diff, spec, and verification output to an independent review agent. Review specifically for menu visibility, MiniMax guard behavior, rollback correctness, stale audio races, and event naming consistency. Fix all important findings and rerun the affected tests.
