# 一對一聊天工具呼叫與提示詞後處理 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在一對一聊天中加入 SillyTavern 完整提示詞後處理、原生優先的工具呼叫、每角色權限，以及低風險自動執行／高風險確認流程。

**Architecture:** 以獨立 `PromptPostProcessor`、`ToolRegistry`、`ToolProtocolAdapter` 和 `ToolExecutionEngine` 分離提示詞、協議、權限與執行。`OpenAICompatibleClient` 只負責供應商請求與回應解析，`useChatGeneration` 負責多輪工具迴圈，ChatScreen 只接收工具狀態與確認事件。

**Tech Stack:** Vue 3、TypeScript、Pinia、Vitest、現有 IndexedDB storage、現有 OpenAI 相容與 Anthropic API 路徑。

## Global Constraints

- 第一階段只支援一對一聊天；群聊工具呼叫者驗證另立計畫。
- 完整模式值為 `none`、`claude`、`merge`、`merge_tools`、`semi`、`semi_tools`、`strict`、`strict_tools`、`single`。
- 非 `*_tools` 模式把 `tool` 轉為 `user` 並移除 `tool_calls`、`tool_call_id`；`*_tools` 模式保留它們。
- 工具協議為 `auto | native | text | disabled`；`auto` 僅在 400/422 且明確不支援 tools 時切換文字備援。
- 每輪最多 5 次工具往返，每個工具 15 秒 timeout，工具結果最多 8,000 字元。
- 未知工具、未授權工具、非 object 參數和 Schema 驗證失敗一律拒絕執行。
- 工具不得接受模型提供的任意 URL、JavaScript、IndexedDB key 或檔案路徑。
- 低風險工具自動執行；高風險工具透過記憶體中的 `PendingToolConfirmation` 暫停並等待使用者核准／拒絕。
- 生產程式碼遵守 TDD：每個行為先寫一個會失敗的測試，再寫最小實作。

---

### Task 1: 擴充訊息、設定與角色資料型別

**Files:**
- Modify: `src/api/OpenAICompatible.ts:96-126, 220-245`
- Modify: `src/types/settings.ts:18-40, 220-226`
- Modify: `src/types/character.ts:283-314, 336-374`
- Test: `src/api/OpenAICompatible.types.test.ts`
- Test: `src/types/character.test.ts`

**Interfaces:**
- Produce `ToolCallFunction`, `ToolCallPayload`, `CharacterToolPermissions`, `ToolProtocol` and `createDefaultCharacterToolPermissions()`.
- Extend `APIMessage.role` with `"tool"`; add optional `tool_calls` and `tool_call_id`.
- Extend `APISettings` with `promptPostProcessing`, `toolProtocol`, and `toolsEnabled` defaults (`"none"`, `"auto"`, `true`).
- Add optional `toolPermissions` to `StoredCharacter` and initialize old/missing records to enabled with empty overrides.

- [ ] **Step 1: Write the failing tests**

```ts
it("creates a character with enabled default tool permissions", () => {
  expect(createDefaultStoredCharacter().toolPermissions).toEqual({
    enabled: true,
    categories: {},
    tools: {},
  });
});

it("accepts an assistant tool call and a tool result message", () => {
  const messages: APIMessage[] = [
    { role: "assistant", content: "", tool_calls: [{ id: "call-1", type: "function", function: { name: "get_time", arguments: "{}" } }] },
    { role: "tool", content: "2026-08-07", tool_call_id: "call-1" },
  ];
  expect(messages[0].tool_calls?.[0].function.name).toBe("get_time");
});
```

- [ ] **Step 2: Run tests and verify they fail**

Run: `npx vitest run src/api/OpenAICompatible.types.test.ts src/types/character.test.ts`
Expected: FAIL because the new role, fields, defaults, and settings properties do not exist.

- [ ] **Step 3: Implement the type and default changes**

Use explicit string unions and optional fields. Add `toolPermissions` without changing the serialized shape of existing characters except for the new default field. Add a normalizer in `CharacterService` so imported old records receive the defaults before storage.

