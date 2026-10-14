/**
 * AudioWorklet 處理器：把麥克風音訊（第一聲道）約每 20ms 批次送回主執行緒
 * 用 Blob URL 載入，不需要打包額外的檔案。
 */
const PROCESSOR_NAME = "aguaphone-pcm-tap";

const WORKLET_SOURCE = `
class PcmTapProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.batchSize = Math.round(sampleRate / 50);
    this.buffer = new Float32Array(this.batchSize);
    this.filled = 0;
  }
  process(inputs) {
    const channel = inputs[0] && inputs[0][0];
    if (channel) {
      let offset = 0;
      while (offset < channel.length) {
        const n = Math.min(channel.length - offset, this.batchSize - this.filled);
        this.buffer.set(channel.subarray(offset, offset + n), this.filled);
        this.filled += n;
        offset += n;
        if (this.filled === this.batchSize) {
          this.port.postMessage(this.buffer, [this.buffer.buffer]);
          this.buffer = new Float32Array(this.batchSize);
          this.filled = 0;
        }
      }
    }
    return true;
  }
}
registerProcessor("${PROCESSOR_NAME}", PcmTapProcessor);
`;

const loadedContexts = new WeakSet<BaseAudioContext>();

export async function createPcmTapNode(ctx: AudioContext): Promise<AudioWorkletNode> {
  if (!loadedContexts.has(ctx)) {
    const url = URL.createObjectURL(
      new Blob([WORKLET_SOURCE], { type: "application/javascript" }),
    );
    try {
      await ctx.audioWorklet.addModule(url);
    } finally {
      URL.revokeObjectURL(url);
    }
    loadedContexts.add(ctx);
  }
  return new AudioWorkletNode(ctx, PROCESSOR_NAME, {
    numberOfInputs: 1,
    numberOfOutputs: 1,
    channelCount: 1,
    channelCountMode: "explicit",
  });
}
