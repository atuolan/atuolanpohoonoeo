import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  type DetectorEvent,
  FRAME_SIZE,
  UtteranceDetector,
  type UtteranceDetectorOptions,
} from "@/services/voiceInput/utteranceDetector";

const SR = 16000;
const len = (ms: number) => Math.round((SR * ms) / 1000);

/** 約 -20 dBFS 的正弦波（代表說話） */
function tone(ms: number, amp = 0.1414): Float32Array {
  const out = new Float32Array(len(ms));
  for (let i = 0; i < out.length; i++) out[i] = amp * Math.sin((2 * Math.PI * 220 * i) / SR);
  return out;
}

/** 決定性的均勻噪音，預設約 -71 dBFS（安靜房間） */
function noise(ms: number, amp = 0.0005, seed = 7): Float32Array {
  const out = new Float32Array(len(ms));
  let x = seed;
  for (let i = 0; i < out.length; i++) {
    x = (x * 48271) % 2147483647;
    out[i] = amp * ((2 * x) / 2147483647 - 1);
  }
  return out;
}

function join(...parts: Float32Array[]): Float32Array {
  const out = new Float32Array(parts.reduce((n, p) => n + p.length, 0));
  let offset = 0;
  for (const p of parts) {
    out.set(p, offset);
    offset += p.length;
  }
  return out;
}

function detector(options: Partial<UtteranceDetectorOptions> = {}) {
  return new UtteranceDetector({ endSilenceMs: 1200, sensitivity: "medium", ...options });
}

const types = (events: DetectorEvent[]) => events.map((e) => e.type);

describe("UtteranceDetector", () => {
  it("安靜時不觸發", () => {
    expect(detector().feed(noise(3000))).toEqual([]);
  });

  it("一段話產生 speechstart 與 utterance，含前後各 300ms", () => {
    const events = detector().feed(join(noise(500), tone(500), noise(2000)));
    expect(types(events)).toEqual(["speechstart", "utterance"]);
    const utterance = events[1] as Extract<DetectorEvent, { type: "utterance" }>;
    expect(utterance.voicedMs).toBe(500);
    // 前緩衝 15 幀 + 說話 25 幀 + 結尾 15 幀
    expect(utterance.samples.length).toBe(55 * FRAME_SIZE);
  });

  it("太短的聲音回報 dropped", () => {
    const events = detector().feed(join(noise(500), tone(100), noise(2000)));
    expect(types(events)).toEqual(["speechstart", "dropped"]);
  });

  it("不到 60ms 的雜音不算開始說話", () => {
    expect(detector().feed(join(noise(500), tone(40), noise(2000)))).toEqual([]);
  });

  it("停頓短於設定時併成同一段", () => {
    const events = detector().feed(
      join(noise(500), tone(300), noise(400), tone(300), noise(2000)),
    );
    expect(types(events)).toEqual(["speechstart", "utterance"]);
    expect((events[1] as { voicedMs: number }).voicedMs).toBe(600);
  });

  it("停頓超過設定時分成兩段", () => {
    const events = detector().feed(
      join(noise(500), tone(300), noise(1500), tone(300), noise(2000)),
    );
    expect(types(events)).toEqual(["speechstart", "utterance", "speechstart", "utterance"]);
  });

  it("可以即時調整停頓秒數", () => {
    const signal = join(noise(500), tone(300), noise(1000), tone(300), noise(2000));
    expect(types(detector().feed(signal))).toEqual(["speechstart", "utterance"]);
    const short = detector();
    short.setOptions({ endSilenceMs: 800 });
    expect(types(short.feed(signal))).toEqual([
      "speechstart",
      "utterance",
      "speechstart",
      "utterance",
    ]);
  });

  it("講滿 15 秒強制結束，之後同一個聲音不再觸發", () => {
    const events = detector().feed(join(noise(500), tone(20000), noise(500)));
    expect(types(events)).toEqual(["speechstart", "utterance"]);
  });

  it("一開始就有的穩定噪音被當成背景", () => {
    expect(detector().feed(noise(5000, 0.01732))).toEqual([]);
  });

  it("reset 會丟掉講到一半的那段", () => {
    const d = detector();
    expect(types(d.feed(join(noise(500), tone(300))))).toEqual(["speechstart"]);
    d.reset();
    expect(d.isSpeaking).toBe(false);
    expect(d.feed(noise(2000))).toEqual([]);
    expect(types(d.feed(join(tone(500), noise(2000))))).toEqual(["speechstart", "utterance"]);
  });

  it("音量介於 0 和 1", () => {
    const d = detector();
    d.feed(join(noise(500), tone(200)));
    expect(d.level).toBeGreaterThan(0.6);
    expect(d.level).toBeLessThanOrEqual(1);
    d.feed(noise(500));
    expect(d.level).toBe(0);
  });

  it("分段送入與一次送入的事件相同", () => {
    const signal = join(noise(500), tone(300), noise(1500), tone(700), noise(2000));
    const summary = (events: DetectorEvent[]) =>
      events.map((e) => [e.type, e.type === "utterance" ? e.samples.length : 0]);
    const expected = summary(detector().feed(signal));
    fc.assert(
      fc.property(fc.array(fc.integer({ min: 1, max: 4000 }), { maxLength: 40 }), (cuts) => {
        const d = detector();
        const events: DetectorEvent[] = [];
        let offset = 0;
        for (const cut of cuts) {
          const end = Math.min(signal.length, offset + cut);
          events.push(...d.feed(signal.subarray(offset, end)));
          offset = end;
        }
        events.push(...d.feed(signal.subarray(offset)));
        expect(summary(events)).toEqual(expected);
      }),
      { numRuns: 30 },
    );
  });

  it("每個 utterance／dropped 之前都有 speechstart", () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            speech: fc.boolean(),
            ms: fc.integer({ min: 1, max: 100 }).map((n) => n * 20),
          }),
          { maxLength: 15 },
        ),
        (segments) => {
          const signal = join(
            noise(500),
            ...segments.map((s) => (s.speech ? tone(s.ms) : noise(s.ms))),
            noise(2000),
          );
          let open = false;
          for (const event of detector().feed(signal)) {
            if (event.type === "speechstart") {
              expect(open).toBe(false);
              open = true;
            } else {
              expect(open).toBe(true);
              open = false;
            }
          }
          expect(open).toBe(false);
        },
      ),
      { numRuns: 50 },
    );
  });
});