- [ ] **Step 4: Run tests and type-check**

Run: `npx vitest run src/api/OpenAICompatible.types.test.ts src/types/character.test.ts` and `npm run type-check`
Expected: PASS with no type errors.

- [ ] **Step 5: Commit**

```powershell
git add src/api/OpenAICompatible.ts src/types/settings.ts src/types/character.ts src/api/OpenAICompatible.types.test.ts src/types/character.test.ts
git commit -m "feat: add tool calling and prompt processing types"
```

### Task 2: Implement the SillyTavern prompt post-processor

**Files:**
- Create: `src/utils/promptPostProcessor.ts`
- Create: `src/utils/promptPostProcessor.test.ts`

**Interfaces:**
- Produce `PromptPostProcessingType`, `PromptPostProcessingOptions`, `postProcessPrompt(messages, type, options): APIMessage[]`.
- Preserve `identifier`, `name` prefixes, text/image/audio blocks, and original input immutability.

- [ ] **Step 1: Write failing tests for all mode contracts**

Cover: empty/none clone, `claude` equals `merge`, merge of adjacent roles, semi conversion of middle system, strict insertion after system and at non-user start, single all-user result, tool preservation/removal, multimodal merge, empty placeholder, and input not mutated.

- [ ] **Step 2: Run the focused test**

Run: `npx vitest run src/utils/promptPostProcessor.test.ts`
Expected: FAIL because the module is absent.

- [ ] **Step 3: Implement minimal pure helpers**

Implement `cloneMessage`, `toTextParts`, `mergeContent`, `mergeMessages`, and `postProcessPrompt`. Use `\n\n` between merged text segments. For strict mode, convert all system messages after index zero to user, insert `{ role: "user", content: "[Start a new chat]" }` when required, then merge again. Do not mutate caller objects.

- [ ] **Step 4: Run focused and full tests**

Run: `npx vitest run src/utils/promptPostProcessor.test.ts` then `npm test`
Expected: PASS; existing tests remain green.

- [ ] **Step 5: Commit**

```powershell
git add src/utils/promptPostProcessor.ts src/utils/promptPostProcessor.test.ts
git commit -m "feat: add SillyTavern prompt post processing"
```

### Task 3: Build shared tool definitions, Schema validation, and permissions

**Files:**
- Create: `src/services/toolCalling/types.ts`
- Create: `src/services/toolCalling/jsonSchema.ts`
- Create: `src/services/toolCalling/permissions.ts`
- Create: `src/services/toolCalling/toolRegistry.ts`
- Create: `src/services/toolCalling/permissions.test.ts`
- Create: `src/services/toolCalling/jsonSchema.test.ts`

**Interfaces:**
- `ChatToolCategory`, `ChatToolContext`, `ChatToolDefinition`, `ToolCall`, `ToolResult`, `PendingToolConfirmation`.
- `validateJsonSchema(schema, value): { ok: true; value } | { ok: false; error }` supporting object, string, number, integer, boolean, array, enum, required, properties, and additionalProperties=false.
- `filterToolsForCharacter(registry, globalEnabled, permissions): ChatToolDefinition[]`.
- `isToolAllowed(tool, globalEnabled, permissions): boolean`.
- `ToolRegistry.register`, `get`, `list`, and `toOpenAITools`.

- [ ] **Step 1: Write failing tests**

Test object/required/type/enum validation, unknown field rejection, category defaults, single-tool override precedence, global/character disable, unknown tool rejection, registry replacement rejection, and OpenAI schema output.

- [ ] **Step 2: Run tests and verify RED**

Run: `npx vitest run src/services/toolCalling/permissions.test.ts src/services/toolCalling/jsonSchema.test.ts`
Expected: FAIL because the modules do not exist.

- [ ] **Step 3: Implement the core**

Keep validation deterministic and dependency-free. Registry names must be unique and match `^[a-z][a-z0-9_]{1,63}$`. Permission resolution must apply global flag, character flag, tool override, category override, then definition default.

