/**
 * useCharJournal
 * 「TA 的手帳」組件的資料來源：優先用頭盔TA（偷窺手機）的日記與行程，
 * 沒有就退回該角色最新一篇聊天日記。都是既有資料，不會另外呼叫 AI。
 */

import { ref, watch, type Ref } from "vue";
import dayjs from "dayjs";
import { db, DB_STORES, type DiaryEntry } from "@/db/database";
import { stripDiaryMarkup, type DiaryStickerId } from "@/utils/diaryStyle";
import type { DiaryData } from "@/types/diary";
import { usePeekPhoneStore } from "@/stores/peekPhone";
import type {
  PeekDiaryEntry,
  PeekPhoneData,
  PeekScheduleItem,
} from "@/types/peekPhone";

export interface JournalView {
  source: "peek" | "diary";
  /** 例：10/10 六 */
  dateLabel: string;
  mood?: PeekDiaryEntry["mood"];
  weather?: string;
  content: string;
  schedule: PeekScheduleItem[];
  /** 點組件時打開的那一頁（沒有日記、只有行程時為 null） */
  page: DiaryData | null;
  /** 日記本裡能翻的頁，舊到新；頭盔TA 只有這一篇 */
  pages: DiaryData[];
}

const PEEK_MOOD_LABELS: Record<PeekDiaryEntry["mood"], string> = {
  happy: "開心",
  neutral: "普通",
  sad: "難過",
  angry: "生氣",
  excited: "興奮",
};

const PEEK_MOOD_STICKERS: Record<PeekDiaryEntry["mood"], DiaryStickerId[]> = {
  happy: ["sun"],
  neutral: [],
  sad: ["raindrop"],
  angry: ["fire"],
  excited: ["star"],
};

/** 頭盔TA 的日記轉成日記本畫面用的資料：心情換成文字、配一張貼紙 */
function peekDiaryToPage(d: PeekDiaryEntry): DiaryData {
  return {
    id: `peek-${d.id}`,
    content: d.content.trim(),
    summary: "",
    messageCount: 0,
    status: "ready",
    createdAt: dayjs(d.date).valueOf(),
    page: {
      weather: d.weather?.trim() || undefined,
      mood: PEEK_MOOD_LABELS[d.mood],
      stickers: PEEK_MOOD_STICKERS[d.mood] ?? [],
    },
  };
}

function chatDiaryToPage(d: DiaryEntry): DiaryData {
  return {
    id: d.id,
    content: d.content,
    summary: "",
    messageCount: d.messageCount,
    status: d.status,
    isFavorite: d.isFavorite,
    createdAt: d.createdAt,
    page: d.page,
  };
}

const WEEKDAYS = ["日", "一", "二", "三", "四", "五", "六"];

export function formatJournalDate(value: string | number): string {
  const d = dayjs(value);
  if (!d.isValid()) return "";
  return `${d.month() + 1}/${d.date()} ${WEEKDAYS[d.day()]}`;
}

/** 從頭盔TA資料取最新一篇日記 + 最多 2 筆行程（未完成的排前面）；兩者都沒有回傳 null */
export function pickJournalFromPeek(data: PeekPhoneData | null): JournalView | null {
  if (!data) return null;
  const latestDiary = [...(data.diary ?? [])]
    .filter((d) => d.content?.trim())
    .sort((a, b) => b.date.localeCompare(a.date))[0];
  const schedule = [...(data.schedule ?? [])]
    .filter((s) => s.title?.trim())
    .sort((a, b) => Number(a.done) - Number(b.done) || a.time.localeCompare(b.time))
    .slice(0, 2);
  if (!latestDiary && schedule.length === 0) return null;

  const page = latestDiary ? peekDiaryToPage(latestDiary) : null;
  return {
    source: "peek",
    dateLabel: latestDiary ? formatJournalDate(latestDiary.date) : "",
    mood: latestDiary?.mood,
    weather: latestDiary?.weather,
    content: latestDiary?.content.trim() ?? "",
    schedule,
    page,
    pages: page ? [page] : [],
  };
}

/** 該角色最新一篇寫好的聊天日記 */
export function pickLatestChatDiary(
  diaries: DiaryEntry[],
  characterId: string,
): JournalView | null {
  const ready = diaries
    .filter(
      (d) => d.characterId === characterId && d.status === "ready" && d.content?.trim(),
    )
    .sort((a, b) => a.createdAt - b.createdAt);
  const latest = ready[ready.length - 1];
  if (!latest) return null;

  const pages = ready.map(chatDiaryToPage);
  return {
    source: "diary",
    dateLabel: formatJournalDate(latest.createdAt),
    // 日記常有 Markdown 標題與多段落，卡片只取純文字
    content: stripDiaryMarkup(latest.content).replace(/[#*_>`]/g, "").replace(/\s+/g, " ").trim(),
    schedule: [],
    page: pages[pages.length - 1],
    pages,
  };
}

export function useCharJournal(
  characterId: Ref<string | null>,
  chatId: Ref<string | null>,
) {
  const peekPhoneStore = usePeekPhoneStore();
  const journal = ref<JournalView | null>(null);
  const isLoaded = ref(false);

  async function load(charId: string | null, cId: string | null) {
    if (!charId) {
      journal.value = null;
      isLoaded.value = true;
      return;
    }
    try {
      const peekData = cId ? await peekPhoneStore.loadFromIDB(charId, cId) : null;
      const fromPeek = pickJournalFromPeek(peekData);
      if (fromPeek) {
        journal.value = fromPeek;
      } else {
        await db.init();
        const diaries = await db.getAll<DiaryEntry>(DB_STORES.DIARIES);
        journal.value = pickLatestChatDiary(diaries, charId);
      }
    } catch (e) {
      console.error("[useCharJournal] load failed:", e);
      journal.value = null;
    } finally {
      isLoaded.value = true;
    }
  }

  watch([characterId, chatId], ([charId, cId]) => void load(charId, cId), {
    immediate: true,
  });

  return { journal, isLoaded };
}
