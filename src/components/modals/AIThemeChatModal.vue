<script setup lang="ts">
/**
 * 對話式 AI 美化助手——聊天 UI
 *
 * 使用者用自然語言描述想要的外觀，AI 透過工具調用協議回覆，
 * 本元件負責：渲染對話、顯示每輪實際套用的工具清單、提供「還原這次修改」。
 *
 * AI 不會寫真實 CSS 選擇器、不改檔案；所有變更都經由 themeTools 派發到既有 setter。
 */
import { nextTick, onMounted, ref, watch } from "vue";
import {
  loadThemeChatHistory,
  saveThemeChatHistory,
  clearThemeChatHistory,
} from "@/storage/themeAssistantChatStorage";
import {
  runThemeAssistant,
  captureSnapshot,
  restoreSnapshot,
  type ChatTurn,
  type ThemeSnapshot,
  type ProgressEvent,
} from "@/services/themeAssistant/ThemeAssistantService";
import { useScreenshot } from "@/composables/useScreenshot";

/** 已附上的參考圖（base64 不含 data: 前綴，previewUrl 供預覽） */
interface AttachedImage {
  base64: string;
  mimeType: string;
  previewUrl: string;
}

interface Props {
  visible: boolean;
}
const props = defineProps<Props>();

const emit = defineEmits<{
  (e: "close"): void;
}>();

// ===== 對話狀態 =====

interface UIToolResult {
  ok: boolean;
  tool: string;
  error?: string;
}

interface UIMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  /** assistant 訊息才有：本輪實際套用的工具結果 */
  toolResults?: UIToolResult[];
  /** 套用前的快照，供「還原」用（只有實際改動的 assistant 訊息才有） */
  snapshot?: ThemeSnapshot;
  /** 已被還原 */
  reverted?: boolean;
  /** AI 提出的待答選擇題（有值時渲染成可點擊按鈕） */
  pendingAsk?: { question: string; options: string[] };
  /** 待答選擇題已被回答（點過後鎖住按鈕） */
  askAnswered?: boolean;
  /** 循序漸進模式：本步已套用，供「繼續下一步／再調整／完成」快捷回覆 */
  stepApplied?: boolean;
  /** 快捷回覆已被點過（鎖住按鈕） */
  quickReplied?: boolean;
  /** 串流中：內容正在逐字更新 */
  streaming?: boolean;
  /** 流程錯誤 */
  error?: string;
}

// 是否已從 IndexedDB 載入完成（載入前不寫回，避免用空陣列覆蓋既有紀錄）
const historyLoaded = ref(false);

// 將目前對話寫回 IndexedDB（串流進行中略過，避免逐字大量寫入）
function persistMessages() {
  if (!historyLoaded.value) return;
  if (messages.value.some((m) => m.streaming)) return;
  const serializable = messages.value.map((m) => ({
    ...m,
    streaming: false,
  }));
  void saveThemeChatHistory(serializable);
}

const messages = ref<UIMessage[]>([]);
const input = ref("");
const loading = ref(false);
// 執行中的進度文字（顯示「還在調用什麼」）
const progressText = ref("");
const scrollArea = ref<HTMLElement | null>(null);
const inputEl = ref<HTMLTextAreaElement | null>(null);

// 聯網搜尋開關（OpenRouter 用 model 後綴 :online）
const online = ref(false);
// 循序漸進模式：預設開啟，一次只改一項、每步停下等使用者確認；
// 關閉則為「一次到位」，AI 一輪把所有想改的都套用完。
const stepByStep = ref(true);
// 縮小狀態：縮小後視窗收成浮球，讓使用者能一邊看 app 一邊等 AI 處理。
const minimized = ref(false);
// 未讀紅點：縮小期間 AI 輸出完成時亮起，還原視窗時清除。
const hasUnread = ref(false);

// 縮小視窗（不關閉，保留對話與進行中的處理）
function minimize() {
  minimized.value = true;
}

// 還原視窗，同時清掉未讀紅點
function restore() {
  minimized.value = false;
  hasUnread.value = false;
}
// 這一輪附上的參考圖
const attachedImages = ref<AttachedImage[]>([]);
const fileInput = ref<HTMLInputElement | null>(null);