- [ ] **Step 4: Run tests and type-check**

Run: `npx vitest run src/services/toolCalling/permissions.test.ts src/services/toolCalling/jsonSchema.test.ts` and `npm run type-check`
Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add src/services/toolCalling
git commit -m "feat: add tool registry and character permissions"
```

### Task 4: Add protocol adapters and streaming tool-call parsing

**Files:**
- Create: `src/services/toolCalling/protocolAdapters.ts`
- Create: `src/services/toolCalling/protocolAdapters.test.ts`
- Modify: `src/types/chat.ts:1206-1229`

**Interfaces:**
- `ToolProtocol = "auto" | "native" | "text" | "disabled"`.
- `OpenAIToolDefinition`, `ToolProtocolAdapter` with `buildRequestTools`, `parseGeneration`, `appendToolResult`, and `isUnsupportedToolsError`.
- Extend `GenerationResult` with `toolCalls?: ToolCall[]`; extend `StreamingEvent` with `toolCallDelta?` and final `toolCalls?`.

- [ ] **Step 1: Write failing adapter tests**

Test OpenAI non-stream response, fragmented OpenAI tool-call deltas, Claude `tool_use`, Claude `tool_result`, fenced `tool_calls` JSON, invalid JSON, and fallback status/error matching. Assert regular text remains separate from tool calls.

- [ ] **Step 2: Run RED**

Run: `npx vitest run src/services/toolCalling/protocolAdapters.test.ts`
Expected: FAIL because parser and result fields are missing.

- [ ] **Step 3: Implement adapters**

Use a per-request accumulator keyed by tool-call index/id. Parse arguments only after a complete call; invalid object arguments become a structured tool error. Text fallback must remove the fenced block from visible content.

- [ ] **Step 4: Run tests**

Run: `npx vitest run src/services/toolCalling/protocolAdapters.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add src/services/toolCalling/protocolAdapters.ts src/services/toolCalling/protocolAdapters.test.ts src/types/chat.ts
git commit -m "feat: add native and text tool protocol adapters"
```

### Task 5: Integrate post-processing and native tools into the API client

**Files:**
- Create: `src/api/OpenAICompatible.request.test.ts`
- Modify: `src/api/OpenAICompatible.ts:644-821, 856-1069, 1132-1197, 1202-1290, 1470-1660`

**Interfaces:**
- `GenerationParams` consumes `tools`, `toolProtocol`, `promptPostProcessing`, and `toolContext`.
- `buildRequest` sends processed messages and OpenAI `tools` only when protocol is native/auto and tools are non-empty.
- Anthropic request builder sends Claude tool definitions and preserves `tool_use/tool_result` blocks.
- `generate` and `generateStream` return parsed `toolCalls` without losing existing text, usage, diagnostics, or stop reasons.

- [ ] **Step 1: Write failing request tests**

Mock `fetch` and assert: strict messages are sent, original input stays unchanged, `none` sends unchanged clone, `tools` appears only when enabled, tool messages retain fields in tools modes, non-tools mode removes them, OpenAI tool calls parse from JSON, and Anthropic tool blocks are emitted.

- [ ] **Step 2: Run RED**

Run: `npx vitest run src/api/OpenAICompatible.request.test.ts`
Expected: FAIL because request builders do not accept the new options or parse tool calls.

- [ ] **Step 3: Implement request integration**

Call `postProcessPrompt` at the start of each request builder. Keep existing DeepSeek alternation and Claude last-role adjustments after post-processing. Delegate protocol formatting/parsing to Task 4 adapters. Do not log full message content or API keys.

- [ ] **Step 4: Run focused, type, and regression tests**

Run: `npx vitest run src/api/OpenAICompatible.request.test.ts src/services/toolCalling/protocolAdapters.test.ts`, `npm run type-check`, and `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add src/api/OpenAICompatible.ts src/api/OpenAICompatible.request.test.ts
git commit -m "feat: send processed prompts and native tools"
```

### Task 6: Add the execution engine and confirmation lifecycle

**Files:**
- Create: `src/services/toolCalling/toolExecutionEngine.ts`
- Create: `src/services/toolCalling/toolExecutionEngine.test.ts`

**Interfaces:**
- `ToolExecutionEngine.run(initialMessages, requestContext): Promise<ToolExecutionOutcome>`.
- `ToolExecutionOutcome` is `{ status: "completed"; content; messages; toolResults } | { status: "confirmation_required"; pending }`.
- `resolveToolConfirmation(id, decision): Promise<ToolExecutionOutcome>`.
- Inject a `generate` callback so the engine can be tested without network calls.

- [ ] **Step 1: Write failing engine tests**

Cover low-risk automatic execution, high-risk pause, approve/resume, reject/resume, invalid args, denied permission, tool error, 15-second timeout, 8,000-character truncation, duplicate normalized call, and five-round cap.

- [ ] **Step 2: Run RED**

Run: `npx vitest run src/services/toolCalling/toolExecutionEngine.test.ts`
Expected: FAIL because the engine is absent.

- [ ] **Step 3: Implement the engine**

Use `AbortController` plus a 15,000 ms timer per execution. Normalize arguments with stable sorted JSON for duplicate detection. Append assistant tool-call messages and tool result messages to the internal conversation only; never persist them as user-visible chat messages by default. Store pending confirmations in a map keyed by UUID and invalidate them on `cancel(chatId)`.

- [ ] **Step 4: Run engine tests**

Run: `npx vitest run src/services/toolCalling/toolExecutionEngine.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add src/services/toolCalling/toolExecutionEngine.ts src/services/toolCalling/toolExecutionEngine.test.ts
git commit -m "feat: add bounded tool execution loop"
```

### Task 7: Register the first one-to-one phone tools

**Files:**
- Create: `src/services/toolCalling/chatTools.ts`
- Create: `src/services/toolCalling/chatTools.test.ts`
- Modify: `src/services/WeatherService.ts` only if an existing exported function needs a narrow adapter.
- Modify: `src/services/IncomingCallScheduler.ts` only if an existing scheduler method needs a typed adapter.
- Modify: `src/stores/music.ts` only if the tool needs a narrow existing action wrapper.
- Modify: `src/stores/theme.ts` only if the tool needs a narrow existing action wrapper.

**Interfaces:**
- Export `CHAT_TOOLS: ChatToolDefinition[]` and `createChatToolRegistry(context): ToolRegistry`.
- Initial low-risk tools: `get_current_time`, `get_weather`, `list_calendar_events`, `search_music`, `play_music`, `set_wallpaper`, `search_memory`.
- `create_calendar_event` and `schedule_call` are high risk; the execution engine pauses before calling their `execute` function and only invokes it after approval.

- [ ] **Step 1: Write failing service-level tests**

Test each tool's schema rejects missing/unsafe arguments, weather uses a fixed city/character context rather than a model-supplied URL, music search returns a bounded summary, wallpaper only accepts existing preset/color values, and high-risk definitions are marked `risk: "high"`.

- [ ] **Step 2: Run RED**

Run: `npx vitest run src/services/toolCalling/chatTools.test.ts`
Expected: FAIL because `CHAT_TOOLS` is absent.

- [ ] **Step 3: Implement narrow adapters**

Call existing store/service APIs through `ChatToolContext`; do not duplicate persistence logic. Cap every returned summary at the shared 8,000-character helper. Use `characterId` and `chatId` from context for character-scoped data.

- [ ] **Step 4: Run tests**

Run: `npx vitest run src/services/toolCalling/chatTools.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add src/services/toolCalling/chatTools.ts src/services/toolCalling/chatTools.test.ts src/services/WeatherService.ts src/services/IncomingCallScheduler.ts src/stores/music.ts src/stores/theme.ts
git commit -m "feat: register one-to-one phone tools"
```

### Task 8: Integrate tool execution into chat generation

**Files:**
- Create: `src/composables/useChatGeneration.tools.test.ts`
- Modify: `src/composables/useChatGeneration.ts:1-125`
- Modify: `src/components/screens/ChatScreen.vue:4180-4650`

**Interfaces:**
- Extend `ChatGenerationRequestRunnerContext` with `tools`, `toolProtocol`, `characterId`, `chatId`, `toolPermissions`, `onToolEvent`, and `onConfirmationRequired`.
- `runChatGenerationRequest` delegates to `ToolExecutionEngine` when tools are enabled and preserves the existing streaming token callbacks for final text.
- Non-chat callers remain unchanged because tools default to disabled.

- [ ] **Step 1: Write failing integration tests**

Test a mocked client returning one low-risk tool call then final text, a high-risk call that pauses without a second API request until approval, a rejected call, and a normal text response that follows the existing path.

- [ ] **Step 2: Run RED**

Run: `npx vitest run src/composables/useChatGeneration.tools.test.ts`
Expected: FAIL because the runner does not expose tool state or loop over tool calls.

- [ ] **Step 3: Implement integration**

Build the registry from the current character and context, filter tools by global and character settings, pass post-processing and protocol settings to the client, forward tool lifecycle events to the caller, and preserve existing diagnostics/token usage aggregation.

- [ ] **Step 4: Run tests and type-check**

Run: `npx vitest run src/composables/useChatGeneration.tools.test.ts` and `npm run type-check`
Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add src/composables/useChatGeneration.ts src/composables/useChatGeneration.tools.test.ts src/components/screens/ChatScreen.vue
git commit -m "feat: run phone tools during one-to-one chat generation"
```

