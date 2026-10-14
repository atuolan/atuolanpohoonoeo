import { describe, expect, it } from "vitest";
import { encodeWavPcm16, pcmToWavBlob } from "@/utils/wav";

function ascii(view: DataView, offset: number, length: number): string {
  let s = "";
  for (let i = 0; i < length; i++) s += String.fromCharCode(view.getUint8(offset + i));
  return s;
}

describe("encodeWavPcm16", () => {
  it("寫出 16kHz 單聲道的 WAV 檔頭", () => {
    const view = new DataView(encodeWavPcm16([new Float32Array(10)], 16000));
    expect(ascii(view, 0, 4)).toBe("RIFF");
    expect(view.getUint32(4, true)).toBe(36 + 20);
    expect(ascii(view, 8, 4)).toBe("WAVE");
    expect(ascii(view, 12, 4)).toBe("fmt ");
    expect(view.getUint16(20, true)).toBe(1);
    expect(view.getUint16(22, true)).toBe(1);
    expect(view.getUint32(24, true)).toBe(16000);
    expect(view.getUint32(28, true)).toBe(32000);
    expect(view.getUint16(32, true)).toBe(2);
    expect(view.getUint16(34, true)).toBe(16);
    expect(ascii(view, 36, 4)).toBe("data");
    expect(view.getUint32(40, true)).toBe(20);
    expect(view.byteLength).toBe(64);
  });

  it("把樣本轉成 16-bit，超出範圍的截斷", () => {
    const view = new DataView(
      encodeWavPcm16([Float32Array.from([0, 1, -1, 2, -2, 0.5])], 16000),
    );
    const samples = Array.from({ length: 6 }, (_, i) => view.getInt16(44 + i * 2, true));
    expect(samples).toEqual([0, 32767, -32768, 32767, -32768, 16383]);
  });

  it("多聲道交錯寫入", () => {
    const view = new DataView(
      encodeWavPcm16([Float32Array.from([1, 0]), Float32Array.from([-1, 0.5])], 8000),
    );
    expect(view.getUint16(22, true)).toBe(2);
    expect(view.getUint32(28, true)).toBe(32000);
    expect([0, 1, 2, 3].map((i) => view.getInt16(44 + i * 2, true))).toEqual([
      32767, -32768, 0, 16383,
    ]);
  });
});

describe("pcmToWavBlob", () => {
  it("回傳 audio/wav 的 Blob", () => {
    const blob = pcmToWavBlob(new Float32Array(160), 16000);
    expect(blob.type).toBe("audio/wav");
    expect(blob.size).toBe(44 + 320);
  });
});
