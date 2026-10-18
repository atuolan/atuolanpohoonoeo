<script setup lang="ts">
import PeekCapsule from "@/components/peek-phone/PeekCapsule.vue";
import PeekHomeView from "@/components/peek-phone/PeekHomeView.vue";
import PeekLockView from "@/components/peek-phone/PeekLockView.vue";
import PeekScreenTime from "@/components/peek-phone/PeekScreenTime.vue";
import PeekSheet from "@/components/peek-phone/PeekSheet.vue";
import { useRootBackground } from "@/components/peek-phone/useRootBackground";
import {
  avatarColor,
  batteryLevel,
  formatClock,
  formatRelative,
  initialOf,
  latestNotifications,
  memosFromPlanner,
  MOOD_LABELS,
  moodLine,
  nextScheduleItem,
  photoTone,
  scheduleFromPlanner,
  toMillis,
  type HomeApp,
  type PeekMemoView,
  type PeekScheduleView,
} from "@/components/peek-phone/peekPhoneView";
import {
  homeTabOfView,
  listSecrets,
  placeOfView,
  progressOf,
  secretKeys,
  unfoundByPlace,
  type PeekSecret,
  type SecretPlace,
} from "@/components/peek-phone/peekSecrets";
import { db, DB_STORES } from "@/db/database";
import { loadMessages } from "@/storage/chatMessageStorage";
import { useCharactersStore } from "@/stores";
import { usePeekPhoneStore } from "@/stores/peekPhone";
import type { StoredCharacter } from "@/types/character";
import type { Chat } from "@/types/chat";
import type { PeekChatMessage, PeekDiaryEntry, PeekPhoneTab } from "@/types/peekPhone";
import { computeChatNow } from "@/utils/fakeTime";
import {
  CHAR_PLANNER_CHANGED_EVENT,
  loadCharPlanner,
  type CharPlannerChangedDetail,
} from "@/services/charPlanner";
import type { CharPlanner } from "@/types/charPlanner";
import type { CalendarEvent } from "@/types/calendar";
import { listCalendarEvents } from "@/services/calendarEvents";
import { emptyPeekRealData, loadPeekRealData } from "@/services/PeekRealData";
import { mergeRealUserThread, type PeekRealData } from "@/utils/peekRealData";
import { eventLastDate, formatEventTime } from "@/utils/calendarEventFormat";
import { comparePlans, formatPlanTime, shiftDate, toDateString } from "@/utils/charPlanner";
import {
  AlertTriangle,
  Angry,
  ArrowUp,
  BookOpen,
  Calendar,
  Camera,
  Check,
  ChevronLeft,
  ChevronRight,
  CreditCard,
  Eye,
  EyeOff,
  FileText,
  Frown,
  Globe,
  Image,
  Laugh,
  ListChecks,
  Loader2,
  Lock,
  Meh,
  MessageCircle,
  RefreshCw,
  Search,
  Settings,
  Smile,
  Trash2,
  UtensilsCrossed,
  X,
} from "lucide-vue-next";
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from "vue";

const emit = defineEmits<{ back: [] }>();
const props = defineProps<{ characterId: string; chatId: string }>();

const charactersStore = useCharactersStore();
const peekPhoneStore = usePeekPhoneStore();

const character = computed<StoredCharacter | undefined>(() =>
  charactersStore.characters.find((c) => c.id === props.characterId),
);
const charName = computed(
  () => character.value?.nickname || character.value?.data?.name || "角色",
);
const charAvatar = computed(() => character.value?.avatar || "");
// 同一個角色的手機，不管用哪段聊天都是同一支
const battery = computed(() => batteryLevel(props.characterId));

// 當前視圖：拿起手機先看到鎖定畫面
const currentView = ref<"lock" | "home" | PeekPhoneTab>("lock");
// 窺視選單（點頂部膠囊）
const showSheet = ref(false);

// 時間顯示：角色手機上的時間，聊天有假時間就照假時間走
const now = ref(new Date());
const timer = setInterval(() => {
  now.value = computeChatNow(chatRecord.value);
}, 30000);
onUnmounted(() => {
  clearInterval(timer);
  // 不再在離開頁面時中止生成，讓串流在背景繼續
  // peekPhoneStore.abortAll();
});

// App 列表（group 對應生成階段）
const phoneApps = [
  { key: "chat" as PeekPhoneTab, label: "訊息", icon: MessageCircle, group: "A" as const },
  { key: "schedule" as PeekPhoneTab, label: "行事曆", icon: Calendar, group: "B" as const },
  { key: "meals" as PeekPhoneTab, label: "飲食記錄", icon: UtensilsCrossed, group: "B" as const },
  { key: "balance" as PeekPhoneTab, label: "錢包", icon: CreditCard, group: "C" as const },
  { key: "memo" as PeekPhoneTab, label: "備忘錄", icon: ListChecks, group: "B" as const },
  { key: "notes" as PeekPhoneTab, label: "記事本", icon: FileText, group: "C" as const },
  { key: "diary" as PeekPhoneTab, label: "日記", icon: BookOpen, group: "C" as const },
  { key: "gallery" as PeekPhoneTab, label: "相簿", icon: Image, group: "D" as const },
  { key: "browser" as PeekPhoneTab, label: "瀏覽器", icon: Globe, group: "D" as const },
  { key: "settings" as PeekPhoneTab, label: "設定", icon: Settings, group: "D" as const },
  // 不放桌面，從相簿進去
  { key: "hidden" as PeekPhoneTab, label: "已隱藏", icon: Lock, group: "D" as const },
  { key: "deleted" as PeekPhoneTab, label: "最近刪除", icon: Trash2, group: "D" as const },
];

// 桌面配置：行事曆從日曆小工具進去，記事本收在備忘錄裡
const gridKeys: PeekPhoneTab[] = ["diary", "memo", "meals", "settings"];
const dockKeys: PeekPhoneTab[] = ["chat", "gallery", "browser", "balance"];
// 深色的 App，其他是淺色
const darkTabs = new Set<PeekPhoneTab>(["chat", "balance", "browser", "settings"]);

// iOS 底部露出的那一截跟著畫面最底下的顏色
useRootBackground(
  computed(() => {
    if (showSheet.value) return "#f6f5f2";
    const view = currentView.value;
    if (view === "lock" || view === "home") return charAvatar.value ? "#151517" : "#352c27";
    return darkTabs.has(view) ? "#0f1012" : "#f7f7f5";
  }),
);

// 從 store 讀取資料
const storeData = computed(() => peekPhoneStore.data);
const groupStatus = computed(() => peekPhoneStore.groupStatus);
const groupErrors = computed(() => peekPhoneStore.groupErrors);

// 各模塊的資料
// 真的聊天、交易、日記、外送：打開手機時現讀，蓋在 AI 生成的上面
const realData = ref<PeekRealData>(emptyPeekRealData());
const userNameForPhone = ref("");
const chats = computed(() =>
  mergeRealUserThread(storeData.value?.chats ?? [], realData.value.userThread, userNameForPhone.value),
);
/** 跟使用者那串顯示的是真的聊天：不能從這裡傳訊息 */
function isRealUserThread(thread: { isUser?: boolean } | undefined): boolean {
  return !!thread?.isUser && realData.value.userThread.length > 0;
}
// 行程和待辦跟聊天頁「他的今天」是同一份；還沒有（舊的偷窺內容）時用偷窺手機自己生成的
const planner = ref<CharPlanner | null>(null);
const phoneToday = computed(() => toDateString(now.value));
const schedule = computed<PeekScheduleView[]>(() => {
  const fromPlanner = scheduleFromPlanner(planner.value?.plans ?? [], phoneToday.value, now.value);
  return fromPlanner.length > 0 ? fromPlanner : (storeData.value?.schedule ?? []);
});
/** 「接下來」左邊那欄窄，只寫 10/19 */
function shortPlanDate(date: string): string {
  const [, m, d] = date.split("-");
  return `${Number(m)}/${Number(d)}`;
}
/** 行事曆 App 下面「接下來」：明天之後的行程 */
const upcomingPlans = computed(() =>
  (planner.value?.plans ?? []).filter((p) => p.date > phoneToday.value).sort(comparePlans).slice(0, 8),
);
const meals = computed(() => [...realData.value.meals, ...(storeData.value?.meals ?? [])]);
const balance = computed(() => storeData.value?.balance ?? 0);
const transactions = computed(() => [...realData.value.transactions, ...(storeData.value?.transactions ?? [])]);
const memos = computed<PeekMemoView[]>(() => {
  const todos = planner.value?.todos ?? [];
  return todos.length > 0 ? memosFromPlanner(todos) : (storeData.value?.memos ?? []);
});

/** 他在這段聊天幫使用者記進行事曆的（接下來兩週） */
const helpedEvents = ref<CalendarEvent[]>([]);

async function loadPlanner() {
  try {
    planner.value = await loadCharPlanner(props.chatId);
    const today = phoneToday.value;
    helpedEvents.value = (await listCalendarEvents({ from: today, to: shiftDate(today, 13) })).filter(
      (e) => e.sourceChatId === props.chatId,
    );
  } catch (err) {
    console.warn("[PeekPhoneScreen] 讀取角色待辦與行程失敗:", err);
  }
}