### Task 9: Add settings and per-character permission UI

**Files:**
- Create: `src/components/modals/ToolConfirmationModal.vue`
- Create: `src/components/panels/CharacterToolPermissionsPanel.vue`
- Create: `src/services/toolCalling/toolSettings.test.ts`
- Modify: `src/components/screens/SettingsScreen.vue:3620-3905`
- Modify: `src/components/screens/CharacterEditScreen.vue`
- Modify: `src/types/settings.ts`, `src/stores/settings.ts`, and character mapper paths for persistence/version migration.

**Interfaces:**
- Settings controls: prompt post-processing select, tool protocol select, global tools toggle.
- Character panel controls `enabled`, category toggles, and per-tool overrides from the registry; show risk labels without allowing unknown tool names.
- Confirmation modal emits `approve(id)` and `reject(id)` and displays masked args plus tool description.

- [ ] **Step 1: Write failing component/store tests**

Test defaults load for old settings/characters, changing settings persists, category override changes the filtered tool list, confirmation modal emits both decisions, and pending state disappears after chat cancellation.

- [ ] **Step 2: Run RED**

Run: `npx vitest run src/services/toolCalling/toolSettings.test.ts`
Expected: FAIL because settings and components do not expose the new controls.

- [ ] **Step 3: Implement persistence and UI**

