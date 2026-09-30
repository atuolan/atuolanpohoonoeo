import { vi } from "vitest";

/**
 * theme store 會直接操作 document（注入 <style>、寫 CSS 變數）。
 * 測試環境是 node、沒有 DOM，這裡提供剛好夠用的替身。
 */
export interface ThemeDomStub {
  /** 取得某個被注入的 <style> 目前的內容；不存在回 null */
  styleText(id: string): string | null;
}

interface StubElement {
  id: string;
  textContent: string;
  remove(): void;
}

export function installThemeDomStub(): ThemeDomStub {
  const elements = new Map<string, StubElement>();
  const append = (el: StubElement) => {
    elements.set(el.id, el);
  };

  vi.stubGlobal("document", {
    documentElement: { style: { setProperty() {} }, setAttribute() {} },
    body: { classList: { toggle() {} }, appendChild: append },
    head: { appendChild: append },
    getElementById: (id: string) => elements.get(id) ?? null,
    createElement: (): StubElement => ({
      id: "",
      textContent: "",
      remove() {
        elements.delete(this.id);
      },
    }),
    fonts: { forEach() {}, add() {}, delete() {} },
  });

  // 桌布亮度採樣會 new Image()；替身直接回報載入失敗，store 會退回中性亮度
  vi.stubGlobal(
    "Image",
    class {
      onerror: (() => void) | null = null;
      set src(_value: string) {
        setTimeout(() => this.onerror?.(), 0);
      }
    },
  );

  return {
    styleText: (id) => elements.get(id)?.textContent ?? null,
  };
}
