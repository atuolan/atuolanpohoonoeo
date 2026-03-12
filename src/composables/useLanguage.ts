import {
    simplifiedToTraditional,
    traditionalToSimplified,
} from "@/data/zhConversionMap";
import { useSettingsStore } from "@/stores/settings";
import { computed } from "vue";

export function useLanguage() {
  const settingsStore = useSettingsStore();

  const currentLanguage = computed(() => settingsStore.language);
  const isSimplifiedChinese = computed(() => currentLanguage.value === "zh-CN");

  /**
   * 翻譯文本 — 繁體原文在簡體模式下自動轉換
   */
  function t(text: string): string {
    if (currentLanguage.value === "zh-CN") {
      return convertToSimplified(text);
    }
    return text;
  }

  /**
   * 繁體 → 簡體
   */
  function convertToSimplified(text: string): string {
    return text
      .split("")
      .map((char) => traditionalToSimplified[char] || char)
      .join("");
  }

  /**
   * 簡體 → 繁體
   */
  function convertToTraditional(text: string): string {
    return text
      .split("")
      .map((char) => simplifiedToTraditional[char] || char)
      .join("");
  }

  /**
   * 切換語言
   */
  function toggleLanguage() {
    const newLang = currentLanguage.value === "zh-TW" ? "zh-CN" : "zh-TW";
    settingsStore.setLanguage(newLang);
  }

  /**
   * 設定語言
   */
  function setLanguage(lang: "zh-TW" | "zh-CN") {
    settingsStore.setLanguage(lang);
  }

  return {
    currentLanguage,
    isSimplifiedChinese,
    t,
    convertToSimplified,
    convertToTraditional,
    toggleLanguage,
    setLanguage,
  };
}