Add settings defaults and migration without changing existing profile IDs. Add the character permission panel to the existing editor, save through `CharacterService.update`, mount the confirmation modal in ChatScreen, and clear pending confirmations on chat switch/stop.

- [ ] **Step 4: Run tests, type-check, and build**

Run: `npx vitest run src/services/toolCalling/toolSettings.test.ts`, `npm run type-check`, and `npm run build`
Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add src/components/modals/ToolConfirmationModal.vue src/components/panels/CharacterToolPermissionsPanel.vue src/components/screens/SettingsScreen.vue src/types/settings.ts src/stores/settings.ts src/types/character.ts src/services/CharacterService.ts src/services/toolCalling/toolSettings.test.ts
git commit -m "feat: add tool protocol and character permission settings"
```

### Task 10: Add Claude adapter, text fallback, and regression coverage

**Files:**
- Modify: `src/services/toolCalling/protocolAdapters.ts`
- Modify: `src/api/OpenAICompatible.ts`
- Create: `src/services/toolCalling/fallback.test.ts`
- Create: `src/api/OpenAICompatible.regression.test.ts`

**Interfaces:**
- Claude native requests use `tool_use` and `tool_result` blocks while preserving existing prompt cache breakpoints.
- Text fallback removes the fenced tool block from visible content and resumes through the same execution engine.

- [ ] **Step 1: Write failing fallback/regression tests**

Test only supported 400/422 errors trigger fallback; auth/timeout/5xx do not. Verify Claude cache metadata, DeepSeek role alternation, normal streaming, and no-tools requests remain unchanged.

- [ ] **Step 2: Run RED**

Run: `npx vitest run src/services/toolCalling/fallback.test.ts src/api/OpenAICompatible.regression.test.ts`
Expected: FAIL for missing fallback and regressions.

- [ ] **Step 3: Implement and wire fallback**

Keep fallback state per generation request, retry once with `toolProtocol: "text"`, and return the original error if the fallback also fails. Do not silently fallback when `toolProtocol` is `native`.

- [ ] **Step 4: Run the complete suite**

Run: `npm test`, `npm run type-check`, and `npm run build`
Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add src/services/toolCalling/protocolAdapters.ts src/services/toolCalling/fallback.test.ts src/api/OpenAICompatible.ts src/api/OpenAICompatible.regression.test.ts
git commit -m "feat: add Claude tools and text protocol fallback"
```

