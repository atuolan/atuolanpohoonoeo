/**
 * WAV 編碼工具
 * 把 Float32 PCM（-1～1）編碼成 16-bit PCM WAV，超出範圍的樣本會被截斷。
 */

/** 多聲道 Float32 PCM（每個聲道一個陣列，長度相同）→ 16-bit WAV */
export function encodeWavPcm16(
  channels: Float32Array[],
  sampleRate: number,
): ArrayBuffer {
  const numChannels = channels.length;
  const numFrames = numChannels > 0 ? channels[0].length : 0;
  const bytesPerSample = 2;
  const dataLength = numFrames * numChannels * bytesPerSample;
  const buffer = new ArrayBuffer(44 + dataLength);
  const view = new DataView(buffer);

  // RIFF header
  writeString(view, 0, "RIFF");
  view.setUint32(4, 36 + dataLength, true);
  writeString(view, 8, "WAVE");

  // fmt chunk
  writeString(view, 12, "fmt ");
  view.setUint32(16, 16, true); // chunk size
  view.setUint16(20, 1, true); // PCM format
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * numChannels * bytesPerSample, true);
  view.setUint16(32, numChannels * bytesPerSample, true);
  view.setUint16(34, 16, true);

  // data chunk
  writeString(view, 36, "data");
  view.setUint32(40, dataLength, true);

  // 寫入交錯的 PCM 數據
  let offset = 44;
  for (let i = 0; i < numFrames; i++) {
    for (let ch = 0; ch < numChannels; ch++) {
      const sample = Math.max(-1, Math.min(1, channels[ch][i]));
      view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
      offset += bytesPerSample;
    }
  }

  return buffer;
}

/** 單聲道 Float32 PCM → WAV Blob */
export function pcmToWavBlob(samples: Float32Array, sampleRate: number): Blob {
  return new Blob([encodeWavPcm16([samples], sampleRate)], { type: "audio/wav" });
}

function writeString(view: DataView, offset: number, str: string): void {
  for (let i = 0; i < str.length; i++) {
    view.setUint8(offset + i, str.charCodeAt(i));
  }
}
