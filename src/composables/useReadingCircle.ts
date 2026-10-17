/**
 * 共讀圈的動作：建立、留邊註、角色回應、主持補充、討論摘要、爭議問題、同步讀
 * 閱讀器和共讀圈畫面共用；資料都寫進那本書的閱讀紀錄（BookReadingProgress.circle）
 */

import { db, DB_STORES } from "@/db/database";
import { askAI } from "@/services/BookAIService";
import {
  buildCircleSummaryPrompt,
  buildDebatePrompt,
  buildRepliesPrompt,
  buildSupplementPrompt,
  HOST_ID,
  HOST_NAME,
  newCircle,
  newNote,
  notesByParagraph,
  parseCircleReplies,
  parseCircleSummary,
  parseDebate,
  parseSupplement,
  pickSyncMember,
  shouldRefreshSummary,
  toggleAgree,
  USER_ID,
  type CircleBookInfo,
  type CircleMember,
  type ParsedReply,
  type ReplyTrigger,
} from "@/services/bookCircle";
import { useBooksStore } from "@/stores/books";
import { useCharactersStore } from "@/stores/characters";
import { useUserStore } from "@/stores/user";
import type { CircleNote, ReadingCircle, StoredBook } from "@/types/book";
import type { StoredCharacter } from "@/types/character";
import { splitParagraphs } from "@/utils/bookReading";
import { computed, ref, type Ref } from "vue";

/** 邊註要掛的段落 */
export interface CircleAnchor {
  chapterIndex: number;
  paraStart: number;
  /** 段落原文（只到讀到的地方） */
  quote: string;
}

export function characterName(c: StoredCharacter | null | undefined): string {
  return c?.nickname || c?.data.name || "";
}

/** 段落原文（給畫面顯示與 AI 用），readEnd 之後的字切掉 */
export function anchorAt(book: StoredBook, chapterIndex: number, offset: number, readEnd = Infinity): CircleAnchor | null {
  const chapter = book.chapters[chapterIndex];
  if (!chapter) return null;
  const paras = splitParagraphs(chapter.content);
  let para = paras[0];
  for (const p of paras) if (p.start <= offset) para = p;
  if (!para) return null;
  const end = Math.min(para.start + para.length, Math.max(readEnd, para.start + 1));
  return { chapterIndex, paraStart: para.start, quote: chapter.content.slice(para.start, end).trim() };
}

