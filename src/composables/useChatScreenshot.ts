import { ref, type Ref } from "vue";

/**
 * 聊天截圖功能（單條 + 批量）
 * 從 ChatScreen.vue 抽取的獨立 composable
 */
export function useChatScreenshot(deps: {
  messages: Ref<{ id: string }[]>;
  /** 與多選模式共用的選取狀態 */
  isSelecting: Ref<boolean>;
  selectedIds: Ref<string[]>;
}) {
  const screenshotPreviewUrl = ref<string | null>(null);
  const screenshotTargetId = ref<string | null>(null);

  async function handleMessageScreenshot(id: string) {
    screenshotTargetId.value = id;
    const chatArea = document.querySelector(
      ".messages-container",
    ) as HTMLElement;
    if (!chatArea) {
      console.error("截圖失敗: 找不到 .messages-container");
      return;
    }

    const el = chatArea.querySelector(
      `[data-message-id="${id}"]`,
    ) as HTMLElement;
    if (!el) {
      console.error("截圖失敗: 找不到消息元素", id);
      return;
    }

    const wasSelected = el.classList.contains("selected");
    if (wasSelected) el.classList.remove("selected");

    try {
      const mod = await import("@/composables/useScreenshot");
      const { captureElement } = mod.useScreenshot();
      const dataUrl = await captureElement(el, { scale: 2 });
      screenshotPreviewUrl.value = dataUrl;
    } catch (e) {
      console.error("截圖失敗:", e);
    } finally {
      if (wasSelected) el.classList.add("selected");
    }
  }

  async function handleScreenshotRetake(opts: any) {
    if (!screenshotTargetId.value) return;
    const chatArea = document.querySelector(
      ".messages-container",
    ) as HTMLElement;
    if (!chatArea) return;

    const el = chatArea.querySelector(
      `[data-message-id="${screenshotTargetId.value}"]`,
    ) as HTMLElement;
    if (!el) return;

    try {
      const mod = await import("@/composables/useScreenshot");
      const { captureElement } = mod.useScreenshot();
      const dataUrl = await captureElement(el, { scale: 2, ...opts });
      screenshotPreviewUrl.value = dataUrl;
    } catch (e) {
      console.error("重新截圖失敗:", e);
    }
  }

  async function executeBatchScreenshot() {
    if (deps.selectedIds.value.length === 0) return;
    const chatArea = document.querySelector(
      ".messages-container",
    ) as HTMLElement;
    if (!chatArea) return;

    const selectedElements: HTMLElement[] = [];
    for (const msgId of deps.selectedIds.value) {
      const el = chatArea.querySelector(
        `[data-message-id="${msgId}"]`,
      ) as HTMLElement;
      if (el && el.classList.contains("selected")) {
        el.classList.remove("selected");
        selectedElements.push(el);
      }
    }

    try {
      const mod = await import("@/composables/useScreenshot");
      const { captureMessages } = mod.useScreenshot();
      const allIds = deps.messages.value.map((m) => m.id);
      const sortedIds = deps.selectedIds.value
        .slice()
        .sort((a, b) => allIds.indexOf(a) - allIds.indexOf(b));
      const dataUrl = await captureMessages(sortedIds, chatArea, {
        scale: 2,
        backgroundColor: "#f5f5f5",
      });
      screenshotPreviewUrl.value = dataUrl;
      cancelScreenshotSelect();
    } catch (e) {
      console.error("批量截圖失敗:", e);
    } finally {
      selectedElements.forEach((el) => el.classList.add("selected"));
    }
  }

  function cancelScreenshotSelect() {
    deps.isSelecting.value = false;
    deps.selectedIds.value = [];
  }

  return {
    screenshotPreviewUrl,
    screenshotTargetId,
    handleMessageScreenshot,
    handleScreenshotRetake,
    executeBatchScreenshot,
    cancelScreenshotSelect,
  };
}
