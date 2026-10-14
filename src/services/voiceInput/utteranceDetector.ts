/**
 * 斷句偵測（純邏輯，不依賴瀏覽器）
 *
 * 輸入 16kHz 單聲道音訊，依音量與自適應噪音底線判斷「開始說話」與「講完了」，
 * 輸出一整段話（含開口前 300ms 與結尾 300ms，避免切掉第一個字或尾音）。
 */

export type Sensitivity = "low" | "medium" | "high";

export interface UtteranceDetectorOptions {
  /** 停頓多久算講完（毫秒） */
  endSilenceMs: number;
  /** 收音靈敏度 */
  sensitivity: Sensitivity;
}

export type DetectorEvent =
  | { type: "speechstart" }
  | { type: "utterance"; samples: Float32Array; voicedMs: number }
  | { type: "dropped"; voicedMs: number };

export const DETECTOR_SAMPLE_RATE = 16000;
const FRAME_MS = 20;
export const FRAME_SIZE = (DETECTOR_SAMPLE_RATE * FRAME_MS) / 1000;

/** 開口前緩衝（300ms） */
const PRE_ROLL_FRAMES = 15;
/** 結尾保留（300ms） */
const TAIL_FRAMES = 15;
/** 連續幾幀高於門檻才算開始說話（60ms） */
const START_FRAMES = 3;
/** 實際有聲時間少於這個就丟掉 */
const MIN_VOICED_MS = 150;
/** 一段最長 15 秒 */
const MAX_UTTERANCE_FRAMES = 750;
/** 一開始用前 200ms 校正噪音底線 */
const CALIBRATION_FRAMES = 10;
const INITIAL_FLOOR_DB = -55;
const MIN_FLOOR_DB = -90;
const MAX_FLOOR_DB = -10;
const FLOOR_DOWN_ALPHA = 0.1;
const FLOOR_UP_ALPHA = 0.005;
const FLOOR_UP_ALPHA_SPEAKING = 0.0005;
/** 結束門檻比開始門檻低一點，避免說話中途忽開忽關 */
const END_HYSTERESIS_DB = 3;

export const SENSITIVITY_PRESETS: Record<
  Sensitivity,
  { marginDb: number; minDb: number }
> = {
  low: { marginDb: 14, minDb: -38 },
  medium: { marginDb: 10, minDb: -45 },
  high: { marginDb: 6, minDb: -52 },
};

/** 一幀的音量（dBFS） */
export function frameDb(frame: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < frame.length; i++) sum += frame[i] * frame[i];
  const rms = Math.sqrt(sum / Math.max(1, frame.length));
  return 20 * Math.log10(rms + 1e-10);
}

function clampFloor(db: number): number {
  return Math.max(MIN_FLOOR_DB, Math.min(MAX_FLOOR_DB, db));
}

function concatFrames(frames: Float32Array[]): Float32Array {
  const out = new Float32Array(frames.length * FRAME_SIZE);
  frames.forEach((frame, i) => out.set(frame, i * FRAME_SIZE));
  return out;
}

export class UtteranceDetector {
  private options: UtteranceDetectorOptions;
  private partial = new Float32Array(FRAME_SIZE);
  private partialLen = 0;
  private floorDb = INITIAL_FLOOR_DB;
  private calibrationLeft = CALIBRATION_FRAMES;
  private calibrationMin = Infinity;
  private preRoll: Float32Array[] = [];
  private candidate: Float32Array[] = [];
  private speaking = false;
  private segment: Float32Array[] = [];
  private trailing: Float32Array[] = [];
  private voicedFrames = 0;
  private voicedDbSum = 0;
  private lastDb = -Infinity;

  constructor(options: UtteranceDetectorOptions) {
    this.options = { ...options };
  }

  setOptions(partial: Partial<UtteranceDetectorOptions>): void {
    this.options = { ...this.options, ...partial };
  }

  get isSpeaking(): boolean {
    return this.speaking;
  }

  /** 最近一幀的音量（0–1，給畫面顯示：-60 dBFS 以下為 0，-10 dBFS 以上為 1） */
  get level(): number {
    return Math.min(1, Math.max(0, (this.lastDb + 60) / 50));
  }

  /** 丟掉進行中的段落（停止收音時呼叫）；噪音底線保留，下次開麥不必重新校正 */
  reset(): void {
    this.partialLen = 0;
    this.preRoll = [];
    this.candidate = [];
    this.speaking = false;
    this.segment = [];
    this.trailing = [];
    this.voicedFrames = 0;
    this.voicedDbSum = 0;
    this.lastDb = -Infinity;
  }

