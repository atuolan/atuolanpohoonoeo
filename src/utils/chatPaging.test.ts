/// <reference types="vitest/globals" />

import {
  hasMoreHistoryFromMetadata,
  prependUniqueMessages,
  shouldLoadOlderMessages,
} from "@/utils/chatPaging";

describe("chat paging scroll trigger", () => {
  it("requests older messages at the top when more history exists", () => {
    expect(
      shouldLoadOlderMessages({
        scrollTop: 0,
        hasMoreMessages: true,
        isLoadingMore: false,
        isSearchContextMode: false,
      }),
    ).toBe(true);
  });

  it("does not request while loading, away from top, or in search context", () => {
    expect(
      shouldLoadOlderMessages({
        scrollTop: 200,
        hasMoreMessages: true,
        isLoadingMore: false,
        isSearchContextMode: false,
      }),
    ).toBe(false);
    expect(
      shouldLoadOlderMessages({
        scrollTop: 0,
        hasMoreMessages: true,
        isLoadingMore: true,
        isSearchContextMode: false,
      }),
    ).toBe(false);
    expect(
      shouldLoadOlderMessages({
        scrollTop: 0,
        hasMoreMessages: true,
        isLoadingMore: false,
        isSearchContextMode: true,
      }),
    ).toBe(false);
  });

  it("does not trust stale metadata after the database page is exhausted", () => {
    expect(
      hasMoreHistoryFromMetadata({
        pageHasMore: false,
        metadataCount: 8703,
        loadedCount: 50,
      }),
    ).toBe(false);
  });

  it("does not duplicate a message when a stale cursor returns the same page", () => {
    const current = [{ id: "msg-1", content: "hello" }];
    const result = prependUniqueMessages(current, [
      { id: "msg-1", content: "hello" },
      { id: "msg-1", content: "hello" },
    ]);

    expect(result.messages).toEqual(current);
    expect(result.addedCount).toBe(0);
  });
});