function helpedWhen(e: CalendarEvent): string {
  const last = eventLastDate(e);
  const days = last !== e.date ? `${shortPlanDate(e.date)}–${shortPlanDate(last)}` : shortPlanDate(e.date);
  const time = formatEventTime(e);
  return time ? `${days}　${time}` : days;
}
// 生成時寫回、聊天頁刪掉的，這裡跟著更新
function onPlannerChanged(event: Event) {
  const detail = (event as CustomEvent<CharPlannerChangedDetail>).detail;
  if (detail?.chatId === props.chatId) planner.value = detail.planner;
}
onMounted(() => {
  window.addEventListener(CHAR_PLANNER_CHANGED_EVENT, onPlannerChanged);
  void loadPlanner();
});
onUnmounted(() => window.removeEventListener(CHAR_PLANNER_CHANGED_EVENT, onPlannerChanged));
const notes = computed(() => storeData.value?.notes ?? []);
const diary = computed(() =>
  [...realData.value.diary, ...(storeData.value?.diary ?? [])].sort((a, b) => b.date.localeCompare(a.date)),
);
const gallery = computed(() => storeData.value?.gallery ?? []);
/** 他排好要打給使用者的電話：行事曆上變成提醒，原因是秘密 */
const pendingCalls = computed(() => realData.value.pendingCalls);
/** 他手機裡給使用者的備註名 */
const userContactName = computed(
  () => chats.value.find((c) => c.isUser)?.contactName || userNameForPhone.value || "你",
);
const browserHistory = computed(() => storeData.value?.browserHistory ?? []);
const hiddenPhotos = computed(() => storeData.value?.hiddenPhotos ?? []);
// 相簿分成一般的和「最近刪除」裡的
// 聊天裡真的傳過的照片排在一起，新的在前
const activePhotos = computed(() =>
  [...realData.value.photos, ...gallery.value.filter((p) => !p.deletedDaysLeft)].sort((a, b) =>
    b.date.localeCompare(a.date),
  ),
);
const deletedPhotos = computed(() => gallery.value.filter((p) => p.deletedDaysLeft));

// ===== 秘密與偷看進度 =====
const secrets = computed(() =>
  listSecrets(
    storeData.value ? { ...storeData.value, chats: chats.value } : null,
    planner.value,
    pendingCalls.value,
  ),
);
const progress = computed(() => progressOf(storeData.value));
const unfound = computed(() => unfoundByPlace(secrets.value, progress.value));

function isRevealed(key: string): boolean {
  return progress.value.revealed.includes(key);
}
function reveal(key: string): void {
  peekPhoneStore.markRevealed(key);
}

// 膠囊上的字：主畫面說幾處有秘密，App 裡說這裡有幾個
const capsuleLabel = computed(() => {
  const view = currentView.value;
  if (view === "home") {
    const places = (["chat", "gallery", "browser", "settings", "memo", "schedule"] as SecretPlace[]).filter(
      (p) => unfound.value[p] > 0,
    ).length;
    return places > 0 ? `${places} 處有秘密` : undefined;
  }
  const place = placeOfView(view);
  if (place && place !== "lock" && unfound.value[place] > 0) {
    return `這裡有 ${unfound.value[place]} 個秘密`;
  }
  return undefined;
});
const hasUnfound = computed(() => Object.values(unfound.value).some((n) => n > 0));

// 打開過哪些 App；打開「已隱藏」就算找到那本相簿
watch(currentView, (view) => {
  if (view === "lock" || view === "home") return;
  peekPhoneStore.markViewed(homeTabOfView(view));
  if (view === "hidden" && hiddenPhotos.value.length > 0) reveal(secretKeys.hidden);
  // 打開備忘錄、行事曆就看到了聊天裡看不到的待辦和行程
  if (view === "memo") {
    for (const t of planner.value?.todos ?? []) if (t.secret) reveal(secretKeys.todo(t.id));
  }
  if (view === "schedule") {
    for (const p of planner.value?.plans ?? []) if (p.secret) reveal(secretKeys.plan(p.id));
    for (const c of pendingCalls.value) reveal(secretKeys.call(c.id));
  }
});

// 鎖屏密碼：還沒解過（或從窺視選單說要再試一次）就要先猜
const lockRetry = ref(false);
const needCode = computed(
  () => !!storeData.value?.lockScreen && (!progress.value.unlocked || lockRetry.value),
);
function onLockSolved() {
  const lockScreen = storeData.value?.lockScreen;
  if (lockScreen) reveal(secretKeys.lock(lockScreen.passcode));
  peekPhoneStore.setUnlocked(true);
  lockRetry.value = false;
}
function onLockSkip() {
  peekPhoneStore.setUnlocked(true);
  lockRetry.value = false;
}
function onUnlock() {
  lockRetry.value = false;
  currentView.value = "home";
}

/** 從窺視選單跳到秘密所在的地方 */
function goToSecret(secret: PeekSecret) {
  showSheet.value = false;
  const { view, threadId, photoId } = secret.target;
  if (view === "lock") {
    lockRetry.value = !isRevealed(secret.key);
    currentView.value = "lock";
    return;
  }
  goBackToHome();
  currentView.value = view;
  if (threadId) selectedChatId.value = threadId;
  if (photoId) selectedDeletedId.value = photoId;
}

// 鎖定畫面與桌面小工具
const lockNotifications = computed(() => latestNotifications(chats.value, 3));
const lockNextSchedule = computed(() => nextScheduleItem(schedule.value));
const homeMoodLine = computed(() => moodLine(diary.value));
const homePhoto = computed(() => activePhotos.value[0] ?? null);

// 鎖屏：聊天頂欄那行狀態、他所在的城市和天氣（角色設定裡填的）
const lockStatusText = computed(() => chatRecord.value?.charStatus?.text?.trim() || "");
const lockPlaceText = computed(() => {
  const world = character.value?.worldSettings;
  return [world?.location?.trim(), world?.weatherOverride?.trim()].filter(Boolean).join(" · ");
});

// 聊天詳情
const selectedChatId = ref<string | null>(null);
const selectedChat = computed(() =>
  chats.value.find((c) => c.id === selectedChatId.value),
);

/** 聊天泡泡＋時間分隔：第一則、或跟上一則隔超過 30 分鐘才顯示時間 */
const chatItems = computed(() => {
  const messages = selectedChat.value?.messages ?? [];
  return messages.map((msg, i) => {
    const ms = toMillis(msg.timestamp);
    const prev = i > 0 ? toMillis(messages[i - 1].timestamp) : 0;
    const showStamp = !!ms && (i === 0 || !prev || ms - prev > 30 * 60_000);
    return { msg, stamp: showStamp ? formatChatStamp(ms) : "" };
  });
});

// ===== 互動聊天：以手機主人身份回覆聯絡人 =====
const replyInput = ref("");
const chatMessagesEl = ref<HTMLElement | null>(null);
// 互動聊天的錯誤訊息（直接顯示在聊天畫面內，避免系統通知被全屏畫面蓋住而看不到）
const replyError = ref<string>("");
// 正在等待回覆的聊天串（來自 store，與批量生成分開）
const replyingThreadId = computed(() => peekPhoneStore.replyingThreadId);
// 當前開啟的聊天串是否正在等待聯絡人回覆
const isReplyingCurrent = computed(
  () => !!selectedChatId.value && replyingThreadId.value === selectedChatId.value,
);

function scrollMessagesToBottom(): void {
  nextTick(() => {
    const el = chatMessagesEl.value;
    if (el) el.scrollTop = el.scrollHeight;
  });
}

async function sendReply(): Promise<void> {
  const text = replyInput.value.trim();
  if (!text) return; // 空輸入忽略
  if (!selectedChatId.value) return;
  if (!character.value || !chatRecord.value) return;
  if (replyingThreadId.value) return; // 生成中，避免重複發送
  const threadId = selectedChatId.value;
  replyInput.value = "";
  replyError.value = ""; // 清除上一則錯誤
  scrollMessagesToBottom();
  try {
    await peekPhoneStore.sendMessageToContact(
      threadId,
      text,
      character.value,
    );
  } catch (err: any) {
    // 系統通知可能被全屏畫面蓋住而看不到，
    // 因此同時把錯誤訊息直接顯示在聊天界面內的橫幅上。
    replyError.value = err?.message ?? "聯絡人回覆失敗";
  } finally {
    scrollMessagesToBottom();
  }
}

function cancelReply(): void {
  peekPhoneStore.cancelContactReply();
  replyError.value = "";
}

// 切換聊天串或訊息數量變化時，自動捲動到底部
watch(
  () => selectedChat.value?.messages.length,
  () => scrollMessagesToBottom(),
);
// 打開有草稿的聊天：草稿就在輸入框裡；離開時沒動過就收回去，不會帶到別的聊天
const showDraftHistory = ref(false);
watch(selectedChatId, (id, prevId) => {
  scrollMessagesToBottom();
  showDraftHistory.value = false;
  const prevDraft = chats.value.find((c) => c.id === prevId)?.draft;
  if (prevDraft && replyInput.value === prevDraft) replyInput.value = "";
  const thread = chats.value.find((c) => c.id === id);
  if (!thread?.draft) return;
  if (!replyInput.value) replyInput.value = thread.draft;
  // 沒有草稿歷史可看：看到輸入框裡的草稿就算找到
  if (!thread.draftHistory?.length) reveal(secretKeys.draft(thread.id));
});

function openDraftHistory() {
  if (!selectedChat.value) return;
  showDraftHistory.value = true;
  reveal(secretKeys.draft(selectedChat.value.id));
}

// 記事本詳情
const selectedNoteId = ref<string | null>(null);
const selectedNote = computed(() =>
  notes.value.find((n) => n.id === selectedNoteId.value),
);

// 日記詳情
const selectedDiaryId = ref<string | null>(null);
const selectedDiary = computed(() =>
  diary.value.find((d) => d.id === selectedDiaryId.value),
);

// 相簿 / 已隱藏：點縮圖看那張照片的說明，預設第一張
const selectedPhotoId = ref<string | null>(null);
const selectedPhoto = computed(
  () => activePhotos.value.find((p) => p.id === selectedPhotoId.value) ?? activePhotos.value[0],
);
const selectedDeletedId = ref<string | null>(null);
const selectedDeleted = computed(
  () => deletedPhotos.value.find((p) => p.id === selectedDeletedId.value) ?? deletedPhotos.value[0],
);
const selectedHiddenId = ref<string | null>(null);
const selectedHidden = computed(
  () => hiddenPhotos.value.find((p) => p.id === selectedHiddenId.value) ?? hiddenPhotos.value[0],
);