function triggerFilePick() {
  fileInput.value?.click();
}

async function addImageFile(file: File) {
  if (!file.type.startsWith("image/")) return;
  const base64 = await readFileAsBase64(file);
  attachedImages.value.push({
    base64,
    mimeType: file.type,
    previewUrl: `data:${file.type};base64,${base64}`,
  });
}

async function onPickImages(e: Event) {
  const el = e.target as HTMLInputElement;
  const files = el.files ? Array.from(el.files) : [];
  for (const file of files) {
    await addImageFile(file);
  }
  // 清空 input 讓同一張圖可再次選取
  el.value = "";
}

// 貼上圖片（Ctrl/Cmd+V）：從剪貼簿抓 image 檔，若有圖則阻止預設貼入文字
async function onPaste(e: ClipboardEvent) {
  const items = e.clipboardData?.items;
  if (!items) return;
  const imageFiles: File[] = [];
  for (const item of Array.from(items)) {
    if (item.kind === "file" && item.type.startsWith("image/")) {
      const file = item.getAsFile();
      if (file) imageFiles.push(file);
    }
  }
  if (imageFiles.length === 0) return;
  e.preventDefault();
  for (const file of imageFiles) {
    await addImageFile(file);
  }
}

function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result);
      // 去掉 data:*/*;base64, 前綴
      const comma = result.indexOf(",");
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function removeImage(idx: number) {
  attachedImages.value.splice(idx, 1);
}

