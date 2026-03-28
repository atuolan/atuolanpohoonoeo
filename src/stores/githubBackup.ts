/**
 * GitHub 雲端備份全局狀態
 *
 * 備份任務在此 store 中執行，離開設定頁面也不會中斷。
 * 任何元件都可以透過此 store 讀取進度。
 */

import { buildBackupZipStreaming } from "@/services/AutoBackupService";
import {
  loadGitHubSettings,
  saveGitHubSettings,
  uploadToGitHub,
  type GitHubBackupProgress,
} from "@/services/GitHubBackupService";
import { defineStore } from "pinia";
import { computed, ref } from "vue";

export const useGitHubBackupStore = defineStore("githubBackup", () => {
  // 狀態
  const busy = ref(false);
  const phase = ref("");
  const currentChunk = ref(0);
  const totalChunks = ref(0);
  /** 0~100 的百分比 */
  const percent = ref(0);
  const lastResult = ref<{ success: boolean; message: string } | null>(null);

  // 內部階段權重：打包佔 40%，上傳佔 55%，提交佔 5%
  const PACK_WEIGHT = 40;
  const UPLOAD_WEIGHT = 55;

  const displayText = computed(() => {
    if (!busy.value) return "";
    if (percent.value > 0) return `${phase.value} (${percent.value}%)`;
    return phase.value;
  });

  /** 執行完整的 GitHub 備份流程 */
  async function startBackup() {
    if (busy.value) return;
    busy.value = true;
    percent.value = 0;
    phase.value = "準備備份資料...";
    currentChunk.value = 0;
    totalChunks.value = 0;
    lastResult.value = null;

    try {
      // 階段 1：打包 ZIP（佔 0~40%）
      const zipData = await buildBackupZipStreaming((info) => {
        phase.value = info.phase;
        if (info.current && info.total && info.total > 0) {
          percent.value = Math.round((info.current / info.total) * PACK_WEIGHT);
        }
      });

      percent.value = PACK_WEIGHT;

      // 階段 2：上傳到 GitHub（佔 40~95%）
      const onUploadProgress = (p: GitHubBackupProgress) => {
        phase.value = p.phase;
        currentChunk.value = p.current ?? 0;
        totalChunks.value = p.total ?? 0;
        if (p.current && p.total && p.total > 0) {
          percent.value =
            PACK_WEIGHT + Math.round((p.current / p.total) * UPLOAD_WEIGHT);
        } else if (p.phase === "提交到 GitHub...") {
          percent.value = PACK_WEIGHT + UPLOAD_WEIGHT;
        }
      };

      const result = await uploadToGitHub(zipData, onUploadProgress);
      percent.value = 100;
      phase.value = result.success ? "備份完成" : "備份失敗";
      lastResult.value = result;

      // 更新設定
      if (result.success) {
        const settings = await loadGitHubSettings();
        settings.lastBackupAt = Date.now();
        settings.lastBackupMessage = result.message;
        await saveGitHubSettings(settings);
      }
    } catch (e: any) {
      phase.value = "備份失敗";
      lastResult.value = { success: false, message: e.message || String(e) };
    } finally {
      // 3 秒後自動清除完成狀態
      setTimeout(() => {
        if (percent.value >= 100 || lastResult.value) {
          busy.value = false;
          percent.value = 0;
          phase.value = "";
        }
      }, 3000);
    }
  }

  return {
    busy,
    phase,
    currentChunk,
    totalChunks,
    percent,
    displayText,
    lastResult,
    startBackup,
  };
});
