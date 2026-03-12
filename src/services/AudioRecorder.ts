/**
 * AudioRecorder 錄音服務
 * 封裝瀏覽器 MediaRecorder API，負責錄音、波形採樣和格式選擇
 */

// ===== 錄音結果 =====
export interface RecordingResult {
  /** 音頻 Blob */
  blob: Blob;
  /** 音頻 data URI (base64) */
  dataUri: string;
  /** MIME 類型 */
  mimeType: string;
  /** 時長（秒） */
  duration: number;
  /** 波形數據（0-1 的振幅陣列，約 30-50 個採樣點） */
  waveform: number[];
}

// ===== 錄音回調 =====
export interface AudioRecorderCallbacks {
  /** 音量更新（用於即時音量條） */
  onVolumeUpdate?: (level: number) => void;
  /** 時間更新（每秒） */
  onTimeUpdate?: (seconds: number) => void;
  /** 達到最大時長 */
  onMaxDuration?: () => void;
}

// ===== MIME 類型優先列表 =====
// audio/wav 排第一：Gemini 等主流 API 不支援 webm/ogg，wav 相容性最好
const MIME_PRIORITY_LIST = [
  "audio/wav",
  "audio/webm;codecs=opus",
  "audio/ogg;codecs=opus",
  "audio/webm",
] as const;

/**
 * 從優先列表中選擇瀏覽器支援的 MIME 類型
 * @returns 支援的 MIME 類型，若全部不支援則返回空字串
 */
export function getSupportedMimeType(): string {
  if (typeof MediaRecorder === "undefined") return "";
  return MIME_PRIORITY_LIST.find((t) => MediaRecorder.isTypeSupported(t)) ?? "";
}

/** 最小錄音時長（秒） */
export const MIN_DURATION = 1;

/**
 * 判斷錄音時長是否足夠發送
 * @param duration 錄音時長（秒）
 * @returns true 表示可以發送，false 表示太短應取消
 */
export function isDurationValid(duration: number): boolean {
  return duration >= MIN_DURATION;
}

/**
 * 將秒數格式化為 M:SS 格式
 * @param seconds 非負整數秒數
 * @returns 格式化字串，如 "0:05", "1:30"
 */
export function formatTime(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const m = Math.floor(s / 60);
  const ss = s % 60;
  return `${m}:${ss.toString().padStart(2, "0")}`;
}

/**
 * 品質對應的 bitrate 映射
 */
const QUALITY_BITRATE: Record<string, number> = {
  low: 32000,
  medium: 64000,
  high: 128000,
};

/**
 * 將 Blob 轉換為 base64 data URI
 */