function uid(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

async function scrollToBottom() {
  await nextTick();
  if (scrollArea.value) {
    scrollArea.value.scrollTop = scrollArea.value.scrollHeight;
  }
}

// 將 UI 對話轉成服務需要的歷史（只取純文字、去掉本輪正在送的）
function buildHistory(): ChatTurn[] {
  return messages.value
    .filter((m) => !m.error)
    .map((m) => ({ role: m.role, content: m.content }) as ChatTurn);
}

// 把進度事件轉成一句人類可讀的狀態文字
function describeProgress(ev: {
  phase: string;
  toolNames?: string[];
}): string {
  const tools = ev.toolNames?.join("、") ?? "";
  if (ev.phase === "requesting") return "AI 思考中…";
  if (ev.phase === "querying") return `正在勘查：${tools}`;
  if (ev.phase === "executing") return `正在套用：${tools}`;
  return "處理中…";
}

// 截圖自檢：擷取首頁畫布的「真實渲染畫面」回餵給 AI，讓它親眼確認改動是否生效。
// 回傳去掉 data: 前綴的 base64 與 mimeType；無畫布或截圖失敗時回 null（服務層會走文字後備）。
const { captureElement } = useScreenshot();
async function captureScreenshot(): Promise<{
  base64: string;
  mimeType: string;
} | null> {
  const canvas = document.querySelector<HTMLElement>(".whiteboard-canvas");
  if (!canvas) return null;
  try {
    // 用 jpeg 壓一下體積、關浮水印，避免回餵圖片過大
    const dataUrl = await captureElement(canvas, {
      format: "jpeg",
      quality: 0.85,
      scale: 1,
      backgroundColor: "#ffffff",
      watermark: false,
    });
    const match = /^data:([^;]+);base64,(.*)$/s.exec(dataUrl);
    if (!match) return null;
    return { mimeType: match[1], base64: match[2] };
  } catch {
    return null;
  }
}

// 送出一輪對話並處理結果（send 與 answerAsk 共用）
async function runTurn(
  userContent: string,
  runImages: { base64: string; mimeType: string }[],
) {
  loading.value = true;
  progressText.value = "AI 思考中…";
  await scrollToBottom();

  // 送出前先擷取快照，供還原
  const history = buildHistory();
  const snapshot = captureSnapshot();

  // 先放一則「串流中」的佔位訊息，隨 token 逐字更新
  const streamMsg: UIMessage = {
    id: uid(),
    role: "assistant",
    content: "",
    streaming: true,
  };
  messages.value.push(streamMsg);

  try {
    const result = await runThemeAssistant(userContent, history, {
      online: online.value,
      stepByStep: stepByStep.value,
      images: runImages.length > 0 ? runImages : undefined,
      captureScreenshot,
      onProgress: (ev) => {
        progressText.value = describeProgress(ev);
      },
      onToken: (visibleText) => {
        // 逐字更新佔位訊息；多輪時後輪文字接在前輪之後
        streamMsg.content = visibleText;
        scrollToBottom();
      },
    });

    if (result.error) {
      streamMsg.streaming = false;
      streamMsg.content = result.message || "";
      streamMsg.error = result.error;
    } else {
      const toolResults: UIToolResult[] = result.execResults
        // 詢問型工具不列進「已套用」清單，改用下方選擇題呈現
        .filter((r) => r.tool !== "詢問使用者")
        .map((r) => ({ ok: r.ok, tool: r.tool, error: r.error }));
      streamMsg.streaming = false;
      streamMsg.content = result.message;
      streamMsg.toolResults = toolResults;
      streamMsg.snapshot = result.applied ? snapshot : undefined;
      streamMsg.pendingAsk = result.pendingAsk;
      // 循序漸進模式下，本步已實際套用且沒有待答選擇題時，
      // 顯示「繼續下一步／再調整／完成」快捷回覆，引導使用者逐項確認。
      streamMsg.stepApplied =
        stepByStep.value && result.applied && !result.pendingAsk;
    }
  } catch (e) {
    streamMsg.streaming = false;
    streamMsg.content = streamMsg.content || "";
    streamMsg.error = e instanceof Error ? e.message : String(e);
  } finally {
    loading.value = false;
    progressText.value = "";
    // 縮小狀態下本輪輸出已結束，亮起未讀紅點提示有新結果可看。
    if (minimized.value) hasUnread.value = true;
    await scrollToBottom();
  }
}

async function send() {
  const text = input.value.trim();
  const images = attachedImages.value;
  if ((!text && images.length === 0) || loading.value) return;

  const userContent = text || "（附上參考圖）";
  messages.value.push({ id: uid(), role: "user", content: userContent });
  input.value = "";

  // 帶出本輪選項後即清空附圖（聯網開關保留）
  const runImages = images.map((img) => ({
    base64: img.base64,
    mimeType: img.mimeType,
  }));
  attachedImages.value = [];

  await runTurn(userContent, runImages);
}

// 使用者點選 AI 提出的選擇題選項：把選項當作下一輪輸入送回，AI 接續套用
async function answerAsk(msg: UIMessage, option: string) {
  if (msg.askAnswered || loading.value) return;
  msg.askAnswered = true;
  messages.value.push({ id: uid(), role: "user", content: option });
  await runTurn(option, []);
}

// 循序漸進模式的快捷回覆：把「繼續下一步／這步再調整／完成了」當作下一輪輸入送回，
// 讓 AI 依上下文接著做下一個原子步驟，或收尾。複用 runTurn 流程（自帶快照可還原）。
async function quickReply(msg: UIMessage, option: string) {
  if (msg.quickReplied || loading.value) return;
  msg.quickReplied = true;
  messages.value.push({ id: uid(), role: "user", content: option });
  await runTurn(option, []);
}

function revert(msg: UIMessage) {
  if (!msg.snapshot || msg.reverted) return;
  restoreSnapshot(msg.snapshot);
  msg.reverted = true;
}

// 雙擊使用者訊息：回朔到該輪之前的外觀、把內容回填輸入框、截斷後續對話重新編輯
async function editUserMessage(msg: UIMessage) {
  if (loading.value || msg.role !== "user") return;
  const idx = messages.value.findIndex((m) => m.id === msg.id);
  if (idx < 0) return;

  // 回朔外觀：這則使用者訊息之後（含）第一個帶快照的訊息，
  // 其快照即為「送出這輪之前」的狀態，還原它就等於撤銷本輪起的所有改動。
  const snapMsg = messages.value
    .slice(idx)
    .find((m) => m.snapshot && !m.reverted);
  if (snapMsg?.snapshot) {
    restoreSnapshot(snapMsg.snapshot);
  }

  // 把內容回填輸入框供編輯，並截斷這則訊息（含）之後的對話
  input.value = msg.content;
  messages.value = messages.value.slice(0, idx);

  await nextTick();
  inputEl.value?.focus();
}

function clearChat() {
  messages.value = [];
  void clearThemeChatHistory();
}

function onKeydown(e: KeyboardEvent) {
  // Enter 送出，Shift+Enter 換行
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    send();
  }
}

