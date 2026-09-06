/// <reference types="vitest/globals" />

import { shouldReloadAfterGeneration } from "./chatGenerationReload";

describe("shouldReloadAfterGeneration", () => {
  it("does not reload an older DB snapshot over newer local messages", () => {
    expect(
      shouldReloadAfterGeneration({
        dbMessages: [
          { id: "user-1", content: "hello" },
          { id: "ai-1", content: "first" },
        ],
        localMessages: [
          { id: "user-1", content: "hello" },
          { id: "ai-1", content: "first" },
          { id: "ai-2", content: "last" },
        ],
        hasStreamingPlaceholder: false,
      }),
    ).toBe(false);
  });

  it("does not reload when the local window is a suffix of a longer history", () => {
    // The paged UI holds the newest 2 of 4 stored messages. Comparing lengths
    // would reload here and wipe the window; comparing IDs must not.
    expect(
      shouldReloadAfterGeneration({
        dbMessages: [
          { id: "old-1", content: "a" },
          { id: "old-2", content: "b" },
          { id: "user-1", content: "hello" },
          { id: "ai-1", content: "reply" },
        ],
        localMessages: [
          { id: "user-1", content: "hello" },
          { id: "ai-1", content: "reply" },
        ],
        hasStreamingPlaceholder: false,
      }),
    ).toBe(false);
  });

  it("keeps a pending user message that has not been persisted yet", () => {
    // Reproduces the reported bug: a message sent through the 400ms debounce is
    // still absent from IndexedDB when the generation watcher fires.
    expect(
      shouldReloadAfterGeneration({
        dbMessages: [
          { id: "old-1", content: "a" },
          { id: "old-2", content: "b" },
          { id: "ai-1", content: "reply" },
        ],
        localMessages: [
          { id: "ai-1", content: "reply" },
          { id: "user-pending", content: "？" },
        ],
        hasStreamingPlaceholder: false,
      }),
    ).toBe(false);
  });

  it("reloads to replace a streaming placeholder", () => {
    expect(
      shouldReloadAfterGeneration({
        dbMessages: [
          { id: "old-1", content: "a" },
          { id: "user-1", content: "hello" },
          { id: "ai-final", content: "landed" },
        ],
        localMessages: [
          { id: "user-1", content: "hello" },
          { id: "ai-placeholder", content: "", isStreaming: true },
        ],
        hasStreamingPlaceholder: true,
      }),
    ).toBe(true);
  });

  it("reloads when the DB has a message appended inside the window", () => {
    expect(
      shouldReloadAfterGeneration({
        dbMessages: [
          { id: "old-1", content: "a" },
          { id: "user-1", content: "hello" },
          { id: "ai-1", content: "reply" },
          { id: "ai-2", content: "background append" },
        ],
        localMessages: [
          { id: "user-1", content: "hello" },
          { id: "ai-1", content: "reply" },
        ],
        hasStreamingPlaceholder: false,
      }),
    ).toBe(true);
  });

  it("reloads when stored content for a visible message differs", () => {
    expect(
      shouldReloadAfterGeneration({
        dbMessages: [
          { id: "old-1", content: "a" },
          { id: "ai-1", content: "final content" },
        ],
        localMessages: [{ id: "ai-1", content: "partial" }],
        hasStreamingPlaceholder: false,
      }),
    ).toBe(true);
  });

  it("does not reload when the window matches the tail exactly", () => {
    expect(
      shouldReloadAfterGeneration({
        dbMessages: [{ id: "ai-1", content: "same" }],
        localMessages: [{ id: "ai-1", content: "same" }],
        hasStreamingPlaceholder: false,
      }),
    ).toBe(false);
  });

  it("does not reload an empty chat", () => {
    expect(
      shouldReloadAfterGeneration({
        dbMessages: [],
        localMessages: [],
        hasStreamingPlaceholder: false,
      }),
    ).toBe(false);
  });
});
