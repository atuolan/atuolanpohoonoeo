export interface TtsAudioSegmentLike {
  audioUrl?: string;
}

export function getTtsAudioRenderKey(
  segments: TtsAudioSegmentLike[] | undefined,
  legacyAudioUrl: string | undefined,
): string {
  const segmentAvailability = segments
    ?.map((segment) => (segment.audioUrl ? "1" : "0"))
    .join("") ?? "";
  return `${legacyAudioUrl ? "1" : "0"}:${segmentAvailability}`;
}
