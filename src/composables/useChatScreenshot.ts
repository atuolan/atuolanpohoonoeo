import { ref, type Ref } from "vue";

/**
 * 聊天截圖功能（單條 + 批量）
 * 從 ChatScreen.vue 抽取的獨立 composable
 */
export function useChatScreenshot(deps: {
  messages: Ref<{ id: string }[]>;
  isSelectingForScreenshot: Ref<boolean>;
  screenshotSelectedIds: Ref<string[]>;
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

  function startScreenshotSelectMode(messageId?: string) {
    deps.isSelectingForScreenshot.value = true;
    deps.screenshotSelectedIds.value = messageId ? [messageId] : [];
  }

  function toggleScreenshotSelection(messageId: string) {
    const index = deps.screenshotSelectedIds.value.indexOf(messageId);
    if (index > -1) {
      deps.screenshotSelectedIds.value.splice(index, 1);
      return;
    }
    deps.screenshotSelectedIds.value.push(messageId);

    // 智能範圍選擇
    if (deps.screenshotSelectedIds.value.length >= 2) {
      const allIds = deps.messages.value.map((m) => m.id);
      const indices = deps.screenshotSelectedIds.value
        .map((id) => allIds.indexOf(id))
        .filter((i) => i >= 0);
      if (indices.length >= 2) {
        const min = Math.min(...indices);
        const max = Math.max(...indices);
        const rangeIds = allIds.slice(min, max + 1);
        deps.screenshotSelectedIds.value = [
          ...new Set([...deps.screenshotSelectedIds.value, ...rangeIds]),
        ];
      }
    }
  }

  async function executeBatchScreenshot() {
    if (deps.screenshotSelectedIds.value.length === 0) return;
    const chatArea = document.querySelector(
      ".messages-container",
    ) as HTMLElement;
    if (!chatArea) return;

    const selectedElements: HTMLElement[] = [];
    for (const msgId of deps.screenshotSelectedIds.value) {
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
      const sortedIds = deps.screenshotSelectedIds.value
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
    deps.isSelectingForScreenshot.value = false;
    deps.screenshotSelectedIds.value = [];
  }

  return {
    screenshotPreviewUrl,
    screenshotTargetId,
    handleMessageScreenshot,
    handleScreenshotRetake,
    startScreenshotSelectMode,
    toggleScreenshotSelection,
    executeBatchScreenshot,
    cancelScreenshotSelect,
  };
}
