/**
 * 收音膠水層：getUserMedia → AudioWorklet → 重採樣 16kHz → 斷句偵測
 *
 * stop() 會立刻停掉麥克風音軌：iOS 只要麥克風開著，網頁播放的聲音就會改走聽筒，
 * 所以角色說話前一定要呼叫 stop()。
 */
import { getRunningCallAudioContext, isAudioCaptureSupported } from "./audioContextPrimer";
import { createPcmTapNode } from "./pcmWorklet";
import { StreamingResampler } from "./resampler";
import {
  DETECTOR_SAMPLE_RATE,
  type DetectorEvent,
  UtteranceDetector,
  type UtteranceDetectorOptions,
} from "./utteranceDetector";

export type MicStartError = "denied" | "notFound" | "busy" | "needsTap" | "unsupported";

export class MicStartFailure extends Error {
  readonly reason: MicStartError;

  constructor(reason: MicStartError, message: string) {
    super(message);
    this.name = "MicStartFailure";
    this.reason = reason;
  }
}

/** 把 getUserMedia 的錯誤分類成畫面要顯示的狀態 */
export function classifyMicError(err: unknown): MicStartFailure {
  const name = (err as { name?: string } | null)?.name ?? "";
  const message = (err as { message?: string } | null)?.message ?? String(err);
  if (["NotAllowedError", "PermissionDeniedError", "SecurityError"].includes(name)) {
    return new MicStartFailure("denied", "麥克風權限被拒");
  }
  if (["NotFoundError", "DevicesNotFoundError", "OverconstrainedError"].includes(name)) {
    return new MicStartFailure("notFound", "找不到麥克風");
  }
  return new MicStartFailure("busy", `麥克風無法啟動：${message}`);
}

export interface MicCaptureCallbacks {
  onEvent: (event: DetectorEvent) => void;
  onLevel?: (level: number) => void;
  /** 音軌被系統結束（例如被其他程式搶走） */
  onTrackEnded?: () => void;
}

export class MicCapture {
  private readonly detector: UtteranceDetector;
  private stream: MediaStream | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private tap: AudioWorkletNode | null = null;
  private sink: GainNode | null = null;
  private resampler: StreamingResampler | null = null;
  private running = false;
  private startToken = 0;

  constructor(options: UtteranceDetectorOptions) {
    this.detector = new UtteranceDetector(options);
  }

  get isRunning(): boolean {
    return this.running;
  }

  updateOptions(partial: Partial<UtteranceDetectorOptions>): void {
    this.detector.setOptions(partial);
  }

  /** 開始收音；啟動期間呼叫 stop() 會讓這次啟動作廢（不會開著麥克風） */
  async start(callbacks: MicCaptureCallbacks): Promise<void> {
    if (this.running) return;
    const token = ++this.startToken;
    if (!isAudioCaptureSupported()) {
      throw new MicStartFailure("unsupported", "瀏覽器不支援收音");
    }
    const ctx = await getRunningCallAudioContext();
    if (token !== this.startToken) return;
    if (!ctx) throw new MicStartFailure("needsTap", "需要點一下才能開始收音");

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          channelCount: 1,
        },
      });
    } catch (err) {
      throw classifyMicError(err);
    }
    const release = () => stream.getTracks().forEach((t) => t.stop());
    if (token !== this.startToken) {
      release();
      return;
    }

    let tap: AudioWorkletNode;
    try {
      tap = await createPcmTapNode(ctx);
    } catch (err) {
      release();
      throw new MicStartFailure("unsupported", `無法啟動收音處理：${String(err)}`);
    }
    if (token !== this.startToken) {
      release();
      tap.disconnect();
      return;
    }

    this.stream = stream;
    this.tap = tap;
    this.source = ctx.createMediaStreamSource(stream);
    this.sink = ctx.createGain();
    this.sink.gain.value = 0; // 只為了讓瀏覽器持續處理，不發出任何聲音
    this.resampler = new StreamingResampler(ctx.sampleRate, DETECTOR_SAMPLE_RATE);
    this.detector.reset();
    tap.port.onmessage = (e: MessageEvent<Float32Array>) => {
      if (!this.running || !this.resampler) return;
      const events = this.detector.feed(this.resampler.process(e.data));
      callbacks.onLevel?.(this.detector.level);
      for (const event of events) callbacks.onEvent(event);
    };
    this.source.connect(tap);
    tap.connect(this.sink);
    this.sink.connect(ctx.destination);
    for (const track of stream.getAudioTracks()) {
      track.onended = () => {
        if (!this.running) return;
        this.stop();
        callbacks.onTrackEnded?.();
      };
    }
    this.running = true;
  }

  /** 立刻停止收音並釋放麥克風，講到一半的那段丟掉 */
  stop(): void {
    this.startToken++;
    this.running = false;
    if (this.tap) {
      this.tap.port.onmessage = null;
      this.tap.disconnect();
      this.tap = null;
    }
    this.source?.disconnect();
    this.source = null;
    this.sink?.disconnect();
    this.sink = null;
    this.stream?.getTracks().forEach((t) => {
      t.onended = null;
      t.stop();
    });
    this.stream = null;
    this.resampler = null;
    this.detector.reset();
  }
}