export function useReadingCircle(options: {
  book: Ref<StoredBook>;
  /** 前情摘要（到某個位置為止，排版好的文字） */
  getSummaries: (chapterIndex: number, charOffset: number) => string;
}) {
  const booksStore = useBooksStore();
  const charsStore = useCharactersStore();
  const userStore = useUserStore();

  const bookId = computed(() => options.book.value.id);
  const circle = computed(() => booksStore.progressByBook[bookId.value]?.circle);
  const memberChars = computed(() =>
    (circle.value?.memberIds ?? [])
      .map((id) => charsStore.getCharacterById(id))
      .filter((c): c is StoredCharacter => !!c),
  );
  const userName = computed(() => userStore.currentName || "我");

  /** 正在等 AI 的事（畫面顯示「小鯤 正在寫…」） */
  const busy = ref("");
  const error = ref("");

  function patchCircle(change: (c: ReadingCircle) => ReadingCircle): Promise<void> {
    return booksStore.patchProgress(bookId.value, (current) =>
      current?.circle ? { circle: change(current.circle) } : {},
    );
  }

  async function createCircle(name: string, memberIds: string[]) {
    const circleName = name.trim() || `${options.book.value.title}小組`;
    await booksStore.patchProgress(bookId.value, { circle: newCircle(circleName, memberIds) });
  }

  function updateCircle(patch: Partial<Pick<ReadingCircle, "name" | "memberIds" | "syncReading" | "syncEvery">>) {
    return patchCircle((c) => ({ ...c, ...patch }));
  }

  /** 成員資料：人設＋私聊記憶最近一則總結的開頭 */
  async function loadMembers(): Promise<CircleMember[]> {
    let summaries: Array<{ characterId?: string; content?: string; createdAt?: number }> = [];
    try {
      summaries = await db.getAll(DB_STORES.SUMMARIES);
    } catch {
      // 讀不到記憶就只用人設
    }
    return memberChars.value.map((c) => {
      const latest = summaries
        .filter((s) => s.characterId === c.id && s.content)
        .sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0))[0];
      const persona = [c.data.description, c.data.personality].filter(Boolean).join("\n").slice(0, 300);
      const memory = latest?.content?.replace(/\s+/g, " ").slice(0, 80);
      return { id: c.id, name: characterName(c), persona, memory };
    });
  }

  function infoFor(anchor: CircleAnchor): CircleBookInfo {
    const book = options.book.value;
    return {
      bookTitle: book.title,
      author: book.author,
      chapterTitle: book.chapters[anchor.chapterIndex]?.title ?? "",
      summaries: options.getSummaries(anchor.chapterIndex, anchor.paraStart + anchor.quote.length),
    };
  }

  function notesAt(anchor: CircleAnchor): CircleNote[] {
    return (circle.value?.notes ?? [])
      .filter((n) => n.chapterIndex === anchor.chapterIndex && n.paraStart === anchor.paraStart)
      .sort((a, b) => a.createdAt - b.createdAt);
  }

  /** 把角色回應存成留言；同意的那則加上同意 */
  async function saveReplies(anchor: CircleAnchor, replies: ParsedReply[], parentId?: string) {
    const members = memberChars.value;
    const now = Date.now();
    const notes = replies.map((r, i) =>
      newNote(
        {
          ...anchor,
          authorId: r.characterId,
          authorName: characterName(members.find((m) => m.id === r.characterId)),
          content: r.content,
          parentId,
        },
        now + i,
      ),
    );
    await patchCircle((c) => ({
      ...c,
      notes: [
        ...c.notes.map((n) => {
          const agreeing = replies.filter((r) => r.agreeWith === n.id && !n.agreeIds.includes(r.characterId));
          return agreeing.length ? { ...n, agreeIds: [...n.agreeIds, ...agreeing.map((r) => r.characterId)] } : n;
        }),
        ...notes,
      ],
    }));
    return notes;
  }

  async function run<T>(label: string, task: () => Promise<T>): Promise<T | undefined> {
    busy.value = label;
    error.value = "";
    try {
      return await task();
    } catch (e) {
      error.value = e instanceof Error ? e.message : "沒有回應，再試一次";
      return undefined;
    } finally {
      busy.value = "";
    }
  }

  async function generateReplies(anchor: CircleAnchor, trigger: ReplyTrigger, parentId?: string) {
    if (memberChars.value.length === 0) return;
    const label =
      trigger.kind === "sync"
        ? `${characterName(charsStore.getCharacterById(trigger.memberId))} 正在寫邊註…`
        : "大家正在想…";
    await run(label, async () => {
      const members = await loadMembers();
      const existing = notesAt(anchor);
      const reply = await askAI(
        buildRepliesPrompt({ info: infoFor(anchor), paragraph: anchor.quote, members, existing, userName: userName.value, trigger }),
        { task: "chat", temperature: 0.8 },
      );
      const max = trigger.kind === "sync" ? 1 : 2;
      let parsed = parseCircleReplies(reply, members, existing.map((n) => n.id), max);
      if (trigger.kind === "sync") parsed = parsed.filter((r) => r.characterId === trigger.memberId);
      if (parsed.length === 0) throw new Error("角色們沒有回應，再試一次");
      await saveReplies(anchor, parsed, parentId);
    });
    await maybeRefreshSummary();
  }

  /** 你留一則邊註，角色接著回 */
  async function postUserNote(anchor: CircleAnchor, content: string, parentId?: string) {
    const text = content.trim();
    if (!text || !circle.value) return;
    const note = newNote({ ...anchor, authorId: USER_ID, authorName: userName.value, content: text, parentId });
    await patchCircle((c) => ({ ...c, notes: [...c.notes, note] }));
    await generateReplies(anchor, { kind: "note", note }, parentId ?? note.id);
  }

  async function toggleAgreeNote(noteId: string) {
    await patchCircle((c) => ({ ...c, notes: c.notes.map((n) => (n.id === noteId ? toggleAgree(n, USER_ID) : n)) }));
  }

  async function deleteNote(noteId: string) {
    // 連同底下的回覆一起刪
    await patchCircle((c) => {
      const drop = new Set([noteId]);
      let grew = true;
      while (grew) {
        grew = false;
        for (const n of c.notes) {
          if (n.parentId && drop.has(n.parentId) && !drop.has(n.id)) {
            drop.add(n.id);
            grew = true;
          }
        }
      }
      return { ...c, notes: c.notes.filter((n) => !drop.has(n.id)) };
    });
  }

  /** 主持補充背景 */
  async function hostSupplement(note: CircleNote) {
    const anchor: CircleAnchor = { chapterIndex: note.chapterIndex, paraStart: note.paraStart, quote: note.quote };
    await run(`${HOST_NAME} 正在查…`, async () => {
      const reply = await askAI(buildSupplementPrompt({ info: infoFor(anchor), paragraph: anchor.quote, note: note.content }), {
        task: "chat",
        temperature: 0.4,
      });
      const content = parseSupplement(reply);
      if (!content) throw new Error("主持沒有回應，再試一次");
      const host = newNote({ ...anchor, authorId: HOST_ID, authorName: HOST_NAME, content, parentId: note.id });
      await patchCircle((c) => ({ ...c, notes: [...c.notes, host] }));
    });
  }

  async function refreshSummary() {
    const c = circle.value;
    if (!c || c.notes.length === 0) return;
    await run(`${HOST_NAME} 正在整理…`, async () => {
      const members = await loadMembers();
      const reply = await askAI(
        buildCircleSummaryPrompt({
          bookTitle: options.book.value.title,
          groups: notesByParagraph(c.notes),
          members,
          userName: userName.value,
        }),
        { task: "summary", temperature: 0.3 },
      );
      const parsed = parseCircleSummary(reply, [USER_ID, ...members.map((m) => m.id)]);
      if (!parsed) throw new Error("主持整理不出來，再試一次");
      await patchCircle((cur) => ({ ...cur, summary: { ...parsed, noteCount: cur.notes.length, createdAt: Date.now() } }));
    });
  }

  /** 新留言夠多才重算（不在背景偷打：只有在共讀圈有動作時才會走到這裡） */
  async function maybeRefreshSummary() {
    const c = circle.value;
    if (c && shouldRefreshSummary(c)) await refreshSummary();
  }

  /** 主持在這段開一個新串，挑 1–2 個角色接著回 */
  async function askDebate(anchor: CircleAnchor) {
    if (memberChars.value.length === 0) return;
    await run(`${HOST_NAME} 正在想問題…`, async () => {
      const members = await loadMembers();
      const reply = await askAI(buildDebatePrompt({ info: infoFor(anchor), paragraph: anchor.quote, members }), {
        task: "chat",
        temperature: 0.8,
      });
      const parsed = parseDebate(reply, members);
      if (!parsed) throw new Error("主持想不出問題，再試一次");
      const host = newNote({ ...anchor, authorId: HOST_ID, authorName: HOST_NAME, content: parsed.question });
      await patchCircle((c) => ({ ...c, notes: [...c.notes, host] }));
      if (parsed.replies.length) await saveReplies(anchor, parsed.replies, host.id);
    });
  }

  /**
   * 同步讀：往後翻一頁就計數，到了就挑最久沒說話的角色在剛讀過的段落留一則
   * @param anchor 剛讀過的那段（上一頁的最後一段）
   */
  async function onSyncPage(anchor: CircleAnchor | null) {
    const c = circle.value;
    if (!c?.syncReading || c.memberIds.length === 0 || busy.value) return;
    const pages = (c.pagesSinceSync ?? 0) + 1;
    if (pages < c.syncEvery || !anchor) {
      await patchCircle((cur) => ({ ...cur, pagesSinceSync: pages }));
      return;
    }
    await patchCircle((cur) => ({ ...cur, pagesSinceSync: 0 }));
    const memberId = pickSyncMember(c.memberIds.filter((id) => charsStore.getCharacterById(id)), c.notes);
    if (memberId) await generateReplies(anchor, { kind: "sync", memberId });
  }

  return {
    circle,
    memberChars,
    userName,
    busy,
    error,
    createCircle,
    updateCircle,
    postUserNote,
    generateReplies,
    toggleAgreeNote,
    deleteNote,
    hostSupplement,
    refreshSummary,
    askDebate,
    onSyncPage,
  };
}

export type ReadingCircleApi = ReturnType<typeof useReadingCircle>;
