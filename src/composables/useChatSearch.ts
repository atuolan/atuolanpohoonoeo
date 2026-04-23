import { nextTick, ref, type Ref } from "vue";

/**
 * 聊天訊息搜索功能
 * 從 ChatScreen.vue 抽取的獨立 composable
 */
export function useChatSearch(deps: {
  messages: Ref<{ id: string; content: string }[]>;
  visibleCount: Ref<number>;
  messagePageSize: number;
  scrollToBottom: () => void;
}) {
  const showSearchBar = ref(false);
  const searchQuery = ref("");
  const searchResults = ref<string[]>([]);
  const currentSearchIndex = ref(0);

  // 搜尋時一次最多擴展的訊息量上限（避免 DOM 一次暴量渲染造成卡頓或崩潰）。
  // 取一頁的 5 倍當保險；真的不夠再請使用者手動載入更多。
  const SEARCH_EXPAND_HARD_CAP = Math.max(500, deps.messagePageSize * 5);

  // 確保指定訊息在可見範圍內（加硬上限，避免一次渲染到崩潰）
  function ensureMessageVisible(messageId: string) {
    const msgIndex = deps.messages.value.findIndex((m) => m.id === messageId);
    if (msgIndex === -1) return;
    const total = deps.messages.value.length;
    const visibleStart = total - deps.visibleCount.value;
    if (msgIndex < visibleStart) {
      const needed = total - msgIndex;
      const capped = Math.min(needed, SEARCH_EXPAND_HARD_CAP);
      // 以整頁為單位，避免奇怪的尾部殘量
      const aligned =
        Math.ceil(capped / deps.messagePageSize) * deps.messagePageSize;
      deps.visibleCount.value = Math.min(aligned, total);
    }
  }

  // 滾動到指定消息
  function scrollToMessage(messageId: string) {
    ensureMessageVisible(messageId);
    // 等兩個 tick：第一個等 visibleCount 觸發 re-render，第二個等 DOM 真的 mount
    nextTick(() => {
      nextTick(() => {
        const messageElement = document.querySelector(
          `[data-message-id="${messageId}"]`,
        );
        if (messageElement) {
          // 用 auto 而非 smooth，避免連續搜尋時 smooth scroll 互相打架造成卡頓
          messageElement.scrollIntoView({ behavior: "auto", block: "center" });
          messageElement.classList.add("highlight-message");
          setTimeout(() => {
            messageElement.classList.remove("highlight-message");
          }, 2000);
        }
      });
    });
  }

  function resetVisibleCount() {
    deps.visibleCount.value = deps.messagePageSize;
  }

  // 打開搜索欄
  function openSearchBar() {
    showSearchBar.value = true;
    searchQuery.value = "";
    searchResults.value = [];
    currentSearchIndex.value = 0;
    nextTick(() => {
      const searchInput = document.querySelector(
        ".search-bar-input",
      ) as HTMLInputElement;
      searchInput?.focus();
    });
  }

  // 關閉搜索欄
  function closeSearchBar() {
    if (searchDebounceTimer !== null) {
      clearTimeout(searchDebounceTimer);
      searchDebounceTimer = null;
    }
    showSearchBar.value = false;
    searchQuery.value = "";
    searchResults.value = [];
    currentSearchIndex.value = 0;
    resetVisibleCount();
    deps.scrollToBottom();
  }

  // 實際執行搜索（與 debounce 版本分離，用於 Enter 立即搜尋）
  function runSearchNow() {
    const query = searchQuery.value.trim().toLowerCase();
    if (!query) {
      searchResults.value = [];
      currentSearchIndex.value = 0;
      return;
    }

    const results: string[] = [];
    const msgs = deps.messages.value;
    for (let i = 0; i < msgs.length; i++) {
      const msg = msgs[i];
      if (msg.content && msg.content.toLowerCase().includes(query)) {
        results.push(msg.id);
      }
    }

    searchResults.value = results;
    currentSearchIndex.value = results.length > 0 ? 0 : -1;
    // 不再自動 scrollToMessage：只有使用者點擊結果清單、
    // 或按 Enter 時才觸發 DOM 擴張與捲動，避免打字過程中不斷擴張 DOM 造成崩潰。
  }

  // debounce 觸發搜尋（綁在 input 上，避免每個按鍵都全訊息掃 + 擴 DOM）
  let searchDebounceTimer: ReturnType<typeof setTimeout> | null = null;
  function performSearch() {
    if (searchDebounceTimer !== null) {
      clearTimeout(searchDebounceTimer);
    }
    searchDebounceTimer = setTimeout(() => {
      searchDebounceTimer = null;
      runSearchNow();
    }, 200);
  }

  // 跳轉到上一個搜索結果
  function goToPrevSearchResult() {
    // 若還有 debounce 等著跑，先跑完再跳
    if (searchDebounceTimer !== null) {
      clearTimeout(searchDebounceTimer);
      searchDebounceTimer = null;
      runSearchNow();
      return;
    }
    if (searchResults.value.length === 0) return;
    currentSearchIndex.value =
      currentSearchIndex.value <= 0
        ? searchResults.value.length - 1
        : currentSearchIndex.value - 1;
    scrollToMessage(searchResults.value[currentSearchIndex.value]);
  }

  // 跳轉到下一個搜索結果
  function goToNextSearchResult() {
    if (searchDebounceTimer !== null) {
      clearTimeout(searchDebounceTimer);
      searchDebounceTimer = null;
      runSearchNow();
      return;
    }
    if (searchResults.value.length === 0) return;
    currentSearchIndex.value =
      currentSearchIndex.value >= searchResults.value.length - 1
        ? 0
        : currentSearchIndex.value + 1;
    scrollToMessage(searchResults.value[currentSearchIndex.value]);
  }

  return {
    showSearchBar,
    searchQuery,
    searchResults,
    currentSearchIndex,
    openSearchBar,
    closeSearchBar,
    performSearch,
    goToPrevSearchResult,
    goToNextSearchResult,
    scrollToMessage,
    ensureMessageVisible,
    resetVisibleCount,
  };
}
