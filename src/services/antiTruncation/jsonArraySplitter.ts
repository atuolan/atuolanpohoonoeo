/**
 * JSON 陣列串流切分器：有些中轉把串流包成 [ {...}, {...} ]，逐段切出完整的頂層元素。
 * 移植自酒館助手防截斷腳本的 splitter.js。
 */

function isSpace(char: string): boolean {
  return char === " " || char === "\n" || char === "\r" || char === "\t";
}

export class JsonArraySplitter {
  private buffer = "";
  private at = 0;
  private start = 0;
  private depth = 0;
  private inElement = false;
  private inString = false;
  private escaped = false;
  private opened = false;
  private closed = false;

  /** 是否已經讀到結尾的 ] */
  get complete(): boolean {
    return this.closed;
  }

  /** 餵入一段文字，回傳這次湊完整的頂層元素 */
  push(text: string): string[] {
    if (!text) return [];
    this.buffer += text;
    const elements: string[] = [];

    while (this.at < this.buffer.length) {
      const char = this.buffer[this.at];
      if (this.closed) {
        this.at += 1;
        continue;
      }
      if (!this.inElement) {
        if (!this.opened) {
          if (char === "[") {
            this.opened = true;
            this.at += 1;
            continue;
          }
          if (isSpace(char)) {
            this.at += 1;
            continue;
          }
          this.opened = true;
          continue;
        }
        if (isSpace(char) || char === ",") {
          this.at += 1;
          continue;
        }
        if (char === "]") {
          this.closed = true;
          this.at += 1;
          continue;
        }
        this.inElement = true;
        this.start = this.at;
        this.depth = 0;
      }

      if (this.inString) {
        if (this.escaped) this.escaped = false;
        else if (char === "\\") this.escaped = true;
        else if (char === '"') this.inString = false;
      } else if (char === '"') {
        this.inString = true;
      } else if (char === "{" || char === "[") {
        this.depth += 1;
      } else if (char === "}" || char === "]") {
        this.depth -= 1;
        if (this.depth === 0) {
          elements.push(this.buffer.slice(this.start, this.at + 1));
          this.inElement = false;
          this.buffer = this.buffer.slice(this.at + 1);
          this.at = 0;
          continue;
        }
      }
      this.at += 1;
    }
    return elements;
  }

  /** 串流被切斷時，吐出最後沒閉合的殘片 */
  finish(): string {
    if (!this.inElement) return "";
    const rest = this.buffer.slice(this.start);
    this.inElement = false;
    this.buffer = "";
    this.at = 0;
    return rest;
  }
}

/** 壓成單行，換行才不會打斷 SSE 的行結構 */
export function flattenJsonElement(element: string): string {
  try {
    return JSON.stringify(JSON.parse(element));
  } catch {
    return element.replace(/[\r\n]+/g, " ");
  }
}
