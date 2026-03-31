<script setup lang="ts">
import { useAudioPlayer } from "@/composables/useAudioPlayer";
import {
  getAvatarFrameInlineStyle,
  getAvatarFrameLayers,
  getAvatarFrameSvg,
  getLayerSrc,
  getLayerTransform,
  isAvatarFrameImage,
  isAvatarFrameSvg,
} from "@/data/avatarFrames";
import {
  getAudioBlob,
  getChatImage,
  isAudioBlobRef,
  isChatImageRef,
} from "@/db/operations";
import { formatTime } from "@/services/AudioRecorder";
import { getRegexedString, regex_placement } from "@/services/RegexEngine";
import { useStickerStore } from "@/stores";
import { useRegexScriptsStore } from "@/stores/regexScripts";
import type { WaimaiOrderSnapshot } from "@/types/chat";
import { cleanTTSTags } from "@/utils/ttsTagCleaner";
import { marked } from "marked";
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from "vue";
import GroupCallHistoryModal from "../modals/GroupCallHistoryModal.vue";
import GroupChatHistoryModal from "../modals/GroupChatHistoryModal.vue";
import PhotoPreviewModal from "../modals/PhotoPreviewModal.vue";
import GroupCallHistoryCard from "./GroupCallHistoryCard.vue";
import GroupChatHistoryCard from "./GroupChatHistoryCard.vue";
import PixelGiftChest from "./PixelGiftChest.vue";
import PixelTransferCard from "./PixelTransferCard.vue";

// 配置 marked
marked.setOptions({
  breaks: true, // 支持換行
  gfm: true, // GitHub Flavored Markdown
});

const stickerStore = useStickerStore();
const regexScriptsStore = useRegexScriptsStore();

// 音頻播放器
const audioPlayer = useAudioPlayer();

// regex 腳本產生的完整 HTML 文件（需要用 iframe 渲染以執行 script）
const regexHtmlDoc = ref("");
const regexIframeRef = ref<HTMLIFrameElement | null>(null);
const regexIframeHeight = ref(0);

// ★ 正則產生 HTML 時需要拆分到獨立氣泡（避免在 computed 內直接修改 ref）
const _regexHtmlEmitted = new Set<string>();
function _emitSplitHtml(html: string) {
  if (!html || !props.id) return;
  // 用內容前 100 字作為 dedup key（比長度更穩定，不受 heightScript 版本差異影響）
  const key = `${props.id}_${html.substring(0, 100)}`;
  if (_regexHtmlEmitted.has(key)) return;
  _regexHtmlEmitted.add(key);
  // 延遲到下一個微任務，避免在 computed 求值期間觸發副作用
  queueMicrotask(() => {
    emit("splitRegexHtml", props.id, html);
  });
}

// HTML 區塊 iframe（來自 ResponseParser 拆分的完整 HTML）
const htmlBlockIframeRef = ref<HTMLIFrameElement | null>(null);
const htmlBlockIframeHeight = ref(0);

// 監聽 iframe 內部回報的高度（使用生命週期管理，避免記憶體洩漏）
// 加入死區防止高度微小震盪導致佈局抖動
function handleIframeMessage(e: MessageEvent) {
  if (
    e.data?.type === "regex-iframe-height" &&
    typeof e.data.height === "number"
  ) {
    const newH = Math.ceil(e.data.height);
    if (
      regexIframeRef.value &&
      e.source === regexIframeRef.value.contentWindow
    ) {
      if (Math.abs(newH - regexIframeHeight.value) >= 5) {
        regexIframeHeight.value = newH;
      }
    }
    if (
      htmlBlockIframeRef.value &&
      e.source === htmlBlockIframeRef.value.contentWindow
    ) {
      if (Math.abs(newH - htmlBlockIframeHeight.value) >= 5) {
        htmlBlockIframeHeight.value = newH;
      }
    }
  }
}

onMounted(() => {
  window.addEventListener("message", handleIframeMessage);
});

onUnmounted(() => {
  window.removeEventListener("message", handleIframeMessage);
});

// Props 定義
interface MessageBubbleProps {
  id: string;
  role: "user" | "ai" | "system";
  content: string;
  avatar?: string;
  /** 角色卡內嵌的正則腳本（由父組件傳入） */
  characterRegexScripts?: import("@/types/character").RegexScript[];
  userAvatar?: string; // 用戶頭像
  senderName?: string;
  timestamp?: number;
  isEditing?: boolean;
  isSelected?: boolean;
  showAvatar?: boolean;
  // 頭像框
  charFrameId?: string | null; // 角色頭像框 ID
  userFrameId?: string | null; // 用戶頭像框 ID
  avatarShape?: "circle" | "rounded" | "square"; // 頭像形狀
  // 流式輸出
  isStreaming?: boolean;
  // HTML 區塊（完整 HTML 文件，用 iframe 渲染）
  isHtmlBlock?: boolean;
  htmlContent?: string;
  // 滑動功能
  swipes?: string[];
  swipeId?: number;
  // 整輪滑動功能
  roundSwipes?: any[][];
  roundSwipeId?: number;
  // 解析後的額外資訊
  thought?: string;
  isTimetravel?: boolean;
  timetravelContent?: string;
  isRedpacket?: boolean;
  redpacketData?: {
    amount: string;
    blessing: string;
    password?: string;
    voice?: string;
  };
  isLocation?: boolean;
  locationContent?: string;
  replyToContent?: string;
  // 回覆引用的原消息 ID
  replyTo?: string;
  // 回覆引用的發送者名稱
  replyToName?: string;
  // 圖片相關
  messageType?:
    | "text"
    | "image"
    | "descriptive-image"
    | "descriptive-video"
    | "image-url"
    | "audio";
  imageUrl?: string;
  imageCaption?: string;
  // 音頻相關
  audioBlob?: Blob | null;
  audioBlobId?: string;
  audioDuration?: number;
  audioWaveform?: number[];
  audioTranscript?: string;
  // 搜索高亮
  isSearchHighlight?: boolean;
  isCurrentSearch?: boolean;
  // 禮物相關
  isGift?: boolean;
  giftName?: string;
  giftReceived?: boolean;
  // 轉帳相關
  isTransfer?: boolean;
  transferAmount?: number;
  transferReceived?: boolean;
  transferType?: "pay" | "refund";
  transferNote?: string;
  transferStatus?: "sent" | "pending" | "received" | "refunded";
  // 外賣相關
  isWaimaiShare?: boolean;
  isWaimaiPaymentRequest?: boolean;
  isWaimaiPaymentConfirm?: boolean;
  isWaimaiPaymentResult?: boolean;
  isWaimaiProgress?: boolean;
  isWaimaiDelivery?: boolean;
  waimaiOrder?: WaimaiOrderSnapshot;
  // 換頭像相關
  isAvatarChange?: boolean;
  avatarChangeAction?: "accept" | "reject" | "forced" | "mood" | "restore";
  avatarChangeMood?: string;
  // 群聊相關
  isGroupChat?: boolean;
  senderCharacterAvatar?: string;
  senderCharacterName?: string;
  // 群聊訊息類型
  isRecall?: boolean;
  recallContent?: string;
  isPrivateMessage?: boolean;
  isGroupAction?: boolean;
  groupActionType?: "rename" | "kick" | "mute" | "unmute";
  groupActionActor?: string;
  groupActionTarget?: string;
  groupActionValue?: string;
  // 群聊記錄卡片
  isGroupChatHistory?: boolean;
  groupChatHistoryData?: {
    groupName: string;
    messages: Array<{
      senderName: string;
      content: string;
      timestamp: number;
      isUser: boolean;
    }>;
  };
  // 群通話記錄卡片
  isGroupCallHistory?: boolean;
  groupCallHistoryData?: {
    groupName: string;
    participants: Array<{
      characterId: string;
      name: string;
      avatar?: string;
    }>;
    messages: Array<{
      type: "voice" | "system" | "user";
      senderName?: string;
      content: string;
      timestamp: number;
    }>;
    startedAt: number;
    endedAt: number;
  };
  // 行事曆事件
  isCalendarEvent?: boolean;
  calendarEventData?: {
    type: "user" | "period";
    title: string;
    date: string;
    description?: string;
  };
  // 通話通知卡片
  isCallNotification?: boolean;
  callNotificationType?: "declined" | "missed";
  callReason?: string;
  // MiniMax TTS 語音合成
  ttsAudioUrl?: string;
  ttsSegments?: Array<{
    emotion: string;
    speed: number;
    text: string;
    clean: string;
    audioUrl?: string;
  }>;
  // 顯示層宏替換所需名稱
  userName?: string;
  characterName?: string;
  // 角色封鎖用戶的系統通知
  isCharBlockedNotification?: boolean;
  charBlockedReason?: string;
}

const props = withDefaults(defineProps<MessageBubbleProps>(), {
  avatar: "",
  userAvatar: "",
  senderName: "",
  timestamp: 0,
  isEditing: false,
  isSelected: false,
  showAvatar: true,
  charFrameId: null,
  userFrameId: null,
  avatarShape: "circle",
  isStreaming: false,
  isHtmlBlock: false,
  htmlContent: "",
  swipes: () => [],
  swipeId: 0,
  roundSwipes: () => [],
  roundSwipeId: 0,
  thought: "",
  isTimetravel: false,
  timetravelContent: "",
  isRedpacket: false,
  redpacketData: undefined,
  isLocation: false,
  locationContent: "",
  replyToContent: "",
  replyTo: "",
  replyToName: "",
  messageType: "text",
  imageUrl: "",
  imageCaption: "",
  audioBlob: null,
  audioDuration: 0,
  audioWaveform: () => [],
  audioTranscript: "",
  isSearchHighlight: false,
  isCurrentSearch: false,
  isGift: false,
  giftName: "",
  giftReceived: false,
  isTransfer: false,
  transferAmount: 0,
  transferReceived: false,
  transferType: "pay",
  transferNote: "",
  transferStatus: "sent",
  isWaimaiShare: false,
  isWaimaiPaymentRequest: false,
  isWaimaiPaymentConfirm: false,
  isWaimaiPaymentResult: false,
  isWaimaiProgress: false,
  isWaimaiDelivery: false,
  waimaiOrder: undefined,
  isAvatarChange: false,
  avatarChangeAction: undefined,
  avatarChangeMood: "",
  isGroupChat: false,
  senderCharacterAvatar: "",
  senderCharacterName: "",
  isRecall: false,
  recallContent: "",
  isPrivateMessage: false,
  isGroupAction: false,
  groupActionType: undefined,
  groupActionActor: "",
  groupActionTarget: "",
  groupActionValue: "",
  isGroupChatHistory: false,
  groupChatHistoryData: undefined,
  isGroupCallHistory: false,
  groupCallHistoryData: undefined,
  isCalendarEvent: false,
  calendarEventData: undefined,
  isCallNotification: false,
  callNotificationType: undefined,
  callReason: undefined,
  ttsAudioUrl: undefined,
  ttsSegments: undefined,
  characterRegexScripts: () => [],
  userName: "",
  characterName: "",
});

// Emits
const emit = defineEmits<{
  (e: "click", id: string): void;
  (e: "avatarClick", id: string): void;
  (e: "edit", id: string): void;
  (e: "delete", id: string): void;
  (e: "copy", id: string): void;
  (e: "regenerate", id: string): void;
  (e: "swipe", id: string, direction: "prev" | "next"): void;
  (e: "roundSwipe", id: string, direction: "prev" | "next"): void;
  (e: "reply", id: string): void;
  (e: "scrollToReply", messageId: string): void;
  (e: "multiDelete", id: string): void;
  (e: "branch", id: string): void;
  (e: "acceptTransfer", id: string): void;
  (e: "refundTransfer", id: string): void;
  (e: "updateTranscript", id: string, transcript: string): void;
  (e: "screenshot", id: string): void;
  (e: "batchScreenshot", id: string): void;
  (e: "splitRegexHtml", id: string, htmlContent: string): void;
}>();

// 群聊記錄 Modal 狀態
const showGroupChatHistoryModal = ref(false);

// 群通話記錄 Modal 狀態
const showGroupCallHistoryModal = ref(false);

// 封鎖原因展開狀態
const showBlockedReason = ref(false);

// 照片預覽 Modal 狀態
const showPhotoPreview = ref(false);

// 群聊頭像載入失敗
const groupAvatarFailed = ref(false);

// 當群聊頭像 URL 變更時，重置失敗狀態以重新嘗試載入
watch(
  () => props.senderCharacterAvatar,
  () => {
    groupAvatarFailed.value = false;
  },
);

// 代理外部圖片 URL（繞過 CORS/CSP）
function getProxiedUrl(url: string): string {
  if (
    !url ||
    url.startsWith("data:") ||
    url.startsWith("blob:") ||
    url.startsWith("/")
  )
    return url;
  // 使用 /ai-proxy/ 路徑（nginx 已配置），同時相容 vite dev server 的 /image-proxy
  try {
    const parsed = new URL(url);
    const hostAndPath = parsed.host + parsed.pathname + parsed.search;
    if (parsed.protocol === "https:") {
      return `/ai-proxy/${hostAndPath}`;
    } else {
      return `/ai-proxy-http/${hostAndPath}`;
    }
  } catch {
    return `/image-proxy?url=${encodeURIComponent(url)}`;
  }
}