const SUGGESTIONS = [
  "幫我換成清新的薄荷綠色系",
  "把聊天氣泡調圓一點、顏色柔和一點",
  "我想要夢幻的少女風",
  "桌布換成溫暖的橘色漸層",
];

function useSuggestion(s: string) {
  input.value = s;
}

// 對話有變動就寫回 IndexedDB（deep 追蹤內容；串流中由 persistMessages 自行略過）
watch(
  messages,
  () => {
    persistMessages();
  },
  { deep: true },
);

// 若目前沒有任何訊息，補一句招呼
function ensureGreeting() {
  if (messages.value.length === 0) {
    messages.value.push({
      id: uid(),
      role: "assistant",
      content:
        "嗨～我是介面美化助手 ✨ 告訴我你想要的氛圍、配色或感覺，我會幫你動手調整。不滿意隨時可以還原。",
    });
  }
}

// 掛載時先從 IndexedDB 還原歷史，載入完成才允許寫回
onMounted(async () => {
  try {
    const persisted = await loadThemeChatHistory<UIMessage>();
    if (Array.isArray(persisted) && persisted.length > 0) {
      // 還原後不應有殘留的串流中旗標
      messages.value = persisted.map((m) => ({ ...m, streaming: false }));
    }
  } catch {
    // 載入失敗時退化為空對話
  } finally {
    historyLoaded.value = true;
    if (props.visible) ensureGreeting();
  }
});

// 開啟時若無訊息（且已載入完成），給一句招呼
watch(
  () => props.visible,
  (v) => {
    if (v) {
      // 每次開啟都回到完整視窗、清掉殘留的縮小與未讀狀態
      minimized.value = false;
      hasUnread.value = false;
      if (historyLoaded.value) ensureGreeting();
    }
  },
);
</script>