// 瀏覽器歷史篩選
const selectedBrowserCategory = ref<"all" | "search" | "adult" | "general">("all");
const browserCategories = [
  { key: "all", label: "全部" },
  { key: "search", label: "搜尋" },
  { key: "general", label: "一般" },
  { key: "adult", label: "無痕" },
] as const;
// 成人網站的紀錄在無痕視窗裡：偷看過才會出現在列表
const privateCount = computed(() => browserHistory.value.filter((e) => e.category === "adult").length);
const privateRevealed = computed(() => isRevealed(secretKeys.browser));
const filteredBrowserHistory = computed(() =>
  browserHistory.value.filter((e) => {
    if (e.category === "adult" && !privateRevealed.value) return false;
    return selectedBrowserCategory.value === "all" || e.category === selectedBrowserCategory.value;
  }),
);
function revealPrivateBrowsing() {
  reveal(secretKeys.browser);
  selectedBrowserCategory.value = "adult";
}

const isAnyGroupLoading = computed(
  () =>
    groupStatus.value.A === "loading" ||
    groupStatus.value.B === "loading" ||
    groupStatus.value.C === "loading" ||
    groupStatus.value.D === "loading",
);

// 取得模塊對應的 group
function getGroupForTab(tab: PeekPhoneTab): "A" | "B" | "C" | "D" {
  const app = phoneApps.find((a) => a.key === tab);
  return app?.group ?? "A";
}

// 取得 badge 數量
function getBadge(tab: PeekPhoneTab): number {
  if (groupStatus.value[getGroupForTab(tab)] !== "done") return 0;
  switch (tab) {
    case "chat":
      return chats.value.length;
    case "memo":
      return memos.value.filter((m) => !m.done).length;
    case "gallery":
      return activePhotos.value.length;
    case "browser":
      return browserHistory.value.filter((e) => e.category === "adult").length;
    default:
      return 0;
  }
}

function toHomeApp(key: PeekPhoneTab): HomeApp {
  const app = phoneApps.find((a) => a.key === key)!;
  const place = placeOfView(key);
  return {
    key,
    label: app.label,
    icon: app.icon,
    badge: getBadge(key),
    status: groupStatus.value[app.group],
    secret: place !== null && unfound.value[place] > 0,
  };
}
const gridApps = computed(() => gridKeys.map(toHomeApp));
const dockApps = computed(() => dockKeys.map(toHomeApp));

function openApp(key: PeekPhoneTab) {
  currentView.value = key;
}

function goBackToHome() {
  currentView.value = "home";
  selectedChatId.value = null;
  selectedNoteId.value = null;
  selectedDiaryId.value = null;
  selectedPhotoId.value = null;
  selectedHiddenId.value = null;
  selectedDeletedId.value = null;
  selectedBrowserCategory.value = "all";
}

/** App 左上的返回：已隱藏、最近刪除回相簿，記事本回備忘錄，其他回主畫面 */
function goBackFromApp() {
  if (currentView.value === "hidden" || currentView.value === "deleted") {
    currentView.value = "gallery";
    selectedHiddenId.value = null;
    selectedDeletedId.value = null;
    return;
  }
  if (currentView.value === "notes") {
    currentView.value = "memo";
    selectedNoteId.value = null;
    return;
  }
  goBackToHome();
}

/** 右滑返回：先退手機裡的一層（面板、聊天、日記、App），退到主畫面或鎖屏才回 false，讓外面離開手機 */
function handleBack(): boolean {
  if (showSheet.value) {
    showSheet.value = false;
    return true;
  }
  const view = currentView.value;
  if (view === "lock" || view === "home") return false;
  if (view === "chat" && showDraftHistory.value) {
    showDraftHistory.value = false;
  } else if (view === "chat" && selectedChatId.value) {
    selectedChatId.value = null;
  } else if (view === "diary" && selectedDiaryId.value) {
    selectedDiaryId.value = null;
  } else {
    goBackFromApp();
  }
  return true;
}

defineExpose({ handleBack });

/** 點鎖屏通知：解鎖並直接打開那個聊天 */
function openThreadFromLock(threadId: string) {
  lockRetry.value = false;
  selectedChatId.value = threadId;
  currentView.value = "chat";
}

// 載入聊天資料並觸發生成
const chatRecord = ref<Chat | null>(null);
watch(chatRecord, (chat) => {
  now.value = computeChatNow(chat);
});

/** 僅載入聊天資料和快取（從記憶體或 IDB），不呼叫 API；回傳有沒有既有內容 */
async function loadChatData(): Promise<boolean> {
  if (!character.value) return false;
  try {
    await db.init();
    const chat = await db.get<Chat>(DB_STORES.CHATS, props.chatId);
    if (!chat) return false;
    chatRecord.value = chat;
    void loadRealData(chat);
    // 從記憶體快取 → IDB → 重置為 null，確保不會顯示其他聊天的內容
    return await peekPhoneStore.loadOrReset(props.characterId, props.chatId);
  } catch (err) {
    console.error("[PeekPhoneScreen] Failed to load chat data:", err);
    return false;
  }
}

async function loadRealData(chat: Chat) {
  if (!character.value) return;
  const userName = peekPhoneStore.resolveUserName(chat, props.characterId);
  userNameForPhone.value = userName;
  try {
    realData.value = await loadPeekRealData(chat, {
      userName,
      charName: character.value.data.name || character.value.nickname || "角色",
      now: computeChatNow(chat),
    });
  } catch (err) {
    console.warn("[PeekPhoneScreen] 讀取真的聊天資料失敗:", err);
  }
}

/** 第一次拿起這支手機時生成全部內容 */
async function loadAndGenerate() {
  if (!character.value) return;
  try {
    if (!chatRecord.value) {
      const chat = await db.get<Chat>(DB_STORES.CHATS, props.chatId);
      if (!chat) return;
      chatRecord.value = chat;
    }
    // v24：從 chatMessages 表載入訊息以供 extractChatContext 使用
    const chatMessages = await loadMessages(props.chatId);
    const chatWithMsgs = { ...chatRecord.value, messages: chatMessages };
    await peekPhoneStore.generateAll(
      props.characterId,
      props.chatId,
      character.value,
      chatWithMsgs,
    );
  } catch (err) {
    console.error("[PeekPhoneScreen] Failed to generate:", err);
  }
}

async function retryGroup(group: "A" | "B" | "C" | "D") {
  if (!character.value || !chatRecord.value) return;
  // 只有相簿組失敗（其他都好了）：只重生相簿組，不用整支手機重來
  const s = groupStatus.value;
  if (group === "D" && s.A === "done" && s.B === "done" && s.C === "done") {
    await refreshPhase("D");
    return;
  }
  const chatWithMsgs = { ...chatRecord.value, messages: await loadMessages(props.chatId) };
  await peekPhoneStore.retryGroup(group, character.value, chatWithMsgs);
}

async function refreshAll() {
  showSheet.value = false;
  if (!character.value) return;
  if (!chatRecord.value) {
    await loadChatData();
  }
  if (!chatRecord.value) return;
  peekPhoneStore.clearCache(props.characterId, props.chatId);
  peekPhoneStore.deleteFromIDB(props.characterId, props.chatId);
  const chatForRefresh = { ...chatRecord.value, messages: await loadMessages(props.chatId) };
  await peekPhoneStore.generateAll(
    props.characterId,
    props.chatId,
    character.value,
    chatForRefresh,
  );
}

async function refreshPhase(phase: "A" | "BC" | "D") {
  showSheet.value = false;
  if (!character.value) return;
  if (!chatRecord.value) {
    await loadChatData();
  }
  if (!chatRecord.value) return;
  const chatForPhase = { ...chatRecord.value, messages: await loadMessages(props.chatId) };
  await peekPhoneStore.regeneratePhase(
    phase,
    character.value,
    chatForPhase,
  );
}

onMounted(async () => {
  const hasData = await loadChatData();
  // 第一次拿起這支手機：直接開始生成，鎖定畫面會顯示進度
  if (!hasData && !isAnyGroupLoading.value) loadAndGenerate();
});

// Utils
const WEEKDAYS = ["日", "一", "二", "三", "四", "五", "六"];

/** 聊天裡的時間分隔：今天 / 昨天 / M/D，加上 HH:mm */
function formatChatStamp(ms: number): string {
  const d = new Date(ms);
  const today = new Date(now.value);
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  const day =
    d.toDateString() === today.toDateString()
      ? "今天"
      : d.toDateString() === yesterday.toDateString()
        ? "昨天"
        : `${d.getMonth() + 1}/${d.getDate()}`;
  return `${day} ${formatClock(d)}`;
}

function threadTime(thread: { messages: PeekChatMessage[] }): string {
  const last = thread.messages[thread.messages.length - 1];
  return last ? formatRelative(last.timestamp, now.value) : "";
}

/** 取得聊天列表的最後一則訊息預覽（去除換行） */
function getLastMessagePreview(thread: { messages: PeekChatMessage[] }): string {
  const last = thread.messages[thread.messages.length - 1];
  if (!last) return "";
  if (last.recalled) return recalledNotice(last);
  return last.content.replace(/\n/g, " ");
}

function recalledNotice(msg: PeekChatMessage): string {
  return msg.isSelf ? "你已收回一則訊息" : `${msg.senderName}已收回一則訊息`;
}

/** 收回的訊息：幾點傳出、存在了幾秒 */
function recalledMeta(msg: PeekChatMessage): string {
  const ms = toMillis(msg.timestamp);
  const parts = [ms ? `${formatClock(new Date(ms))} 傳出` : "傳出後收回"];
  if (msg.recalledAfter) parts.push(`只存在了 ${msg.recalledAfter} 秒`);
  return parts.join(" · ");
}

