/**
 * 音頻格式轉換工具
 *
 * 將瀏覽器錄製的 webm/ogg 等格式轉換為 WAV，
 * 確保與 Gemini、OpenAI 等所有 API 相容。
 */

import { encodeWavPcm16 } from "./wav";

/** API 普遍支援的 MIME 類型 */
const API_SAFE_TYPES = new Set([
  "audio/wav",
  "audio/mp3",
  "audio/mpeg",
]);

/**
 * 判斷 MIME 類型是否為 API 安全格式（不需要轉碼）
 */
export function isApiSafeMimeType(mimeType: string): boolean {
  // 取主類型（去掉 codecs 等參數）
  const base = mimeType.split(";")[0].trim().toLowerCase();
  return API_SAFE_TYPES.has(base);
}

/**
 * 將音頻 Blob 轉換為 WAV 格式
 *
 * 使用 AudioContext.decodeAudioData 解碼任意格式，
 * 再手動編碼為 16-bit PCM WAV。
 *
 * @param blob 原始音頻 Blob（webm、ogg 等）
 * @returns WAV 格式的 Blob 和 data URI
 */
export async function convertToWav(
  blob: Blob,
): Promise<{ blob: Blob; dataUri: string; mimeType: string }> {
  const arrayBuffer = await blob.arrayBuffer();

  // 解碼為 PCM AudioBuffer
  const audioCtx = new AudioContext();
  let audioBuffer: AudioBuffer;
  try {
    audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
  } finally {
    await audioCtx.close();
  }

  // 編碼為 WAV
  const wavBlob = encodeWav(audioBuffer);
  const dataUri = await blobToDataUri(wavBlob);

  return { blob: wavBlob, dataUri, mimeType: "audio/wav" };
}

/**
 * 確保音頻為 API 安全格式。
 * 如果已經是安全格式則直接返回，否則轉碼為 WAV。
 */
export async function ensureApiSafeAudio(
  blob: Blob,
  mimeType: string,
  dataUri: string,
): Promise<{ blob: Blob; dataUri: string; mimeType: string }> {
  if (isApiSafeMimeType(mimeType)) {
    return { blob, dataUri, mimeType };
  }
  return convertToWav(blob);
}

// ===== 內部工具函數 =====

/**
 * 將 AudioBuffer 編碼為 16-bit PCM WAV Blob
 */
function encodeWav(audioBuffer: AudioBuffer): Blob {
  const channels: Float32Array[] = [];
  for (let ch = 0; ch < audioBuffer.numberOfChannels; ch++) {
    channels.push(audioBuffer.getChannelData(ch));
  }
  return new Blob([encodeWavPcm16(channels, audioBuffer.sampleRate)], {
    type: "audio/wav",
  });
}

function blobToDataUri(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}
