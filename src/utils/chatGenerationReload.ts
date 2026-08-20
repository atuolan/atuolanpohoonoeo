export interface GenerationReloadMessage {
  id: string;
  content?: string;
}

export interface GenerationReloadInput {
  dbMessages: GenerationReloadMessage[];
  localMessages: GenerationReloadMessage[];
  hasStreamingPlaceholder: boolean;
}

export function shouldReloadAfterGeneration({
  dbMessages,
  localMessages,
  hasStreamingPlaceholder,
}: GenerationReloadInput): boolean {
  // A smaller DB snapshot can be stale while the final generated message is
  // still being persisted. Reloading it would overwrite newer local messages.
  if (dbMessages.length < localMessages.length) return false;

  return (
    dbMessages.length > localMessages.length ||
    hasStreamingPlaceholder ||
    (dbMessages.length === localMessages.length &&
      dbMessages.length > 0 &&
      dbMessages[dbMessages.length - 1]?.content !==
        localMessages[localMessages.length - 1]?.content)
  );
}
