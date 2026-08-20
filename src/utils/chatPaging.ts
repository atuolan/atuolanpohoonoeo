export interface ChatPagingScrollState {
  scrollTop: number;
  hasMoreMessages: boolean;
  isLoadingMore: boolean;
  isSearchContextMode: boolean;
  threshold?: number;
}

export interface ChatPagingMetadataState {
  pageHasMore: boolean;
  metadataCount: number | null | undefined;
  loadedCount: number;
}

export function hasMoreHistoryFromMetadata({
  pageHasMore,
}: ChatPagingMetadataState): boolean {
  return pageHasMore;
}

export function prependUniqueMessages<T extends { id: string }>(
  currentMessages: T[],
  olderMessages: T[],
): { messages: T[]; addedCount: number } {
  const knownIds = new Set(currentMessages.map((message) => message.id));
  const uniqueOlderMessages: T[] = [];

  for (const message of olderMessages) {
    if (knownIds.has(message.id)) continue;
    knownIds.add(message.id);
    uniqueOlderMessages.push(message);
  }

  return {
    messages: [...uniqueOlderMessages, ...currentMessages],
    addedCount: uniqueOlderMessages.length,
  };
}

export function shouldLoadOlderMessages({
  scrollTop,
  hasMoreMessages,
  isLoadingMore,
  isSearchContextMode,
  threshold = 96,
}: ChatPagingScrollState): boolean {
  return (
    !isSearchContextMode &&
    !isLoadingMore &&
    hasMoreMessages &&
    scrollTop <= threshold
  );
}