function blobToDataUri(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

/**
 * AudioRecorder 錄音服務
 *
 * 使用 MediaRecorder API 進行錄音，搭配 AnalyserNode 進行即時波形採樣。
 * 支援可配置的最大時長和錄音品質。
 */
export class AudioRecorder {
  private mediaRecorder: MediaRecorder | null = null;
  private audioContext: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private stream: MediaStream | null = null;
  private chunks: Blob[] = [];
  private waveformSamples: number[] = [];
  private startTime = 0;
  private durationTimer: ReturnType<typeof setInterval> | null = null;
  private waveformTimer: ReturnType<typeof setInterval> | null = null;
  private _isRecording = false;
  private _currentDuration = 0;
  private mimeType = "";
  private maxDuration = 120;
  private quality: "low" | "medium" | "high" = "medium";

  /** 當前是否正在錄音 */
  get isRecording(): boolean {
    return this._isRecording;
  }

  /** 當前錄音時長（秒） */
  get currentDuration(): number {
    return this._currentDuration;
  }

  /**
   * 設定錄音參數
   */
  configure(options: {
    maxDuration?: number;
    quality?: "low" | "medium" | "high";
  }) {
    if (options.maxDuration !== undefined)
      this.maxDuration = options.maxDuration;
    if (options.quality !== undefined) this.quality = options.quality;
  }

  /**
   * 開始錄音
   */
  async start(callbacks?: AudioRecorderCallbacks): Promise<void> {
    if (this._isRecording) return;

    // 取得麥克風權限
    this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });

    // 選擇 MIME 類型
    this.mimeType = getSupportedMimeType();
    if (!this.mimeType) {
      this.cleanup();
      throw new Error("No supported audio MIME type found");
    }

    // 設定 AudioContext + AnalyserNode
    this.audioContext = new AudioContext();
    const source = this.audioContext.createMediaStreamSource(this.stream);
    this.analyser = this.audioContext.createAnalyser();
    this.analyser.fftSize = 256;
    source.connect(this.analyser);

    // 設定 MediaRecorder
    const recorderOptions: MediaRecorderOptions = { mimeType: this.mimeType };
    const bitrate = QUALITY_BITRATE[this.quality];
    if (bitrate) {
      recorderOptions.audioBitsPerSecond = bitrate;
    }

    this.mediaRecorder = new MediaRecorder(this.stream, recorderOptions);
    this.chunks = [];
    this.waveformSamples = [];
    this._currentDuration = 0;
    this.startTime = Date.now();
    this._isRecording = true;

    this.mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) this.chunks.push(e.data);
    };

    this.mediaRecorder.start(100); // 每 100ms 收集一次數據

    // 時間更新計時器（每秒）
    this.durationTimer = setInterval(() => {
      this._currentDuration = Math.floor((Date.now() - this.startTime) / 1000);
      callbacks?.onTimeUpdate?.(this._currentDuration);

      // 檢查是否達到最大時長
      if (this._currentDuration >= this.maxDuration) {
        callbacks?.onMaxDuration?.();
      }
    }, 1000);

    // 波形採樣計時器（約每 200ms 採樣一次，錄 2 分鐘約 600 個點，最後會壓縮到 30-50 個）
    const dataArray = new Uint8Array(this.analyser.frequencyBinCount);
    this.waveformTimer = setInterval(() => {
      if (!this.analyser) return;
      this.analyser.getByteTimeDomainData(dataArray);

      // 計算 RMS 音量 (0-1)
      let sum = 0;
      for (let i = 0; i < dataArray.length; i++) {
        const v = (dataArray[i] - 128) / 128;
        sum += v * v;
      }
      const rms = Math.sqrt(sum / dataArray.length);
      const level = Math.min(1, rms * 3); // 放大以獲得更好的視覺效果

      this.waveformSamples.push(level);
      callbacks?.onVolumeUpdate?.(level);
    }, 200);
  }

  /**
   * 停止錄音並返回結果
   */
  async stop(): Promise<RecordingResult> {
    if (!this.mediaRecorder || !this._isRecording) {
      throw new Error("Not recording");
    }

    return new Promise<RecordingResult>((resolve, reject) => {
      if (!this.mediaRecorder) {
        reject(new Error("Not recording"));
        return;
      }

      this.mediaRecorder.onstop = async () => {
        try {
          const duration = Math.floor((Date.now() - this.startTime) / 1000);
          const blob = new Blob(this.chunks, { type: this.mimeType });
          const dataUri = await blobToDataUri(blob);
          const waveform = this.compressWaveform(this.waveformSamples, 40);

          this.cleanup();

          resolve({
            blob,
            dataUri,
            mimeType: this.mimeType,
            duration,
            waveform,
          });
        } catch (err) {
          this.cleanup();
          reject(err);
        }
      };

      this.mediaRecorder.stop();
    });
  }

  /**
   * 取消錄音（丟棄數據）
   */
  cancel(): void {
    if (this.mediaRecorder && this._isRecording) {
      this.mediaRecorder.stop();
    }
    this.cleanup();
  }

  /**
   * 壓縮波形數據到指定數量的採樣點
   */
  private compressWaveform(samples: number[], targetCount: number): number[] {
    if (samples.length === 0) return [];
    if (samples.length <= targetCount) return [...samples];

    const result: number[] = [];
    const step = samples.length / targetCount;
    for (let i = 0; i < targetCount; i++) {
      const start = Math.floor(i * step);
      const end = Math.floor((i + 1) * step);
      let max = 0;
      for (let j = start; j < end && j < samples.length; j++) {
        if (samples[j] > max) max = samples[j];
      }
      result.push(max);
    }
    return result;
  }

  /**
   * 清理所有資源
   */
  private cleanup(): void {
    this._isRecording = false;

    if (this.durationTimer) {
      clearInterval(this.durationTimer);
      this.durationTimer = null;
    }
    if (this.waveformTimer) {
      clearInterval(this.waveformTimer);
      this.waveformTimer = null;
    }
    if (this.stream) {
      this.stream.getTracks().forEach((t) => t.stop());
      this.stream = null;
    }
    if (this.audioContext) {
      this.audioContext.close().catch(() => {});
      this.audioContext = null;
    }
    this.analyser = null;
    this.mediaRecorder = null;
    this.chunks = [];
  }
}
