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
});