/** 群組聊天裡對方不只一個人時，泡泡上方標出是誰說的 */
function showSender(msg: PeekChatMessage, contactName: string): boolean {
  return !msg.isSelf && !!msg.senderName && msg.senderName !== contactName;
}

function getMealLabel(type: string) {
  return (
    (
      {
        breakfast: "早餐",
        lunch: "午餐",
        dinner: "晚餐",
        snack: "點心",
      } as Record<string, string>
    )[type] || type
  );
}

const MOOD_ICONS = { happy: Smile, neutral: Meh, sad: Frown, angry: Angry, excited: Laugh };
function getMood(mood: PeekDiaryEntry["mood"]) {
  return {
    icon: MOOD_ICONS[mood] ?? Meh,
    label: MOOD_LABELS[mood] ?? MOOD_LABELS.neutral,
  };
}

function formatDiaryDate(date: string): string {
  const d = new Date(`${date}T00:00:00`);
  if (Number.isNaN(d.getTime())) return date;
  return `${d.getMonth() + 1}月${d.getDate()}日 星期${WEEKDAYS[d.getDay()]}`;
}

function getAppTitle(key: PeekPhoneTab) {
  if (key === "browser") return "瀏覽紀錄";
  if (key === "settings") return "螢幕使用時間";
  return phoneApps.find((a) => a.key === key)?.label || "";
}

const appBackLabel = computed(() => {
  if (currentView.value === "hidden" || currentView.value === "deleted") return "相簿";
  if (currentView.value === "notes") return "備忘錄";
  return "主畫面";
});
const todayLabel = computed(
  () => `今天 · ${now.value.getMonth() + 1}月${now.value.getDate()}日 星期${WEEKDAYS[now.value.getDay()]}`,
);
</script>

