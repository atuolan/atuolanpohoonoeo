export const MAX_RENDERED_MESSAGE_COUNT = 500;

export function nextVisibleMessageCount(
  currentCount: number,
  totalCount: number,
  pageSize: number,
  maxCount = MAX_RENDERED_MESSAGE_COUNT,
): number {
  if (currentCount >= totalCount || currentCount >= maxCount) {
    return Math.min(currentCount, totalCount, maxCount);
  }

  return Math.min(currentCount + pageSize, totalCount, maxCount);
}

export function hasMoreVisibleMessages(
  totalCount: number,
  visibleCount: number,
  maxCount = MAX_RENDERED_MESSAGE_COUNT,
): boolean {
  return totalCount > visibleCount && visibleCount < maxCount;
}