<template>
  <Teleport to="body">
    <Transition name="ai-theme-fade">
      <div
        v-if="visible && !minimized"
        class="ai-theme-overlay"
        @click.self="minimize"
      >
        <div class="ai-theme-modal">
          <header class="ai-theme-header">
            <div class="title">
              <span class="emoji">✨</span>
              <span>AI 介面美化助手</span>
            </div>
            <div class="header-actions">
              <button
                class="text-btn"
                :disabled="messages.length === 0"
                @click="clearChat"
              >
                清空
              </button>
              <button
                class="icon-btn"
                title="縮小視窗"
                aria-label="縮小視窗"
                @click="minimize"
              >
                －
              </button>
              <button class="close-btn" @click="emit('close')">✕</button>
            </div>
          </header>

          <div ref="scrollArea" class="ai-theme-body">
            <div
              v-for="msg in messages"
              :key="msg.id"
              class="msg-row"
              :class="msg.role"
              :title="msg.role === 'user' ? '雙擊可重新編輯並回朔改動' : undefined"
              @dblclick="msg.role === 'user' ? editUserMessage(msg) : undefined"
            >
              <div class="bubble">
                <p v-if="msg.error" class="msg-error">⚠️ {{ msg.error }}</p>
                <p v-else-if="msg.content" class="msg-text">
                  {{ msg.content }}<span v-if="msg.streaming" class="stream-caret"></span>
                </p>
                <span
                  v-else-if="msg.streaming"
                  class="typing"
                >
                  <i></i><i></i><i></i>
                </span>

                <!-- 本輪實際套用的工具清單 -->
                <ul
                  v-if="msg.toolResults && msg.toolResults.length"
                  class="tool-list"
                >
                  <li
                    v-for="(tr, i) in msg.toolResults"
                    :key="i"
                    :class="{ failed: !tr.ok }"
                  >
                    <span class="dot">{{ tr.ok ? "✓" : "✕" }}</span>
                    <span class="tool-name">{{ tr.tool }}</span>
                    <span v-if="!tr.ok && tr.error" class="tool-err">
                      — {{ tr.error }}
                    </span>
                  </li>
                </ul>

                <!-- AI 提出的選擇題：渲染成可點擊按鈕 -->
                <div
                  v-if="msg.pendingAsk"
                  class="ask-block"
                  :class="{ answered: msg.askAnswered }"
                >
                  <p class="ask-question">{{ msg.pendingAsk.question }}</p>
                  <div class="ask-options">
                    <button
                      v-for="(opt, oi) in msg.pendingAsk.options"
                      :key="oi"
                      class="ask-option"
                      :disabled="msg.askAnswered || loading"
                      @click="answerAsk(msg, opt)"
                    >
                      {{ opt }}
                    </button>
                  </div>
                </div>

                <!-- 還原按鈕 -->
                <div v-if="msg.snapshot" class="revert-row">
                  <button
                    class="revert-btn"
                    :disabled="msg.reverted"
                    @click="revert(msg)"
                  >
                    {{ msg.reverted ? "已還原這次修改" : "↩ 還原這次修改" }}
                  </button>
                </div>

                <!-- 循序漸進模式：本步已套用後的快捷回覆，引導逐項確認 -->
                <div
                  v-if="msg.stepApplied && !msg.reverted"
                  class="quick-reply"
                  :class="{ answered: msg.quickReplied }"
                >
                  <button
                    class="quick-btn primary"
                    :disabled="msg.quickReplied || loading"
                    @click="quickReply(msg, '這步可以，繼續下一步')"
                  >
                    繼續下一步
                  </button>
                  <button
                    class="quick-btn"
                    :disabled="msg.quickReplied || loading"
                    @click="quickReply(msg, '這步再調整一下')"
                  >
                    這步再調整
                  </button>
                  <button
                    class="quick-btn"
                    :disabled="msg.quickReplied || loading"
                    @click="quickReply(msg, '很好，這樣就完成了')"
                  >
                    完成了
                  </button>
                </div>
              </div>
            </div>

            <div
              v-if="loading && !messages[messages.length - 1]?.streaming"
              class="msg-row assistant"
            >
              <div class="bubble">
                <span class="typing">
                  <i></i><i></i><i></i>
                </span>
                <span v-if="progressText" class="progress-text">
                  {{ progressText }}
                </span>
              </div>
            </div>
          </div>

          <!-- 建議快捷 -->
          <div v-if="messages.length <= 1" class="suggestions">
            <button
              v-for="(s, i) in SUGGESTIONS"
              :key="i"
              class="suggestion-chip"
              @click="useSuggestion(s)"
            >
              {{ s }}
            </button>
          </div>

          <!-- 已附上的參考圖預覽 -->
          <div v-if="attachedImages.length" class="attached-images">
            <div
              v-for="(img, i) in attachedImages"
              :key="i"
              class="attached-thumb"
            >
              <img :src="img.previewUrl" alt="參考圖" />
              <button
                class="remove-thumb"
                title="移除"
                @click="removeImage(i)"
              >
                ✕
              </button>
            </div>
          </div>

          <div class="input-tools">
            <button
              class="tool-toggle"
              :class="{ active: stepByStep }"
              :title="
                stepByStep
                  ? '循序漸進：一次只改一項，每步停下等你確認'
                  : '一次到位：AI 一輪把想改的都套用完'
              "
              @click="stepByStep = !stepByStep"
            >
              {{ stepByStep ? "🐢 循序漸進" : "⚡ 一次到位" }}
            </button>
            <button
              class="tool-toggle"
              :class="{ active: online }"
              title="聯網搜尋（OpenRouter :online）"
              @click="online = !online"
            >
              🌐 聯網{{ online ? "：開" : "：關" }}
            </button>
            <button
              class="tool-toggle"
              title="附上參考圖"
              :disabled="loading"
              @click="triggerFilePick"
            >
              🖼️ 圖片
            </button>
            <input
              ref="fileInput"
              type="file"
              accept="image/*"
              multiple
              class="hidden-file"
              @change="onPickImages"
            />
          </div>

          <footer class="ai-theme-footer">
            <textarea
              ref="inputEl"
              v-model="input"
              class="ai-theme-input"
              rows="1"
              placeholder="描述你想要的外觀…（Enter 送出，Shift+Enter 換行，可貼上圖片）"
              :disabled="loading"
              @keydown="onKeydown"
              @paste="onPaste"
            ></textarea>
            <button
              class="send-btn"
              :disabled="loading || (!input.trim() && attachedImages.length === 0)"
              @click="send"
            >
              {{ loading ? "…" : "送出" }}
            </button>
          </footer>
        </div>
      </div>
    </Transition>

    <!-- 縮小後的浮球：點擊還原視窗，AI 輸出完成時右上角亮紅點 -->
    <Transition name="ai-theme-ball">
      <button
        v-if="visible && minimized"
        class="ai-theme-ball"
        :class="{ working: loading }"
        title="展開 AI 介面美化助手"
        aria-label="展開 AI 介面美化助手"
        @click="restore"
      >
        <span class="ball-emoji">✨</span>
        <span v-if="loading" class="ball-spinner"></span>
        <span v-else-if="hasUnread" class="ball-dot"></span>
      </button>
    </Transition>
  </Teleport>