<template>
  <div class="peek-phone-screen peek-theme">
    <Transition name="peek-view">
      <!-- ===== 鎖定畫面 ===== -->
      <PeekLockView
        v-if="currentView === 'lock'"
        key="lock"
        :name="charName"
        :avatar="charAvatar"
        :now="now"
        :next-schedule="lockNextSchedule"
        :notifications="lockNotifications"
        :group-status="groupStatus"
        :lock-screen="storeData?.lockScreen"
        :status-text="lockStatusText"
        :place-text="lockPlaceText"
        :need-code="needCode"
        @unlock="onUnlock"
        @open-thread="openThreadFromLock"
        @solved="onLockSolved"
        @skip="onLockSkip"
      />

      <!-- ===== 主畫面 ===== -->
      <PeekHomeView
        v-else-if="currentView === 'home'"
        key="home"
        :avatar="charAvatar"
        :now="now"
        :mood-line="homeMoodLine"
        :photo="homePhoto"
        :grid-apps="gridApps"
        :dock-apps="dockApps"
        @open="openApp"
      />

      <!-- ===== App 內頁 ===== -->
      <div
        v-else
        :key="currentView"
        class="app-view"
        :class="darkTabs.has(currentView) ? 'is-dark' : 'is-light'"
      >
        <!-- 聊天詳情有自己的頂部欄 -->
        <template v-if="!(currentView === 'chat' && selectedChat)">
          <header class="app-bar">
            <button
              v-if="currentView === 'diary' && selectedDiary"
              type="button"
              class="app-back"
              @click="selectedDiaryId = null"
            >
              <ChevronLeft :size="24" aria-hidden="true" />日記
            </button>
            <button v-else type="button" class="app-back" @click="goBackFromApp">
              <ChevronLeft :size="24" aria-hidden="true" />{{ appBackLabel }}
            </button>
          </header>
        </template>

        <!-- 載入中 -->
        <div
          v-if="groupStatus[getGroupForTab(currentView)] === 'loading'"
          class="app-scroll"
        >
          <h1 class="app-title">{{ getAppTitle(currentView) }}</h1>
          <div class="app-state">
            <Loader2 :size="32" class="spin" aria-hidden="true" />
            <div>還在讀取這裡的內容…</div>
          </div>
        </div>

        <!-- 錯誤 -->
        <div
          v-else-if="groupStatus[getGroupForTab(currentView)] === 'error'"
          class="app-scroll"
        >
          <h1 class="app-title">{{ getAppTitle(currentView) }}</h1>
          <div class="app-state">
            <AlertTriangle :size="32" aria-hidden="true" />
            <div>{{ groupErrors[getGroupForTab(currentView)] || "生成失敗" }}</div>
            <button
              type="button"
              class="app-retry"
              @click="retryGroup(getGroupForTab(currentView))"
            >
              <RefreshCw :size="16" aria-hidden="true" />重試
            </button>
          </div>
        </div>

        <!-- ===== 訊息 ===== -->
        <template v-else-if="currentView === 'chat'">
          <div v-if="!selectedChat" class="app-scroll">
            <h1 class="app-title">訊息</h1>
            <ul v-if="chats.length > 0" class="chat-list">
              <li v-for="thread in chats" :key="thread.id">
                <button type="button" class="chat-row" @click="selectedChatId = thread.id">
                  <span class="avatar" :style="{ background: avatarColor(thread.contactName) }">
                    {{ initialOf(thread.contactName) }}
                  </span>
                  <span class="chat-row-main">
                    <span class="chat-row-top">
                      <span class="chat-row-name">{{ thread.contactName }}</span>
                      <span class="chat-row-time">{{ threadTime(thread) }}</span>
                    </span>
                    <span class="chat-row-preview">{{ getLastMessagePreview(thread) }}</span>
                  </span>
                </button>
              </li>
            </ul>
            <div v-else class="app-empty">沒有聊天紀錄</div>
          </div>

          <div v-else class="chat-detail">
            <header class="chat-bar">
              <button type="button" class="app-back" aria-label="返回訊息列表" @click="selectedChatId = null">
                <ChevronLeft :size="24" aria-hidden="true" />
              </button>
              <div class="chat-bar-who">
                <span class="avatar avatar--sm" :style="{ background: avatarColor(selectedChat.contactName) }">
                  {{ initialOf(selectedChat.contactName) }}
                </span>
                <span class="chat-bar-name">{{ selectedChat.contactName }}</span>
              </div>
              <span class="chat-bar-spacer" />
            </header>

            <div ref="chatMessagesEl" class="chat-messages">
              <template v-for="item in chatItems" :key="item.msg.id">
                <div v-if="item.stamp" class="chat-stamp">{{ item.stamp }}</div>
                <!-- 收回的訊息：偷看前只看到「已收回」 -->
                <div
                  v-if="item.msg.recalled && !isRevealed(secretKeys.recalled(item.msg.id))"
                  class="chat-recalled"
                >
                  <span class="chat-recalled-notice">{{ recalledNotice(item.msg) }}</span>
                  <button
                    type="button"
                    class="peek-chip"
                    @click="reveal(secretKeys.recalled(item.msg.id))"
                  >
                    <Eye :size="14" aria-hidden="true" />偷看{{ item.msg.isSelf ? " TA " : item.msg.senderName }}收回了什麼
                  </button>
                </div>
                <div v-else class="chat-msg" :class="{ self: item.msg.isSelf, recalled: item.msg.recalled }">
                  <span v-if="showSender(item.msg, selectedChat.contactName)" class="chat-sender">
                    {{ item.msg.senderName }}
                  </span>
                  <div class="chat-bubble">{{ item.msg.content }}</div>
                  <span v-if="item.msg.recalled" class="chat-recalled-meta">{{ recalledMeta(item.msg) }}</span>
                  <!-- 沒接通的電話：偷看他打來想說什麼 -->
                  <template v-if="item.msg.callReason">
                    <span v-if="isRevealed(secretKeys.call(item.msg.id))" class="chat-recalled-meta">
                      想說的是：{{ item.msg.callReason }}
                    </span>
                    <button
                      v-else
                      type="button"
                      class="peek-chip"
                      @click="reveal(secretKeys.call(item.msg.id))"
                    >
                      <Eye :size="14" aria-hidden="true" />偷看 TA 打來想說什麼
                    </button>
                  </template>
                </div>
              </template>
              <!-- 對方輸入中提示 -->
              <div v-if="isReplyingCurrent" class="chat-msg">
                <div class="chat-bubble typing" aria-label="對方輸入中">
                  <span class="typing-dot" />
                  <span class="typing-dot" />
                  <span class="typing-dot" />
                </div>
              </div>
            </div>

            <!-- 錯誤橫幅：直接顯示在聊天畫面內，避免系統通知被蓋住 -->
            <div v-if="replyError" class="chat-error" role="alert">
              <span class="chat-error-text">{{ replyError }}</span>
              <button type="button" class="chat-error-close" aria-label="關閉" @click="replyError = ''">
                <X :size="16" />
              </button>
            </div>

            <!-- 草稿：改過幾次可以偷看 -->
            <div v-if="selectedChat.draft && selectedChat.draftHistory?.length" class="chat-draft">
              <div v-if="showDraftHistory" class="chat-draft-history" role="status">
                <div class="chat-draft-history-head">
                  <span>草稿改了 {{ selectedChat.draftHistory.length + 1 }} 次</span>
                  <button type="button" class="chat-draft-close" aria-label="收起草稿紀錄" @click="showDraftHistory = false">
                    <X :size="16" />
                  </button>
                </div>
                <ol class="chat-draft-list">
                  <li v-for="(version, i) in selectedChat.draftHistory" :key="i" class="chat-draft-old">{{ version }}</li>
                  <li class="chat-draft-now">{{ selectedChat.draft }}</li>
                </ol>
              </div>
              <button v-else type="button" class="peek-chip" @click="openDraftHistory">
                <Eye :size="14" aria-hidden="true" />輸入框裡的草稿改了 {{ selectedChat.draftHistory.length + 1 }} 次 · 看紀錄 ›
              </button>
            </div>

            <!-- 跟使用者那串是真的聊天：只看得到輸入框裡沒送出的字 -->
            <div v-if="isRealUserThread(selectedChat)" class="chat-input-bar">
              <div class="chat-input chat-input--readonly" role="note">
                {{ selectedChat.draft || "輸入框是空的" }}
              </div>
            </div>
            <!-- 以手機主人身份回覆聯絡人的輸入列 -->
            <div v-else class="chat-input-bar">
              <input
                v-model="replyInput"
                class="chat-input"
                type="text"
                :aria-label="`以 ${charName} 的身份回覆`"
                :placeholder="`以 ${charName} 的身份回覆…`"
                :disabled="isReplyingCurrent"
                @keydown.enter.prevent="sendReply"
              />
              <button
                v-if="isReplyingCurrent"
                type="button"
                class="chat-send"
                aria-label="取消回覆"
                @click="cancelReply"
              >
                <Loader2 :size="18" class="spin" />
              </button>
              <button
                v-else
                type="button"
                class="chat-send"
                :disabled="!replyInput.trim()"
                aria-label="傳送"
                @click="sendReply"
              >
                <ArrowUp :size="18" :stroke-width="2.4" />
              </button>
            </div>
          </div>
        </template>

        <!-- ===== 行事曆 ===== -->
        <div v-else-if="currentView === 'schedule'" class="app-scroll">
          <h1 class="app-title">行事曆</h1>
          <p class="app-sub">{{ todayLabel }}</p>
          <ol v-if="schedule.length > 0" class="app-card sched-list">
            <li
              v-for="item in schedule"
              :key="item.id"
              class="app-row sched-item"
              :class="{ done: item.done }"
            >
              <span class="sched-time">{{ item.time || "整天" }}</span>
              <span class="sched-dot" aria-hidden="true" />
              <span class="sched-main">
                <span class="sched-title">
                  {{ item.title }}
                  <span v-if="item.secret" class="secret-tag">沒讓你知道</span>
                </span>
                <span v-if="item.location" class="sched-loc">{{ item.location }}</span>
              </span>
              <Check v-if="item.done" :size="16" class="sched-check" aria-label="已完成" />
            </li>
          </ol>
          <div v-else class="app-empty">今天沒有行程</div>
          <template v-if="upcomingPlans.length > 0">
            <div class="app-section-label">接下來</div>
            <ol class="app-card sched-list">
              <li v-for="plan in upcomingPlans" :key="plan.id" class="app-row sched-item">
                <span class="sched-time">{{ shortPlanDate(plan.date) }}</span>
                <span class="sched-dot" aria-hidden="true" />
                <span class="sched-main">
                  <span class="sched-title">
                    {{ plan.title }}
                    <span v-if="plan.secret" class="secret-tag">沒讓你知道</span>
                  </span>
                  <span v-if="formatPlanTime(plan) || plan.place" class="sched-loc">
                    {{ [formatPlanTime(plan), plan.place].filter(Boolean).join("　") }}
                  </span>
                </span>
              </li>
            </ol>
          </template>
          <template v-if="pendingCalls.length > 0">
            <div class="app-section-label">提醒</div>
            <ol class="app-card sched-list">
              <li v-for="call in pendingCalls" :key="call.id" class="app-row sched-item">
                <span class="sched-time">{{ call.time }}</span>
                <span class="sched-dot" aria-hidden="true" />
                <span class="sched-main">
                  <span class="sched-title">
                    打電話給{{ userContactName }}
                    <span class="secret-tag">沒讓你知道</span>
                  </span>
                  <span class="sched-loc">想說：{{ call.reason }}</span>
                </span>
              </li>
            </ol>
          </template>
          <template v-if="helpedEvents.length > 0">
            <div class="app-section-label">幫你記進行事曆的</div>
            <ul class="app-card">
              <li v-for="e in helpedEvents" :key="e.id" class="app-row sched-item">
                <span class="sched-main">
                  <span class="sched-title">{{ e.title }}</span>
                  <span class="sched-loc">{{ helpedWhen(e) }}</span>
                </span>
              </li>
            </ul>
          </template>
        </div>

        <!-- ===== 飲食記錄 ===== -->
        <div v-else-if="currentView === 'meals'" class="app-scroll">
          <h1 class="app-title">飲食記錄</h1>
          <p class="app-sub">今天吃了什麼</p>
          <ul v-if="meals.length > 0" class="app-card">
            <li v-for="meal in meals" :key="meal.id" class="app-row meal-row">
              <span class="meal-chip" :class="meal.mealType">{{ getMealLabel(meal.mealType) }}</span>
              <span class="meal-main">
                <span class="meal-food">{{ meal.food }}</span>
                <span v-if="meal.note" class="meal-note">{{ meal.note }}</span>
              </span>
              <span class="meal-time">{{ meal.time }}</span>
            </li>
          </ul>
          <div v-else class="app-empty">今天還沒吃東西</div>
        </div>

        <!-- ===== 錢包 ===== -->
        <div v-else-if="currentView === 'balance'" class="app-scroll">
          <h1 class="app-title">錢包</h1>
          <div class="wallet-card">
            <span class="wallet-label">帳戶餘額</span>
            <span class="wallet-amount">
              <span class="wallet-currency">$</span>{{ balance.toLocaleString() }}
            </span>
            <span class="wallet-hint">上次更新：今天</span>
          </div>
          <template v-if="transactions.length > 0">
            <div class="app-section-label">交易紀錄</div>
            <ul class="app-card">
              <li v-for="tx in transactions" :key="tx.id" class="app-row tx-row">
                <span class="tx-main">
                  <span class="tx-desc">{{ tx.description }}</span>
                  <span class="tx-time">{{ tx.time }}</span>
                </span>
                <span class="tx-amount" :class="tx.amount >= 0 ? 'is-in' : 'is-out'">
                  {{ tx.amount >= 0 ? "+" : "" }}{{ tx.amount.toLocaleString() }}
                </span>
              </li>
            </ul>
          </template>
        </div>

        <!-- ===== 備忘錄 ===== -->
        <div v-else-if="currentView === 'memo'" class="app-scroll">
          <h1 class="app-title">備忘錄</h1>
          <div v-if="memos.length > 0" class="app-section-label">待辦</div>
          <ul v-if="memos.length > 0" class="app-card">
            <li
              v-for="memo in memos"
              :key="memo.id"
              class="app-row memo-row"
              :class="{ done: memo.done }"
            >
              <span class="memo-check" :aria-label="memo.done ? '已完成' : '未完成'">
                <Check v-if="memo.done" :size="14" :stroke-width="3" aria-hidden="true" />
              </span>
              <span class="memo-text">
                {{ memo.content }}
                <span v-if="memo.secret" class="secret-tag">沒讓你知道</span>
              </span>
            </li>
          </ul>
          <template v-if="notes.length > 0">
            <div class="app-section-label">筆記</div>
            <div class="note-list note-list--tight">
              <button
                v-for="note in notes"
                :key="note.id"
                type="button"
                class="note-card"
                @click="selectedNoteId = note.id; openApp('notes')"
              >
                <span class="note-card-title">{{ note.title }}</span>
                <span class="note-card-preview">{{ note.content }}</span>
                <span class="note-card-date">{{ new Date(note.updatedAt).toLocaleDateString("zh-TW") }}</span>
              </button>
            </div>
          </template>
          <div v-if="memos.length === 0 && notes.length === 0" class="app-empty">沒有備忘錄</div>
        </div>

        <!-- ===== 記事本 ===== -->
        <div v-else-if="currentView === 'notes'" class="app-scroll">
          <template v-if="!selectedNote">
            <h1 class="app-title">記事本</h1>
            <div v-if="notes.length > 0" class="note-list">
              <button
                v-for="note in notes"
                :key="note.id"
                type="button"
                class="note-card"
                @click="selectedNoteId = note.id"
              >
                <span class="note-card-title">{{ note.title }}</span>
                <span class="note-card-preview">{{ note.content }}</span>
                <span class="note-card-date">{{ new Date(note.updatedAt).toLocaleDateString("zh-TW") }}</span>
              </button>
            </div>
            <div v-else class="app-empty">沒有記事</div>
          </template>
          <article v-else class="reading">
            <h1 class="app-title">{{ selectedNote.title }}</h1>
            <p class="app-sub">{{ new Date(selectedNote.updatedAt).toLocaleDateString("zh-TW") }}</p>
            <div class="reading-body">{{ selectedNote.content }}</div>
          </article>
        </div>

        <!-- ===== 日記 ===== -->
        <div v-else-if="currentView === 'diary'" class="app-scroll">
          <template v-if="!selectedDiary">
            <h1 class="app-title">日記</h1>
            <div v-if="diary.length > 0" class="note-list">
              <button
                v-for="entry in diary"
                :key="entry.id"
                type="button"
                class="note-card"
                @click="selectedDiaryId = entry.id"
              >
                <span class="diary-meta">
                  <span class="diary-date">{{ formatDiaryDate(entry.date) }}</span>
                  <span class="mood-chip">
                    <component :is="getMood(entry.mood).icon" :size="14" aria-hidden="true" />
                    {{ getMood(entry.mood).label }}
                  </span>
                  <span v-if="entry.weather" class="diary-weather">{{ entry.weather }}</span>
                </span>
                <span class="note-card-preview">{{ entry.content }}</span>
              </button>
            </div>
            <div v-else class="app-empty">沒有日記</div>
          </template>
          <article v-else class="reading">
            <h1 class="app-title app-title--sm">{{ formatDiaryDate(selectedDiary.date) }}</h1>
            <p class="diary-meta">
              <span class="mood-chip">
                <component :is="getMood(selectedDiary.mood).icon" :size="14" aria-hidden="true" />
                {{ getMood(selectedDiary.mood).label }}
              </span>
              <span v-if="selectedDiary.weather" class="diary-weather">{{ selectedDiary.weather }}</span>
            </p>
            <div class="reading-body">{{ selectedDiary.content }}</div>
          </article>
        </div>

        <!-- ===== 相簿 ===== -->
        <div v-else-if="currentView === 'gallery'" class="app-scroll">
          <h1 class="app-title">相簿</h1>
          <p class="app-sub">{{ activePhotos.length }} 張照片</p>
          <template v-if="activePhotos.length > 0">
            <div class="photo-grid">
              <button
                v-for="item in activePhotos"
                :key="item.id"
                type="button"
                class="photo-tile"
                :class="{ 'is-selected': selectedPhoto?.id === item.id }"
                :style="{ background: photoTone(item.description) }"
                :aria-label="`照片 ${item.date}`"
                :aria-pressed="selectedPhoto?.id === item.id"
                @click="selectedPhotoId = item.id"
              >
                <img v-if="item.imageUrl" :src="item.imageUrl" alt="" class="photo-tile-img" loading="lazy" />
                <Camera v-else-if="item.source === 'selfie'" :size="22" aria-hidden="true" />
                <Image v-else-if="item.source === 'scene'" :size="22" aria-hidden="true" />
                <MessageCircle v-else :size="22" aria-hidden="true" />
                <span class="photo-tile-tag">{{ item.date.slice(5).replace("-", "/") }}</span>
              </button>
            </div>
            <div v-if="selectedPhoto" class="app-card photo-detail">
              <div class="photo-detail-meta">
                <span class="photo-source">
                  {{ selectedPhoto.source === "selfie" ? "自拍" : selectedPhoto.source === "scene" ? "拍攝" : "從聊天存下" }}
                </span>
                <span>{{ selectedPhoto.date }}</span>
              </div>
              <p class="photo-desc">{{ selectedPhoto.description }}</p>
              <p class="photo-reason">
                <span class="photo-reason-label">{{ selectedPhoto.source === "saved" ? "存下來的原因" : "拍的時候在想" }}</span>
                {{ selectedPhoto.reason }}
              </p>
            </div>
          </template>
          <div v-else class="app-empty">沒有照片</div>

          <div class="app-section-label">其他相簿</div>
          <div class="app-card">
            <button type="button" class="app-row album-row" @click="openApp('deleted')">
              <Trash2 :size="18" aria-hidden="true" />
              <span class="album-row-label">最近刪除</span>
              <span class="album-row-count">{{ deletedPhotos.length }}</span>
              <ChevronRight :size="16" class="album-row-chev" aria-hidden="true" />
            </button>
            <button type="button" class="app-row album-row" @click="openApp('hidden')">
              <Lock :size="18" aria-hidden="true" />
              <span class="album-row-label">已隱藏</span>
              <span class="album-row-count">{{ hiddenPhotos.length }}</span>
              <ChevronRight :size="16" class="album-row-chev" aria-hidden="true" />
            </button>
          </div>
        </div>

        <!-- ===== 最近刪除 ===== -->
        <div v-else-if="currentView === 'deleted'" class="app-scroll">
          <h1 class="app-title">最近刪除</h1>
          <p class="app-sub">項目會在 30 天後永久刪除。</p>
          <template v-if="deletedPhotos.length > 0">
            <div class="photo-grid">
              <button
                v-for="item in deletedPhotos"
                :key="item.id"
                type="button"
                class="photo-tile"
                :class="{ 'is-selected': selectedDeleted?.id === item.id }"
                :style="{ background: photoTone(item.description) }"
                :aria-label="`刪掉的照片，還剩 ${item.deletedDaysLeft} 天${item.secret && !isRevealed(secretKeys.photo(item.id)) ? '，這張有秘密' : ''}`"
                :aria-pressed="selectedDeleted?.id === item.id"
                @click="selectedDeletedId = item.id"
              >
                <Image :size="22" aria-hidden="true" />
                <span v-if="item.secret && !isRevealed(secretKeys.photo(item.id))" class="photo-tile-secret" aria-hidden="true" />
                <span class="photo-tile-tag">{{ item.deletedDaysLeft }}天</span>
              </button>
            </div>
            <template v-if="selectedDeleted">
              <div
                v-if="selectedDeleted.secret && isRevealed(secretKeys.photo(selectedDeleted.id))"
                class="peek-card"
                role="status"
              >
                <div class="peek-card-head">
                  <Eye :size="14" aria-hidden="true" />偷看這張照片
                  <span class="peek-card-date">{{ selectedDeleted.date.slice(5).replace("-", "/") }}</span>
                </div>
                <p class="peek-card-text">{{ selectedDeleted.description }}</p>
                <p class="peek-card-text">{{ selectedDeleted.secret }}</p>
              </div>
              <button
                v-else-if="selectedDeleted.secret"
                type="button"
                class="peek-card peek-card--btn"
                @click="reveal(secretKeys.photo(selectedDeleted.id))"
              >
                <span class="peek-card-head"><Eye :size="14" aria-hidden="true" />偷看這張照片</span>
                <span class="peek-card-text">刪掉了，卻還留在這裡</span>
              </button>
              <div v-else class="app-card photo-detail">
                <div class="photo-detail-meta">
                  <span class="photo-source">還剩 {{ selectedDeleted.deletedDaysLeft }} 天</span>
                  <span>{{ selectedDeleted.date }}</span>
                </div>
                <p class="photo-desc">{{ selectedDeleted.description }}</p>
                <p v-if="selectedDeleted.reason" class="photo-reason">{{ selectedDeleted.reason }}</p>
              </div>
            </template>
          </template>
          <div v-else class="app-empty">沒有刪掉的照片</div>
        </div>

        <!-- ===== 已隱藏 ===== -->
        <div v-else-if="currentView === 'hidden'" class="app-scroll">
          <h1 class="app-title">已隱藏</h1>
          <p class="app-sub">這些照片被藏在手機深處，不對外公開</p>
          <template v-if="hiddenPhotos.length > 0">
            <div class="photo-grid">
              <button
                v-for="item in hiddenPhotos"
                :key="item.id"
                type="button"
                class="photo-tile is-hidden"
                :class="{ 'is-selected': selectedHidden?.id === item.id }"
                :aria-label="`隱藏的照片 ${item.date}`"
                :aria-pressed="selectedHidden?.id === item.id"
                @click="selectedHiddenId = item.id"
              >
                <EyeOff :size="22" aria-hidden="true" />
                <span class="photo-tile-tag">{{ item.date.slice(5).replace("-", "/") }}</span>
              </button>
            </div>
            <div v-if="selectedHidden" class="app-card photo-detail">
              <div class="photo-detail-meta">
                <span class="photo-source">
                  {{ selectedHidden.type === "selfie" ? "本人自拍" : selectedHidden.type === "saved" ? "從網路存下" : "截圖" }}
                </span>
                <span>{{ selectedHidden.date }}</span>
              </div>
              <p class="photo-desc">{{ selectedHidden.description }}</p>
              <p class="photo-reason">
                <span class="photo-reason-label">藏起來的原因</span>
                {{ selectedHidden.reason }}
              </p>
            </div>
          </template>
          <div v-else class="app-empty">沒有隱藏的照片</div>
        </div>

        <!-- ===== 瀏覽紀錄 ===== -->
        <div v-else-if="currentView === 'browser'" class="app-scroll">
          <h1 class="app-title">瀏覽紀錄</h1>
          <div class="segmented" role="group" aria-label="篩選">
            <button
              v-for="cat in browserCategories"
              :key="cat.key"
              type="button"
              class="segmented-btn"
              :aria-pressed="selectedBrowserCategory === cat.key"
              @click="selectedBrowserCategory = cat.key"
            >
              {{ cat.label }}
            </button>
          </div>
          <button
            v-if="privateCount > 0 && !privateRevealed && (selectedBrowserCategory === 'all' || selectedBrowserCategory === 'adult')"
            type="button"
            class="peek-chip browser-private"
            @click="revealPrivateBrowsing"
          >
            <Eye :size="14" aria-hidden="true" />還有 {{ privateCount }} 筆無痕瀏覽紀錄 · 偷看 ›
          </button>
          <ul v-if="filteredBrowserHistory.length > 0" class="app-card">
            <li
              v-for="entry in filteredBrowserHistory"
              :key="entry.id"
              class="app-row browser-row"
            >
              <span class="browser-icon" :class="entry.category">
                <Search v-if="entry.category === 'search'" :size="16" aria-hidden="true" />
                <EyeOff v-else-if="entry.category === 'adult'" :size="16" aria-hidden="true" />
                <Globe v-else :size="16" aria-hidden="true" />
              </span>
              <span class="browser-main">
                <span class="browser-title">{{ entry.title }}</span>
                <span class="browser-url">{{ entry.url }}</span>
              </span>
              <span class="browser-side">
                <span v-if="entry.category === 'adult'" class="browser-tag">成人</span>
                <span class="browser-time">{{ entry.time }}</span>
              </span>
            </li>
          </ul>
          <div v-else-if="selectedBrowserCategory !== 'adult' || privateRevealed" class="app-empty">沒有瀏覽紀錄</div>
        </div>

        <!-- ===== 設定 · 螢幕使用時間 ===== -->
        <div v-else-if="currentView === 'settings'" class="app-scroll">
          <h1 class="app-title">螢幕使用時間</h1>
          <PeekScreenTime
            :screen-time="storeData?.screenTime"
            :revealed="isRevealed(secretKeys.screen)"
            @reveal="reveal(secretKeys.screen)"
          />
        </div>
      </div>
    </Transition>

    <!-- ===== 窺視層：頂部膠囊＋窺視選單 ===== -->
    <PeekCapsule
      :name="charName"
      :avatar="charAvatar"
      :battery="battery"
      :active="showSheet"
      :loading="isAnyGroupLoading"
      :label="capsuleLabel"
      :secret="hasUnfound"
      @open="showSheet = !showSheet"
    />
    <PeekSheet
      :open="showSheet"
      :name="charName"
      :avatar="charAvatar"
      :group-status="groupStatus"
      :secrets="secrets"
      :progress="progress"
      @close="showSheet = false"
      @go-secret="goToSecret"
      @regenerate="refreshPhase"
      @regenerate-all="refreshAll"
      @leave="emit('back')"
    />
  </div>