### Task 11: End-to-end verification and documentation

**Files:**
- Modify: `README.md`
- Create: `docs/superpowers/plans/2026-08-07-chat-tool-calling-verification.md`

**Verification record format:** The verification file must contain the commit SHA, command, exit code, test count, manual test timestamp, API provider/protocol (with the API key omitted), selected prompt mode, character ID hash, observed tool name, confirmation decision, and pass/fail result for each matrix row. Failed rows must include the exact error text and reproduction steps.

- [ ] **Step 1: Run all automated checks**

Run: `npm test`, `npm run type-check`, and `npm run build`
Expected: all commands exit 0.

- [ ] **Step 2: Run the development server**

Run: `npm run dev`
Expected: Vite starts on the configured local port and the app loads without console errors.

- [ ] **Step 3: Perform the one-to-one manual matrix**

Verify with a character whose tools are enabled:

1. `none`, `merge`, `semi`, `strict`, `single` each produce the documented roles.
2. `strict_tools` preserves a synthetic tool result in the outgoing request.
3. `get_current_time` executes automatically and the model receives its result.
4. `create_calendar_event` pauses with a confirmation card; approve executes once and reject does not mutate state.
5. Disable the character's media category and verify `search_music` is absent from the request and denied if requested anyway.
6. Stop generation or switch chats while confirmation is visible; the pending operation becomes invalid.

- [ ] **Step 4: Document configuration and limitations**

Add a README section describing mode values, protocol selection, per-character permissions, automatic versus confirmation-required tools, and the fact that群聊工具呼叫者驗證 is not part of this phase. Write the verification record with this exact heading structure:

```markdown
# Chat Tool Calling Verification
## Automated Checks
## Manual Matrix
| Case | Provider | Protocol | Prompt Mode | Tool | Decision | Result | Evidence |
## Known Limitations
```

- [ ] **Step 5: Commit**

```powershell
git add README.md docs/superpowers/plans/2026-08-07-chat-tool-calling-verification.md
git commit -m "docs: document and verify chat tool calling"
```

## Self-Review Checklist

- [ ] Every design requirement maps to at least one task: post-processing (2/5), tool types and permissions (1/3/9), native adapters (4/5/10), execution loop (6/8), first tools (7), confirmation UI (9), one-to-one acceptance (11).
- [ ] No task relies on an undefined production function; all cross-task interfaces are listed in the task's Interfaces section.
- [ ] Fallback behavior, limits, permission precedence, and confirmation lifecycle are numerically and behaviorally defined.
- [ ] Existing non-chat generation remains tools-disabled by default and existing Claude cache/DeepSeek behavior has regression tests.
- [ ] No群聊 implementation is included in this plan; it remains a separate follow-up design.
