import {
    simplifiedToTraditional,
    traditionalToSimplified,
} from "@/data/zhConversionMap";
import { useSettingsStore } from "@/stores/settings";
import { watch } from "vue";

/**
 * 全局繁簡轉換 — 在 App 層級呼叫一次即可
 * 透過 MutationObserver 監聽 DOM 變化，自動轉換所有文字節點
 */
export function useGlobalLanguage() {
  const settingsStore = useSettingsStore();

  let observer: MutationObserver | null = null;
  // 用 WeakMap 儲存原始文字，避免重複轉換導致資料遺失
  const originalTextMap = new WeakMap<Text, string>();

  /**
   * 轉換單個文字節點
   */
  function convertTextNode(node: Text, toSimplified: boolean) {
    const text = node.textContent;
    if (!text || !text.trim()) return;

    // 儲存原始文字（只在第一次遇到時儲存）
    if (!originalTextMap.has(node)) {
      originalTextMap.set(node, text);
    }

    const original = originalTextMap.get(node) || text;
    const map = toSimplified
      ? traditionalToSimplified
      : simplifiedToTraditional;

    const converted = original
      .split("")
      .map((char) => map[char] || char)
      .join("");

    if (node.textContent !== converted) {
      node.textContent = converted;
    }
  }

  /**
   * 還原文字節點到原始內容
   */
  function restoreTextNode(node: Text) {
    const original = originalTextMap.get(node);
    if (original && node.textContent !== original) {
      node.textContent = original;
    }
  }

  /**
   * 遍歷 DOM 樹中的所有文字節點
   */
  function walkTextNodes(root: Node, callback: (node: Text) => void) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        // 跳過 script, style, textarea, input 等
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
        // 跳過 contenteditable
        if (parent.isContentEditable) return NodeFilter.FILTER_REJECT;
        // 跳過空白文字
        if (!node.textContent?.trim()) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      },
    });

    while (walker.nextNode()) {
      callback(walker.currentNode as Text);
    }
  }

  /**
   * 對整個頁面執行轉換
   */
  function convertAll(toSimplified: boolean) {
    walkTextNodes(document.body, (node) => {
      if (toSimplified) {
        convertTextNode(node, true);
      } else {
        // 切回繁體：先嘗試還原原始文字，若無原始記錄則主動簡→繁轉換
        const original = originalTextMap.get(node);
        if (original && node.textContent !== original) {
          node.textContent = original;
        } else if (node.textContent) {
          // 沒有原始記錄（新節點），用簡→繁 map 轉換
          const text = node.textContent;
          const converted = text
            .split("")
            .map((char) => simplifiedToTraditional[char] || char)
            .join("");
          if (node.textContent !== converted) {
            node.textContent = converted;
          }
        }
        originalTextMap.delete(node);
      }
    });
  }

  /**
   * 啟動 MutationObserver 監聽新增的 DOM 節點
   */
  function startObserver() {
    if (observer) observer.disconnect();

    observer = new MutationObserver((mutations) => {
      if (settingsStore.language !== "zh-CN") return;

      for (const mutation of mutations) {
        // 處理新增節點
        for (const node of mutation.addedNodes) {
          if (node.nodeType === Node.TEXT_NODE) {
            convertTextNode(node as Text, true);
          } else if (node.nodeType === Node.ELEMENT_NODE) {
            walkTextNodes(node, (textNode) => convertTextNode(textNode, true));
          }
        }
        // 處理文字內容變化
        if (
          mutation.type === "characterData" &&
          mutation.target.nodeType === Node.TEXT_NODE
        ) {
          const textNode = mutation.target as Text;
          // 重新記錄原始文字並轉換
          originalTextMap.delete(textNode);
          convertTextNode(textNode, true);
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
    // 監聽語言切換
    watch(
      () => settingsStore.language,
      (newLang) => {
        if (newLang === "zh-CN") {
          convertAll(true);
          startObserver();
        } else {
          convertAll(false);
          if (observer) {
            observer.disconnect();
            observer = null;
          }
        }
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
