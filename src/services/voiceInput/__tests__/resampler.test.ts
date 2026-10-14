import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { StreamingResampler } from "@/services/voiceInput/resampler";

describe("StreamingResampler", () => {
  it("48k → 16k 長度是三分之一，定值不變", () => {
    const out = new StreamingResampler(48000).process(new Float32Array(4800).fill(0.5));
    expect(out.length).toBe(1600);
    expect(out.every((v) => Math.abs(v - 0.5) < 1e-6)).toBe(true);
  });

  it("44.1k → 16k 一秒約 16000 個樣本", () => {
    const out = new StreamingResampler(44100).process(new Float32Array(44100));
    expect(Math.abs(out.length - 16000)).toBeLessThanOrEqual(1);
  });

  it("8k → 16k 長度加倍", () => {
    const out = new StreamingResampler(8000).process(new Float32Array(800).fill(0.25));
    expect(Math.abs(out.length - 1600)).toBeLessThanOrEqual(1);
    expect(out.every((v) => Math.abs(v - 0.25) < 1e-6)).toBe(true);
  });

  it("分段送入與一次送入的結果完全相同", () => {
    fc.assert(
      fc.property(
        fc.array(fc.float({ min: -1, max: 1, noNaN: true }), { maxLength: 3000 }),
        fc.array(fc.nat(500), { maxLength: 20 }),
        fc.constantFrom(48000, 44100, 22050, 16000, 8000),
        (values, cuts, rate) => {
          const input = Float32Array.from(values);
          const whole = Array.from(new StreamingResampler(rate).process(input));
          const chunked = new StreamingResampler(rate);
          const parts: number[] = [];
          let offset = 0;
          for (const cut of cuts) {
            const end = Math.min(input.length, offset + cut);
            parts.push(...chunked.process(input.subarray(offset, end)));
            offset = end;
          }
          parts.push(...chunked.process(input.subarray(offset)));
          expect(parts).toEqual(whole);
        },
      ),
    );
  });

  it("取樣率不正確時丟出錯誤", () => {
    expect(() => new StreamingResampler(0)).toThrow();
  });
});
