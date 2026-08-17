/// <reference types="vitest/globals" />

import {
  hasMoreHistoryFromMetadata,
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

  it("keeps the paging control visible when metadata exceeds the first page", () => {
    expect(
      hasMoreHistoryFromMetadata({
        pageHasMore: false,
        metadataCount: 8703,
        loadedCount: 50,
      }),
    ).toBe(true);
  });
});