</template>

<style lang="scss">
@use "@/components/peek-phone/peek-theme.scss";
</style>

<style lang="scss" scoped>
@import url("https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600&display=swap");

.peek-phone-screen {
  position: relative;
  width: 100%;
  height: 100%;
  overflow: hidden;
  background: #000000;
}

// 鎖屏 → 主畫面 → App 之間淡入淡出
.peek-view-enter-active,
.peek-view-leave-active {
  transition: opacity 0.18s ease;
}

.peek-view-enter-from,
.peek-view-leave-to {
  opacity: 0;
}

// ===== App 共用骨架 =====
.app-view {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  padding-top: calc(var(--safe-top, 0px) + 56px);
  box-sizing: border-box;
  background: var(--a-bg);
  color: var(--a-ink);

  &.is-dark {
    --a-bg: var(--p-dark-bg);
    --a-card: var(--p-dark-card);
    --a-raised: var(--p-dark-raised);
    --a-line: var(--p-dark-line);
    --a-ink: #ffffff;
    --a-ink-2: var(--p-dark-ink-2);
    --a-ink-3: var(--p-dark-ink-3);
    --a-link: var(--p-dark-link);
    --a-peek-line: var(--p-peek);
    --a-peek-bg: var(--p-peek-soft);
    --a-peek-ink: var(--p-peek);
  }

  &.is-light {
    --a-bg: var(--p-light-bg);
    --a-card: var(--p-light-card);
    --a-raised: #ecebe7;
    --a-line: var(--p-light-line);
    --a-ink: var(--p-ink);
    --a-ink-2: var(--p-light-ink-2);
    --a-ink-3: var(--p-light-ink-2);
    --a-link: var(--p-light-link);
    --a-peek-line: var(--p-peek-line-light);
    --a-peek-bg: var(--p-peek-soft-light);
    --a-peek-ink: var(--p-peek-ink-light);
  }
}

