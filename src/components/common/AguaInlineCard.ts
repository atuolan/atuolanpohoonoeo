/**
 * <aguaphone-inline-card>
 * --------------------------------------------------------------------------
 * 自訂元素：把 light DOM 子節點（包含 <style>）搬進 Shadow DOM，徹底隔離樣式。
 *
 * 使用情境：HtmlTemplateEngine 在 renderMode === "inline" 時輸出的 HTML，
 * 會用本元素包裹。瀏覽器解析 innerHTML 時先把子節點以 light DOM 建出來，
 * connectedCallback 觸發後再搬進 shadow root：
 *
 *   <aguaphone-inline-card>
 *     <style>.card{...}</style>      ← 進入 shadow，僅影響本卡片
 *     <div class="card">...</div>    ← 進入 shadow，由 shadow 內 style 渲染
 *   </aguaphone-inline-card>
 *
 * 比較其他方案：
 *   - iframe：跨文檔、需要 sandbox 與 ResizeObserver 雙向同步高度，行動端常見裁切/動畫斷裂。
 *   - 全域注入 cssScope + class 前綴：每條規則都得自加前綴、容易撞名、且 CSS 仍可能洩漏到聊天頁其他元素。
 *   - Shadow DOM：原生 CSS 隔離、無 iframe 縮放問題、可繼承外層字體/色彩、零跨域。
 *
 * 注意：
 *   - Vue v-html 先把字串注入到父節點 innerHTML，瀏覽器解析時若本元素已定義（在 main.ts 註冊），
 *     會同步觸發 connectedCallback，子節點還沒被瀏覽器渲染就已搬入 shadow，不會有 FOUC。
 *   - 若 v-html 之後 Vue 又更新內容，外層 <aguaphone-inline-card> 通常會被整個重建（因為 innerHTML
 *     被替換），新元素會走一遍 connectedCallback；MutationObserver 是保險用，處理「同實例」內容更新。
 */

const TAG = "aguaphone-inline-card";

export class AguaInlineCard extends HTMLElement {
  private _shadowReady = false;
  private _observer?: MutationObserver;

  connectedCallback(): void {
    if (!this._shadowReady) {
      const shadow = this.attachShadow({ mode: "open" });
      // 基礎樣式：block 佈局；色彩/字體沿用外層（color/font-family 等可繼承屬性
      // 自然穿透 shadow 邊界），與聊天氣泡視覺保持一致。
      const base = document.createElement("style");
      // 預設允許卡片自帶捲動：過寬時水平捲動，過高時垂直捲動。
      // 避免無限撐高聊天氣泡；可用 max-height / overflow 屬性覆蓋。
      // - max-height 優先讀 attribute（host 可寫 <aguaphone-inline-card max-height="320px">）
      // - 若 attribute 未指定，fallback 到 60vh
      const maxH = this.getAttribute("max-height") ?? "60vh";
      const overflowAttr = this.getAttribute("overflow") ?? "auto";
      base.textContent = `
        :host {
          display: block;
          width: 100%;
          max-width: 100%;
          max-height: ${maxH};
          overflow: ${overflowAttr};
          box-sizing: border-box;
          text-align: center; /* 兜底：行內 / inline-block 元素也置中 */
          -webkit-overflow-scrolling: touch;
        }
        :host([hidden]) { display: none; }
        /* 模板的 <html>/<body> 會被 HTML parser 剝掉，body{} CSS 失效。
           吸收進來的子節點被包進 .aguaphone-card-root，讓直系子元素自動水平置中，
           模仿 body{} 置中行為。模板若自帶 margin 會被這條規則覆蓋。 */
        .aguaphone-card-root {
          display: block;
          width: 100%;
          max-width: 100%;
          box-sizing: border-box;
          text-align: inherit;
        }
        .aguaphone-card-root > * {
          margin-left: auto !important;
          margin-right: auto !important;
        }
      `;
      shadow.appendChild(base);
      this._shadowReady = true;
    }
    this._absorbLightChildren();
    if (!this._observer) {
      this._observer = new MutationObserver(() => this._absorbLightChildren());
      this._observer.observe(this, { childList: true });
    }
  }

  disconnectedCallback(): void {
    this._observer?.disconnect();
    this._observer = undefined;
  }

