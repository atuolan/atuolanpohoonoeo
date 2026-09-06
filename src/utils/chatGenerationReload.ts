export interface GenerationReloadMessage {
  id: string;
  content?: string;
  /** True for the streaming placeholder bubble that a reload is meant to replace. */
  isStreaming?: boolean;
}

export interface GenerationReloadInput {
  dbMessages: GenerationReloadMessage[];
  localMessages: GenerationReloadMessage[];
  hasStreamingPlaceholder: boolean;
}

/**
 * Decide whether the paged UI window should be rebuilt from IndexedDB.
 *
 * `dbMessages` is the complete history while `localMessages` is only the newest
 * page, so their lengths are not comparable — a long chat always has more rows
 * in IndexedDB than on screen. Every check therefore works on message IDs and
 * treats the local window as a suffix of the stored history.
 */
export function shouldReloadAfterGeneration({
  dbMessages,
  localMessages,
  hasStreamingPlaceholder,
}: GenerationReloadInput): boolean {
  const dbIds = new Set(dbMessages.map((message) => message.id));

  // Messages that exist only in the UI are not persisted yet (the debounced
  // save may still be pending). Reloading would drop them, so never do it.
  // A streaming placeholder is exempt: replacing it is the point of the reload.
  const hasUnpersistedLocalMessage = localMessages.some(
    (message) => !dbIds.has(message.id) && !message.isStreaming,
  );
  if (hasUnpersistedLocalMessage) return false;

  if (hasStreamingPlaceholder) return true;

  const localById = new Map(localMessages.map((message) => [message.id, message]));

  // Older history outside the current page is expected to be missing locally.
  // Only rows at or after the window's first message count as newly appended.
  const firstLocalId = localMessages[0]?.id;
  const windowStart = firstLocalId
    ? dbMessages.findIndex((message) => message.id === firstLocalId)
    : 0;
  const storedWindow =
    windowStart >= 0 ? dbMessages.slice(windowStart) : dbMessages;

  return storedWindow.some((stored) => {
    const local = localById.get(stored.id);
    return !local || stored.content !== local.content;
  });
}