.app-bar {
  flex-shrink: 0;
  height: 44px;
  display: flex;
  align-items: center;
  padding: 0 8px;
}

.app-back {
  height: 44px;
  min-width: 44px;
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 0 8px 0 0;
  border: none;
  background: none;
  color: var(--a-link);
  font-family: inherit;
  font-size: 16px;
  cursor: pointer;
}

.app-scroll {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 0 16px calc(var(--safe-bottom, 0px) + 32px);
}

.app-title {
  margin: 4px 0 0;
  font-size: 30px;
  font-weight: 700;
  line-height: 1.25;

  &--sm {
    font-size: 24px;
  }
}

.app-sub {
  margin: 4px 0 0;
  font-size: 13px;
  color: var(--a-ink-2);
}

.app-section-label {
  margin: 24px 4px 8px;
  font-size: 13px;
  color: var(--a-ink-2);
}

.app-card {
  list-style: none;
  margin: 16px 0 0;
  padding: 0 16px;
  background: var(--a-card);
  border-radius: 16px;

  .app-section-label + & {
    margin-top: 0;
  }
}

.app-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 0;
  border-bottom: 1px solid var(--a-line);

  &:last-child {
    border-bottom: none;
  }
}

.app-empty {
  margin-top: 48px;
  text-align: center;
  font-size: 14px;
  color: var(--a-ink-2);
}

.app-state {
  margin-top: 64px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  font-size: 14px;
  color: var(--a-ink-2);
  text-align: center;
}

.app-retry {
  height: 44px;
  padding: 0 18px;
  border: none;
  border-radius: 22px;
  background: var(--a-raised);
  color: var(--a-ink);
  font-family: inherit;
  font-size: 14px;
  font-weight: 500;
  display: flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
}

.avatar {
  width: 48px;
  height: 48px;
  border-radius: 24px;
  flex-shrink: 0;
  color: #ffffff;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 18px;
  font-weight: 700;

  &--sm {
    width: 34px;
    height: 34px;
    border-radius: 17px;
    font-size: 14px;
  }
}

.spin {
  animation: peek-spin 1s linear infinite;
}

// ===== 窺視層：偷看用的琥珀虛線（深色、淺色 App 各自換色） =====
.peek-chip {
  align-self: center;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 32px;
  max-width: 100%;
  padding: 6px 12px 6px 10px;
  box-sizing: border-box;
  border-radius: 16px;
  border: 1px dashed var(--a-peek-line);
  background: var(--a-peek-bg);
  color: var(--a-peek-ink);
  font-family: inherit;
  font-size: 12px;
  font-weight: 500;
  line-height: 1.4;
  text-align: left;
  cursor: pointer;

  svg {
    flex-shrink: 0;
  }
}

.peek-card {
  width: 100%;
  margin-top: 16px;
  padding: 12px 14px;
  box-sizing: border-box;
  border-radius: 18px;
  border: 1px dashed var(--a-peek-line);
  background: var(--a-peek-bg);
  display: flex;
  flex-direction: column;
  gap: 8px;
  font-family: inherit;
  text-align: left;

  &--btn {
    cursor: pointer;
  }
}

.peek-card-head {
  display: flex;
  align-items: center;
  gap: 6px;
  color: var(--a-peek-ink);
  font-size: 12px;
  font-weight: 700;
}

.peek-card-date {
  margin-left: auto;
  font-family: var(--p-num);
  font-weight: 500;
}

.peek-card-text {
  margin: 0;
  font-size: 14px;
  line-height: 1.6;
  color: var(--a-ink);
  white-space: pre-line;
}

@keyframes peek-spin {
  to {
    transform: rotate(360deg);
  }
}

// ===== 訊息 =====
.chat-list {
  list-style: none;
  margin: 12px 0 0;
  padding: 0;
}

.chat-row {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 0;
  border: none;
  background: none;
  color: inherit;
  font-family: inherit;
  text-align: left;
  cursor: pointer;
}

.chat-row-main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding-bottom: 10px;
  border-bottom: 1px solid var(--a-line);
}

.chat-row-top {
  display: flex;
  justify-content: space-between;
  gap: 8px;
}