</template>

<style lang="scss" scoped>
.ai-theme-overlay {
  position: fixed;
  inset: 0;
  z-index: 3000;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  background: rgba(0, 0, 0, 0.4);
  backdrop-filter: blur(2px);

  @media (min-width: 768px) {
    align-items: center;
  }
}

.ai-theme-modal {
  display: flex;
  flex-direction: column;
  width: 100%;
  max-width: 480px;
  height: 80vh;
  max-height: 720px;
  background: var(--color-surface, #fff);
  color: var(--color-text, #333);
  border-radius: 20px 20px 0 0;
  overflow: hidden;
  box-shadow: 0 -8px 40px rgba(0, 0, 0, 0.2);

  @media (min-width: 768px) {
    border-radius: 20px;
    height: 70vh;
  }
}

.ai-theme-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 16px;
  border-bottom: 1px solid var(--color-border, rgba(0, 0, 0, 0.08));

  .title {
    display: flex;
    align-items: center;
    gap: 8px;
    font-weight: 600;
    font-size: 16px;

    .emoji {
      font-size: 18px;
    }
  }

  .header-actions {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .text-btn {
    border: none;
    background: transparent;
    color: var(--color-text-secondary, #888);
    font-size: 13px;
    cursor: pointer;

    &:disabled {
      opacity: 0.4;
      cursor: default;
    }
  }

  .icon-btn {
    border: none;
    background: transparent;
    font-size: 20px;
    line-height: 1;
    padding: 0 4px;
    color: var(--color-text-secondary, #888);
    cursor: pointer;
  }

  .close-btn {
    border: none;
    background: transparent;
    font-size: 18px;
    line-height: 1;
    color: var(--color-text-secondary, #888);
    cursor: pointer;
  }
}

.ai-theme-ball {
  position: fixed;
  right: 18px;
  bottom: 24px;
  z-index: 3000;
  width: 56px;
  height: 56px;
  border: none;
  border-radius: 50%;
  background: var(--color-primary, #ff9eb5);
  color: #fff;
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.25);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;

  .ball-emoji {
    font-size: 26px;
    line-height: 1;
  }

  // 未讀紅點
  .ball-dot {
    position: absolute;
    top: 6px;
    right: 6px;
    width: 12px;
    height: 12px;
    border-radius: 50%;
    background: #ff3b30;
    border: 2px solid var(--color-primary, #ff9eb5);
  }

  // 處理中轉圈
  .ball-spinner {
    position: absolute;
    inset: -3px;
    border-radius: 50%;
    border: 2px solid transparent;
    border-top-color: #fff;
    animation: ai-theme-ball-spin 0.8s linear infinite;
  }

  &.working {
    animation: ai-theme-ball-pulse 1.4s ease-in-out infinite;
  }
}

@keyframes ai-theme-ball-spin {
  to {
    transform: rotate(360deg);
  }
}

@keyframes ai-theme-ball-pulse {
  0%,
  100% {
    box-shadow: 0 6px 20px rgba(0, 0, 0, 0.25);
  }
  50% {
    box-shadow: 0 6px 28px rgba(255, 158, 181, 0.6);
  }
}

.ai-theme-ball-enter-active,
.ai-theme-ball-leave-active {
  transition: transform 0.2s ease, opacity 0.2s ease;
}

.ai-theme-ball-enter-from,
.ai-theme-ball-leave-to {
  transform: scale(0.6);
  opacity: 0;
}

.ai-theme-body {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.msg-row {
  display: flex;

  &.user {
    justify-content: flex-end;

    .bubble {
      background: var(--color-primary, #ff9eb5);
      color: #fff;
      border-bottom-right-radius: 4px;
    }
  }

  &.assistant {
    justify-content: flex-start;

    .bubble {
      background: var(--color-surface-hover, #f3f3f5);
      color: var(--color-text, #333);
      border-bottom-left-radius: 4px;
    }
  }
}

.bubble {
  max-width: 80%;
  padding: 10px 14px;
  border-radius: 16px;
  font-size: 14px;
  line-height: 1.5;
  word-break: break-word;
}

.msg-text {
  margin: 0;
  white-space: pre-wrap;
}

.stream-caret {
  display: inline-block;
  width: 2px;
  height: 1em;
  margin-left: 2px;
  vertical-align: text-bottom;
  background: currentColor;
  opacity: 0.7;
  animation: stream-caret-blink 1s step-end infinite;
}

@keyframes stream-caret-blink {
  0%,
  100% {
    opacity: 0.7;
  }
  50% {
    opacity: 0;
  }
}

.msg-error {
  margin: 0;
  color: var(--color-error, #e5484d);
}

.tool-list {
  margin: 8px 0 0;
  padding: 8px 0 0;
  list-style: none;
  border-top: 1px dashed var(--color-border, rgba(0, 0, 0, 0.12));

  li {
    display: flex;
    align-items: baseline;
    gap: 6px;
    font-size: 12.5px;
    padding: 2px 0;

    .dot {
      color: var(--color-success, #30a46c);
      font-weight: 700;
    }

    &.failed .dot {
      color: var(--color-error, #e5484d);
    }

    .tool-name {
      font-weight: 600;
    }

    .tool-err {
      color: var(--color-error, #e5484d);
      font-size: 12px;
    }
  }
}

.revert-row {
  margin-top: 8px;
}

.revert-btn {
  border: 1px solid var(--color-border, rgba(0, 0, 0, 0.15));
  background: transparent;
  color: var(--color-text, #333);
  border-radius: 999px;
  padding: 4px 12px;
  font-size: 12.5px;
  cursor: pointer;
  transition: background 0.15s;

  &:hover:not(:disabled) {
    background: var(--color-surface-hover, rgba(0, 0, 0, 0.05));
  }

  &:disabled {
    opacity: 0.5;
    cursor: default;
  }
}

.typing {
  display: inline-flex;
  gap: 4px;
  align-items: center;

  i {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--color-text-muted, #bbb);
    animation: typing-bounce 1.2s infinite ease-in-out;

    &:nth-child(2) {
      animation-delay: 0.15s;
    }
    &:nth-child(3) {
      animation-delay: 0.3s;
    }
  }
}

.progress-text {
  margin-left: 8px;
  font-size: 12.5px;
  color: var(--color-text-muted, #999);
  align-self: center;
}

.ask-block {
  margin: 10px 0 0;
  padding: 10px 0 0;
  border-top: 1px dashed var(--color-border, rgba(0, 0, 0, 0.12));

  &.answered .ask-option {
    opacity: 0.55;
  }
}

.ask-question {
  margin: 0 0 8px;
  font-size: 13px;
  font-weight: 600;
  color: var(--color-text, #333);
}

.ask-options {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.ask-option {
  border: 1px solid var(--color-primary, #6c8cff);
  background: transparent;
  color: var(--color-primary, #6c8cff);
  border-radius: 999px;
  padding: 6px 14px;
  font-size: 12.5px;
  cursor: pointer;
  transition:
    background 0.15s,
    color 0.15s;

  &:hover:not(:disabled) {
    background: var(--color-primary, #6c8cff);
    color: #fff;
  }

  &:disabled {
    cursor: default;
  }
}

.quick-reply {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin: 10px 0 0;
  padding: 10px 0 0;
  border-top: 1px dashed var(--color-border, rgba(0, 0, 0, 0.12));

  &.answered .quick-btn {
    opacity: 0.55;
  }
}

.quick-btn {
  border: 1px solid var(--color-border, rgba(0, 0, 0, 0.15));
  background: transparent;
  color: var(--color-text, #333);
  border-radius: 999px;
  padding: 6px 14px;
  font-size: 12.5px;
  cursor: pointer;
  transition:
    background 0.15s,
    color 0.15s;

  &:hover:not(:disabled) {
    background: var(--color-surface-hover, rgba(0, 0, 0, 0.05));
  }

  &.primary {
    border-color: var(--color-primary, #6c8cff);
    color: var(--color-primary, #6c8cff);

    &:hover:not(:disabled) {
      background: var(--color-primary, #6c8cff);
      color: #fff;
    }
  }

  &:disabled {
    cursor: default;
  }
}

@keyframes typing-bounce {
  0%,
  60%,
  100% {
    transform: translateY(0);
    opacity: 0.4;
  }
  30% {
    transform: translateY(-4px);
    opacity: 1;
  }
}

.suggestions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  padding: 0 16px 8px;
}

.suggestion-chip {
  border: 1px solid var(--color-border, rgba(0, 0, 0, 0.15));
  background: var(--color-surface-hover, #f7f7f8);
  color: var(--color-text, #444);
  border-radius: 999px;
  padding: 6px 12px;
  font-size: 12.5px;
  cursor: pointer;
  transition: background 0.15s;

  &:hover {
    background: var(--color-primary-light, rgba(255, 158, 181, 0.2));
  }
}

.attached-images {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  padding: 0 16px 8px;
}

.attached-thumb {
  position: relative;
  width: 56px;
  height: 56px;
  border-radius: 10px;
  overflow: hidden;
  border: 1px solid var(--color-border, rgba(0, 0, 0, 0.15));

  img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }
}

.remove-thumb {
  position: absolute;
  top: 2px;
  right: 2px;
  width: 18px;
  height: 18px;
  padding: 0;
  border: none;
  border-radius: 50%;
  background: rgba(0, 0, 0, 0.55);
  color: #fff;
  font-size: 10px;
  line-height: 18px;
  cursor: pointer;
}

.input-tools {
  display: flex;
  gap: 8px;
  padding: 0 16px 8px;
}

.tool-toggle {
  border: 1px solid var(--color-border, rgba(0, 0, 0, 0.15));
  background: var(--color-surface-hover, #f7f7f8);
  color: var(--color-text, #444);
  border-radius: 999px;
  padding: 5px 12px;
  font-size: 12.5px;
  cursor: pointer;
  transition:
    background 0.15s,
    border-color 0.15s,
    color 0.15s;

  &:hover {
    background: var(--color-primary-light, rgba(255, 158, 181, 0.2));
  }

  &.active {
    background: var(--color-primary, #ff9eb5);
    border-color: var(--color-primary, #ff9eb5);
    color: #fff;
  }

  &:disabled {
    opacity: 0.5;
    cursor: default;
  }
}

.hidden-file {
  display: none;
}

.ai-theme-footer {
  display: flex;
  align-items: flex-end;
  gap: 8px;
  padding: 12px 16px;
  border-top: 1px solid var(--color-border, rgba(0, 0, 0, 0.08));
}

.ai-theme-input {
  flex: 1;
  resize: none;
  max-height: 120px;
  border: 1px solid var(--color-border, rgba(0, 0, 0, 0.15));
  border-radius: 12px;
  padding: 10px 12px;
  font-size: 14px;
  font-family: inherit;
  background: var(--color-background, #fff);
  color: var(--color-text, #333);
  outline: none;

  &:focus {
    border-color: var(--color-primary, #ff9eb5);
  }
}

.send-btn {
  border: none;
  background: var(--color-primary, #ff9eb5);
  color: #fff;
  border-radius: 12px;
  padding: 10px 18px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  white-space: nowrap;

  &:disabled {
    opacity: 0.5;
    cursor: default;
  }
}

.ai-theme-fade-enter-active,
.ai-theme-fade-leave-active {
  transition: opacity 0.2s ease;
}
.ai-theme-fade-enter-from,
.ai-theme-fade-leave-to {
  opacity: 0;
}
</style>
