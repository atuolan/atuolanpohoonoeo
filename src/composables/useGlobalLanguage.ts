import {
    simplifiedToTraditional,
    traditionalToSimplified,
} from "@/data/zhConversionMap";
import { useSettingsStore } from "@/stores/settings";
import { watch } from "vue";

type LangMode = "zh-TW" | "zh-CN" | "none";

/**
 * 全局繁簡轉換 — 在 App 層級呼叫一次即可
 *
 * 三模式：
 *  - 'zh-TW'：將 DOM 文字一律收斂為繁體
 *  - 'zh-CN'：將 DOM 文字一律收斂為簡體
 *  - 'none' ：不轉換，盡量還原為「首見 pristine」
 *
 * 設計重點：
 *  - 在 'zh-TW'/'zh-CN' 模式下 convertTextNode 直接讀當前 textContent 套對應 map，
 *    不依賴 WeakMap original，保證 idempotent 且不怕 Vue 重渲染 / v-html 重建。
 *  - MutationObserver 雙模式都常駐，addedNodes / characterData 變動都會立刻再收斂一次。
 *  - WeakMap originalTextMap 僅服務 'none' 模式的「原地還原」用途。
 */
export function useGlobalLanguage() {
  const settingsStore = useSettingsStore();

  let observer: MutationObserver | null = null;
  // 首見 pristine：節點第一次進入視野時的原始文字
  const originalTextMap = new WeakMap<Text, string>();

  function pickMap(mode: "zh-TW" | "zh-CN"): Record<string, string> {
    return mode === "zh-CN" ? traditionalToSimplified : simplifiedToTraditional;
  }

  function convertString(text: string, mode: "zh-TW" | "zh-CN"): string {
    const map = pickMap(mode);
    return text
      .split("")
      .map((c) => map[c] || c)
      .join("");
  }

  /**
   * 'zh-TW' / 'zh-CN' 模式下將節點當前文字套 map 寫回（idempotent）
   */
  function convertTextNode(node: Text, mode: "zh-TW" | "zh-CN") {
    const text = node.textContent;
    if (!text || !text.trim()) return;
    const converted = convertString(text, mode);
    if (text !== converted) {
      node.textContent = converted;
    }
  }

  /**
   * 'none' 模式下用 WeakMap pristine 原地還原
   */
  function restoreTextNode(node: Text) {
    const original = originalTextMap.get(node);
    if (original !== undefined && node.textContent !== original) {
      node.textContent = original;
    }
  }

  /**
   * 紀錄首見 pristine（只在沒記錄過時才記）
   */
  function recordPristineIfNew(node: Text) {
    if (originalTextMap.has(node)) return;
    const text = node.textContent;
    if (!text || !text.trim()) return;
    originalTextMap.set(node, text);
  }

  /**
   * 遍歷 DOM 樹中的所有文字節點
   */
  function walkTextNodes(root: Node, callback: (node: Text) => void) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        const parent = node.parentElement;
        if (!parent) return NodeFilter.FILTER_REJECT;
        const tag = parent.tagName;
        if (
          tag === "SCRIPT" ||
          tag === "STYLE" ||
          tag === "TEXTAREA" ||
          tag === "NOSCRIPT"
        ) {
          return NodeFilter.FILTER_REJECT;
        }
        if (parent.isContentEditable) return NodeFilter.FILTER_REJECT;
        if (!node.textContent?.trim()) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      },
    });

    while (walker.nextNode()) {
      callback(walker.currentNode as Text);
    }
  }

  /**
   * 對整個 body 執行一次處理（記 pristine + 套當前模式）
   */
  function processAll(mode: LangMode) {
    walkTextNodes(document.body, (node) => {
      recordPristineIfNew(node);
      if (mode === "none") {
        restoreTextNode(node);
      } else {
        convertTextNode(node, mode);
      }
    });
  }

  /**
   * 處理單一節點（observer addedNodes 用）
   */
  function processNode(node: Text, mode: LangMode) {
    recordPristineIfNew(node);
    if (mode === "none") {
      restoreTextNode(node);
    } else {
      convertTextNode(node, mode);
    }
  }

  /**
   * 啟動 MutationObserver — 不論模式都常駐
   */
  function startObserver() {
    if (observer) observer.disconnect();

    observer = new MutationObserver((mutations) => {
      const mode = (settingsStore.language ?? "none") as LangMode;

      for (const mutation of mutations) {
        // 新增節點：記 pristine、套當前模式
        for (const node of mutation.addedNodes) {
          if (node.nodeType === Node.TEXT_NODE) {
            processNode(node as Text, mode);
          } else if (node.nodeType === Node.ELEMENT_NODE) {
            walkTextNodes(node, (textNode) => processNode(textNode, mode));
          }
        }

        // characterData：Vue 更新文字
        if (
          mutation.type === "characterData" &&
          mutation.target.nodeType === Node.TEXT_NODE
        ) {
          const textNode = mutation.target as Text;
          const text = textNode.textContent ?? "";

          if (mode === "none") {
            // none 模式下，Vue 寫入的就是新 pristine
            if (text.trim()) {
              originalTextMap.set(textNode, text);
            }
            // 不轉字
          } else {
            // 區分「Vue 寫入新資料」 vs 「我們轉過後的 mutation 回呼」：
            // 若 currentText 等於「stored pristine 套當前 map 的結果」，視為自己的 write，
            // 否則視為 Vue 用新資料覆寫，更新 pristine。
            const stored = originalTextMap.get(textNode);
            if (stored === undefined) {
              if (text.trim()) originalTextMap.set(textNode, text);
            } else {
              const expected = convertString(stored, mode);
              if (text !== expected && text.trim()) {
                // Vue 覆寫了新資料
                originalTextMap.set(textNode, text);
              }
            }
            convertTextNode(textNode, mode);
          }
        }
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
    });
  }

  /**
   * 初始化：監聽語言變化
   */
  function init() {
    // 先啟動 observer，避免在 processAll 跑之前就有 Vue 更新被遺漏
    startObserver();

    watch(
      () => settingsStore.language,
      (newLang) => {
        const mode = (newLang ?? "none") as LangMode;
        processAll(mode);
      },
      { immediate: true },
    );
  }

  function destroy() {
    if (observer) {
      observer.disconnect();
      observer = null;
    }
  }

  return { init, destroy };
}