.chat-row-name {
  font-size: 16px;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.chat-row-time {
  flex-shrink: 0;
  font-size: 13px;
  color: var(--a-ink-3);
}

.chat-row-preview {
  font-size: 14px;
  color: var(--a-ink-3);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.chat-detail {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.chat-bar {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  height: 56px;
  padding: 0 8px;
  border-bottom: 1px solid var(--a-line);
}

.chat-bar-who {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
}

.chat-bar-name {
  max-width: 100%;
  font-size: 11px;
  color: #d6d6da;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.chat-bar-spacer {
  width: 44px;
  flex-shrink: 0;
}

.chat-messages {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 14px 14px 12px;
}

.chat-stamp {
  align-self: center;
  margin: 8px 0 4px;
  font-size: 11px;
  color: var(--a-ink-3);
}

.chat-msg {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;

  &.self {
    align-items: flex-end;
  }
}

// 收回的訊息
.chat-recalled {
  align-self: center;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  margin: 4px 0;
}

.chat-recalled-notice {
  padding: 5px 12px;
  border-radius: 12px;
  background: #1e1f23;
  color: var(--a-ink-2);
  font-size: 12px;
}

.chat-msg.recalled .chat-bubble {
  border: 1.5px dashed var(--a-peek-line);
  background: transparent;
}

.chat-recalled-meta {
  margin: 0 4px;
  font-size: 11px;
  color: var(--a-peek-ink);
}

// 草稿紀錄
.chat-draft {
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  padding: 0 14px 6px;
}

.chat-draft-history {
  padding: 10px 12px 12px;
  border-radius: 16px;
  border: 1px dashed var(--a-peek-line);
  background: var(--a-peek-bg);
}

.chat-draft-history-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  color: var(--a-peek-ink);
  font-size: 12px;
  font-weight: 700;
}

.chat-draft-close {
  width: 32px;
  height: 32px;
  margin: -6px -6px -6px 0;
  border: none;
  background: none;
  color: inherit;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}

.chat-draft-list {
  list-style: none;
  margin: 6px 0 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 14px;
  line-height: 1.5;
}

.chat-draft-old {
  color: var(--a-ink-3);
  text-decoration: line-through;
}

.secret-tag {
  display: inline-block;
  margin-left: 6px;
  padding: 1px 6px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 600;
  vertical-align: 1px;
  color: var(--p-peek-ink-light);
  background: var(--p-peek-soft-light);
  border: 1px solid var(--p-peek-line-light);
}

.chat-draft-now {
  color: var(--a-ink);
}

.chat-sender {
  margin-left: 12px;
  font-size: 11px;
  color: var(--a-ink-3);
}

.chat-bubble {
  max-width: 72%;
  padding: 9px 13px;
  border-radius: 18px 18px 18px 6px;
  background: var(--a-raised);
  font-size: 15px;
  line-height: 1.45;
  white-space: pre-line;
  overflow-wrap: anywhere;

  .self & {
    border-radius: 18px 18px 6px 18px;
    background: var(--p-self-bubble);
  }

  &.typing {
    display: flex;
    gap: 4px;
    padding: 13px 14px;
  }
}

.typing-dot {
  width: 7px;
  height: 7px;
  border-radius: 4px;
  background: var(--a-ink-2);
  animation: peek-typing 1.2s infinite ease-in-out;

  &:nth-child(2) {
    animation-delay: 0.15s;
  }

  &:nth-child(3) {
    animation-delay: 0.3s;
  }
}

@keyframes peek-typing {
  0%,
  60%,
  100% {
    opacity: 0.3;
    transform: translateY(0);
  }

  30% {
    opacity: 1;
    transform: translateY(-3px);
  }
}

.chat-error {
  margin: 0 14px 8px;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 8px 8px 14px;
  border-radius: 14px;
  background: rgba(255, 69, 58, 0.16);
  color: #ffb4ae;
  font-size: 13px;
}

.chat-error-text {
  flex: 1;
}

.chat-error-close {
  width: 32px;
  height: 32px;
  flex-shrink: 0;
  border: none;
  background: none;
  color: inherit;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}

.chat-input-bar {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 14px calc(var(--safe-bottom, 0px) + 24px);
}

.chat-input.chat-input--readonly {
  display: flex;
  align-items: center;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  color: var(--a-ink-3);
}

.chat-input {
  flex: 1;
  min-width: 0;
  height: 38px;
  box-sizing: border-box;
  padding: 0 14px;
  border: 1px solid #3a3b40;
  border-radius: 19px;
  background: transparent;
  color: var(--a-ink);
  font-family: inherit;
  font-size: 15px;
  outline: none;

  &::placeholder {
    color: var(--a-ink-3);
  }

  &:focus {
    border-color: var(--a-link);
  }

  &:disabled {
    opacity: 0.6;
  }
}

.chat-send {
  width: 36px;
  height: 36px;
  flex-shrink: 0;
  border: none;
  border-radius: 18px;
  background: var(--p-self-bubble);
  color: #ffffff;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;

  &:disabled {
    background: var(--a-raised);
    color: var(--a-ink-3);
    cursor: default;
  }
}

// ===== 行事曆 =====
.sched-item {
  align-items: flex-start;

  &.done {
    .sched-title,
    .sched-time {
      color: var(--a-ink-2);
    }

    .sched-title {
      text-decoration: line-through;
    }

    .sched-dot {
      background: var(--a-line);
    }
  }
}

.sched-time {
  width: 46px;
  flex-shrink: 0;
  font-family: var(--p-num);
  font-size: 15px;
  font-weight: 500;
  line-height: 1.5;
}

.sched-dot {
  width: 8px;
  height: 8px;
  margin-top: 8px;
  border-radius: 4px;
  flex-shrink: 0;
  background: var(--p-owner);
}

.sched-main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.sched-title {
  font-size: 15px;
  line-height: 1.5;
}

.sched-loc {
  font-size: 13px;
  color: var(--a-ink-2);
}

.sched-check {
  margin-top: 4px;
  flex-shrink: 0;
  color: var(--a-ink-2);
}

// ===== 飲食記錄 =====
.meal-row {
  align-items: flex-start;
}

.meal-chip {
  flex-shrink: 0;
  height: 24px;
  padding: 0 9px;
  border-radius: 12px;
  background: var(--a-raised);
  font-size: 12px;
  font-weight: 500;
  display: flex;
  align-items: center;
}

.meal-main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.meal-food {
  font-size: 15px;
  line-height: 1.5;
}

.meal-note {
  font-size: 13px;
  color: var(--a-ink-2);
}

.meal-time {
  flex-shrink: 0;
  font-family: var(--p-num);
  font-size: 13px;
  color: var(--a-ink-2);
  line-height: 1.7;
}

// ===== 錢包 =====
.wallet-card {
  margin-top: 16px;
  padding: 20px;
  border-radius: 20px;
  background: linear-gradient(150deg, #2b323b 0%, #3d4a5c 100%);
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.wallet-label,
.wallet-hint {
  font-size: 13px;
  color: var(--a-ink-2);
}

.wallet-amount {
  font-family: var(--p-num);
  font-size: 40px;
  font-weight: 500;
  line-height: 1.2;
}

.wallet-currency {
  margin-right: 4px;
  font-size: 24px;
  color: var(--a-ink-2);
}

.tx-main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.tx-desc {
  font-size: 15px;
}

.tx-time {
  font-family: var(--p-num);
  font-size: 12px;
  color: var(--a-ink-3);
}

.tx-amount {
  flex-shrink: 0;
  font-family: var(--p-num);
  font-size: 16px;
  font-weight: 500;

  &.is-in {
    color: #7bd88f;
  }
}

// ===== 備忘錄 =====
.memo-row {
  align-items: flex-start;

  &.done .memo-text {
    color: var(--a-ink-2);
    text-decoration: line-through;
  }

  &.done .memo-check {
    background: var(--p-owner);
    border-color: var(--p-owner);
  }
}

.memo-check {
  width: 22px;
  height: 22px;
  margin-top: 1px;
  flex-shrink: 0;
  box-sizing: border-box;
  border: 1.5px solid #b4b3af;
  border-radius: 11px;
  color: #ffffff;
  display: flex;
  align-items: center;
  justify-content: center;
}

.memo-text {
  flex: 1;
  font-size: 15px;
  line-height: 1.5;
}

// ===== 記事本 / 日記 =====
.note-list {
  margin-top: 16px;
  display: flex;
  flex-direction: column;
  gap: 10px;

  &--tight {
    margin-top: 0;
  }
}

.note-card {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 6px;
  padding: 14px 16px;
  border: none;
  border-radius: 16px;
  background: var(--a-card);
  color: inherit;
  font-family: inherit;
  text-align: left;
  cursor: pointer;
}

.note-card-title {
  font-size: 16px;
  font-weight: 700;
}

.note-card-preview {
  font-size: 14px;
  line-height: 1.55;
  color: var(--a-ink-2);
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.note-card-date {
  font-family: var(--p-num);
  font-size: 12px;
  color: var(--a-ink-2);
}

.diary-meta {
  margin: 8px 0 0;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: var(--a-ink-2);

  .note-card & {
    margin: 0;
  }
}

.diary-date {
  font-weight: 700;
  color: var(--a-ink);
}

.mood-chip {
  height: 24px;
  padding: 0 9px;
  border-radius: 12px;
  background: var(--a-raised);
  color: var(--a-ink);
  font-size: 12px;
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.reading {
  padding-top: 4px;
}

.reading-body {
  margin-top: 20px;
  font-size: 16px;
  line-height: 1.8;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

// ===== 相簿 / 已隱藏 =====
.photo-grid {
  margin: 16px -16px 0;
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 2px;
}

.photo-tile {
  position: relative;
  aspect-ratio: 1;
  border: none;
  padding: 0;
  color: rgba(255, 255, 255, 0.85);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;

  &.is-hidden {
    background: #2b303a;
  }

  .photo-tile-img {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  &.is-selected {
    outline: 3px solid var(--a-link);
    outline-offset: -3px;
  }
}

.photo-tile-secret {
  position: absolute;
  top: 6px;
  right: 6px;
  width: 10px;
  height: 10px;
  border-radius: 5px;
  background: var(--p-peek);
  box-shadow: 0 0 0 2px rgba(0, 0, 0, 0.35);
}

.photo-tile-tag {
  position: absolute;
  left: 5px;
  bottom: 5px;
  padding: 1px 6px;
  border-radius: 6px;
  background: rgba(0, 0, 0, 0.5);
  color: #ffffff;
  font-family: var(--p-num);
  font-size: 11px;
}

.photo-detail {
  padding: 14px 16px;
}

.photo-detail-meta {
  display: flex;
  justify-content: space-between;
  font-family: var(--p-num);
  font-size: 12px;
  color: var(--a-ink-2);
}

.photo-source {
  font-family: "Noto Sans TC", sans-serif;
  font-weight: 700;
  color: var(--a-ink);
}

.photo-desc {
  margin: 8px 0 0;
  font-size: 15px;
  line-height: 1.6;
  white-space: pre-line;
}

.photo-reason {
  margin: 10px 0 0;
  font-size: 14px;
  line-height: 1.6;
  color: var(--a-ink-2);
  white-space: pre-line;
}

.photo-reason-label {
  display: block;
  margin-bottom: 2px;
  font-size: 12px;
  font-weight: 700;
  color: var(--a-ink);
}

.album-row {
  width: 100%;
  border-left: none;
  border-right: none;
  border-top: none;
  background: none;
  color: inherit;
  font-family: inherit;
  font-size: 15px;
  text-align: left;
  cursor: pointer;
}

.album-row-label {
  flex: 1;
}

.album-row-count {
  font-family: var(--p-num);
  color: var(--a-ink-2);
}

.album-row-chev {
  color: var(--a-ink-2);
}

// ===== 瀏覽紀錄 =====
.browser-private {
  margin-top: 12px;
}

.segmented {
  margin-top: 16px;
  display: flex;
  padding: 2px;
  border-radius: 10px;
  background: var(--a-card);
}

.segmented-btn {
  flex: 1;
  height: 36px;
  border: none;
  border-radius: 8px;
  background: none;
  color: var(--a-ink-2);
  font-family: inherit;
  font-size: 13px;
  cursor: pointer;

  &[aria-pressed="true"] {
    background: var(--a-raised);
    color: var(--a-ink);
    font-weight: 500;
  }
}

.browser-row {
  align-items: flex-start;
}

.browser-icon {
  width: 30px;
  height: 30px;
  flex-shrink: 0;
  border-radius: 8px;
  background: var(--a-raised);
  color: var(--a-ink-2);
  display: flex;
  align-items: center;
  justify-content: center;

  &.adult {
    color: #ff9f97;
  }
}

.browser-main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.browser-title {
  font-size: 15px;
  line-height: 1.45;
  white-space: pre-line;
  overflow-wrap: anywhere;
}

.browser-url {
  font-size: 12px;
  color: var(--a-ink-3);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.browser-side {
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 4px;
}

.browser-tag {
  height: 20px;
  padding: 0 7px;
  border-radius: 10px;
  background: rgba(255, 69, 58, 0.18);
  color: #ff9f97;
  font-size: 11px;
  display: flex;
  align-items: center;
}

.browser-time {
  font-family: var(--p-num);
  font-size: 12px;
  color: var(--a-ink-3);
}
</style>
