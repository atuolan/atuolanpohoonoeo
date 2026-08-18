export interface TTSInlineButtonSegment {
  emotion?: string;
  audioUrl?: string;
}

const EMOTION_TAG_RE = /\[emotion=[^\]]*\]/gi;

function renderButton(segment: TTSInlineButtonSegment, index: number): string {
  const disabled = segment.audioUrl
    ? ""
    : ' style="opacity:0.3;cursor:default"';
  return `<span class="tts-inline-btn" data-tts-idx="${index}" title="${segment.emotion || ""}" role="button" aria-label="播放語音"${disabled}><svg class="tts-inline-btn__icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M8 5.6v12.8c0 .7.8 1.1 1.4.7l9.2-6.4c.5-.3.5-1.1 0-1.4L9.4 4.9c-.6-.4-1.4 0-1.4.7Z" /></svg></span>`;
}

/** Replace emotion markers, or append buttons when regenerated content has none. */
export function injectTTSInlineButtons(
  html: string,
  segments: TTSInlineButtonSegment[],
): string {
  if (segments.length === 0) return html;

  let nextIndex = 0;
  const rendered = html.replace(EMOTION_TAG_RE, () => {
    const index = nextIndex++;
    const segment = segments[index];
    return segment ? renderButton(segment, index) : "";
  });

  let result = rendered;
  for (; nextIndex < segments.length; nextIndex++) {
    result += renderButton(segments[nextIndex], nextIndex);
  }
  return result;
}
