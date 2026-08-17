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
  metadataCount,
  loadedCount,
}: ChatPagingMetadataState): boolean {
  return pageHasMore || (metadataCount ?? 0) > loadedCount;
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
