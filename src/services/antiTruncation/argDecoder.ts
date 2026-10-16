/**
 * 工具參數串流解碼器：參數 JSON 還沒傳完時，先把目標欄位已確定的文字解出來。
 * 移植自酒館助手防截斷腳本的 decoder.js。
 */

const HIGH_SURROGATE_START = 0xd800;
const HIGH_SURROGATE_END = 0xdbff;
const LOW_SURROGATE_START = 0xdc00;
const LOW_SURROGATE_END = 0xdfff;
/** 找目標欄位名最多掃這麼多字，超過就放棄 */
const MAX_KEY_SCAN = 500;

const SIMPLE_ESCAPES: Record<string, string> = {
  '"': '"',
  "\\": "\\",
  "/": "/",
  b: "\b",
  f: "\f",
  n: "\n",
  r: "\r",
  t: "\t",
};

type DecoderState = "init" | "key" | "colon" | "quote" | "string" | "completed" | "error";

interface CharStep {
  text: string;
  width: number;
  stop: boolean;
}

export class StreamArgDecoder {
  private readonly keyPattern: string;
  private state: DecoderState = "init";
  private keyScan = "";
  /** 被切在兩段之間的跳脫序列 */
  private pendingEscape = "";
  /** 段落結尾的引號（含後面的空白）：要看下一段才知道是不是字串結尾 */
  private pendingQuote = "";
  private highSurrogate = 0;

  constructor(targetKey = "content") {
    this.keyPattern = `"${targetKey}"`;
  }

  get isComplete(): boolean {
    return this.state === "completed";
  }

  /** 餵入一段原始參數文字，回傳已確定可以輸出的純文字 */
  feed(fragment: string): string {
    if (!fragment) return "";
    let out = "";
    let source = fragment;

    if (this.pendingQuote) {
      const rest = source.trimStart();
      if (rest === "") {
        this.pendingQuote += source;
        return "";
      }
      if (rest.startsWith("}")) {
        this.pendingQuote = "";
        this.state = "completed";
        return "";
      }
      out += this.pendingQuote;
      this.pendingQuote = "";
    }

    if (this.pendingEscape) {
      source = this.pendingEscape + source;
      this.pendingEscape = "";
    }

    let i = 0;
    while (i < source.length) {
      const char = source[i];
      switch (this.state) {
        case "init":
          if (char === "{" || char === '"') {
            this.state = "key";
            if (char === '"') this.keyScan = '"';
          }
          i += 1;
          break;
        case "key":
          this.keyScan += char;
          i += 1;
          if (this.keyScan.includes(this.keyPattern)) {
            this.state = "colon";
            this.keyScan = "";
          } else if (this.keyScan.length > MAX_KEY_SCAN) {
            this.state = "error";
          }
          break;
        case "colon":
          if (char === ":") this.state = "quote";
          i += 1;
          break;
        case "quote":
          if (char === '"') this.state = "string";
          else if (!/\s/.test(char)) this.state = "error";
          i += 1;
          break;
        case "string": {
          const step = this.consumeStringChar(source, i);
          out += step.text;
          i = step.stop ? source.length : i + step.width;
          break;
        }
        case "completed": {
          // 結尾引號後面又來了正文：當初那個引號其實是沒跳脫的內文引號
          const rest = source.slice(i).trim();
          if (rest !== "" && rest !== "}" && rest !== "},") {
            this.state = "string";
            break;
          }
          i = source.length;
          break;
        }
        case "error":
          i = source.length;
          break;
      }
    }
    return out;
  }

  /** 串流結束：吐出還卡著的跳脫字元；結尾的引號當成字串結尾丟掉 */
  finish(): string {
    this.pendingQuote = "";
    const out = this.flushSurrogate() + this.pendingEscape;
    this.pendingEscape = "";
    return out;
  }

  private consumeStringChar(source: string, index: number): CharStep {
    const char = source[index];
    if (char === "\\") {
      const next = source[index + 1];
      if (next === undefined) {
        this.pendingEscape = "\\";
        return { text: "", width: 0, stop: true };
      }
      if (next === "u") {
        const hex = source.slice(index + 2, index + 6);
        if (hex.length < 4) {
          this.pendingEscape = source.slice(index);
          return { text: "", width: 0, stop: true };
        }
        if (!/^[0-9a-fA-F]{4}$/.test(hex)) return { text: `\\u${hex}`, width: 6, stop: false };
        return { text: this.takeCodeUnit(Number.parseInt(hex, 16)), width: 6, stop: false };
      }
      return { text: this.flushSurrogate() + (SIMPLE_ESCAPES[next] ?? char + next), width: 2, stop: false };
    }
    if (char === '"') {
      const rest = source.slice(index + 1);
      if (rest.trim() === "") {
        this.pendingQuote = `"${rest}`;
        return { text: "", width: 0, stop: true };
      }
      if (rest.trimStart().startsWith("}")) {
        this.state = "completed";
        return { text: "", width: 0, stop: true };
      }
      return { text: `${this.flushSurrogate()}"`, width: 1, stop: false };
    }
    return { text: this.flushSurrogate() + char, width: 1, stop: false };
  }

  private takeCodeUnit(code: number): string {
    if (code >= HIGH_SURROGATE_START && code <= HIGH_SURROGATE_END) {
      const flushed = this.flushSurrogate();
      this.highSurrogate = code;
      return flushed;
    }
    if (code >= LOW_SURROGATE_START && code <= LOW_SURROGATE_END && this.highSurrogate) {
      const pair = String.fromCharCode(this.highSurrogate, code);
      this.highSurrogate = 0;
      return pair;
    }
    return this.flushSurrogate() + String.fromCharCode(code);
  }

  /** 高代理後面沒接低代理：照原樣吐出，不吞字 */
  private flushSurrogate(): string {
    if (!this.highSurrogate) return "";
    const text = String.fromCharCode(this.highSurrogate);
    this.highSurrogate = 0;
    return text;
  }
}
