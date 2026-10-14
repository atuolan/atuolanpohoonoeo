/**
 * 串流重採樣（純邏輯，不依賴瀏覽器）
 *
 * 每個輸出樣本取「對應輸入區間」的平均值（盒狀濾波），降頻時順便抑制混疊。
 * 狀態跨呼叫保留，所以分段送入與一次送入的結果完全相同。
 */
export class StreamingResampler {
  private readonly ratio: number;
  private nextBoundary: number;
  private consumed = 0;
  private sum = 0;
  private count = 0;
  private last = 0;

  constructor(inputRate: number, outputRate = 16000) {
    if (!(inputRate > 0) || !(outputRate > 0)) {
      throw new Error(`取樣率不正確：${inputRate} → ${outputRate}`);
    }
    this.ratio = inputRate / outputRate;
    this.nextBoundary = this.ratio;
  }

  /** 送入一段輸入，回傳這段產生的輸出樣本 */
  process(input: Float32Array): Float32Array {
    const out = new Float32Array(Math.ceil(input.length / this.ratio) + 2);
    let n = 0;
    for (let i = 0; i < input.length; i++) {
      this.sum += input[i];
      this.count++;
      this.consumed++;
      // 升頻時一個輸入樣本可能對應多個輸出樣本
      while (this.consumed >= this.nextBoundary) {
        const value = this.count > 0 ? this.sum / this.count : this.last;
        out[n++] = value;
        this.last = value;
        this.sum = 0;
        this.count = 0;
        this.nextBoundary += this.ratio;
      }
    }
    return out.slice(0, n);
  }
}