// HTML 區塊的 iframe srcdoc（注入自動回報高度的 script）
const htmlBlockSrcdoc = computed(() => {
  if (!props.isHtmlBlock || !props.htmlContent) return "";
  const heightScript = `<script>
(function() {
  var lastH = 0, stableCount = 0, tid;
  function _reportHeight(){
    var h = Math.ceil(document.documentElement.scrollHeight || document.body.scrollHeight);
    if (Math.abs(h - lastH) < 5) { stableCount++; if (stableCount > 3 && tid) { clearInterval(tid); tid = null; } return; }
    stableCount = 0;
    lastH = h;
    window.parent.postMessage({type:'regex-iframe-height',height:h},'*');
  }
  window.addEventListener('load', _reportHeight);
  if (window.ResizeObserver) {
    new ResizeObserver(_reportHeight).observe(document.body);
  }
  new MutationObserver(_reportHeight).observe(document.body, {childList:true, subtree:true, attributes:true});
  tid = setInterval(_reportHeight, 1000);
})();
<\/script>`;
  let html = props.htmlContent;
  // 如果是 HTML 片段（不是完整文件），包成完整文件
  if (!/^\s*<!DOCTYPE\s/i.test(html) && !/^\s*<html[\s>]/i.test(html)) {
    html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>body{margin:0;padding:0;background:transparent;}</style></head><body>${html}</body></html>`;
  }
  const injected = html.includes("</body>")
    ? html.replace("</body>", heightScript + "</body>")
    : html + heightScript;
  return injected;
});

function replaceDisplayMacros(text: string): string {
  if (!text) return text;

  const charName = (
    props.senderCharacterName ||
    props.senderName ||
    props.characterName ||
    ""
  ).trim();
  const userName = (props.userName || "").trim();

  let result = text;
  if (charName) {
    result = result.replace(/\{\{\s*char\s*\}\}/gi, charName);
  }
  if (userName) {
    result = result.replace(/\{\{\s*user\s*\}\}/gi, userName);
  }
  return result;
}

// 渲染 Markdown 內容（包含圖片描述和影片描述的特殊處理）
const renderedContent = computed(() => {
  if (!props.content) return "";

  // 如果是真實圖片或圖片URL類型，不進行拍立得渲染
  if (props.messageType === "image" || props.messageType === "image-url") {
    return props.content;
  }

  try {
    // 防線：清理可能殘留的 TTS 標記
    // 如果有 ttsSegments，用逐句替換（保留播放按鈕位置）；否則一刀切清理
    let html = replaceDisplayMacros(props.content);

    // ★ 隱藏時間標記 [time:...] - 對用戶隱藏但保留在數據庫中供 AI 讀取
    // 使用 CSS 隱藏而不是刪除，這樣數據仍然存在於 DOM 中
    html = html.replace(
      /\[time:[^\]]+\]/g,
      (match) =>
        `<span class="hidden-time-tag" style="display:none;">${match}</span>`,
    );

    if (props.ttsSegments && props.ttsSegments.length > 0) {
      // 統一單次替換：所有 [emotion=...] 按出現順序對應 ttsSegments
      // 不論是引號內還是句末裸露，都一視同仁
      let segIdx = 0;
      html = html.replace(/\[emotion=[^\]]*\]/g, () => {
        const seg = props.ttsSegments?.[segIdx];
        // 只要有分段就顯示按鈕（有無 audioUrl 都先渲染，點擊時再判斷）
        const btnHtml = seg
          ? `<span class="tts-inline-btn" data-tts-idx="${segIdx}" title="${seg.emotion || ""}"${seg.audioUrl ? "" : ' style="opacity:0.3;cursor:default"'}>🔊</span>`
          : "";
        segIdx++;
        return btnHtml;
      });
      // 清理其他殘留的 TTS 標記
      html = cleanTTSTags(html);
    } else {
      html = cleanTTSTags(html);
    }

    // ★ 偵測舊訊息中 ```html ``` 包裹的 HTML 片段（isHtmlBlock 未設定的情況）
    // 這處理從資料庫讀出的舊訊息，讓它們也能走 iframe 渲染路徑
    if (!props.isHtmlBlock) {
      // 使用兩步法匹配 HTML fence（同 regex 後偵測邏輯）
      const fenceOpenMatch = html.match(/```(?:html)?\s*\n?/);
      let htmlFenceMatch: RegExpMatchArray | null = null;
      if (fenceOpenMatch) {
        const afterOpen = fenceOpenMatch.index! + fenceOpenMatch[0].length;
        const rest = html.substring(afterOpen);
        const htmlEndIdx = rest.search(/<\/html>\s*\n*\s*```/i);
        if (htmlEndIdx >= 0) {
          const closeMatch = rest
            .substring(htmlEndIdx)
            .match(/<\/html>\s*\n*\s*(```)/i);
          if (closeMatch) {
            const contentEnd =
              htmlEndIdx + closeMatch.index! + closeMatch[0].length - 3;
            const fenceContent = rest
              .substring(0, contentEnd)
              .replace(/\n\s*$/, "");
            htmlFenceMatch = [
              fenceContent,
              fenceContent,
            ] as unknown as RegExpMatchArray;
          }
        }
        if (!htmlFenceMatch) {
          const lastFenceIdx = rest.lastIndexOf("\n```");
          if (lastFenceIdx >= 0) {
            const fenceContent = rest.substring(0, lastFenceIdx);
            htmlFenceMatch = [
              fenceContent,
              fenceContent,
            ] as unknown as RegExpMatchArray;
          }
        }
      }
      if (htmlFenceMatch) {
        const fenceContent = htmlFenceMatch[1].trim();
        if (/^\s*<[a-zA-Z]/.test(fenceContent)) {
          // 包成完整文件
          const fullHtml =
            /^\s*<!DOCTYPE\s/i.test(fenceContent) ||
            /^\s*<html[\s>]/i.test(fenceContent)
              ? fenceContent
              : `<!DOCTYPE html><html><head><meta charset="utf-8"><style>body{margin:0;padding:0;background:transparent;}</style></head><body>${fenceContent}</body></html>`;
          const heightScript = `<script>
function _reportHeight(){var h=document.documentElement.scrollHeight||document.body.scrollHeight;window.parent.postMessage({type:'regex-iframe-height',height:h},'*');}
window.addEventListener('load',function(){_reportHeight();setTimeout(_reportHeight,300);setTimeout(_reportHeight,1000);});
new MutationObserver(function(){setTimeout(_reportHeight,50);}).observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['style','class']});
<\/script>`;
          const injected = fullHtml.includes("</body>")
            ? fullHtml.replace("</body>", heightScript + "</body>")
            : fullHtml + heightScript;
          regexHtmlDoc.value = injected;
          return "";
        }
      }
    }

    // ★ 偵測裸露的 HTML 片段（含 <style> 標籤但沒有 fence 包裹的大型 HTML 區塊）
    if (!props.isHtmlBlock && !regexHtmlDoc.value) {
      if (
        html.length > 200 &&
        /<style[\s>]/i.test(html) &&
        /<div[\s>]/i.test(html)
      ) {
        const fragment = html.trim();
        const fullHtml =
          /^\s*<!DOCTYPE\s/i.test(fragment) || /^\s*<html[\s>]/i.test(fragment)
            ? fragment
            : `<!DOCTYPE html><html><head><meta charset="utf-8"><style>body{margin:0;padding:0;background:transparent;}</style></head><body>${fragment}</body></html>`;
        const heightScript = `<script>
function _reportHeight(){var h=document.documentElement.scrollHeight||document.body.scrollHeight;window.parent.postMessage({type:'regex-iframe-height',height:h},'*');}
window.addEventListener('load',function(){_reportHeight();setTimeout(_reportHeight,300);setTimeout(_reportHeight,1000);});
new MutationObserver(function(){setTimeout(_reportHeight,50);}).observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['style','class']});
<\/script>`;
        const injected = fullHtml.includes("</body>")
          ? fullHtml.replace("</body>", heightScript + "</body>")
          : fullHtml + heightScript;
        regexHtmlDoc.value = injected;
        return "";
      }
    }

    // 移除轉帳相關標籤（這些會由 PixelTransferCard 組件單獨渲染）
    html = html.replace(/<pay>[\s\S]*?<\/pay>/gi, "").trim();
    html = html.replace(/<refund>[\s\S]*?<\/refund>/gi, "").trim();

    // 渲染 <game>遊戲名|成績</game> 為美化卡片
    const gameMatch = html.match(/<game>\s*([\s\S]*?)\s*<\/game>/i);
    if (gameMatch) {
      const parts = gameMatch[1].split("|");
      const gameName = parts[0]?.trim() || "遊戲";
      const gameScore = parts[1]?.trim() || "0";
      const remaining = html.replace(gameMatch[0], "").trim();
      const extraHtml = remaining
        ? `<div style="margin-top:8px">${marked.parse(remaining)}</div>`
        : "";
      return `<div class="game-score-card">
        <div class="game-score-header">
          <svg viewBox="0 0 24 24" fill="currentColor" class="game-score-icon"><path d="M21 6H3a1 1 0 0 0-1 1v4a3 3 0 0 0 3 3h1.06A8.04 8.04 0 0 0 12 19a8.04 8.04 0 0 0 5.94-5H19a3 3 0 0 0 3-3V7a1 1 0 0 0-1-1zM5 12a1 1 0 0 1-1-1V8h2v3a5.98 5.98 0 0 0 .42 2H5zm15-1a1 1 0 0 1-1 1h-1.42A5.98 5.98 0 0 0 18 10V8h2v3z"/></svg>
          <span class="game-score-title">${gameName}</span>
        </div>
        <div class="game-score-value">${gameScore}</div>
        <div class="game-score-label">分</div>
      </div>${extraHtml}`;
    }

    // 如果移除標籤後內容為空，返回空字串
    if (!html) return "";

    // 檢測並美化 XML 格式的媒體描述
    // 支援新格式 <pic> 和舊格式 <圖片描述>，以及帶屬性的 <pic prompt="...">
    const imageDescMatch =
      html.match(/<pic(?:\s[^>]*)?\s*>\s*([\s\S]*?)\s*<\/pic>/) ||
      html.match(/<圖片描述>\s*([\s\S]*?)\s*<\/圖片描述>/);
    // 支援新格式 <vid> 和舊格式 <影片描述>
    const videoDescMatch =
      html.match(/<vid>\s*([\s\S]*?)\s*<\/vid>/) ||
      html.match(/<影片描述>\s*([\s\S]*?)\s*<\/影片描述>/);

    // 同時支援舊格式 [圖片] 和 [影片]，但必須有描述內容（不是單獨的 [圖片]）
    // 匹配 [圖片] 後面有非空白字符的情況
    const oldImageMatch = html.match(/^\[圖片\]\s+(.+)$/s);
    const oldVideoMatch = html.match(/^\[影片\]\s+(.+)$/s);

    if (imageDescMatch || videoDescMatch || oldImageMatch || oldVideoMatch) {
      // 格式化日期 2023.05.20
      const now = props.timestamp ? new Date(props.timestamp) : new Date();
      const year = now.getFullYear();
      const month = String(now.getMonth() + 1).padStart(2, "0");
      const day = String(now.getDate()).padStart(2, "0");
      const formattedDate = `${year}.${month}.${day}`;

      if (imageDescMatch) {
        const content = imageDescMatch[1].trim();
        html = html.replace(
          imageDescMatch[0],
          `<div class="media-description image-description photo-container">
            <div class="photo-overlay"></div>
            <div class="photo-frame"></div>
            <div class="media-content photo-text">${content.replace(/\n/g, "<br>")}</div>
            <div class="photo-date">${formattedDate}</div>
          </div>`,
        );
      } else if (oldImageMatch) {
        // 舊格式 [圖片] 描述
        const content = oldImageMatch[1].trim();
        html = `<div class="media-description image-description photo-container">
          <div class="photo-overlay"></div>
          <div class="photo-frame"></div>
          <div class="media-content photo-text">${content.replace(/\n/g, "<br>")}</div>
          <div class="photo-date">${formattedDate}</div>
        </div>`;
      }

      if (videoDescMatch) {
        const content = videoDescMatch[1].trim();
        const currentTime = new Date().toLocaleTimeString("zh-TW", {
          hour: "2-digit",
          minute: "2-digit",
        });
        html = html.replace(
          videoDescMatch[0],
          `<div class="media-description video-description">
            <div class="video-screen">
              <div class="video-grid"></div>
              <div class="recording-indicator">
                <div class="recording-light"></div>
                <div class="recording-text">REC</div>
              </div>
              <div class="video-timer">00:45</div>
              <div class="video-content">
                <div class="video-title">${content.replace(/\n/g, "<br>")}</div>
                <div class="video-time">${currentTime}</div>
              </div>
            </div>
          </div>`,
        );
      } else if (oldVideoMatch) {
        // 舊格式 [影片] 描述
        const content = oldVideoMatch[1].trim();
        const currentTime = new Date().toLocaleTimeString("zh-TW", {
          hour: "2-digit",
          minute: "2-digit",
        });
        html = `<div class="media-description video-description">
          <div class="video-screen">
            <div class="video-grid"></div>
            <div class="recording-indicator">
              <div class="recording-light"></div>
              <div class="recording-text">REC</div>
            </div>
            <div class="video-timer">00:45</div>
            <div class="video-content">
              <div class="video-title">${content.replace(/\n/g, "<br>")}</div>
              <div class="video-time">${currentTime}</div>
            </div>
          </div>
        </div>`;
      }
      // 媒體格式已處理完成，直接返回
      return html;
    }

    // ★ 從已經處理過 TTS 行內按鈕的 html 繼續，而不是重新讀 props.content
    let processedContent = html;

    // 防線：清理 ResponseParser 可能遺漏的標記
    // 移除漏網的 <think>...</think> 和 <thinking>...</thinking> 區塊
    processedContent = processedContent
      .replace(/<think(?:ing)?>[\s\S]*?<\/think(?:ing)?>/gi, "")
      .trim();
    // 移除缺少開頭標籤的殘留 think 內容（如串流截斷）
    processedContent = processedContent
      .replace(/^[\s\S]*?<\/think(?:ing)?>/gis, "")
      .trim();
    // 移除漏網的 ˇ想法ˇ 和舊格式 ~(想法)~
    processedContent = processedContent
      .replace(/\s*ˇ[^ˇ]+ˇ/g, "")
      .replace(/\s*~\([\s\S]+?\)~/g, "")
      .trim();

    // ★ 套用 markdownOnly regex 腳本（顯示層轉換，不污染原始訊息）
    const beforeRegex = processedContent;
    const mergedScripts = [
      ...regexScriptsStore.scripts,
      ...(props.characterRegexScripts ?? []),
    ];

    processedContent = getRegexedString(
      processedContent,
      regex_placement.AI_OUTPUT,
      mergedScripts,
      { isMarkdown: true },
    );

    // ★ regex 替換後可能產生完整 HTML（被 ``` 包住或直接輸出）
    // 只在 regex 確實改變了內容時才偵測
    if (processedContent !== beforeRegex) {
      const stripped = processedContent.trim();

      // ★ 提取所有 HTML fence：可能有多個（如音樂播放器 + 狀態欄）
      //   使用 </html> 作為錨點找到每個 fence 的精確邊界
      const htmlBlocks: string[] = [];
      let textOnly = stripped;

      // 反覆尋找並移除 HTML fence，直到沒有更多
      let safetyCounter = 0;
      while (safetyCounter++ < 10) {
        const openMatch = textOnly.match(/```(?:html)?\s*\n?/);
        if (!openMatch) break;

        const afterOpen = openMatch.index! + openMatch[0].length;
        const rest = textOnly.substring(afterOpen);

        // 找 </html> 後面最近的 ``` 作為結束標記
        let fenceEndInRest = -1;
        let fenceContentEnd = -1;
        const htmlCloseSearch = rest.search(/<\/html>\s*\n*\s*```/i);
        if (htmlCloseSearch >= 0) {
          const closeMatch = rest
            .substring(htmlCloseSearch)
            .match(/<\/html>(\s*\n*\s*)(```)/i);
          if (closeMatch) {
            fenceContentEnd =
              htmlCloseSearch +
              closeMatch.index! +
              closeMatch[0].length -
              closeMatch[2].length;
            fenceEndInRest =
              htmlCloseSearch + closeMatch.index! + closeMatch[0].length;
          }
        }
        // 退路：找不到 </html>，用最後一個獨立行 ```
        if (fenceEndInRest < 0) {
          const lastFence = rest.lastIndexOf("\n```");
          if (lastFence >= 0) {
            fenceContentEnd = lastFence;
            fenceEndInRest = lastFence + 4; // \n```
          }
        }
        if (fenceEndInRest < 0) break;

        const fenceContent = rest.substring(0, fenceContentEnd).trim();
        // 確認是 HTML 內容
        if (
          /^\s*<!DOCTYPE\s/i.test(fenceContent) ||
          /^\s*<html[\s>]/i.test(fenceContent) ||
          /^\s*<[a-zA-Z]/.test(fenceContent)
        ) {
          htmlBlocks.push(fenceContent);
          // 從 textOnly 中移除這個 fence
          const fullFenceEnd = afterOpen + fenceEndInRest;
          textOnly =
            textOnly.substring(0, openMatch.index!) +
            textOnly.substring(fullFenceEnd);
        } else {
          break; // fence 內容不是 HTML，停止
        }
      }

      if (htmlBlocks.length > 0) {
        const remainingText = textOnly.trim();

        // 為每個 HTML 區塊注入高度回報 script 並包成完整文件
        const processedBlocks = htmlBlocks.map((block) => {
          let html = block;
          // 如果是 HTML 片段，包成完整文件
          if (!/^\s*<!DOCTYPE\s/i.test(html) && !/^\s*<html[\s>]/i.test(html)) {
            html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>body{margin:0;padding:0;background:transparent;}</style></head><body>${html}</body></html>`;
          }
          const heightScript = `<script>
(function() {
  var lastH = 0, stableCount = 0, tid;
  function _reportHeight(){
    var h = Math.ceil(document.documentElement.scrollHeight || document.body.scrollHeight);
    if (Math.abs(h - lastH) < 5) { stableCount++; if (stableCount > 3 && tid) { clearInterval(tid); tid = null; } return; }
    stableCount = 0;
    lastH = h;
    window.parent.postMessage({type:'regex-iframe-height',height:h},'*');
  }
  window.addEventListener('load', _reportHeight);
  if (window.ResizeObserver) {
    new ResizeObserver(_reportHeight).observe(document.body);
  }
  new MutationObserver(_reportHeight).observe(document.body, {childList:true, subtree:true, attributes:true});
  tid = setInterval(_reportHeight, 1000);
})();
<\/script>`;
          return html.includes("</body>")
            ? html.replace("</body>", heightScript + "</body>")
            : html + heightScript;
        });

        if (remainingText) {
          // 有文字內容：所有 HTML 區塊 emit 給父組件建立獨立氣泡，當前氣泡保留文字
          for (const block of processedBlocks) {
            _emitSplitHtml(block);
          }
          regexHtmlDoc.value = "";
          processedContent = remainingText;
          // 不 return，繼續走後面的 markdown 渲染流程
        } else if (processedBlocks.length === 1) {
          // 只有一個 HTML 區塊且沒有文字，直接在當前氣泡渲染
          regexHtmlDoc.value = processedBlocks[0];
          return "";
        } else {
          // 多個 HTML 區塊且沒有文字：第一個在當前氣泡渲染，其餘 emit
          regexHtmlDoc.value = processedBlocks[0];
          for (let i = 1; i < processedBlocks.length; i++) {
            _emitSplitHtml(processedBlocks[i]);
          }
          return "";
        }
      }
    }
    // 不是完整 HTML，清除之前的快取
    regexHtmlDoc.value = "";

    // 將「內容」轉換為帶有 quote 樣式的 span
    processedContent = processedContent.replace(
      /「([^」]+)」/g,
      '<span class="chinese-quote">「$1」</span>',
    );

    // 修正 marked v17 對中文標點旁斜體的嚴格解析
    // 舊版支持 *文字標點：* 新版需要標點後有空格才能閉合
    // 預處理：將 *...標點* 模式直接轉為 <em> 標籤
    processedContent = processedContent.replace(
      /(?<!\*)\*(?!\s)([^*\n]+?[，。：；！？、）」』】…—～·])(?<!\s)\*(?!\*)/g,
      "<em>$1</em>",
    );

    return marked.parse(processedContent) as string;
  } catch {
    return props.content;
  }
});

// 解析消息中的圖片和表情包標記
interface MessagePart {
  type: "text" | "image" | "sticker";
  text?: string;
  url?: string;
  name?: string;
}

const hasMedia = computed(() => {
  if (typeof props.content !== "string") return false;
  return (
    props.content.includes("[img:") ||
    props.content.includes("[sticker:") ||
    props.content.includes("[表情包:") ||
    props.content.includes("<sticker:") ||
    props.content.includes("<sticker>")
  );
});

const messageParts = computed<MessagePart[]>(() => {
  let content = props.content;
  const parts: MessagePart[] = [];

  if (typeof content !== "string") return parts;

  // 移除轉帳相關標籤
  content = content.replace(/<pay>[\s\S]*?<\/pay>/gi, "").trim();
  content = content.replace(/<refund>[\s\S]*?<\/refund>/gi, "").trim();

  // 正規化表情包標籤：將 AI 可能輸出的各種格式統一為 [sticker:name]
  content = content
    .replace(/<sticker:([^/>]+)\s*\/>/gi, "[sticker:$1]")
    .replace(/<sticker:([^>]+)><\/sticker:[^>]+>/gi, "[sticker:$1]")
    .replace(/<sticker>([^<]+)<\/sticker>/gi, "[sticker:$1]")
    .replace(/<sticker:([^>/<]+)>/gi, "[sticker:$1]");

  if (!content) return parts;

  // 匹配 [img:url]、[sticker:name] 或 [表情包:name]
  const mediaRegex = /\[(img|sticker|表情包):(.*?)\]/g;

  let lastIndex = 0;
  let match;

  while ((match = mediaRegex.exec(content)) !== null) {
    // 添加媒體前的文字
    if (match.index > lastIndex) {
      const text = content.substring(lastIndex, match.index);
      if (text.trim()) {
        parts.push({ type: "text", text });
      }
    }

    const mediaType = match[1];
    const mediaData = match[2];

    if (mediaType === "sticker" || mediaType === "表情包") {
      // 表情包格式：[sticker:名稱] 或 [sticker:名稱|URL]
      const [name, providedUrl] = mediaData.split("|");

      // 如果沒有提供 URL，從表情包庫中查找
      let url = providedUrl;
      if (!url) {
        const sticker = stickerStore.findStickerByName(name);
        if (sticker) {
          url = sticker.url;
        }
      }

      parts.push({
        type: "sticker",
        name: name || "表情包",
        url: url || "",
      });
    } else {
      // 圖片格式：[img:URL] 或 [img:描述|URL]
      const imgParts = mediaData.split("|");
      const url = imgParts.length > 1 ? imgParts[1] : imgParts[0];
      const name = imgParts.length > 1 ? imgParts[0] : undefined;
      parts.push({
        type: "image",
        url,
        name,
      });
    }

    lastIndex = match.index + match[0].length;
  }

  // 添加剩餘的文字
  if (lastIndex < content.length) {
    const text = content.substring(lastIndex);
    if (text.trim()) {
      parts.push({ type: "text", text });
    }
  }

  return parts;
});

// 預先解析 messageParts 中文字部分的 Markdown，避免在模板中重複呼叫 marked.parse
const parsedTextParts = computed(() => {
  return messageParts.value.map((part) => {
    if (part.type === "text" && part.text) {
      return marked.parse(replaceDisplayMacros(part.text)) as string;
    }
    return "";
  });
});

// 將需要代理的圖片 URL 轉換為代理 URL
function getProxiedImageUrl(url: string): string {
  if (!url) return url;

  // 暫時禁用代理，直接返回原始 URL 進行測試
  console.log("表情包 URL:", url);
  return url;

  /* 代理邏輯暫時註釋
  // 如果是來自 aguacloudreve 的圖片，直接使用代理
  if (url.includes('aguacloudreve.aguacloud.uk')) {
    return `https://nai-proxy.aguacloud.uk/image-proxy?url=${encodeURIComponent(url)}`;
  }
  
  // 其他外部圖片也使用代理
  if (url.startsWith('http://') || url.startsWith('https://')) {
    // 如果已經是代理 URL，不要重複代理
    if (url.includes('nai-proxy.aguacloud.uk/image-proxy')) {
      return url;
    }
    return `https://nai-proxy.aguacloud.uk/image-proxy?url=${encodeURIComponent(url)}`;
  }
  
  return url;
  */
}

// 圖片載入錯誤處理
function onImageError(event: Event) {
  const img = event.target as HTMLImageElement;
  // 使用 data-original-url 屬性獲取原始 URL，避免使用被瀏覽器修改過的 img.src
  const originalUrl = img.dataset.originalUrl || img.src;

  if (!img.dataset.proxyAttempted) {
    img.dataset.proxyAttempted = "true";
    // 使用自己的 Cloudflare Worker 代理
    const proxyUrl = `https://nai-proxy.aguacloud.uk/image-proxy?url=${encodeURIComponent(originalUrl)}`;
    console.log("圖片載入失敗，嘗試使用代理:", originalUrl, "→", proxyUrl);
    img.src = proxyUrl;

    img.onerror = () => {
      if (!img.dataset.finalFailed) {
        img.dataset.finalFailed = "true";
        img.style.opacity = "0.5";
      }
    };
  }
}

// 是否有滑動選項
const hasSwipes = computed(() => props.swipes && props.swipes.length > 1);

// 滑動計數文字
const swipeCountText = computed(() => {
  if (!hasSwipes.value) return "";
  return `${(props.swipeId ?? 0) + 1}/${props.swipes?.length ?? 0}`;
});

// 處理滑動
function handleSwipePrev() {
  emit("swipe", props.id, "prev");
}

function handleSwipeNext() {
  emit("swipe", props.id, "next");
}

// 是否有整輪滑動選項
const hasRoundSwipes = computed(
  () => props.roundSwipes && props.roundSwipes.length > 1,
);

// 整輪滑動計數文字
const roundSwipeCountText = computed(() => {
  if (!hasRoundSwipes.value) return "";
  return `${(props.roundSwipeId ?? 0) + 1}/${props.roundSwipes?.length ?? 0}`;
});

// 處理整輪滑動
function handleRoundSwipePrev() {
  emit("roundSwipe", props.id, "prev");
}

function handleRoundSwipeNext() {
  emit("roundSwipe", props.id, "next");
}

// 顯示選單
const showMenu = ref(false);
// 訊息 wrapper 的 ref，用於菜單開啟時滾動到可見區域
const wrapperRef = ref<HTMLElement | null>(null);

// 菜單開啟時，確保訊息在可見區域（菜單出現在上方，需要留出空間）
function scrollIntoViewForMenu() {
  nextTick(() => {
    if (!wrapperRef.value) return;
    const el = wrapperRef.value;
    const rect = el.getBoundingClientRect();
    // 菜單高度約 120px（兩行），加上間距
    const menuHeight = 130;
    if (rect.top < menuHeight) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  });
}

// 想法展開狀態
const showThought = ref(false);

// 有效的想法內容（props.thought 優先，否則從 content 中提取漏網的 ˇ想法ˇ 或 ~(想法)~）
const effectiveThought = computed(() => {
  if (props.thought) return props.thought;
  if (!props.content || typeof props.content !== "string") return "";
  // 新格式 ˇ想法ˇ（注音符號）
  const newMatches = props.content.match(/ˇ([^ˇ]+)ˇ/g);
  if (newMatches && newMatches.length > 0) {
    const last = newMatches[newMatches.length - 1];
    const inner = last.match(/ˇ([^ˇ]+)ˇ/);
    return inner ? inner[1] : "";
  }
  // 舊格式 ~(想法)~
  const oldMatches = props.content.match(/~\(([\s\S]+?)\)~/g);
  if (oldMatches && oldMatches.length > 0) {
    const last = oldMatches[oldMatches.length - 1];
    const inner = last.match(/~\(([\s\S]+?)\)~/);
    return inner ? inner[1] : "";
  }
  return "";
});

// 切換想法顯示
function toggleThought(e: Event) {
  e.stopPropagation();
  showThought.value = !showThought.value;
}

// 氣泡點擊處理（統一處理心聲切換，避免行內三元表達式在部分瀏覽器不觸發）
function onBubbleClick(e: Event) {
  e.stopPropagation();
  // 如果長按菜單正在顯示，先關閉菜單，不切換心聲
  if (showMenu.value) {
    showMenu.value = false;
    return;
  }
  if (effectiveThought.value) {
    showThought.value = !showThought.value;
  }
}

// 格式化時間
const formattedTime = computed(() => {
  if (!props.timestamp) return "";
  const date = new Date(props.timestamp);
  return date.toLocaleTimeString("zh-TW", {
    hour: "2-digit",
    minute: "2-digit",
  });
});

// 格式化拍立得日期（2023.05.20 格式）
const formattedPhotoDate = computed(() => {
  const date = props.timestamp ? new Date(props.timestamp) : new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}.${month}.${day}`;
});

function formatWaimaiPrice(value?: number): string {
  const amount = Number.isFinite(value) ? Number(value) : 0;
  return `🪙 ${amount.toLocaleString("zh-TW")}`;
}

const waimaiStatusLabel = computed(() => {
  switch (props.waimaiOrder?.status) {
    case "created":
      return "待處理";
    case "payment_requested":
      return "待付款";
    case "payment_reviewing":
      return "付款確認中";
    case "paid":
      return "已付款";
    case "rejected":
      return "已拒絕";
    case "failed":
      return "失敗";
    case "in_transit":
      return "運輸中";
    case "customs":
      return "清關中";
    case "delivering":
      return "末端派送";
    case "delivered":
      return "已送達";
    default:
      return "";
  }
});

const waimaiCardTitle = computed(() => {
  if (props.isWaimaiShare) return "🛍️ 外賣商品分享";
  if (props.isWaimaiPaymentRequest) return "💸 請你幫我支付！";
  if (props.isWaimaiPaymentConfirm) return "✅ 付款確認";
  if (props.isWaimaiPaymentResult) return "📣 付款結果";
  if (props.isWaimaiProgress) return "📍 物流進度";
  if (props.isWaimaiDelivery) return "📦 外賣送達";
  return "🧾 外賣訂單";
});

const waimaiSummaryText = computed(() => {
  if (props.isWaimaiShare) return "你可以繼續討論後再決定是否下單。";
  if (props.isWaimaiPaymentRequest) return "對方可在聊天中決定是否替你付款。";
  if (props.isWaimaiPaymentConfirm) return "請先確認商品、總價、運費與收件人。";
  if (props.isWaimaiDelivery) return "訂單已完成，餐點已送達。";

  if (props.isWaimaiProgress) {
    switch (props.waimaiOrder?.status) {
      case "in_transit":
        return "幹線運輸中，正在前往目的地國家。";
      case "customs":
        return "包裹進入清關流程，完成後交由當地配送。";
      case "delivering":
        return "已進入末端派送，請留意收貨通知。";
      case "delivered":
        return "配送完成，請留意是否已簽收。";
      default:
        return "物流節點已更新。";
    }
  }

  if (props.isWaimaiPaymentResult) {
    if (props.waimaiOrder?.status === "paid") return "支付成功，商家正在備餐。";
    if (props.waimaiOrder?.status === "rejected")
      return "對方已拒絕此次代付請求。";
    if (props.waimaiOrder?.status === "failed") return "支付失敗，請稍後重試。";
  }

  switch (props.waimaiOrder?.status) {
    case "in_transit":
      return "幹線運輸中，正在前往目的地國家。";
    case "customs":
      return "包裹進入清關流程，完成後交由當地配送。";
    case "delivering":
      return "已進入末端派送，請留意收貨通知。";
    default:
      return "";
  }
});

function formatWaimaiRouteType(order?: WaimaiOrderSnapshot): string {
  if (!order?.eta) return "";
  const eta = order.eta;
  if (eta.routeType === "local_instant") return "即時配送";
  if (eta.routeType === "domestic") return "國內物流";
  if (eta.routeType === "cross_border") {
    const toFlag = (code: string) => {
      const upper = code.trim().toUpperCase();
      if (upper.length !== 2) return "";
      const a = upper.codePointAt(0)! - 65 + 0x1f1e6;
      const b = upper.codePointAt(1)! - 65 + 0x1f1e6;
      return String.fromCodePoint(a) + String.fromCodePoint(b);
    };
    return `跨境空運 ${toFlag(eta.originCountry)}→${toFlag(eta.destinationCountry)}`;
  }
  return "";
}

function formatWaimaiEtaRange(order?: WaimaiOrderSnapshot): string {
  if (!order?.eta) {
    return "未提供 ETA";
  }

  const now = order.eta.computedAt;
  const minMinutes = Math.max(
    1,
    Math.round((order.eta.etaWindowStartAt - now) / 60000),
  );
  const maxMinutes = Math.max(
    minMinutes,
    Math.round((order.eta.etaWindowEndAt - now) / 60000),
  );

  if (maxMinutes < 180) {
    return `預估送達：${minMinutes}-${maxMinutes} 分鐘`;
  }

  const minDays = Math.max(0.5, Math.round((minMinutes / 60 / 24) * 10) / 10);
  const maxDays = Math.max(
    minDays,
    Math.round((maxMinutes / 60 / 24) * 10) / 10,
  );
  return `預估送達：${minDays}-${maxDays} 天`;
}

const waimaiDestinationText = computed(() => {
  const destination = props.waimaiOrder?.destination;
  if (!destination) return "";
  return `${destination.countryName} ${destination.city}｜${destination.addressLine}`;
});

const waimaiEtaText = computed(() => formatWaimaiEtaRange(props.waimaiOrder));

const waimaiRouteBadge = computed(() =>
  formatWaimaiRouteType(props.waimaiOrder),
);

/** 延遲原因文案（暴雨延遲 / 清關中 / 尖峰時段） */
const waimaiDelayReason = computed(() => {
  const eta = props.waimaiOrder?.eta;
  if (!eta) return "";
  const reasons: string[] = [];
  if (eta.weatherLevel === "storm") reasons.push("⛈️ 暴雨延遲");
  else if (eta.weatherLevel === "rain") reasons.push("🌧️ 雨天延遲");
  if (props.waimaiOrder?.status === "customs") reasons.push("🛃 清關中");
  if (eta.isPeakHour && eta.routeType === "local_instant")
    reasons.push("🕐 尖峰時段");
  return reasons.join("　");
});

// 是否是用戶訊息
const isUser = computed(() => props.role === "user");

// 是否是系統訊息
const isSystem = computed(() => props.role === "system");

// 是否是電話通話總結系統訊息
const isPhoneCallSummary = computed(
  () =>
    isSystem.value &&
    typeof props.content === "string" &&
    props.content.startsWith("📞 通話結束"),
);

const phoneCallSummaryMeta = computed(() => {
  const text = props.content || "";
  const titleMatch = text.match(/^📞\s*([^\n]*)/m);
  const durationMatch = text.match(/時長：([^\n]+)/);

  return {
    title: titleMatch ? `📞 ${titleMatch[1].trim()}` : "📞 通話結束",
    duration: durationMatch?.[1]?.trim() || "",
  };
});

const phoneCallSummaryTranscript = computed(() => {
  const text = props.content || "";
  const marker = "--- 通話內容 ---";
  const markerIndex = text.indexOf(marker);

  if (markerIndex === -1) return "";
  return text.slice(markerIndex + marker.length).trim();
});

// 頭像框樣式
const charFrameStyle = computed(() =>
  getAvatarFrameInlineStyle(props.charFrameId),
);
const userFrameStyle = computed(() =>
  getAvatarFrameInlineStyle(props.userFrameId),
);

// SVG 頭像框檢測
const isCharFrameSvg = computed(() => isAvatarFrameSvg(props.charFrameId));
const isUserFrameSvg = computed(() => isAvatarFrameSvg(props.userFrameId));

// 圖片圖層頭像框檢測
const isCharFrameImage = computed(() => isAvatarFrameImage(props.charFrameId));
const isUserFrameImage = computed(() => isAvatarFrameImage(props.userFrameId));

// 圖片圖層資料
const charFrameLayers = computed(() => getAvatarFrameLayers(props.charFrameId));
const userFrameLayers = computed(() => getAvatarFrameLayers(props.userFrameId));

// SVG 頭像框內容（根據頭像形狀選擇對應 SVG）
const charFrameSvg = computed(() =>
  getAvatarFrameSvg(props.charFrameId, props.avatarShape),
);
const userFrameSvg = computed(() =>
  getAvatarFrameSvg(props.userFrameId, props.avatarShape),
);

// 長按顯示選單
let longPressTimer: number | null = null;
let touchStartPos = { x: 0, y: 0 };
// 菜單剛打開的時間戳，用於防止手指抬起時誤觸菜單按鈕
let menuOpenedAt = 0;
// 手指放開的時間戳，用於忽略 touchend 後產生的合成 click
let touchEndedAt = 0;
// 標記是否由長按觸發了菜單
let menuFromLongPress = false;

function onTouchStart(e: TouchEvent) {
  menuFromLongPress = false;
  touchStartPos = {
    x: e.touches[0].clientX,
    y: e.touches[0].clientY,
  };
  longPressTimer = window.setTimeout(() => {
    menuFromLongPress = true;
    menuOpenedAt = Date.now();
    showMenu.value = true;
    scrollIntoViewForMenu();
    longPressTimer = null;
  }, 500);
}

function onTouchMove(e: TouchEvent) {
  // 手指移動超過 10px 就取消長按（用戶在滑動，不是長按）
  const moveX = Math.abs(e.touches[0].clientX - touchStartPos.x);
  const moveY = Math.abs(e.touches[0].clientY - touchStartPos.y);
  if (moveX > 10 || moveY > 10) {
    if (longPressTimer) {
      clearTimeout(longPressTimer);
      longPressTimer = null;
    }
  }
}

function onTouchEnd() {
  if (longPressTimer) {
    clearTimeout(longPressTimer);
    longPressTimer = null;
  }
  // 記錄手指放開時間，用於在 click handler 中判斷
  if (menuFromLongPress) {
    touchEndedAt = Date.now();
  }
}

function handleClick(e: MouseEvent) {
  // 長按觸發菜單後，手指放開 400ms 內的 click 一律忽略
  // 這能覆蓋用戶長按任意時長的情況
  if (menuFromLongPress && touchEndedAt && Date.now() - touchEndedAt < 400) {
    e.stopPropagation();
    e.preventDefault();
    menuFromLongPress = false;
    return;
  }
  menuFromLongPress = false;
  if (showMenu.value) {
    showMenu.value = false;
  } else {
    emit("click", props.id);
  }
}

function handleEdit() {
  // 防止菜單剛打開時手指抬起誤觸
  if (menuOpenedAt && Date.now() - menuOpenedAt < 800) return;
  showMenu.value = false;
  emit("edit", props.id);
}

function handleDelete() {
  if (menuOpenedAt && Date.now() - menuOpenedAt < 800) return;
  showMenu.value = false;
  emit("delete", props.id);
}

function handleMultiDelete() {
  if (menuOpenedAt && Date.now() - menuOpenedAt < 800) return;
  showMenu.value = false;
  emit("multiDelete", props.id);
}

function handleBranch() {
  if (menuOpenedAt && Date.now() - menuOpenedAt < 800) return;
  showMenu.value = false;
  emit("branch", props.id);
}

function handleCopy() {
  if (menuOpenedAt && Date.now() - menuOpenedAt < 800) return;
  const text = props.content;

  // 類型安全檢查
  if (typeof text !== "string") {
    return;
  }

  // 移除圖片標記
  const cleanText = text.replace(/\[img:.*?\]/g, "");

  if (navigator.clipboard?.writeText) {
    navigator.clipboard
      .writeText(cleanText)
      .then(() => console.log("Message copied:", props.id))
      .catch(() => {
        // 降級方案
        copyWithExecCommand(cleanText);
      });
  } else {
    // 降級方案
    copyWithExecCommand(cleanText);
  }

  showMenu.value = false;
  emit("copy", props.id);
}

function copyWithExecCommand(text: string) {
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  textarea.setAttribute("data-app-copy", "true");
  document.body.appendChild(textarea);
  textarea.select();
  try {
    document.execCommand("copy");
  } catch {
    // ignore
  }
  document.body.removeChild(textarea);
}

function handleRegenerate() {
  if (menuOpenedAt && Date.now() - menuOpenedAt < 800) return;
  showMenu.value = false;
  emit("regenerate", props.id);
}

function handleReply() {
  if (menuOpenedAt && Date.now() - menuOpenedAt < 800) return;
  showMenu.value = false;
  emit("reply", props.id);
}

function handleScreenshot() {
  if (menuOpenedAt && Date.now() - menuOpenedAt < 800) return;
  showMenu.value = false;
  emit("screenshot", props.id);
}

function handleBatchScreenshot() {
  if (menuOpenedAt && Date.now() - menuOpenedAt < 800) return;
  showMenu.value = false;
  emit("batchScreenshot", props.id);
}

function handleReplyClick() {
  // 點擊回覆引用時，滾動到原消息
  if (props.replyTo) {
    emit("scrollToReply", props.replyTo);
  }
}

function closeMenu() {
  // 長按觸發菜單後，短時間內忽略關閉（防止手指放開時的合成 click 落在 backdrop 上）
  if (menuFromLongPress && touchEndedAt && Date.now() - touchEndedAt < 400) {
    return;
  }
  showMenu.value = false;
}

// 右鍵選單（電腦端）
function onContextMenu(e: MouseEvent) {
  e.preventDefault();
  menuOpenedAt = Date.now();
  showMenu.value = true;
  scrollIntoViewForMenu();
}

// 委派處理 bubble-text 內部的 TTS 行內按鈕點擊
function onBubbleTextClick(e: MouseEvent) {
  const target = (e.target as HTMLElement).closest(".tts-inline-btn");
  if (!target) return;
  e.stopPropagation();
  const idx = parseInt((target as HTMLElement).dataset.ttsIdx ?? "-1", 10);
  if (idx >= 0) {
    playTTSSegment(e, idx);
  }
}

// ===== 音頻播放相關 =====

const isAudioMessage = computed(() => props.messageType === "audio");

// 當前消息是否正在播放
const isThisPlaying = computed(
  () =>
    audioPlayer.playingMessageId.value === props.id &&
    audioPlayer.isPlaying.value,
);

// 當前消息的播放進度 (0-1)
const audioProgress = computed(() =>
  audioPlayer.playingMessageId.value === props.id
    ? audioPlayer.progress.value
    : 0,
);

// 格式化音頻時長
const formattedAudioDuration = computed(() =>
  formatTime(props.audioDuration ?? 0),
);

// 按需載入的音頻 Blob 快取
const lazyAudioBlob = ref<Blob | null>(null);
const isLoadingAudio = ref(false);

// ===== 圖片懶載入：偵測 chatimg_ 引用 ID，按需從 IndexedDB 讀取 =====
const lazyImageUrl = ref<string | null>(null);
const isLoadingImage = ref(false);

/** 解析後的圖片 URL（優先使用懶載入結果，否則直接用 prop） */
const resolvedImageUrl = computed(() => {
  // 如果已經懶載入完成，使用載入的 base64
  if (lazyImageUrl.value) return lazyImageUrl.value;
  // 如果是引用 ID 且正在載入中，返回空（顯示 loading 狀態）
  if (props.imageUrl && isChatImageRef(props.imageUrl)) return "";
  // 普通 URL 或 base64，直接使用
  return props.imageUrl || "";
});

// 監聽 imageUrl prop 變化，觸發懶載入
watch(
  () => props.imageUrl,
  async (newUrl) => {
    if (!newUrl || !isChatImageRef(newUrl)) {
      lazyImageUrl.value = null;
      return;
    }
    // 是 chatimg_ 引用，從 IndexedDB 按需讀取
    isLoadingImage.value = true;
    try {
      const base64 = await getChatImage(newUrl);
      if (base64) {
        lazyImageUrl.value = base64;
      }
    } catch (e) {
      console.warn("[MessageBubble] 載入圖片失敗:", e);
    } finally {
      isLoadingImage.value = false;
    }
  },
  { immediate: true },
);

/** 取得可用的音頻 Blob（優先使用 prop，否則按需從 IndexedDB 載入） */
async function getAvailableAudioBlob(): Promise<Blob | null> {
  if (props.audioBlob) return props.audioBlob;
  if (lazyAudioBlob.value) return lazyAudioBlob.value;
  if (!props.audioBlobId || !isAudioBlobRef(props.audioBlobId)) return null;
  isLoadingAudio.value = true;
  try {
    const record = await getAudioBlob(props.audioBlobId);
    if (record?.blob) {
      lazyAudioBlob.value = record.blob;
      return record.blob;
    }
  } catch (e) {
    console.warn("[MessageBubble] 載入音頻失敗:", e);
  } finally {
    isLoadingAudio.value = false;
  }
  return null;
}

/** 是否有可用的音頻（用於模板判斷） */
const hasAudioAvailable = computed(
  () =>
    !!(
      props.audioBlob ||
      lazyAudioBlob.value ||
      (props.audioBlobId && isAudioBlobRef(props.audioBlobId))
    ),
);

// 播放/暫停切換
async function toggleAudioPlay(e: Event) {
  e.stopPropagation();
  const blob = await getAvailableAudioBlob();
  if (!blob) return;
  if (isThisPlaying.value) {
    audioPlayer.pause();
  } else if (audioPlayer.playingMessageId.value === props.id) {
    audioPlayer.play(props.id, blob);
  } else {
    audioPlayer.play(props.id, blob);
  }
}

// 進度條拖動
const isDraggingProgress = ref(false);

function onProgressPointerDown(e: PointerEvent) {
  e.stopPropagation();
  isDraggingProgress.value = true;
  const target = e.currentTarget as HTMLElement;
  target.setPointerCapture(e.pointerId);
  seekFromEvent(e, target);
}

function onProgressPointerMove(e: PointerEvent) {
  if (!isDraggingProgress.value) return;
  e.stopPropagation();
  seekFromEvent(e, e.currentTarget as HTMLElement);
}

function onProgressPointerUp(e: PointerEvent) {
  if (!isDraggingProgress.value) return;
  e.stopPropagation();
  isDraggingProgress.value = false;
}

function seekFromEvent(e: PointerEvent, el: HTMLElement) {
  const rect = el.getBoundingClientRect();
  const x = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
  const p = x / rect.width;
  audioPlayer.seek(p);
}

// ===== 語音轉文字（Qwen3-ASR via Gradio） =====

// ===== MiniMax TTS 語音播放 =====
const ttsAudio = ref<HTMLAudioElement | null>(null);
const isTTSPlaying = ref(false);
/** 當前正在播放的段落索引（-1 = 全部播放模式中的當前段） */
const ttsPlayingIndex = ref(-1);

/** 文字語音訊息的渲染內容（清除 TTS 標記 + 注入行內播放按鈕） */
const renderedVoiceTranscript = computed(() => {
  const raw = replaceDisplayMacros(
    props.audioTranscript || props.content || "",
  );
  if (!raw) return "";
  if (props.ttsSegments && props.ttsSegments.length > 0) {
    let segIdx = 0;
    let html = raw.replace(/\[emotion=[^\]]*\]/g, () => {
      const seg = props.ttsSegments?.[segIdx];
      const btnHtml = seg
        ? `<span class="tts-inline-btn" data-tts-idx="${segIdx}" title="${seg.emotion || ""}"${seg.audioUrl ? "" : ' style="opacity:0.3;cursor:default"'}>🔊</span>`
        : "";
      segIdx++;
      return btnHtml;
    });
    html = cleanTTSTags(html);
    return html;
  }
  return cleanTTSTags(raw);
});

/** 是否有可播放的 TTS 段落 */
const hasTTSSegments = computed(() => {
  return (
    props.ttsSegments &&
    props.ttsSegments.length > 0 &&
    props.ttsSegments.some((s) => s.audioUrl)
  );
});

/** 向下相容：舊版單段 ttsAudioUrl（只在無 ttsSegments 時顯示） */
const hasTTSLegacy = computed(() => {
  // 只要 ttsSegments 陣列存在（即使 audioUrl 尚未合成），就不顯示舊版播放器
  return !props.ttsSegments?.length && !!props.ttsAudioUrl;
});

/** 停止當前播放 */
function stopTTS() {
  if (ttsAudio.value) {
    ttsAudio.value.pause();
    ttsAudio.value = null;
  }
  isTTSPlaying.value = false;
  ttsPlayingIndex.value = -1;
}

/** 播放單段 TTS */
function playTTSSegment(e: Event, index: number) {
  e.stopPropagation();
  const seg = props.ttsSegments?.[index];
  if (!seg?.audioUrl) return;

  // 如果正在播放同一段，暫停
  if (isTTSPlaying.value && ttsPlayingIndex.value === index) {
    stopTTS();
    return;
  }

  stopTTS();
  const audio = new Audio(seg.audioUrl);
  audio.addEventListener("ended", () => {
    isTTSPlaying.value = false;
    ttsPlayingIndex.value = -1;
  });
  ttsAudio.value = audio;
  ttsPlayingIndex.value = index;
  isTTSPlaying.value = true;
  audio.play();
}

/** 全部播放（逐段串接） */
async function playAllTTS(e: Event) {
  e.stopPropagation();
  if (!props.ttsSegments) return;

  // 如果正在播放，停止
  if (isTTSPlaying.value) {
    stopTTS();
    return;
  }

  const segs = props.ttsSegments.filter((s) => s.audioUrl);
  if (segs.length === 0) return;

  isTTSPlaying.value = true;

  for (let i = 0; i < props.ttsSegments.length; i++) {
    const seg = props.ttsSegments[i];
    if (!seg.audioUrl) continue;
    if (!isTTSPlaying.value) break; // 被手動停止

    ttsPlayingIndex.value = i;
    await new Promise<void>((resolve) => {
      const audio = new Audio(seg.audioUrl);
      audio.addEventListener("ended", () => resolve());
      audio.addEventListener("error", () => resolve());
      ttsAudio.value = audio;
      audio.play().catch(() => resolve());
    });
  }

  stopTTS();
}

/** 向下相容：播放舊版單段 */
function toggleTTSLegacy(e: Event) {
  e.stopPropagation();
  if (!props.ttsAudioUrl) return;

  if (ttsAudio.value) {
    if (isTTSPlaying.value) {
      stopTTS();
    } else {
      ttsAudio.value.play();
      isTTSPlaying.value = true;
    }
    return;
  }

  const audio = new Audio(props.ttsAudioUrl);
  audio.addEventListener("ended", () => {
    isTTSPlaying.value = false;
  });
  ttsAudio.value = audio;
  isTTSPlaying.value = true;
  audio.play();
}

onUnmounted(() => {
  stopTTS();
});

// ===== 語音轉文字（Qwen3-ASR via Gradio） =====

const isTranscribing = ref(false);
const showTranscript = ref(false);
const localTranscript = ref("");

// Qwen3-ASR Gradio 服務器地址
const QWEN_ASR_SERVER = "https://qwen-qwen3-asr-demo.ms.show";

/** 使用 Qwen3-ASR Gradio API 進行語音轉文字 */
async function transcribeWithQwenASR() {
  const blob = await getAvailableAudioBlob();
  if (!blob || isTranscribing.value) return;

  // 如果已有轉錄結果，直接切換顯示
  if (props.audioTranscript || localTranscript.value) {
    showTranscript.value = !showTranscript.value;
    return;
  }

  isTranscribing.value = true;
  showTranscript.value = true;

  try {
    // Step 1: 上傳音頻到 Gradio 服務器
    const uploadUrl = `${QWEN_ASR_SERVER}/gradio_api/upload`;
    const formData = new FormData();
    const audioFile = new File([blob], `voice_${Date.now()}.webm`, {
      type: blob.type || "audio/webm",
    });
    formData.append("files", audioFile);

    const uploadResp = await fetch(uploadUrl, {
      method: "POST",
      body: formData,
    });

    if (!uploadResp.ok) throw new Error(`上傳失敗 (${uploadResp.status})`);

    const uploadResult = await uploadResp.json();
    if (!uploadResult || uploadResult.length === 0) {
      throw new Error("服務器未返回上傳路徑");
    }
    const uploadedPath = uploadResult[0];

    // Step 2: 調用 ASR 推理接口
    const submitUrl = `${QWEN_ASR_SERVER}/gradio_api/call/asr_inference`;
    const postBody = {
      data: [
        {
          path: uploadedPath,
          orig_name: audioFile.name,
          size: audioFile.size,
          mime_type: audioFile.type || "audio/webm",
          meta: { _type: "gradio.FileData" },
        },
        "", // context
        "auto", // language
        false, // ITN
      ],
    };

    const postResp = await fetch(submitUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(postBody),
    });

    if (!postResp.ok) throw new Error(`API 調用失敗 (${postResp.status})`);

    const postData = await postResp.json();
    const eventId = postData.event_id;
    if (!eventId) throw new Error("未返回 event_id");

    // Step 3: 獲取 SSE 結果
    const resultUrl = `${submitUrl}/${eventId}`;
    const getResp = await fetch(resultUrl);
    if (!getResp.ok) throw new Error(`獲取結果失敗 (${getResp.status})`);

    const responseText = await getResp.text();
    const lines = responseText.split("\n");
    let recognizedText: string | null = null;

    for (const line of lines) {
      if (line.startsWith("data:")) {
        try {
          const jsonStr = line.substring(5).trim();
          const data = JSON.parse(jsonStr);
          if (Array.isArray(data) && data.length >= 1) {
            recognizedText = data[0];
          }
        } catch {
          // 忽略非 JSON 行
        }
      }
    }

    if (recognizedText) {
      localTranscript.value = recognizedText;
      emit("updateTranscript", props.id, recognizedText);
    } else {
      localTranscript.value = "（未識別到語音內容）";
    }
  } catch (err) {
    console.warn("[Qwen3-ASR] 轉文字失敗:", err);
    localTranscript.value = "轉文字失敗，請稍後重試";
  } finally {
    isTranscribing.value = false;
  }
}

// 顯示的轉錄文字（優先使用已保存的）
const displayTranscript = computed(
  () => props.audioTranscript || localTranscript.value,
);

// 文字語音訊息的展開/收起狀態
const showTextVoiceTranscript = ref(true);
</script>

<template>
  <div
    ref="wrapperRef"
    class="message-wrapper"
    :class="{
      user: isUser,
      ai: !isUser && !isSystem && !isRecall && !isGroupAction,
      system: isSystem || isRecall || isGroupAction,
      selected: isSelected,
      'search-highlight': isSearchHighlight,
      'current-search': isCurrentSearch,
      'group-chat': isGroupChat,
    }"
    :data-message-id="id"
    @click="handleClick"
    @touchstart.passive="onTouchStart"
    @touchmove.passive="onTouchMove"
    @touchend="onTouchEnd"
    @touchcancel="onTouchEnd"
    @contextmenu.prevent="onContextMenu"
  >
    <!-- 系統訊息 -->
    <template v-if="isSystem">
      <!-- 跳轉魔法消息 -->
      <div v-if="isTimetravel" class="timetravel-system-message">
        <div class="timetravel-line"></div>
        <div class="timetravel-badge">
          <svg viewBox="0 0 24 24" fill="currentColor" class="timetravel-icon">
            <path
              d="M7.5 5.6L10 7 8.6 4.5 10 2 7.5 3.4 5 2l1.4 2.5L5 7zm12 9.8L17 14l1.4 2.5L17 19l2.5-1.4L22 19l-1.4-2.5L22 14zM22 2l-2.5 1.4L17 2l1.4 2.5L17 7l2.5-1.4L22 7l-1.4-2.5zm-7.63 5.29c-.39-.39-1.02-.39-1.41 0L1.29 18.96c-.39.39-.39 1.02 0 1.41l2.34 2.34c.39.39 1.02.39 1.41 0L16.7 11.05c.39-.39.39-1.02 0-1.41l-2.33-2.35z"
            />
          </svg>
          <span>{{ timetravelContent || content }}</span>
        </div>
        <div class="timetravel-line"></div>
      </div>
      <!-- 小劇場消息 -->
      <div
        v-else-if="content.startsWith('小劇場：')"
        class="small-theater-system-message"
      >
        <div class="small-theater-badge">
          <svg viewBox="0 0 24 24" fill="currentColor" class="theater-icon">
            <path
              d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zM8.5 8c.83 0 1.5.67 1.5 1.5S9.33 11 8.5 11 7 10.33 7 9.5 7.67 8 8.5 8zm3.5 9c-2.33 0-4.31-1.46-5.11-3.5h10.22c-.8 2.04-2.78 3.5-5.11 3.5zm3.5-6c-.83 0-1.5-.67-1.5-1.5S14.67 8 15.5 8s1.5.67 1.5 1.5-.67 1.5-1.5 1.5z"
            />
          </svg>
          平行世界・小劇場
        </div>
        <div class="small-theater-content">
          {{ content.replace("小劇場：", "") }}
        </div>
      </div>
      <!-- 換頭像系統消息 -->
      <div v-else-if="isAvatarChange" class="avatar-change-system-message">
        <div class="avatar-change-line"></div>
        <div class="avatar-change-badge">
          <svg
            viewBox="0 0 24 24"
            fill="currentColor"
            class="avatar-change-icon"
          >
            <path
              d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 3c1.66 0 3 1.34 3 3s-1.34 3-3 3-3-1.34-3-3 1.34-3 3-3zm0 14.2c-2.5 0-4.71-1.28-6-3.22.03-1.99 4-3.08 6-3.08 1.99 0 5.97 1.09 6 3.08-1.29 1.94-3.5 3.22-6 3.22z"
            />
          </svg>
          <span>{{ content }}</span>
        </div>
        <div class="avatar-change-line"></div>
      </div>
      <!-- 群聊記錄卡片（系統訊息樣式） -->
      <div
        v-else-if="isGroupChatHistory && groupChatHistoryData"
        class="group-chat-history-system-message"
      >
        <GroupChatHistoryCard
          :group-name="groupChatHistoryData.groupName"
          :messages="groupChatHistoryData.messages"
          @view="showGroupChatHistoryModal = true"
        />
      </div>
      <!-- 群通話記錄卡片（系統訊息樣式） -->
      <div
        v-else-if="isGroupCallHistory && groupCallHistoryData"
        class="group-call-history-system-message"
      >
        <GroupCallHistoryCard
          :group-name="groupCallHistoryData.groupName"
          :participants="groupCallHistoryData.participants"
          :messages="groupCallHistoryData.messages"
          :started-at="groupCallHistoryData.startedAt"
          :ended-at="groupCallHistoryData.endedAt"
          @view="showGroupCallHistoryModal = true"
        />
        <GroupCallHistoryModal
          v-if="showGroupCallHistoryModal"
          :visible="showGroupCallHistoryModal"
          :records="[
            {
              id: id,
              groupName: groupCallHistoryData.groupName,
              participants: groupCallHistoryData.participants,
              messages: groupCallHistoryData.messages,
              startedAt: groupCallHistoryData.startedAt,
              endedAt: groupCallHistoryData.endedAt,
            },
          ]"
          @close="showGroupCallHistoryModal = false"
        />
      </div>
      <!-- 通話通知卡片 -->
      <div v-else-if="isCallNotification" class="call-notification-card">
        <svg
          viewBox="0 0 24 24"
          fill="currentColor"
          class="call-notification-icon"
          :class="callNotificationType"
        >
          <path
            d="M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z"
          />
        </svg>
        <span class="call-notification-text">
          {{ callNotificationType === "declined" ? "已拒接" : "未接來電" }}
        </span>
        <span class="call-notification-time">
          {{ formattedTime }}
        </span>
      </div>
      <!-- 電話通話紀錄（系統訊息） -->
      <div v-else-if="isPhoneCallSummary" class="phone-call-summary-message">
        <div class="summary-head">
          <span class="summary-title">{{ phoneCallSummaryMeta.title }}</span>
          <span v-if="phoneCallSummaryMeta.duration" class="summary-duration">
            時長 {{ phoneCallSummaryMeta.duration }}
          </span>
        </div>
        <div v-if="phoneCallSummaryTranscript" class="summary-body">
          {{ phoneCallSummaryTranscript }}
        </div>
      </div>
      <!-- 角色封鎖用戶通知 -->
      <div
        v-else-if="isCharBlockedNotification"
        class="char-blocked-notification"
      >
        <div class="char-blocked-notification-line"></div>
        <div class="char-blocked-notification-body">
          <svg
            viewBox="0 0 24 24"
            fill="currentColor"
            width="14"
            height="14"
            style="flex-shrink: 0; opacity: 0.6"
          >
            <path
              d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.42 0-8-3.58-8-8 0-1.85.63-3.55 1.69-4.9L16.9 18.31C15.55 19.37 13.85 20 12 20zm6.31-3.1L7.1 5.69C8.45 4.63 10.15 4 12 4c4.42 0 8 3.58 8 8 0 1.85-.63 3.55-1.69 4.9z"
            />
          </svg>
          <span>對方已將你封鎖</span>
          <button
            v-if="
              charBlockedReason &&
              charBlockedReason !== '原因' &&
              charBlockedReason.trim()
            "
            class="char-blocked-why-btn"
            @click.stop="showBlockedReason = !showBlockedReason"
          >
            為什麼！
          </button>
        </div>
        <!-- 原因小面板（點擊展開，不蓋住頁面） -->
        <div
          v-if="showBlockedReason && charBlockedReason"
          class="char-blocked-reason-panel"
        >
          <span>{{ charBlockedReason }}</span>
        </div>
        <div class="char-blocked-notification-line"></div>
      </div>
      <!-- 普通系統消息 -->
      <div v-else class="system-message">
        <span>{{ content }}</span>
      </div>
    </template>

    <!-- 群聊撤回通知（系統訊息樣式） -->
    <template v-else-if="isRecall">
      <div class="system-message recall-message">
        <svg viewBox="0 0 24 24" fill="currentColor" class="recall-icon">
          <path
            d="M12.5 8c-2.65 0-5.05.99-6.9 2.6L2 7v9h9l-3.62-3.62c1.39-1.16 3.16-1.88 5.12-1.88 3.54 0 6.55 2.31 7.6 5.5l2.37-.78C21.08 11.03 17.15 8 12.5 8z"
          />
        </svg>
        <span
          >{{ senderCharacterName || groupActionActor }} 撤回了一條訊息</span
        >
      </div>
    </template>

    <!-- 群聊管理動作（居中系統訊息） -->
    <template v-else-if="isGroupAction">
      <div class="system-message group-action-message">
        <span v-if="groupActionType === 'rename'"
          >{{ groupActionActor }} 修改了群名為「{{ groupActionValue }}」</span
        >
        <span v-else-if="groupActionType === 'kick'"
          >{{ groupActionActor }} 將 {{ groupActionTarget }} 移出了群聊</span
        >
        <span v-else-if="groupActionType === 'mute'"
          >{{ groupActionActor }} 禁言了 {{ groupActionTarget }}</span
        >
        <span v-else-if="groupActionType === 'unmute'"
          >{{ groupActionActor }} 解除了 {{ groupActionTarget }} 的禁言</span
        >
        <span v-else>{{ content }}</span>
      </div>
    </template>

    <!-- 一般訊息 -->
    <template v-else>
      <!-- AI 頭像（左側）- 群聊模式使用發送者頭像 -->
      <div
        v-if="!isUser && showAvatar"
        class="avatar-container"
        @click="emit('avatarClick', id)"
      >
        <!-- 群聊模式：使用發送者角色頭像（簡化，不套用頭像框） -->
        <template v-if="isGroupChat && senderCharacterAvatar">
          <img
            v-if="!groupAvatarFailed"
            :src="getProxiedUrl(senderCharacterAvatar)"
            :alt="senderCharacterName"
            class="soft-avatar"
            @error="groupAvatarFailed = true"
          />
          <div v-else class="avatar-placeholder">
            {{ (senderCharacterName || "?").charAt(0) }}
          </div>
        </template>
        <!-- 非群聊模式或無發送者頭像：使用原有邏輯 -->
        <template v-else>
          <!-- 圖片圖層頭像框 -->
          <div v-if="isCharFrameImage" class="avatar-with-image-frame">
            <!-- 背景層 -->
            <img
              v-if="charFrameLayers?.background"
              :src="getLayerSrc(charFrameLayers.background)"
              class="image-frame-layer background-layer"
              :style="{
                transform: getLayerTransform(charFrameLayers.background),
                filter: charFrameLayers.background.filter,
              }"
            />
            <!-- 頭像 -->
            <img
              v-if="avatar"
              :src="avatar"
              :alt="senderName"
              class="soft-avatar image-frame-avatar"
            />
            <div v-else class="avatar-placeholder image-frame-avatar">
              <svg viewBox="0 0 24 24" fill="currentColor">
                <path
                  d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 3c1.66 0 3 1.34 3 3s-1.34 3-3 3-3-1.34-3-3 1.34-3 3-3zm0 14.2c-2.5 0-4.71-1.28-6-3.22.03-1.99 4-3.08 6-3.08 1.99 0 5.97 1.09 6 3.08-1.29 1.94-3.5 3.22-6 3.22z"
                />
              </svg>
            </div>
            <!-- 覆蓋層 -->
            <img
              v-if="charFrameLayers?.overlay"
              :src="getLayerSrc(charFrameLayers.overlay)"
              class="image-frame-layer overlay-layer"
              :style="{
                transform: getLayerTransform(charFrameLayers.overlay),
                filter: charFrameLayers.overlay.filter,
              }"
            />
            <!-- 裝飾層 -->
            <img
              v-if="charFrameLayers?.decoration"
              :src="getLayerSrc(charFrameLayers.decoration)"
              class="image-frame-layer decoration-layer"
              :style="{
                transform: getLayerTransform(charFrameLayers.decoration),
                filter: charFrameLayers.decoration.filter,
              }"
            />
          </div>
          <!-- SVG 頭像框 -->
          <div v-else-if="isCharFrameSvg" class="avatar-with-svg-frame">
            <img
              v-if="avatar"
              :src="avatar"
              :alt="senderName"
              class="soft-avatar svg-frame-avatar"
            />
            <div v-else class="avatar-placeholder svg-frame-avatar">
              <svg viewBox="0 0 24 24" fill="currentColor">
                <path
                  d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 3c1.66 0 3 1.34 3 3s-1.34 3-3 3-3-1.34-3-3 1.34-3 3-3zm0 14.2c-2.5 0-4.71-1.28-6-3.22.03-1.99 4-3.08 6-3.08 1.99 0 5.97 1.09 6 3.08-1.29 1.94-3.5 3.22-6 3.22z"
                />
              </svg>
            </div>
            <div class="svg-frame-overlay" v-html="charFrameSvg"></div>
          </div>
          <!-- CSS 頭像框 -->
          <template v-else>
            <img
              v-if="avatar"
              :src="avatar"
              :alt="senderName"
              class="soft-avatar"
              :class="{ 'has-frame': !!charFrameId }"
              :style="charFrameStyle"
            />
            <div v-else class="avatar-placeholder">
              <svg viewBox="0 0 24 24" fill="currentColor">
                <path
                  d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 3c1.66 0 3 1.34 3 3s-1.34 3-3 3-3-1.34-3-3 1.34-3 3-3zm0 14.2c-2.5 0-4.71-1.28-6-3.22.03-1.99 4-3.08 6-3.08 1.99 0 5.97 1.09 6 3.08-1.29 1.94-3.5 3.22-6 3.22z"
                />
              </svg>
            </div>
          </template>
        </template>
      </div>

      <!-- 訊息內容區 -->
      <div class="message-content">
        <!-- 發送者名稱（群聊模式顯示發送者角色名） -->
        <div
          v-if="!isUser && (isGroupChat ? senderCharacterName : senderName)"
          class="sender-name"
        >
          {{ isGroupChat ? senderCharacterName : senderName }}
        </div>

        <!-- 回覆引用 (移至氣泡外) -->
        <div
          v-if="replyToContent"
          class="reply-quote-floating"
          @click.stop="handleReplyClick"
        >
          <div class="reply-bar"></div>
          <div class="reply-body">
            <span v-if="replyToName" class="reply-name">{{ replyToName }}</span>
            <span class="reply-text">{{ replyToContent }}</span>
          </div>
        </div>

        <!-- 位置分享（獨立卡片，不在氣泡內） -->
        <div v-if="isLocation" class="location-bubble-card">
          <!-- 地圖區域 -->
          <div class="location-map-area">
            <!-- 街區背景 -->
            <div class="map-bg"></div>

            <!-- 道路網格 -->
            <div class="map-roads">
              <div class="road-h road-h-1"></div>
              <div class="road-h road-h-2"></div>
              <div class="road-v road-v-1"></div>
              <div class="road-v road-v-2"></div>
            </div>

            <!-- 裝飾性建築塊 -->
            <div class="map-block block-1"></div>
            <div class="map-block block-2"></div>
            <div class="map-park"></div>

            <!-- 位置標記 -->
            <div class="map-marker">
              <div class="marker-head">
                <div class="marker-dot"></div>
              </div>
              <div class="marker-point"></div>
            </div>
          </div>

          <!-- 資訊區域 -->
          <div class="location-info-area">
            <div class="location-text-col">
              <div class="location-title">位置分享</div>
              <div class="location-address">{{ locationContent }}</div>
            </div>
            <div class="location-action-icon">
              <!-- 導航圖標 -->
              <svg viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2L4.5 20.29l.71.71L12 18l6.79 3 .71-.71z" />
              </svg>
            </div>
          </div>
        </div>

        <!-- 氣泡（位置消息不顯示氣泡） -->
        <div
          v-if="!isLocation"
          class="bubble"
          :class="{
            user: isUser,
            ai: !isUser,
            streaming: isStreaming,
            'has-thought': !!effectiveThought,
            'thought-expanded': showThought,
            'transparent-bubble':
              (isHtmlBlock && htmlBlockSrcdoc) || regexHtmlDoc,
            'menu-active': showMenu,
          }"
          @click.stop="onBubbleClick"
        >
          <!-- 時空跳轉訊息 -->
          <div v-if="isTimetravel" class="timetravel-message">
            <div class="timetravel-icon">⏰</div>
            <div class="timetravel-content">{{ timetravelContent }}</div>
          </div>

          <!-- 紅包訊息 -->
          <div
            v-else-if="isRedpacket && redpacketData"
            class="redpacket-message"
          >
            <div class="redpacket-icon">🧧</div>
            <div class="redpacket-info">
              <div class="redpacket-amount">{{ redpacketData.amount }}</div>
              <div class="redpacket-blessing">{{ redpacketData.blessing }}</div>
            </div>
          </div>

          <!-- 禮物寶箱訊息 -->
          <div v-else-if="isGift && giftName" class="pixel-gift-wrapper">
            <PixelGiftChest
              :gift-name="giftName"
              :receiver-mode="role === 'user'"
              :received="giftReceived"
            />
          </div>

          <!-- 群聊記錄卡片 -->
          <div
            v-else-if="isGroupChatHistory && groupChatHistoryData"
            class="group-chat-history-wrapper"
          >
            <GroupChatHistoryCard
              :group-name="groupChatHistoryData.groupName"
              :messages="groupChatHistoryData.messages"
              @view="showGroupChatHistoryModal = true"
            />
          </div>

          <!-- 轉帳訊息（可能同時有文字內容） -->
          <div
            v-else-if="isTransfer && transferAmount"
            class="transfer-message-wrapper"
          >
            <!-- 如果有文字內容，先顯示文字 -->
            <template v-if="content && content.trim()">
              <!-- 包含圖片/表情包的消息 -->
              <div v-if="hasMedia" class="message-mixed">
                <template v-for="(part, idx) in messageParts" :key="idx">
                  <!-- 表情包 -->
                  <div
                    v-if="part.type === 'sticker' && part.url"
                    class="message-sticker-wrapper"
                  >
                    <img
                      :src="getProxiedImageUrl(part.url)"
                      :data-original-url="part.url"
                      :alt="part.name"
                      :title="part.name"
                      class="message-sticker"
                      referrerpolicy="no-referrer"
                      @error="onImageError"
                    />
                  </div>
                  <!-- 表情包URL為空時顯示文本 -->
                  <span
                    v-else-if="part.type === 'sticker' && !part.url"
                    class="sticker-text-fallback"
                    >[sticker:{{ part.name }}]</span
                  >
                  <!-- 普通圖片 -->
                  <img
                    v-else-if="part.type === 'image'"
                    :src="part.url || ''"
                    :alt="part.name"
                    :title="part.name"
                    class="message-image"
                    referrerpolicy="no-referrer"
                    loading="lazy"
                    @error="onImageError"
                  />
                  <!-- 文字 -->
                  <div
                    v-else-if="part.type === 'text'"
                    class="bubble-text"
                    v-html="parsedTextParts[idx]"
                  ></div>
                </template>
              </div>
              <!-- 純文字訊息 -->
              <div
                v-else
                class="bubble-text"
                v-html="renderedContent"
                @click="onBubbleTextClick"
              ></div>
            </template>
            <div class="pixel-transfer-wrapper">
              <PixelTransferCard
                :amount="transferAmount"
                :note="transferNote"
                :transfer-type="transferType"
                :status="transferStatus"
                @accept="emit('acceptTransfer', id)"
                @refund="emit('refundTransfer', id)"
              />
            </div>
          </div>

          <!-- 外賣訊息卡片 -->
          <div
            v-else-if="
              waimaiOrder &&
              (isWaimaiShare ||
                isWaimaiPaymentRequest ||
                isWaimaiPaymentConfirm ||
                isWaimaiPaymentResult ||
                isWaimaiProgress ||
                isWaimaiDelivery)
            "
            class="waimai-message-wrapper"
          >
            <div class="waimai-card">
              <div class="waimai-card-head">
                <span class="waimai-card-title">{{ waimaiCardTitle }}</span>
                <span v-if="waimaiStatusLabel" class="waimai-status">{{
                  waimaiStatusLabel
                }}</span>
              </div>

              <div class="waimai-item-row">
                <img
                  v-if="waimaiOrder.item.imageUrl"
                  :src="getProxiedUrl(waimaiOrder.item.imageUrl)"
                  :alt="waimaiOrder.item.name"
                  class="waimai-item-image"
                />
                <div class="waimai-item-meta">
                  <div class="waimai-item-name">
                    {{ waimaiOrder.item.name }}
                  </div>
                  <div class="waimai-item-store">
                    {{ waimaiOrder.item.storeName }}
                  </div>
                  <div class="waimai-item-qty">
                    x{{ waimaiOrder.item.quantity }}
                  </div>
                </div>
              </div>

              <div class="waimai-price-grid">
                <span>小計</span>
                <span>{{ formatWaimaiPrice(waimaiOrder.subtotal) }}</span>
                <span>運費</span>
                <span>{{ formatWaimaiPrice(waimaiOrder.shippingFee) }}</span>
                <span class="total-label">總計</span>
                <span class="total-value">{{
                  formatWaimaiPrice(waimaiOrder.totalPrice)
                }}</span>
              </div>

              <div class="waimai-recipient">
                送達給：{{ waimaiOrder.recipientName }}
              </div>
              <div v-if="waimaiDestinationText" class="waimai-destination">
                收貨地：{{ waimaiDestinationText }}
              </div>
              <div v-if="waimaiOrder.eta" class="waimai-eta-row">
                <span class="waimai-eta-text">{{ waimaiEtaText }}</span>
                <span v-if="waimaiRouteBadge" class="waimai-route-badge">{{
                  waimaiRouteBadge
                }}</span>
              </div>
              <div v-if="waimaiDelayReason" class="waimai-delay-reason">
                {{ waimaiDelayReason }}
              </div>
              <div v-if="waimaiSummaryText" class="waimai-card-foot">
                {{ waimaiSummaryText }}
              </div>
            </div>
          </div>

          <!-- 真實圖片訊息（拍立得樣式） -->
          <div
            v-else-if="
              (messageType === 'image' || messageType === 'image-url') &&
              (resolvedImageUrl || isLoadingImage)
            "
            class="polaroid-photo-container"
            @click="showPhotoPreview = true"
          >
            <div class="polaroid-photo-overlay"></div>
            <div class="polaroid-photo-image">
              <div
                v-if="isLoadingImage && !resolvedImageUrl"
                class="image-loading-placeholder"
              >
                <span>載入中…</span>
              </div>
              <img
                v-else
                :src="resolvedImageUrl"
                alt="上傳的圖片"
                referrerpolicy="no-referrer"
                loading="lazy"
                @error="onImageError"
              />
            </div>
            <div class="polaroid-photo-caption">{{ imageCaption || "" }}</div>
            <div class="polaroid-photo-date">{{ formattedPhotoDate }}</div>
          </div>

          <!-- 音頻訊息（有實際音頻 blob） -->
          <div
            v-else-if="isAudioMessage && hasAudioAvailable"
            class="audio-message-container"
          >
            <div class="audio-row">
              <div
                class="audio-bubble"
                :class="{ playing: isThisPlaying }"
                @click.stop="toggleAudioPlay"
              >
                <button class="audio-play-btn" type="button">
                  <!-- 播放圖標 -->
                  <svg
                    v-if="!isThisPlaying"
                    viewBox="0 0 24 24"
                    fill="currentColor"
                    class="audio-icon"
                  >
                    <path d="M8 5v14l11-7z" />
                  </svg>
                  <!-- 暫停圖標 -->
                  <svg
                    v-else
                    viewBox="0 0 24 24"
                    fill="currentColor"
                    class="audio-icon"
                  >
                    <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
                  </svg>
                </button>
                <div class="audio-info">
                  <div
                    class="audio-waveform"
                    @pointerdown="onProgressPointerDown"
                    @pointermove="onProgressPointerMove"
                    @pointerup="onProgressPointerUp"
                  >
                    <div
                      v-for="(bar, i) in audioWaveform?.length
                        ? audioWaveform
                        : Array(20).fill(0.3)"
                      :key="i"
                      class="waveform-bar"
                      :class="{
                        active:
                          audioProgress > i / (audioWaveform?.length || 20),
                      }"
                      :style="{ height: Math.max(3, bar * 18) + 'px' }"
                    ></div>
                  </div>
                  <div class="audio-meta">
                    <span class="audio-duration">{{
                      formattedAudioDuration
                    }}</span>
                  </div>
                </div>
              </div>
              <!-- 轉文字按鈕 -->
              <button
                class="stt-btn"
                :class="{
                  transcribing: isTranscribing,
                  'has-transcript': !!displayTranscript,
                }"
                type="button"
                @click.stop="transcribeWithQwenASR"
              >
                <span v-if="isTranscribing" class="stt-dot"></span>
                <span class="stt-label">{{
                  isTranscribing
                    ? "識別中"
                    : displayTranscript
                      ? showTranscript
                        ? "收起"
                        : "轉文字"
                      : "轉文字"
                }}</span>
              </button>
            </div>
            <!-- 轉文字結果 -->
            <div
              v-if="showTranscript && displayTranscript"
              class="stt-transcript"
              @click.stop
            >
              {{ displayTranscript }}
            </div>
          </div>

          <!-- 文字語音訊息（無音頻 blob，僅有文字 transcript） -->
          <div
            v-else-if="isAudioMessage && !hasAudioAvailable"
            class="audio-message-container text-voice-message"
          >
            <div class="audio-row">
              <div class="audio-bubble text-voice-bubble">
                <svg
                  viewBox="0 0 24 24"
                  fill="currentColor"
                  class="audio-icon text-voice-icon"
                >
                  <path
                    d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm-1-9c0-.55.45-1 1-1s1 .45 1 1v6c0 .55-.45 1-1 1s-1-.45-1-1V5z"
                  />
                  <path
                    d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"
                  />
                </svg>
                <div class="audio-info">
                  <div class="audio-waveform text-voice-waveform">
                    <div
                      v-for="i in 20"
                      :key="i"
                      class="waveform-bar active"
                      :style="{
                        height:
                          Math.max(3, (Math.sin(i * 0.8) * 0.5 + 0.5) * 14) +
                          'px',
                      }"
                    ></div>
                  </div>
                </div>
              </div>
              <!-- 展開/收起按鈕 -->
              <button
                class="stt-btn"
                :class="{
                  'has-transcript': showTextVoiceTranscript,
                }"
                type="button"
                @click.stop="showTextVoiceTranscript = !showTextVoiceTranscript"
              >
                <span class="stt-label">{{
                  showTextVoiceTranscript ? "收起" : "展開"
                }}</span>
              </button>
            </div>
            <!-- 文字語音直接顯示文字內容（支援 TTS 行內播放按鈕） -->
            <div
              v-if="showTextVoiceTranscript"
              class="stt-transcript text-voice-transcript"
              v-html="renderedVoiceTranscript"
              @click="onBubbleTextClick"
            ></div>
          </div>

          <!-- HTML 區塊（完整 HTML 文件，用 iframe 渲染） -->
          <div
            v-else-if="isHtmlBlock && htmlBlockSrcdoc"
            class="html-block-wrapper"
          >
            <iframe
              ref="htmlBlockIframeRef"
              :srcdoc="htmlBlockSrcdoc"
              class="html-block-iframe"
              :style="{ height: htmlBlockIframeHeight + 'px' }"
              sandbox="allow-scripts"
              frameborder="0"
              scrolling="no"
            ></iframe>
          </div>

          <!-- 一般文字訊息 -->
          <template v-else>
            <!-- streaming 時只顯示 typing dots，不顯示累積文字 -->
            <div v-if="isStreaming" class="typing-dots">
              <span></span><span></span><span></span>
            </div>
            <!-- 包含圖片/表情包的消息 -->
            <div v-if="!isStreaming && hasMedia" class="message-mixed">
              <template v-for="(part, idx) in messageParts" :key="idx">
                <!-- 表情包 -->
                <div
                  v-if="part.type === 'sticker' && part.url"
                  class="message-sticker-wrapper"
                >
                  <img
                    :src="getProxiedImageUrl(part.url)"
                    :data-original-url="part.url"
                    :alt="part.name"
                    :title="part.name"
                    class="message-sticker"
                    referrerpolicy="no-referrer"
                    @error="onImageError"
                  />
                </div>
                <!-- 表情包URL為空時顯示文本 -->
                <span
                  v-else-if="part.type === 'sticker' && !part.url"
                  class="sticker-text-fallback"
                  >[sticker:{{ part.name }}]</span
                >
                <!-- 普通圖片 -->
                <img
                  v-else-if="part.type === 'image'"
                  :src="part.url || ''"
                  :alt="part.name"
                  :title="part.name"
                  class="message-image"
                  referrerpolicy="no-referrer"
                  loading="lazy"
                  @error="onImageError"
                />
                <!-- 文字 -->
                <div
                  v-else-if="part.type === 'text'"
                  class="bubble-text"
                  v-html="parsedTextParts[idx]"
                ></div>
              </template>
            </div>
            <!-- 純文字訊息 -->
            <template v-else-if="!isStreaming">
              <!-- regex 產生的完整 HTML：用 iframe 渲染（script 才能執行） -->
              <iframe
                v-if="regexHtmlDoc"
                ref="regexIframeRef"
                :srcdoc="regexHtmlDoc"
                class="regex-html-iframe"
                :style="{ height: regexIframeHeight + 'px' }"
                sandbox="allow-scripts"
                frameborder="0"
                scrolling="no"
              ></iframe>
              <div
                v-else
                class="bubble-text"
                v-html="renderedContent"
                @click="onBubbleTextClick"
              ></div>
            </template>
          </template>

          <!-- 私信指示器 -->
          <div v-if="isPrivateMessage" class="private-message-indicator">
            <svg viewBox="0 0 24 24" fill="currentColor" class="dm-icon">
              <path
                d="M20 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z"
              />
            </svg>
            <span>私信</span>
          </div>

          <!-- MiniMax TTS 語音播放 -->
          <!-- 舊版：單段播放（向下相容，新版已改為行內按鈕） -->
          <div
            v-if="hasTTSLegacy && !isStreaming"
            class="tts-player"
            @click.stop="toggleTTSLegacy"
          >
            <svg
              v-if="!isTTSPlaying"
              viewBox="0 0 24 24"
              fill="currentColor"
              class="tts-icon"
            >
              <path
                d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"
              />
            </svg>
            <svg
              v-else
              viewBox="0 0 24 24"
              fill="currentColor"
              class="tts-icon tts-playing"
            >
              <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
            </svg>
            <span class="tts-label">語音</span>
          </div>
        </div>

        <!-- 想法氣泡（展開時顯示，在主氣泡外面） -->
        <Transition name="thought-pop">
          <div
            v-if="effectiveThought && showThought"
            class="thought-bubble"
            @click.stop="toggleThought"
          >
            <div class="thought-bubble-content">
              <span class="thought-icon">💭</span>
              <span class="thought-text-content">{{ effectiveThought }}</span>
            </div>
            <div class="thought-bubble-tail"></div>
          </div>
        </Transition>

        <!-- 滑動控制區（單條訊息 swipe） -->
        <div v-if="hasSwipes && !isUser" class="swipe-controls">
          <button
            class="swipe-btn"
            @click.stop="handleSwipePrev"
            title="上一個回覆"
          >
            <svg viewBox="0 0 24 24" fill="currentColor">
              <path d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z" />
            </svg>
          </button>
          <span class="swipe-count">{{ swipeCountText }}</span>
          <button
            class="swipe-btn"
            @click.stop="handleSwipeNext"
            title="下一個回覆"
          >
            <svg viewBox="0 0 24 24" fill="currentColor">
              <path d="M8.59 16.59L10 18l6-6-6-6-1.41 1.41L13.17 12z" />
            </svg>
          </button>
        </div>

        <!-- 整輪滑動控制區（roundSwipe） -->
        <div
          v-if="hasRoundSwipes && !isUser"
          class="swipe-controls round-swipe-controls"
        >
          <button
            class="swipe-btn round-swipe-btn"
            @click.stop="handleRoundSwipePrev"
            title="上一輪回覆"
          >
            <svg viewBox="0 0 24 24" fill="currentColor">
              <path d="M18.41 16.59L13.82 12l4.59-4.59L17 6l-6 6 6 6z" />
              <path d="M12.41 16.59L7.82 12l4.59-4.59L11 6l-6 6 6 6z" />
            </svg>
          </button>
          <span class="swipe-count round-swipe-count">
            <svg viewBox="0 0 24 24" fill="currentColor" class="round-icon">
              <path
                d="M12 4V1L8 5l4 4V6c3.31 0 6 2.69 6 6 0 1.01-.25 1.97-.7 2.8l1.46 1.46C19.54 15.03 20 13.57 20 12c0-4.42-3.58-8-8-8zm0 14c-3.31 0-6-2.69-6-6 0-1.01.25-1.97.7-2.8L5.24 7.74C4.46 8.97 4 10.43 4 12c0 4.42 3.58 8 8 8v3l4-4-4-4v3z"
              />
            </svg>
            {{ roundSwipeCountText }}
          </span>
          <button
            class="swipe-btn round-swipe-btn"
            @click.stop="handleRoundSwipeNext"
            title="下一輪回覆"
          >
            <svg viewBox="0 0 24 24" fill="currentColor">
              <path d="M5.59 7.41L10.18 12l-4.59 4.59L7 18l6-6-6-6z" />
              <path d="M11.59 7.41L16.18 12l-4.59 4.59L13 18l6-6-6-6z" />
            </svg>
          </button>
        </div>

        <!-- 時間戳 -->
        <div v-if="timestamp" class="message-time">
          {{ formattedTime }}
        </div>
      </div>

      <!-- 用戶頭像（右側） -->
      <div v-if="isUser && showAvatar" class="avatar-container user-avatar">
        <!-- 圖片圖層頭像框 -->
        <div v-if="isUserFrameImage" class="avatar-with-image-frame">
          <!-- 背景層 -->
          <img
            v-if="userFrameLayers?.background"
            :src="getLayerSrc(userFrameLayers.background)"
            class="image-frame-layer background-layer"
            :style="{
              transform: getLayerTransform(userFrameLayers.background),
              filter: userFrameLayers.background.filter,
            }"
          />
          <!-- 頭像 -->
          <img
            v-if="userAvatar"
            :src="userAvatar"
            alt="用戶"
            class="soft-avatar image-frame-avatar"
          />
          <div v-else class="avatar-placeholder image-frame-avatar">
            <svg viewBox="0 0 24 24" fill="currentColor">
              <path
                d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 3c1.66 0 3 1.34 3 3s-1.34 3-3 3-3-1.34-3-3 1.34-3 3-3zm0 14.2c-2.5 0-4.71-1.28-6-3.22.03-1.99 4-3.08 6-3.08 1.99 0 5.97 1.09 6 3.08-1.29 1.94-3.5 3.22-6 3.22z"
              />
            </svg>
          </div>
          <!-- 覆蓋層 -->
          <img
            v-if="userFrameLayers?.overlay"
            :src="getLayerSrc(userFrameLayers.overlay)"
            class="image-frame-layer overlay-layer"
            :style="{
              transform: getLayerTransform(userFrameLayers.overlay),
              filter: userFrameLayers.overlay.filter,
            }"
          />
          <!-- 裝飾層 -->
          <img
            v-if="userFrameLayers?.decoration"
            :src="getLayerSrc(userFrameLayers.decoration)"
            class="image-frame-layer decoration-layer"
            :style="{
              transform: getLayerTransform(userFrameLayers.decoration),
              filter: userFrameLayers.decoration.filter,
            }"
          />
        </div>
        <!-- SVG 頭像框 -->
        <div v-else-if="isUserFrameSvg" class="avatar-with-svg-frame">
          <img
            v-if="userAvatar"
            :src="userAvatar"
            alt="用戶"
            class="soft-avatar svg-frame-avatar"
          />
          <div v-else class="avatar-placeholder svg-frame-avatar">
            <svg viewBox="0 0 24 24" fill="currentColor">
              <path
                d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 3c1.66 0 3 1.34 3 3s-1.34 3-3 3-3-1.34-3-3 1.34-3 3-3zm0 14.2c-2.5 0-4.71-1.28-6-3.22.03-1.99 4-3.08 6-3.08 1.99 0 5.97 1.09 6 3.08-1.29 1.94-3.5 3.22-6 3.22z"
              />
            </svg>
          </div>
          <div class="svg-frame-overlay" v-html="userFrameSvg"></div>
        </div>
        <!-- CSS 頭像框 -->
        <template v-else>
          <img
            v-if="userAvatar"
            :src="userAvatar"
            alt="用戶"
            class="soft-avatar"
            :class="{ 'has-frame': !!userFrameId }"
            :style="userFrameStyle"
          />
          <div v-else class="avatar-placeholder">
            <svg viewBox="0 0 24 24" fill="currentColor">
              <path
                d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 3c1.66 0 3 1.34 3 3s-1.34 3-3 3-3-1.34-3-3 1.34-3 3-3zm0 14.2c-2.5 0-4.71-1.28-6-3.22.03-1.99 4-3.08 6-3.08 1.99 0 5.97 1.09 6 3.08-1.29 1.94-3.5 3.22-6 3.22z"
              />
            </svg>
          </div>
        </template>
      </div>
    </template>

    <!-- 操作選單 -->
    <Transition name="menu-pop">
      <div v-if="showMenu" class="message-menu" @click.stop>
        <div class="menu-backdrop" @click="closeMenu"></div>
        <div class="menu-content">
          <!-- 系統消息選單（跳轉魔法/小劇場） -->
          <template v-if="isSystem">
            <button class="menu-item" @click="handleCopy">
              <svg viewBox="0 0 24 24" fill="currentColor">
                <path
                  d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"
                />
              </svg>
              <span>複製</span>
            </button>
            <div class="menu-divider"></div>
            <button class="menu-item" @click="handleEdit">
              <svg viewBox="0 0 24 24" fill="currentColor">
                <path
                  d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"
                />
              </svg>
              <span>編輯</span>
            </button>
            <div class="menu-divider"></div>
            <button class="menu-item danger" @click="handleDelete">
              <svg viewBox="0 0 24 24" fill="currentColor">
                <path
                  d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"
                />
              </svg>
              <span>刪除</span>
            </button>
          </template>
          <!-- 一般消息選單 -->
          <template v-else>
            <button class="menu-item" @click="handleReply">
              <svg viewBox="0 0 24 24" fill="currentColor">
                <path
                  d="M10 9V5l-7 7 7 7v-4.1c5 0 8.5 1.6 11 5.1-1-5-4-10-11-11z"
                />
              </svg>
              <span>回覆</span>
            </button>
            <div class="menu-divider"></div>
            <button class="menu-item" @click="handleCopy">
              <svg viewBox="0 0 24 24" fill="currentColor">
                <path
                  d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"
                />
              </svg>
              <span>複製</span>
            </button>
            <div class="menu-divider"></div>
            <button class="menu-item" @click="handleEdit">
              <svg viewBox="0 0 24 24" fill="currentColor">
                <path
                  d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"
                />
              </svg>
              <span>編輯</span>
            </button>
            <div class="menu-divider"></div>
            <button class="menu-item" @click="handleBatchScreenshot">
              <svg viewBox="0 0 24 24" fill="currentColor">
                <path
                  d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z"
                />
              </svg>
              <span>截圖</span>
            </button>
            <template v-if="!isUser">
              <div class="menu-divider"></div>
              <button class="menu-item" @click="handleRegenerate">
                <svg viewBox="0 0 24 24" fill="currentColor">
                  <path
                    d="M17.65 6.35C16.2 4.9 14.21 4 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08c-.82 2.33-3.04 4-5.65 4-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"
                  />
                </svg>
                <span>重新生成</span>
              </button>
            </template>
            <div class="menu-divider"></div>
            <button class="menu-item" @click="handleBranch">
              <svg viewBox="0 0 24 24" fill="currentColor">
                <path
                  d="M17 12c-1.11 0-2 .89-2 2s.89 2 2 2 2-.89 2-2-.89-2-2-2zM7 8c-1.11 0-2 .89-2 2s.89 2 2 2 2-.89 2-2-.89-2-2-2zm0 8c-1.11 0-2 .89-2 2s.89 2 2 2 2-.89 2-2-.89-2-2-2zm10-12c-1.11 0-2 .89-2 2s.89 2 2 2 2-.89 2-2-.89-2-2-2zM7 4C5.34 4 4 5.34 4 7s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3zm0 8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3zm10-4c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3zm-5-4H9v2h3v3h2V6h3V4h-3V1h-2v3z"
                />
              </svg>
              <span>分支</span>
            </button>
            <div class="menu-divider"></div>
            <button class="menu-item" @click="handleMultiDelete">
              <svg viewBox="0 0 24 24" fill="currentColor">
                <path
                  d="M3 5h2V3c-1.1 0-2 .9-2 2zm0 8h2v-2H3v2zm4 8h2v-2H7v2zM3 9h2V7H3v2zm10-6h-2v2h2V3zm6 0v2h2c0-1.1-.9-2-2-2zM5 21v-2H3c0 1.1.9 2 2 2zm-2-4h2v-2H3v2zM9 3H7v2h2V3zm2 18h2v-2h-2v2zm8-8h2v-2h-2v2zm0 8c1.1 0 2-.9 2-2h-2v2zm0-12h2V7h-2v2zm0 8h2v-2h-2v2zm-4 4h2v-2h-2v2zm0-16h2V3h-2v2zM7 17h10V7H7v10zm2-8h6v6H9V9z"
                />
              </svg>
              <span>批量刪除</span>
            </button>
            <div class="menu-divider"></div>
            <button class="menu-item danger" @click="handleDelete">
              <svg viewBox="0 0 24 24" fill="currentColor">
                <path
                  d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"
                />
              </svg>
              <span>刪除</span>
            </button>
          </template>
        </div>
      </div>
    </Transition>
  </div>

  <!-- 群聊記錄查看 Modal -->
  <GroupChatHistoryModal
    v-if="showGroupChatHistoryModal && groupChatHistoryData"
    :group-name="groupChatHistoryData.groupName"
    :messages="groupChatHistoryData.messages"
    @close="showGroupChatHistoryModal = false"
  />

  <!-- 照片預覽 Modal -->
  <PhotoPreviewModal
    v-if="resolvedImageUrl"
    :visible="showPhotoPreview"
    :image-url="resolvedImageUrl"
    :caption="imageCaption"
    :date="formattedPhotoDate"
    @update:visible="showPhotoPreview = $event"
  />
</template>

<style lang="scss" scoped>
.regex-html-iframe {
  width: 100%;
  border: none;
  border-radius: 0;
  background: transparent;
  overflow: hidden;
}

.html-block-wrapper {
  width: 100%;
  overflow: hidden;
  border-radius: 0;
}

.html-block-iframe {
  width: 100%;
  border: none;
  border-radius: 0;
  background: transparent;
  overflow: hidden;
}

.message-wrapper {
  display: flex;
  gap: 10px;
  padding: 4px 0;
  position: relative;

  &.user {
    justify-content: flex-end;
  }

  &.system {
    justify-content: center;
  }

  &.selected {
    background: var(--color-primary-light);
    border-radius: var(--radius-lg);
    margin: 0 -8px;
    padding: 4px 8px;
  }

  // 搜索高亮
  &.search-highlight {
    .bubble {
      box-shadow: 0 0 0 2px var(--color-primary);
    }
  }

  &.current-search {
    .bubble {
      box-shadow: 0 0 0 3px var(--color-primary);
      animation: search-pulse 1s ease-in-out;
    }
  }
}

@keyframes search-pulse {
  0%,
  100% {
    box-shadow: 0 0 0 3px var(--color-primary);
  }
  50% {
    box-shadow:
      0 0 0 5px var(--color-primary),
      0 0 12px var(--color-primary);
  }
}

// 系統訊息
.system-message {
  padding: 8px 16px;
  background: rgba(0, 0, 0, 0.05);
  border-radius: var(--radius-full);
  font-size: 12px;
  color: var(--color-text-muted);
  text-align: center;
}

// 角色封鎖用戶通知
.char-blocked-notification {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: 4px 16px;
  width: 100%;
}

.char-blocked-notification-line {
  width: 40%;
  height: 1px;
  background: rgba(255, 80, 80, 0.3);
}

.char-blocked-notification-body {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: rgba(200, 60, 60, 0.85);
}

.char-blocked-why-btn {
  font-size: 11px;
  color: var(--color-primary, #6c8ebf);
  background: none;
  border: none;
  padding: 0 2px;
  cursor: pointer;
  text-decoration: underline;
  text-underline-offset: 2px;
  &:hover {
    opacity: 0.75;
  }
}

.char-blocked-reason-panel {
  font-size: 12px;
  color: var(--color-text-secondary);
  background: var(--color-surface-raised, rgba(0, 0, 0, 0.04));
  border-radius: 8px;
  padding: 6px 12px;
  max-width: 240px;
  text-align: center;
  line-height: 1.5;
}

// 群聊記錄卡片（系統訊息樣式）
.group-chat-history-system-message {
  display: flex;
  justify-content: center;
  padding: 8px 16px;
}

// 群通話記錄卡片（系統訊息樣式）
.group-call-history-system-message {
  display: flex;
  justify-content: center;
  padding: 8px 16px;
}

// 電話通話紀錄卡片
.phone-call-summary-message {
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: min(100%, 560px);
  padding: 10px 14px;
  border-radius: 14px;
  border: 1px solid rgba(148, 163, 184, 0.28);
  background: linear-gradient(
    180deg,
    rgba(248, 250, 252, 0.9) 0%,
    rgba(241, 245, 249, 0.92) 100%
  );
  box-shadow:
    0 1px 2px rgba(15, 23, 42, 0.08),
    0 6px 16px rgba(15, 23, 42, 0.06);

  .summary-head {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    flex-wrap: wrap;
  }

  .summary-title {
    font-size: 12px;
    font-weight: 600;
    color: #475569;
    letter-spacing: 0.2px;
  }

  .summary-duration {
    font-size: 11px;
    color: #64748b;
    background: rgba(148, 163, 184, 0.16);
    border-radius: 999px;
    padding: 2px 8px;
  }

  .summary-body {
    font-size: 12px;
    line-height: 1.5;
    color: #64748b;
    text-align: left;
    white-space: pre-wrap;
    word-break: break-word;
    background: rgba(255, 255, 255, 0.7);
    border-radius: 10px;
    padding: 8px 10px;
    max-height: 120px;
    overflow: auto;
  }
}

// 通話通知卡片
.call-notification-card {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 6px 14px;
  background: rgba(0, 0, 0, 0.04);
  border-radius: var(--radius-full);

  .call-notification-icon {
    width: 14px;
    height: 14px;
    flex-shrink: 0;
    color: #9ca3af;

    &.declined {
      color: #e53e3e;
    }
  }

  .call-notification-text {
    font-size: 12px;
    color: var(--color-text-muted);
  }

  .call-notification-time {
    font-size: 11px;
    color: var(--color-text-muted);
    opacity: 0.7;
  }
}

// 頭像
.avatar-container {
  flex-shrink: 0;
  width: var(--avatar-size, 40px);
  height: var(--avatar-size, 40px);

  .soft-avatar {
    width: 100%;
    height: 100%;

    // 有頭像框時的樣式
    &.has-frame {
      border-radius: var(--avatar-border-radius, 50%);
    }
  }
}

// SVG 頭像框容器
.avatar-with-svg-frame {
  position: relative;
  width: 100%;
  height: 100%;

  .svg-frame-avatar {
    position: absolute;
    // 頭像在 SVG 框內的位置（根據 SVG viewBox 280x280，頭像區域在 40,40 到 240,240）
    top: 14.3%; // 40/280
    left: 14.3%;
    width: 71.4%; // 200/280
    height: 71.4%;
    border-radius: 50%;
    object-fit: cover;
    z-index: 1;
  }

  .svg-frame-overlay {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    z-index: 2;
    pointer-events: none;

    :deep(svg) {
      width: 100%;
      height: 100%;
    }
  }
}

// 圖片圖層頭像框
.avatar-with-image-frame {
  position: relative;
  width: 48px;
  height: 48px;

  .image-frame-avatar {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    width: 36px;
    height: 36px;
    border-radius: 50%;
    object-fit: cover;
    z-index: 1;
  }

  .image-frame-layer {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    object-fit: contain;
    pointer-events: none;

    &.background-layer {
      z-index: 0;
    }

    &.overlay-layer {
      z-index: 2;
    }

    &.decoration-layer {
      z-index: 3;
    }
  }

  .avatar-placeholder {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    width: 36px;
    height: 36px;
    border-radius: 50%;
    background: var(--color-surface);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1;

    svg {
      width: 24px;
      height: 24px;
      color: var(--color-text-secondary);
    }
  }
}

// 頭像框動畫
@keyframes ocean-shimmer {
  0%,
  100% {
    box-shadow:
      0 0 12px rgba(79, 195, 247, 0.6),
      0 0 20px rgba(79, 195, 247, 0.3);
  }
  50% {
    box-shadow:
      0 0 18px rgba(79, 195, 247, 0.8),
      0 0 30px rgba(79, 195, 247, 0.5);
  }
}

@keyframes gold-glow {
  0%,
  100% {
    box-shadow:
      0 0 15px rgba(255, 215, 0, 0.7),
      0 0 30px rgba(255, 215, 0, 0.3);
  }
  50% {
    box-shadow:
      0 0 25px rgba(255, 215, 0, 0.9),
      0 0 45px rgba(255, 215, 0, 0.5);
  }
}

@keyframes fire-flicker {
  0% {
    box-shadow:
      0 0 20px rgba(255, 107, 53, 0.8),
      0 0 40px rgba(255, 69, 0, 0.4);
  }
  100% {
    box-shadow:
      0 0 25px rgba(255, 140, 0, 0.9),
      0 0 50px rgba(255, 69, 0, 0.6);
  }
}

@keyframes dragon-pulse {
  0%,
  100% {
    box-shadow:
      0 0 20px rgba(156, 39, 176, 0.8),
      0 0 40px rgba(156, 39, 176, 0.4),
      0 0 60px rgba(103, 58, 183, 0.3);
  }
  50% {
    box-shadow:
      0 0 30px rgba(156, 39, 176, 1),
      0 0 55px rgba(156, 39, 176, 0.6),
      0 0 80px rgba(103, 58, 183, 0.5);
  }
}

.avatar-placeholder {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--color-background);
  border-radius: var(--avatar-border-radius, 50%);
  color: var(--color-text-muted);

  svg {
    width: 60%;
    height: 60%;
  }
}

// 訊息內容
.message-content {
  display: flex;
  flex-direction: column;
  max-width: var(--bubble-max-width, 75%);

  // 如果包含透明氣泡，放寬寬度限制以利於 HTML 渲染
  &:has(.transparent-bubble) {
    max-width: 95%;
    width: 100%;
  }

  .user & {
    align-items: flex-end;
  }
}

.sender-name {
  font-size: 12px;
  color: var(--color-text-secondary);
  margin-bottom: 4px;
  padding-left: 4px;
}

// 氣泡
.bubble {
  padding: 12px 16px;
  border-radius: var(--bubble-radius, 20px);
  font-size: var(--chat-font-size, 15px);
  font-family: var(--chat-font-family, inherit);
  line-height: 1.5;
  word-break: break-word;
  width: fit-content;
  max-width: 100%;
  transition: all 0.3s ease;

  // 菜單開啟時氣泡高亮
  &.menu-active {
    filter: brightness(0.88);
  }

  // 如果包含媒體描述，移除氣泡背景和內邊距
  &:has(.media-description) {
    background: transparent !important;
    padding: 0;
    box-shadow: none;
    border-radius: 0;
  }

  // 如果包含拍立得照片，移除氣泡背景和內邊距
  &:has(.polaroid-photo-container) {
    background: transparent !important;
    padding: 0;
    box-shadow: none;
    border-radius: 0;
  }

  // 如果包含禮物寶箱，移除氣泡背景和內邊距
  &:has(.pixel-gift-wrapper) {
    background: transparent !important;
    padding: 0;
    box-shadow: none;
    border-radius: 0;
  }

  // 如果是純轉帳訊息（沒有文字內容），移除氣泡背景和內邊距
  // 注意：如果同時有文字內容（.bubble-text），保留氣泡背景
  &:has(.transfer-message-wrapper):not(
      :has(.transfer-message-wrapper .bubble-text)
    ) {
    background: transparent !important;
    padding: 0;
    box-shadow: none;
    border-radius: 0;
  }

  // 如果只有轉帳卡片（沒有 transfer-message-wrapper 包裹），也移除氣泡背景
  &:has(> .pixel-transfer-wrapper) {
    background: transparent !important;
    padding: 0;
    box-shadow: none;
    border-radius: 0;
  }

  // 外賣卡片訊息不顯示預設氣泡底色
  &:has(.waimai-message-wrapper) {
    background: transparent !important;
    padding: 0;
    box-shadow: none;
    border-radius: 0;
  }

  // 如果包含 HTML 區塊 iframe 或 regex iframe，移除氣泡背景和內邊距，讓內容自由撐開
  &.transparent-bubble {
    background: transparent !important;
    padding: 0 !important;
    box-shadow: none !important;
    border-radius: 0 !important;
    width: 100% !important;
    max-width: 100% !important;
  }

  // 確保透明氣泡內的內容填滿寬度且沒有多餘間隙
  &.transparent-bubble iframe {
    display: block;
    width: 100%;
  }

  &.user {
    background: var(
      --bubble-user-bg,
      linear-gradient(135deg, #ff85a2, #ffb6c8)
    );
    border-bottom-right-radius: 6px;

    .message-time {
      color: var(--bubble-user-text, white);
    }
  }

  &.ai {
    background: var(--bubble-ai-bg, white);
    border-bottom-left-radius: 6px;
    box-shadow: var(--shadow-sm);

    .message-time {
      color: var(--bubble-ai-text, #4a4a6a);
    }

    // 有想法時發光效果
    &.has-thought {
      cursor: pointer;
      box-shadow:
        0 0 8px var(--thought-glow-1, rgba(173, 216, 230, 0.6)),
        0 0 16px var(--thought-glow-2, rgba(173, 216, 230, 0.4)),
        0 0 24px var(--thought-glow-3, rgba(173, 216, 230, 0.2));

      &:hover {
        box-shadow:
          0 0 12px var(--thought-glow-1, rgba(173, 216, 230, 0.8)),
          0 0 24px var(--thought-glow-2, rgba(173, 216, 230, 0.5)),
          0 0 36px var(--thought-glow-3, rgba(173, 216, 230, 0.3));
      }

      // 展開後停止發光
      &.thought-expanded {
        box-shadow: var(--shadow-sm);
      }
    }
  }
}

.bubble-text {
  :deep(p) {
    margin: 0;

    & + p {
      margin-top: 8px;
    }
  }

  :deep(code) {
    background: rgba(0, 0, 0, 0.1);
    padding: 2px 6px;
    border-radius: 4px;
    font-family: monospace;
    font-size: 14px;
  }

  :deep(pre) {
    background: rgba(0, 0, 0, 0.1);
    padding: 12px;
    border-radius: 8px;
    overflow-x: auto;
    margin: 8px 0;

    code {
      background: none;
      padding: 0;
    }
  }

  // 中文引號「」樣式
  :deep(.chinese-quote) {
    color: var(--chat-md-quote, #8b5a2b);
  }

  // 媒體描述樣式
  :deep(.media-description) {
    display: flex;
    gap: 12px;
    padding: 14px 16px;
    border-radius: 12px;
    color: white;
    align-items: flex-start;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);

    .media-icon {
      font-size: 28px;
      flex-shrink: 0;
      line-height: 1;
    }

    .media-content {
      flex: 1;
      line-height: 1.6;
      font-size: 14px;
    }

    // 影片描述樣式
    &.video-description {
      width: 320px;
      max-width: 100%;
      min-height: 180px;
      height: auto;
      background: #000;
      border-radius: 12px;
      position: relative;
      overflow: hidden;
      box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5);
      cursor: pointer;
      padding: 0;
      border: 1px solid #333;
      margin: 10px 0;

      .video-screen {
        width: 100%;
        min-height: 180px;
        height: auto;
        background: radial-gradient(circle at center, #1a1a1a 0%, #000000 100%);
        display: flex;
        flex-direction: column;
        justify-content: center;
        align-items: center;
        position: relative;
        padding: 40px 20px;
        font-family: "Courier New", Courier, monospace; /* Digital OSD feel */
      }

      .video-content {
        color: #fff;
        text-align: center;
        padding: 0 10px;
        z-index: 5;
        width: 100%;
        text-shadow: 0 1px 2px rgba(0, 0, 0, 0.8);
      }

      .video-title {
        font-size: 16px;
        margin-bottom: 8px;
        color: #fff;
        line-height: 1.4;
        font-weight: bold;
        letter-spacing: 0.5px;
      }

      /* OSD Elements (On Screen Display) */
      .video-time {
        font-size: 14px;
        color: #fff;
        position: absolute;
        bottom: 20px;
        right: 20px;
        z-index: 5;
        text-shadow: 0 0 4px rgba(0, 0, 0, 0.8);
      }

      .recording-indicator {
        position: absolute;
        top: 20px;
        left: 20px;
        display: flex;
        align-items: center;
        z-index: 5;
        background: rgba(0, 0, 0, 0.4);
        padding: 4px 8px;
        border-radius: 4px;
      }

      .recording-light {
        width: 12px;
        height: 12px;
        background: #ff3b30;
        border-radius: 50%;
        margin-right: 8px;
        box-shadow: 0 0 8px #ff3b30;
        animation: recording-blink 1.5s infinite ease-in-out;
      }

      .recording-text {
        color: #fff;
        font-size: 12px;
        font-weight: bold;
        letter-spacing: 1px;
      }

      .video-timer {
        position: absolute;
        top: 20px;
        right: 20px;
        color: #fff;
        font-size: 14px;
        z-index: 5;
        letter-spacing: 1px;
        background: rgba(0, 0, 0, 0.4);
        padding: 4px 8px;
        border-radius: 4px;
      }

      // Cinematic Grid
      .video-grid {
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        pointer-events: none;
        z-index: 2;

        /* Rule of thirds grid */
        &::before {
          content: "";
          position: absolute;
          top: 33.33%;
          left: 0;
          width: 100%;
          height: 33.33%;
          border-top: 1px solid rgba(255, 255, 255, 0.15);
          border-bottom: 1px solid rgba(255, 255, 255, 0.15);
        }

        &::after {
          content: "";
          position: absolute;
          left: 33.33%;
          top: 0;
          width: 33.33%;
          height: 100%;
          border-left: 1px solid rgba(255, 255, 255, 0.15);
          border-right: 1px solid rgba(255, 255, 255, 0.15);
        }
      }

      /* Focus bracket corners overlay */
      &::after {
        content: "";
        position: absolute;
        inset: 15px;
        border: 2px solid rgba(255, 255, 255, 0.3);
        /* Clip path to make corners only */
        clip-path: polygon(
          0 20px,
          0 0,
          20px 0,
          100% 0,
          100% 0,
          100% 0,
          100% 20px,
          100% 100%,
          100% 100%,
          100% calc(100% - 20px),
          100% 100%,
          calc(100% - 20px) 100%,
          0 100%,
          0 100%,
          0 calc(100% - 20px)
        );
        /* The clip path above is complex, let's simplify to just a border with gaps or just let it be a full frame for now, or use a simpler trick */
        /* Actually let's just make it a subtle full frame safe area guide */
        border: 1px dashed rgba(255, 255, 255, 0.1);
        pointer-events: none;
        z-index: 2;
      }

      // 響應式設計
      @media (max-width: 768px) {
        width: 280px;
        // height auto adjust by aspect-ratio
      }
    }
  }

  // 拍立得照片樣式
  // 拍立得照片樣式
  :deep(.photo-container) {
    width: 260px;
    background: #ffffff;
    padding: 12px 12px 50px 12px; /* Classic Polaroid spacing */
    box-shadow:
      0 4px 10px rgba(0, 0, 0, 0.1),
      0 10px 25px rgba(0, 0, 0, 0.05);
    transform: rotate(-1deg);
    transition: all 0.4s cubic-bezier(0.25, 0.8, 0.25, 1);
    position: relative;
    cursor: pointer;
    display: flex;
    flex-direction: column;
    align-items: center;
    margin: 10px auto;

    &:hover {
      transform: rotate(0deg) scale(1.02) translateY(-5px);
      box-shadow:
        0 15px 35px rgba(0, 0, 0, 0.15),
        0 5px 15px rgba(0, 0, 0, 0.08);
      z-index: 10;
    }

    /* internal black area acting as the "film" */
    .photo-text {
      width: 100%;
      aspect-ratio: 1/1;
      background: linear-gradient(145deg, #2a2a2a, #1a1a1a);
      color: rgba(255, 255, 255, 0.9);
      display: flex;
      flex-direction: column; /* Allow content to stack if needed */
      align-items: center;
      justify-content: center;
      text-align: center;
      padding: 16px;
      font-size: 14px;
      line-height: 1.6;
      box-shadow: inset 0 0 20px rgba(0, 0, 0, 0.5);
      position: relative;
      overflow-y: auto; /* Allow scrolling for long text */
      scrollbar-width: none; /* Firefox */
      font-family: "Times New Roman", serif;
      font-style: italic;

      &::-webkit-scrollbar {
        display: none; /* Chrome/Safari */
      }
    }

    /* Glossy overlay effect */
    .photo-overlay {
      position: absolute;
      top: 12px;
      left: 12px;
      right: 12px;
      width: auto;
      aspect-ratio: 1/1;
      background: linear-gradient(
        135deg,
        rgba(255, 255, 255, 0.1) 0%,
        rgba(255, 255, 255, 0) 40%,
        rgba(255, 255, 255, 0) 60%,
        rgba(255, 255, 255, 0.05) 100%
      );
      pointer-events: none;
      z-index: 20;
    }

    /* Date stamp */
    .photo-date {
      position: absolute;
      bottom: 12px;
      right: 15px;
      font-family: "Brush Script MT", "Comic Sans MS", cursive;
      font-size: 16px;
      color: #555;
      transform: rotate(-3deg);
      opacity: 0.8;
      pointer-events: none;
      z-index: 20;
    }

    .photo-frame {
      display: none; /* remove old frame logic */
    }

    // 響應式設計
    @media (max-width: 768px) {
      width: 240px;
    }
  }
}

@keyframes recording-blink {
  0%,
  50% {
    opacity: 1;
  }
  51%,
  100% {
    opacity: 0.3;
  }
}

// 正在輸入中的三個點動畫
.typing-dots {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 2px 4px;

  span {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: currentColor;
    opacity: 0.4;
    animation: typing-bounce 1.2s infinite ease-in-out;

    &:nth-child(1) {
      animation-delay: 0s;
    }
    &:nth-child(2) {
      animation-delay: 0.2s;
    }
    &:nth-child(3) {
      animation-delay: 0.4s;
    }
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
    transform: translateY(-5px);
    opacity: 1;
  }
}

// 想法氣泡
.thought-bubble {
  position: relative;
  margin-top: 8px;
  cursor: pointer;

  .thought-bubble-content {
    display: flex;
    align-items: flex-start;
    gap: 6px;
    padding: 10px 14px;
    background: linear-gradient(
      135deg,
      rgba(173, 216, 230, 0.9),
      rgba(176, 224, 230, 0.9)
    );
    border-radius: 16px;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
    font-size: 13px;
    color: #4a6572;
    font-style: italic;
    max-width: 100%;
  }

  .thought-icon {
    font-size: 16px;
    flex-shrink: 0;
  }

  .thought-text-content {
    line-height: 1.4;
  }

  .thought-bubble-tail {
    position: absolute;
    top: -6px;
    left: 20px;
    width: 12px;
    height: 12px;
    background: linear-gradient(
      135deg,
      rgba(173, 216, 230, 0.9),
      rgba(176, 224, 230, 0.9)
    );
    border-radius: 50%;

    &::before {
      content: "";
      position: absolute;
      top: -8px;
      left: 4px;
      width: 8px;
      height: 8px;
      background: linear-gradient(
        135deg,
        rgba(173, 216, 230, 0.9),
        rgba(176, 224, 230, 0.9)
      );
      border-radius: 50%;
    }

    &::after {
      content: "";
      position: absolute;
      top: -14px;
      left: 6px;
      width: 5px;
      height: 5px;
      background: linear-gradient(
        135deg,
        rgba(173, 216, 230, 0.9),
        rgba(176, 224, 230, 0.9)
      );
      border-radius: 50%;
    }
  }
}

// 想法氣泡彈出動畫
.thought-pop-enter-active {
  animation: thought-pop-in 0.4s cubic-bezier(0.68, -0.55, 0.265, 1.55);
}

.thought-pop-leave-active {
  animation: thought-pop-out 0.25s ease-in;
}

@keyframes thought-pop-in {
  0% {
    opacity: 0;
    transform: scale(0.3) translateY(10px);
  }
  50% {
    transform: scale(1.1) translateY(-2px);
  }
  100% {
    opacity: 1;
    transform: scale(1) translateY(0);
  }
}

@keyframes thought-pop-out {
  0% {
    opacity: 1;
    transform: scale(1);
  }
  100% {
    opacity: 0;
    transform: scale(0.5) translateY(10px);
  }
}

// 回覆引用 (浮動樣式)
.reply-quote-floating {
  position: relative;
  display: inline-flex;
  align-items: stretch;
  gap: 0;
  margin-bottom: 4px;
  z-index: 2;
  max-width: 100%;
  overflow: hidden;

  background: rgba(255, 255, 255, 0.18);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  border-radius: 10px;
  border: 1px solid rgba(255, 255, 255, 0.25);

  cursor: pointer;
  animation: reply-pop 0.2s cubic-bezier(0.34, 1.56, 0.64, 1);
  transition:
    background 0.15s ease,
    transform 0.15s ease;

  &:hover {
    background: rgba(255, 255, 255, 0.28);
    transform: translateY(-1px);
  }

  /* 左側色條 */
  .reply-bar {
    width: 3px;
    flex-shrink: 0;
    background: var(--color-primary, #6c8ebf);
    border-radius: 10px 0 0 10px;
    opacity: 0.85;
  }

  /* 文字區域 */
  .reply-body {
    display: flex;
    flex-direction: column;
    padding: 5px 10px;
    min-width: 0;
    gap: 1px;
  }

  .reply-name {
    font-size: 11px;
    font-weight: 600;
    color: var(--color-primary, #6c8ebf);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    opacity: 0.9;
  }

  .reply-text {
    font-size: 12px;
    color: var(--color-text-secondary);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    opacity: 0.75;
  }

  /* 用戶側：色條在右邊 */
  .user & {
    align-self: flex-end;
    flex-direction: row-reverse;

    .reply-bar {
      border-radius: 0 10px 10px 0;
    }
  }
}

@keyframes reply-pop {
  from {
    opacity: 0;
    transform: scale(0.95) translateY(3px);
  }
  to {
    opacity: 1;
    transform: scale(1) translateY(0);
  }
}

// 時空跳轉訊息
.timetravel-message {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px;
  background: linear-gradient(
    135deg,
    rgba(147, 112, 219, 0.2),
    rgba(138, 43, 226, 0.2)
  );
  border-radius: 12px;

  .timetravel-icon {
    font-size: 24px;
  }

  .timetravel-content {
    font-size: 14px;
    color: var(--color-text);
  }
}

// 紅包訊息
.redpacket-message {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  background: linear-gradient(135deg, #ff6b6b, #ee5a5a);
  border-radius: 12px;
  color: white;

  .redpacket-icon {
    font-size: 32px;
  }

  .redpacket-info {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .redpacket-amount {
    font-size: 18px;
    font-weight: bold;
  }

  .redpacket-blessing {
    font-size: 13px;
    opacity: 0.9;
  }
}

// 像素風格禮物寶箱外層
.pixel-gift-wrapper {
  display: flex;
  justify-content: center;
  padding: 10px;
}

// 轉帳訊息容器（同時包含文字和轉帳卡片）
.transfer-message-wrapper {
  display: flex;
  flex-direction: column;
  gap: 8px;

  .bubble-text,
  .message-mixed {
    margin-bottom: 4px;
  }
}

// 像素風格轉帳卡片外層
.pixel-transfer-wrapper {
  display: flex;
  justify-content: center;
  padding: 10px;
}

// 外賣卡片
.waimai-message-wrapper {
  display: flex;
  justify-content: center;
  padding: 6px 2px;
}

.waimai-card {
  width: min(320px, 100%);
  border-radius: 14px;
  border: 1px solid rgba(148, 163, 184, 0.25);
  background: linear-gradient(180deg, #ffffff 0%, #f8fafc 100%);
  padding: 12px;
  box-shadow: 0 4px 14px rgba(15, 23, 42, 0.08);

  .waimai-card-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    margin-bottom: 10px;
  }

  .waimai-card-title {
    font-size: 13px;
    font-weight: 700;
    color: #334155;
  }

  .waimai-status {
    font-size: 11px;
    color: #475569;
    background: rgba(148, 163, 184, 0.16);
    border-radius: 999px;
    padding: 2px 8px;
    white-space: nowrap;
  }

  .waimai-item-row {
    display: flex;
    gap: 10px;
    margin-bottom: 10px;
  }

  .waimai-item-image {
    width: 52px;
    height: 52px;
    border-radius: 10px;
    object-fit: cover;
    flex-shrink: 0;
    background: #e2e8f0;
  }

  .waimai-item-meta {
    min-width: 0;
    flex: 1;
  }

  .waimai-item-name {
    font-size: 14px;
    font-weight: 600;
    color: #0f172a;
    line-height: 1.3;
  }

  .waimai-item-store,
  .waimai-item-qty {
    font-size: 12px;
    color: #64748b;
    margin-top: 2px;
  }

  .waimai-price-grid {
    display: grid;
    grid-template-columns: 1fr auto;
    gap: 4px 10px;
    font-size: 12px;
    color: #475569;
    padding: 8px 0;
    border-top: 1px dashed rgba(148, 163, 184, 0.45);
    border-bottom: 1px dashed rgba(148, 163, 184, 0.45);

    .total-label,
    .total-value {
      font-weight: 700;
      color: #0f172a;
    }
  }

  .waimai-recipient {
    margin-top: 8px;
    font-size: 12px;
    color: #334155;
  }

  .waimai-destination {
    margin-top: 6px;
    font-size: 12px;
    color: #334155;
    line-height: 1.4;
  }

  .waimai-eta-row {
    margin-top: 6px;
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
  }

  .waimai-eta-text {
    font-size: 12px;
    color: #1e293b;
    font-weight: 600;
  }

  .waimai-route-badge {
    font-size: 11px;
    color: #1d4ed8;
    background: #dbeafe;
    border-radius: 999px;
    padding: 2px 8px;
    white-space: nowrap;
  }

  .waimai-delay-reason {
    margin-top: 5px;
    font-size: 11px;
    color: #b45309;
    line-height: 1.4;
  }

  .waimai-card-foot {
    margin-top: 8px;
    font-size: 12px;
    color: #64748b;
    line-height: 1.45;
  }
}

// 禮物標籤 (重用於 PixelGiftChest slot)
.gift-label {
  background: linear-gradient(135deg, #fff8e7 0%, #fff0d4 100%);
  padding: 8px 20px;
  border-radius: 20px;
  border: 2px solid #e8d5b7;
  box-shadow:
    0 2px 8px rgba(139, 90, 43, 0.15),
    inset 0 1px 0 rgba(255, 255, 255, 0.8);
  margin-top: 10px;
  animation: pop-in 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);

  .gift-text {
    font-size: 14px;
    font-weight: 600;
    color: #8b4513;
    letter-spacing: 0.5px;
  }
}

@keyframes pop-in {
  0% {
    transform: scale(0);
    opacity: 0;
  }
  100% {
    transform: scale(1);
    opacity: 1;
  }
}

// 位置分享（現代卡片樣式）
.location-bubble-card {
  display: flex;
  flex-direction: column;
  width: 260px;
  background: #ffffff;
  border-radius: 16px;
  overflow: hidden;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
  border: 1px solid rgba(0, 0, 0, 0.05);

  .location-map-area {
    position: relative;
    width: 100%;
    height: 140px;
    background-color: #f1f5f9; /* 淺灰背景，模仿地圖底色 */
    overflow: hidden;

    .map-roads {
      position: absolute;
      inset: 0;
    }

    .road-h {
      position: absolute;
      left: 0;
      width: 100%;
      height: 6px;
      background-color: #ffffff;

      &.road-h-1 {
        top: 35%;
      }
      &.road-h-2 {
        top: 70%;
      }
    }

    .road-v {
      position: absolute;
      top: 0;
      height: 100%;
      width: 6px;
      background-color: #ffffff;

      &.road-v-1 {
        left: 30%;
      }
      &.road-v-2 {
        left: 65%;
      }
    }

    .map-block {
      position: absolute;
      background-color: #e2e8f0;
      border-radius: 2px;

      &.block-1 {
        top: 10%;
        left: 5%;
        width: 20%;
        height: 20%;
      }
      &.block-2 {
        top: 45%;
        left: 36%;
        width: 25%;
        height: 20%;
      }
    }

    .map-park {
      position: absolute;
      bottom: 15%;
      right: 15%;
      width: 15%;
      height: 25%;
      background-color: #bbf7d0; /* 柔和的綠色 */
      border-radius: 4px;
    }

    .map-marker {
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -100%); /* 標記底部對齊中心 */
      display: flex;
      flex-direction: column;
      align-items: center;
      filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.2));

      .marker-head {
        width: 20px;
        height: 20px;
        background-color: #ef4444;
        border-radius: 50% 50% 50% 0;
        transform: rotate(-45deg);
        display: flex;
        align-items: center;
        justify-content: center;
        margin-bottom: -6px;
      }

      .marker-dot {
        width: 6px;
        height: 6px;
        background-color: white;
        border-radius: 50%;
      }
    }
  }

  .location-info-area {
    display: flex;
    align-items: center;
    padding: 12px 14px;
    background: #fff;
    gap: 12px;

    .location-text-col {
      flex: 1;
      display: flex;
      flex-direction: column;
      gap: 2px;
      overflow: hidden;
    }

    .location-title {
      font-size: 13px;
      font-weight: 600;
      color: #1e293b;
    }

    .location-address {
      font-size: 12px;
      color: #64748b;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .location-action-icon {
      width: 32px;
      height: 32px;
      display: flex;
      align-items: center;
      justify-content: center;
      background-color: #eff6ff; /* 淺藍色背景 */
      border-radius: 50%;
      color: #3b82f6; /* 藍色圖標 */
      flex-shrink: 0;

      svg {
        width: 16px;
        height: 16px;
        transform: rotate(45deg); /* 使箭頭指向右上方 */
      }
    }
  }
}

// 混合消息（包含表情包/圖片）
.message-mixed {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  gap: 4px;
}

// 表情包
.message-sticker-wrapper {
  display: inline-block;
}

.message-sticker {
  max-width: 120px;
  max-height: 120px;
  object-fit: contain;
  border-radius: 8px;
  cursor: pointer;
  transition: transform 0.2s;

  &:hover {
    transform: scale(1.05);
  }
}

.sticker-text-fallback {
  color: var(--color-text-muted);
  font-style: italic;
  font-size: 13px;
}

// 消息中的圖片
.message-image {
  max-width: 200px;
  max-height: 200px;
  object-fit: contain;
  border-radius: 8px;
  cursor: pointer;
}

// 拍立得照片樣式（真實圖片）
.polaroid-photo-container {
  width: 260px;
  background: #ffffff;
  padding: 12px 12px 50px 12px;
  box-shadow:
    0 4px 10px rgba(0, 0, 0, 0.1),
    0 10px 25px rgba(0, 0, 0, 0.05);
  transform: rotate(-1deg);
  transition: all 0.4s cubic-bezier(0.25, 0.8, 0.25, 1);
  position: relative;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  align-items: center;
  margin: 10px auto;

  &:hover {
    transform: rotate(0deg) scale(1.02) translateY(-5px);
    box-shadow:
      0 15px 35px rgba(0, 0, 0, 0.15),
      0 5px 15px rgba(0, 0, 0, 0.08);
    z-index: 10;
  }

  .polaroid-photo-overlay {
    position: absolute;
    top: 12px;
    left: 12px;
    right: 12px;
    width: auto;
    aspect-ratio: 1/1;
    background: linear-gradient(
      135deg,
      rgba(255, 255, 255, 0.15) 0%,
      rgba(255, 255, 255, 0) 40%,
      rgba(255, 255, 255, 0) 60%,
      rgba(255, 255, 255, 0.08) 100%
    );
    pointer-events: none;
    z-index: 20;
    border-radius: 2px;
  }

  .polaroid-photo-image {
    width: 100%;
    aspect-ratio: 1/1;
    background: linear-gradient(145deg, #f5f5f5, #e8e8e8);
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
    position: relative;

    .image-loading-placeholder {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 100%;
      height: 100%;
      color: #999;
      font-size: 13px;
    }

    img {
      width: 100%;
      height: 100%;
      object-fit: cover;
      transition: transform 0.3s ease;
    }

    &:hover img {
      transform: scale(1.05);
    }
  }

  .polaroid-photo-caption {
    position: absolute;
    bottom: 18px;
    left: 15px;
    right: 50px;
    font-family: "Brush Script MT", "Comic Sans MS", cursive;
    font-size: 14px;
    color: #444;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    transform: rotate(-2deg);
  }

  .polaroid-photo-date {
    position: absolute;
    bottom: 12px;
    right: 15px;
    font-family: "Brush Script MT", "Comic Sans MS", cursive;
    font-size: 16px;
    color: #555;
    transform: rotate(-3deg);
    opacity: 0.8;
    pointer-events: none;
  }

  @media (max-width: 768px) {
    width: 220px;
  }
}

// 音頻氣泡樣式
.audio-bubble {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1;
  min-width: 0;
  padding: 6px 10px;
  cursor: pointer;
  user-select: none;

  &.playing .audio-play-btn {
    color: var(--color-primary, #7dd3a8);
  }

  .audio-play-btn {
    flex-shrink: 0;
    width: 28px;
    height: 28px;
    border-radius: 50%;
    border: none;
    background: rgba(0, 0, 0, 0.06);
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    transition: background 0.2s;
    color: inherit;

    &:hover {
      background: rgba(0, 0, 0, 0.1);
    }

    .audio-icon {
      width: 14px;
      height: 14px;
    }
  }

  .audio-info {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .audio-waveform {
    display: flex;
    align-items: center;
    gap: 2px;
    height: 20px;
    cursor: pointer;
    touch-action: none;
  }

  .waveform-bar {
    flex: 1;
    min-width: 2px;
    max-width: 3px;
    border-radius: 1.5px;
    background: rgba(0, 0, 0, 0.15);
    transition: background 0.15s;

    &.active {
      background: var(--color-primary, #7dd3a8);
    }
  }

  .audio-meta {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 10px;
    opacity: 0.6;
  }

  .audio-duration {
    white-space: nowrap;
  }

  .audio-transcript {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
}

// 用戶側音頻氣泡方向翻轉
.message-wrapper.user .audio-bubble {
  flex-direction: row-reverse;
}

// MiniMax TTS 語音播放條
.tts-player {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  margin-top: 6px;
  padding: 3px 10px 3px 6px;
  border-radius: 12px;
  background: rgba(var(--primary-rgb, 100, 100, 255), 0.1);
  cursor: pointer;
  user-select: none;
  transition: background 0.2s;

  &:active {
    background: rgba(var(--primary-rgb, 100, 100, 255), 0.2);
  }
}

.tts-icon {
  width: 16px;
  height: 16px;
  color: var(--primary-color, #6366f1);
  flex-shrink: 0;

  &.tts-playing {
    animation: tts-pulse 1s ease-in-out infinite;
  }
}

.tts-label {
  font-size: 11px;
  color: var(--primary-color, #6366f1);
  white-space: nowrap;
}

@keyframes tts-pulse {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.5;
  }
}

// TTS 逐句段落播放
.tts-segments {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px;
  margin-top: 6px;
}

.tts-seg-row {
  display: inline-flex;
  align-items: center;
  gap: 2px;
}

.tts-seg-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border: none;
  border-radius: 50%;
  background: rgba(var(--primary-rgb, 100, 100, 255), 0.12);
  cursor: pointer;
  padding: 0;
  transition: background 0.2s;

  &:active,
  &.playing {
    background: rgba(var(--primary-rgb, 100, 100, 255), 0.25);
  }
}

.tts-seg-icon {
  width: 12px;
  height: 12px;
  color: var(--primary-color, #6366f1);
}

.tts-seg-emotion {
  font-size: 10px;
  color: var(--color-text-secondary, #888);
  opacity: 0.7;
}

.tts-play-all {
  display: inline-flex;
  align-items: center;
  padding: 2px 8px;
  border: 1px solid rgba(var(--primary-rgb, 100, 100, 255), 0.2);
  border-radius: 10px;
  background: transparent;
  font-size: 11px;
  color: var(--primary-color, #6366f1);
  cursor: pointer;
  white-space: nowrap;

  &:active {
    background: rgba(var(--primary-rgb, 100, 100, 255), 0.1);
  }
}

// 音頻訊息容器（包含氣泡 + 轉文字按鈕）
.audio-message-container {
  display: flex;
  flex-direction: column;
  gap: 4px;
  max-width: 280px;

  .audio-row {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .stt-btn {
    flex-shrink: 0;
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 4px 10px;
    border: none;
    border-radius: 12px;
    background: rgba(0, 0, 0, 0.06);
    color: rgba(0, 0, 0, 0.45);
    font-size: 12px;
    cursor: pointer;
    white-space: nowrap;
    transition:
      background 0.2s,
      color 0.2s;
    user-select: none;

    &:hover {
      background: rgba(0, 0, 0, 0.1);
      color: rgba(0, 0, 0, 0.6);
    }

    &.transcribing {
      color: rgba(0, 0, 0, 0.5);
      pointer-events: none;
    }

    &.has-transcript {
      color: var(--color-primary, #7dd3a8);
    }

    .stt-dot {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: #e53e3e;
      animation: stt-pulse 1s infinite;
    }

    .stt-label {
      line-height: 1;
    }
  }

  .stt-transcript {
    padding: 8px 12px;
    font-size: 14px;
    line-height: 1.6;
    color: inherit;
    opacity: 0.85;
    word-break: break-word;
    white-space: pre-wrap;
    border-top: 1px solid rgba(0, 0, 0, 0.06);
  }
}

@keyframes stt-pulse {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.3;
  }
}

// 用戶側音頻行方向翻轉
.message-wrapper.user .audio-message-container .audio-row {
  flex-direction: row-reverse;
}

// 文字語音訊息（手寫輸入的語音，無實際音頻）
.text-voice-message {
  .text-voice-bubble {
    cursor: default;
    padding: 8px 14px;

    .text-voice-icon {
      width: 18px;
      height: 18px;
      flex-shrink: 0;
      opacity: 0.6;
    }
  }

  .text-voice-waveform {
    pointer-events: none;
    opacity: 0.5;
  }

  .text-voice-transcript {
    border-top: none;
    padding-top: 2px;
    opacity: 1;
  }
}

// 舊的上傳圖片樣式（保留作為備用）
.uploaded-image-container {
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-width: 100%;
}

.uploaded-image {
  max-width: 280px;
  max-height: 280px;
  width: 100%;
  height: auto;
  border-radius: 12px;
  cursor: pointer;
  transition: all 0.2s;
  object-fit: contain;
  background: rgba(0, 0, 0, 0.05);

  &:hover {
    transform: scale(1.02);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  }

  &:active {
    transform: scale(0.98);
  }
}

.image-caption {
  font-size: 14px;
  line-height: 1.5;
  color: inherit;
  margin-top: 4px;
}

// 滑動控制
.swipe-controls {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 6px;
  padding: 0 4px;
}

.swipe-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  background: var(--color-background);
  border: 1px solid var(--color-border);
  border-radius: 50%;
  cursor: pointer;
  transition: all var(--transition-fast);

  svg {
    width: 16px;
    height: 16px;
    color: var(--color-text-secondary);
  }

  &:hover {
    background: var(--color-surface);
    border-color: var(--color-primary);

    svg {
      color: var(--color-primary);
    }
  }

  &:active {
    transform: scale(0.9);
  }
}

.swipe-count {
  font-size: 12px;
  color: var(--color-text-muted);
  min-width: 32px;
  text-align: center;
}

// 整輪滑動控制
.round-swipe-controls {
  border-top: 1px dashed var(--color-border);
  padding-top: 4px;
}

.round-swipe-btn {
  background: var(--color-surface) !important;
  border-color: var(--color-primary-light, var(--color-border)) !important;

  svg {
    width: 14px;
    height: 14px;
  }
}

.round-swipe-count {
  display: flex;
  align-items: center;
  gap: 3px;

  .round-icon {
    width: 12px;
    height: 12px;
    color: var(--color-text-muted);
  }
}

.message-time {
  font-size: 11px;
  color: var(--color-text-muted);
  margin-top: 4px;
  padding: 0 4px;
}

// 操作選單
.message-menu {
  // 不佔空間，不影響佈局
  position: absolute;
  top: 0;
  height: 0;
  overflow: visible;
  z-index: 100;

  // AI 訊息：從左側對齊（頭像寬度約 44px + gap 10px）
  .message-wrapper.ai & {
    left: 54px;
  }

  // 用戶訊息：從右側對齊
  .message-wrapper.user & {
    right: 0;
  }

  // 系統訊息：置中
  .message-wrapper.system & {
    left: 50%;
  }
}

.menu-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.15);
  z-index: 100;
}

.menu-content {
  position: absolute;
  bottom: 8px;
  display: flex;
  flex-direction: row;
  flex-wrap: wrap;
  align-items: stretch;
  background: var(--color-surface);
  border-radius: 16px;
  box-shadow: var(--shadow-lg);
  overflow: hidden;
  z-index: 101;
  // 固定寬度讓 flex-wrap 生效，4 個按鈕一排（每個 ~60px）
  width: min(260px, calc(100vw - 80px));

  // AI 訊息：菜單靠左展開
  .message-wrapper.ai & {
    left: 0;
  }

  // 用戶訊息：菜單靠右展開
  .message-wrapper.user & {
    right: 0;
  }

  // 系統訊息：置中
  .message-wrapper.system & {
    left: 50%;
    transform: translateX(-50%);
  }

  // 小箭頭（朝下，指向泡泡）
  &::after {
    content: "";
    position: absolute;
    bottom: -5px;
    width: 10px;
    height: 10px;
    background: var(--color-surface);
    transform: rotate(45deg);
    border-radius: 2px;
    box-shadow: 2px 2px 4px rgba(0, 0, 0, 0.08);

    .message-wrapper.ai & {
      left: 20px;
    }

    .message-wrapper.user & {
      right: 20px;
    }

    .message-wrapper.system & {
      left: 50%;
      transform: translateX(-50%) rotate(45deg);
    }
  }
}

.menu-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  padding: 10px 0;
  background: transparent;
  border: none;
  font-size: 11px;
  color: var(--color-text-secondary);
  cursor: pointer;
  transition: background var(--transition-fast);
  // 每排 4 個，各佔 25%
  flex: 0 0 25%;
  width: 25%;

  svg {
    width: 20px;
    height: 20px;
    color: var(--color-text);
    flex-shrink: 0;
  }

  span {
    line-height: 1;
    white-space: nowrap;
  }

  &:hover {
    background: var(--color-background);
  }

  &:active {
    background: var(--color-surface-hover);
  }

  &.danger {
    color: var(--color-error);

    svg {
      color: var(--color-error);
    }

    &:hover {
      background: rgba(255, 123, 123, 0.1);
    }
  }
}

// 分隔線改成行分隔（每排之間的水平線）
.menu-divider {
  display: none;
}

// 動畫
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

// 菜單彈出動畫（從下往上）
.menu-pop-enter-active {
  transition:
    opacity 0.15s ease,
    transform 0.15s ease;
}
.menu-pop-leave-active {
  transition:
    opacity 0.1s ease,
    transform 0.1s ease;
}
.menu-pop-enter-from,
.menu-pop-leave-to {
  opacity: 0;
  transform: translateY(6px) scale(0.95);
}

// 高亮動畫（滾動到消息時）
:global(.highlight-message) {
  animation: highlight-pulse 2s ease-out;
}

@keyframes highlight-pulse {
  0% {
    background: rgba(125, 211, 168, 0.4);
    box-shadow: 0 0 0 4px rgba(125, 211, 168, 0.3);
  }
  50% {
    background: rgba(125, 211, 168, 0.2);
    box-shadow: 0 0 0 2px rgba(125, 211, 168, 0.2);
  }
  100% {
    background: transparent;
    box-shadow: none;
  }
}

// ===== 跳轉魔法系統消息 =====
.timetravel-system-message {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  padding: 8px 0;

  .timetravel-line {
    flex: 1;
    height: 1px;
    background: linear-gradient(
      90deg,
      transparent,
      var(--color-primary, #7dd3a8),
      transparent
    );
  }

  .timetravel-badge {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 16px;
    background: linear-gradient(
      135deg,
      rgba(125, 211, 168, 0.15),
      rgba(137, 207, 240, 0.15)
    );
    border-radius: 20px;
    border: 1px dashed var(--color-primary, #7dd3a8);
    font-size: 14px;
    color: var(--color-text-secondary, #666);
    font-style: italic;
    white-space: normal;
    text-align: center;
    max-width: 80%;
    line-height: 1.5;

    .timetravel-icon {
      width: 18px;
      height: 18px;
      color: var(--color-primary, #7dd3a8);
      flex-shrink: 0;
    }
  }
}

// ===== 換頭像系統消息 =====
.avatar-change-system-message {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  padding: 8px 0;

  .avatar-change-line {
    flex: 1;
    height: 1px;
    background: linear-gradient(
      90deg,
      transparent,
      var(--color-primary, #f5a9b8),
      transparent
    );
  }

  .avatar-change-badge {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 16px;
    background: linear-gradient(
      135deg,
      rgba(245, 169, 184, 0.15),
      rgba(137, 207, 240, 0.15)
    );
    border-radius: 20px;
    border: 1px dashed rgba(245, 169, 184, 0.5);
    font-size: 13px;
    color: var(--color-text-secondary, #666);
    white-space: normal;
    text-align: center;
    max-width: 85%;
    line-height: 1.5;

    .avatar-change-icon {
      width: 16px;
      height: 16px;
      color: #f5a9b8;
      flex-shrink: 0;
    }
  }
}

// ===== 小劇場系統消息 =====
.small-theater-system-message {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 16px;
  background: linear-gradient(
    135deg,
    rgba(245, 169, 184, 0.08),
    rgba(137, 207, 240, 0.08)
  );
  border-radius: 16px;
  border: 1px solid rgba(245, 169, 184, 0.2);

  .small-theater-badge {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 6px 14px;
    background: rgba(245, 169, 184, 0.15);
    border-radius: 14px;
    font-size: 12px;
    font-weight: 500;
    color: #d4849a;

    .theater-icon {
      width: 16px;
      height: 16px;
    }
  }

  .small-theater-content {
    font-size: 14px;
    color: var(--color-text-secondary, #666);
    line-height: 1.6;
    text-align: center;
    max-width: 90%;
  }
}

// ===== 群聊相關樣式 =====

// 撤回通知
.recall-message {
  display: inline-flex;
  align-items: center;
  gap: 4px;

  .recall-icon {
    width: 14px;
    height: 14px;
    opacity: 0.6;
  }
}

// 群管理動作
.group-action-message {
  font-style: italic;
}

// 私信指示器
.private-message-indicator {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  margin-top: 6px;
  padding: 2px 8px;
  border-radius: var(--radius-full);
  background: rgba(0, 0, 0, 0.05);
  font-size: 11px;
  color: var(--color-text-muted);

  .dm-icon {
    width: 12px;
    height: 12px;
    opacity: 0.6;
  }
}

// 群聊模式下的發送者名稱加粗
.message-wrapper.group-chat {
  .sender-name {
    font-weight: 500;
    color: var(--color-text-primary, #333);
  }
}

// 遊戲成績卡片
:deep(.game-score-card) {
  background: linear-gradient(145deg, #fff8f0, #fff);
  border: 1.5px solid #f0e0cc;
  border-radius: 14px;
  padding: 16px;
  text-align: center;
  min-width: 160px;

  .game-score-header {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    margin-bottom: 8px;
  }

  .game-score-icon {
    width: 20px;
    height: 20px;
    color: #edc22e;
  }

  .game-score-title {
    font-size: 14px;
    font-weight: 600;
    color: #92400e;
  }

  .game-score-value {
    font-size: 36px;
    font-weight: 800;
    color: var(--color-primary, #7dd3a8);
    line-height: 1.1;
  }

  .game-score-label {
    font-size: 12px;
    color: #9ca3af;
    margin-top: 2px;
  }
}

// TTS 行內播放按鈕（嵌入在 v-html 內容中，需用 :deep）
:deep(.tts-inline-btn) {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  margin-left: 3px;
  font-size: 0.85em;
  cursor: pointer;
  opacity: 0.7;
  vertical-align: middle;
  border-radius: 50%;
  padding: 1px 2px;
  transition:
    opacity 0.15s,
    background 0.15s;
  user-select: none;

  &:hover {
    opacity: 1;
    background: rgba(0, 0, 0, 0.08);
  }
}
</style>
