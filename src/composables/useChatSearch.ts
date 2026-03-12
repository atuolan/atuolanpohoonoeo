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

  // 確保指定訊息在可見範圍內
  function ensureMessageVisible(messageId: string) {
    const msgIndex = deps.messages.value.findIndex((m) => m.id === messageId);
    if (msgIndex === -1) return;
    const total = deps.messages.value.length;
    const visibleStart = total - deps.visibleCount.value;
    if (msgIndex < visibleStart) {
      deps.visibleCount.value = total - msgIndex;
    }
  }

  // 滾動到指定消息
  function scrollToMessage(messageId: string) {
    ensureMessageVisible(messageId);
    nextTick(() => {
      const messageElement = document.querySelector(
        `[data-message-id="${messageId}"]`,
      );
      if (messageElement) {
        messageElement.scrollIntoView({ behavior: "smooth", block: "center" });
        messageElement.classList.add("highlight-message");
        setTimeout(() => {
          messageElement.classList.remove("highlight-message");
        }, 2000);
      }
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
    showSearchBar.value = false;
    searchQuery.value = "";
    searchResults.value = [];
    currentSearchIndex.value = 0;
    resetVisibleCount();
    deps.scrollToBottom();
  }

  // 執行搜索
  function performSearch() {
    const query = searchQuery.value.trim().toLowerCase();
    if (!query) {
      searchResults.value = [];
      currentSearchIndex.value = 0;
      return;
    }

    const results: string[] = [];
    deps.messages.value.forEach((msg) => {
      if (msg.content.toLowerCase().includes(query)) {
        results.push(msg.id);
      }
    });

    searchResults.value = results;
    currentSearchIndex.value = results.length > 0 ? 0 : -1;

    if (results.length > 0) {
      scrollToMessage(results[0]);
    }
  }

  // 跳轉到上一個搜索結果
  function goToPrevSearchResult() {
    if (searchResults.value.length === 0) return;
    currentSearchIndex.value =
      currentSearchIndex.value <= 0
        ? searchResults.value.length - 1
        : currentSearchIndex.value - 1;
    scrollToMessage(searchResults.value[currentSearchIndex.value]);
  }

  // 跳轉到下一個搜索結果
  function goToNextSearchResult() {
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