  /** 送入任意長度的 16kHz 音訊，回傳這段期間發生的事件 */
  feed(samples: Float32Array): DetectorEvent[] {
    const events: DetectorEvent[] = [];
    let offset = 0;
    while (offset < samples.length) {
      const n = Math.min(FRAME_SIZE - this.partialLen, samples.length - offset);
      this.partial.set(samples.subarray(offset, offset + n), this.partialLen);
      this.partialLen += n;
      offset += n;
      if (this.partialLen === FRAME_SIZE) {
        const frame = this.partial.slice();
        this.partialLen = 0;
        const event = this.processFrame(frame);
        if (event) events.push(event);
      }
    }
    return events;
  }

  private processFrame(frame: Float32Array): DetectorEvent | null {
    const db = frameDb(frame);
    this.lastDb = db;

    if (this.calibrationLeft > 0) {
      this.calibrationLeft--;
      this.calibrationMin = Math.min(this.calibrationMin, db);
      if (this.calibrationLeft === 0) this.floorDb = clampFloor(this.calibrationMin);
      this.pushPreRoll(frame);
      return null;
    }

    const { marginDb, minDb } = SENSITIVITY_PRESETS[this.options.sensitivity];
    const startDb = Math.max(this.floorDb + marginDb, minDb);
    const endDb = startDb - END_HYSTERESIS_DB;

    if (!this.speaking) {
      if (db >= startDb) {
        this.candidate.push(frame);
        if (this.candidate.length < START_FRAMES) return null;
        this.speaking = true;
        this.segment = [...this.preRoll, ...this.candidate];
        this.voicedFrames = this.candidate.length;
        this.voicedDbSum = this.candidate.reduce((sum, f) => sum + frameDb(f), 0);
        this.preRoll = [];
        this.candidate = [];
        this.trailing = [];
        return { type: "speechstart" };
      }
      // 沒達門檻：先前短暫的雜音一起當成背景
      for (const f of this.candidate) this.pushPreRoll(f);
      this.candidate = [];
      this.updateFloor(db, false);
      this.pushPreRoll(frame);
      return null;
    }

    if (db >= endDb) {
      this.segment.push(...this.trailing, frame);
      this.trailing = [];
      this.voicedFrames++;
      this.voicedDbSum += db;
    } else {
      this.trailing.push(frame);
    }
    this.updateFloor(db, true);

    if (this.trailing.length * FRAME_MS >= this.options.endSilenceMs) return this.finish(false);
    if (this.segment.length + this.trailing.length >= MAX_UTTERANCE_FRAMES) return this.finish(true);
    return null;
  }

  private finish(forced: boolean): DetectorEvent {
    const voicedMs = this.voicedFrames * FRAME_MS;
    const frames = [...this.segment, ...this.trailing.slice(0, TAIL_FRAMES)];
    const avgVoicedDb =
      this.voicedFrames > 0 ? this.voicedDbSum / this.voicedFrames : this.floorDb;
    // 結尾剩下的靜音當作下一段的前置緩衝
    this.preRoll = this.trailing.slice(-PRE_ROLL_FRAMES);
    this.speaking = false;
    this.segment = [];
    this.trailing = [];
    this.voicedFrames = 0;
    this.voicedDbSum = 0;
    if (forced) {
      // 講滿 15 秒多半是穩定噪音（電扇、冷氣），把底線拉上來避免一直誤判
      this.floorDb = clampFloor(Math.max(this.floorDb, avgVoicedDb - 2));
    }
    if (voicedMs < MIN_VOICED_MS) return { type: "dropped", voicedMs };
    return { type: "utterance", samples: concatFrames(frames), voicedMs };
  }

  private pushPreRoll(frame: Float32Array): void {
    this.preRoll.push(frame);
    if (this.preRoll.length > PRE_ROLL_FRAMES) this.preRoll.shift();
  }

  private updateFloor(db: number, speaking: boolean): void {
    const alpha =
      db < this.floorDb ? FLOOR_DOWN_ALPHA : speaking ? FLOOR_UP_ALPHA_SPEAKING : FLOOR_UP_ALPHA;
    this.floorDb = clampFloor(this.floorDb + alpha * (db - this.floorDb));
  }
}