  private _absorbLightChildren(): void {
    const shadow = this.shadowRoot;
    if (!shadow) return;

    // 找 / 建立 root 容器（用於置中所有可見內容）。
    let root = shadow.querySelector<HTMLDivElement>(".aguaphone-card-root");
    if (!root) {
      root = document.createElement("div");
      root.className = "aguaphone-card-root";
      shadow.appendChild(root);
    }

    // 把 light DOM 子節點搬進 shadow：<style> 直接放 shadow 根（讓全域 CSS 生效），
    // 其餘可見元素放進 root 容器，便於統一控制置中。
    while (this.firstChild) {
      const node = this.firstChild;
      if (
        node.nodeType === Node.ELEMENT_NODE &&
        (node as Element).tagName.toLowerCase() === "style"
      ) {
        shadow.appendChild(node);
      } else {
        root.appendChild(node);
      }
    }

    const scripts = Array.from(shadow.querySelectorAll("script"));
    for (const script of scripts) {
      script.remove();
      this._executeScript(script.textContent || "");
    }
  }

  private _executeScript(source: string): void {
    const root = this.shadowRoot;
    if (!root || !source.trim()) return;

    type MiniQueryNode = Element | Window | Document;
    class MiniQuery {
      nodes: MiniQueryNode[];

      constructor(nodes: MiniQueryNode[]) {
        this.nodes = Array.prototype.slice.call(nodes || []);
      }

      on(event: string, handler: EventListener): MiniQuery {
        this.nodes.forEach((node) => node.addEventListener(event, handler));
        return this;
      }

      text(value?: string): string | MiniQuery {
        if (value === undefined) return (this.nodes[0] as Node | undefined)?.textContent || "";
        this.nodes.forEach((node) => {
          (node as Node).textContent = value;
        });
        return this;
      }

      val(value?: string | number): string | MiniQuery {
        const first = this.nodes[0] as HTMLInputElement | undefined;
        if (value === undefined) return first?.value || "";
        this.nodes.forEach((node) => {
          if ("value" in node) {
            (node as HTMLInputElement).value = String(value);
          }
        });
        return this;
      }

      trigger(eventName: string): MiniQuery {
        this.nodes.forEach((node) => {
          node.dispatchEvent(new Event(eventName, { bubbles: true }));
        });
        return this;
      }
    }

    const $ = (selector: string | MiniQueryNode | (() => void)): MiniQuery => {
      if (typeof selector === "function") {
        selector();
        return new MiniQuery([]);
      }
      if (
        selector instanceof Element ||
        selector === window ||
        selector === document
      ) {
        return new MiniQuery([selector]);
      }
      return new MiniQuery(Array.from(root.querySelectorAll(selector as string)));
    };

    const emitAudioControl = (
      action: "play" | "pause" | "settings",
      id?: string,
      payload?: Record<string, unknown>,
    ): void => {
      this.dispatchEvent(
        new CustomEvent("aguaphone-audio-control", {
          detail: { action, id, payload: payload || {} },
          bubbles: true,
          composed: true,
        }),
      );
    };

    const playAudio = (id?: string, payload?: Record<string, unknown>) =>
      emitAudioControl("play", id, payload);
    const pauseAudio = (id?: string) => emitAudioControl("pause", id);
    const setAudioSettings = (id?: string, payload?: Record<string, unknown>) =>
      emitAudioControl("settings", id, payload);
    const TavernHelper = { playAudio, pauseAudio, setAudioSettings };
    const scopedDocument = new Proxy(document, {
      get(target, prop) {
        if (prop === "querySelector") {
          return (selector: string) => root.querySelector(selector);
        }
        if (prop === "querySelectorAll") {
          return (selector: string) => root.querySelectorAll(selector);
        }
        if (prop === "getElementById") {
          return (id: string) => root.getElementById(id);
        }
        if (prop === "getElementsByClassName") {
          return (className: string) => root.querySelectorAll(`.${className}`);
        }
        if (prop === "getElementsByTagName") {
          return (tagName: string) => root.querySelectorAll(tagName);
        }
        if (prop === "body") {
          return root.firstElementChild;
        }
        const value = Reflect.get(target, prop, target);
        return typeof value === "function" ? value.bind(target) : value;
      },
    });

    try {
      new Function(
        "document",
        "$",
        "TavernHelper",
        "playAudio",
        "pauseAudio",
        "setAudioSettings",
        source,
      ).call(
        this,
        scopedDocument,
        $,
        TavernHelper,
        playAudio,
        pauseAudio,
        setAudioSettings,
      );
    } catch (error) {
      console.warn("[AguaInlineCard] script execution failed:", error);
    }
  }
}

/** 冪等註冊；在 main.ts bootstrap 階段呼叫一次即可。SSR 安全（無 customElements 時直接跳過）。 */
export function registerAguaInlineCard(): void {
  if (typeof customElements === "undefined") return;
  if (customElements.get(TAG)) return;
  customElements.define(TAG, AguaInlineCard);
}

/** 提供給引擎/元件複用的標籤常數，避免散落字串。 */
export const AGUA_INLINE_CARD_TAG = TAG;
