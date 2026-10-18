/**
 * 作者公告系統
 *
 * 發布流程：
 * 1. 編輯 public/announcements.xml，新增/修改一筆 <announcement>。
 * 2. 圖片可放在 public/announcements/，用 /announcements/xxx.png 引用。
 * 3. git push → Cloudflare Pages 自動部署，所有用戶下次開 App 就會看到。
 *
 * 顯示邏輯（明信片寄回 203 號房）：
 * - App 啟動後 fetch announcements.xml，所有公告都收進「信箱」。
 * - 開 App 時最多只跳一張：最新一則沒跳過的；其他沒看過的直接進信箱標「還沒拆」。
 * - 每則只會跳一次；按「收下了」才算已讀，按「稍後再看」只是不再跳。
 * - critical（電報）例外：沒按「收下了」之前每次開 App 都會跳。
 * - 第一次使用（這台裝置沒有任何紀錄）：舊公告全部當成已讀，不補跳。
 * - 想再次提示同內容 → 換新 id。
 */
import { getDatabase } from "@/db/database";

export type AnnouncementLevel = "info" | "important" | "critical";

export interface AnnouncementHighlight {
  title: string;
  detail?: string;
  /** 圖示名稱，見 announcementUi.ts 的 ANNOUNCEMENT_ICONS */
  icon?: string;
}

export interface Announcement {
  /** 唯一 id，已確認後永遠以此為準 */
  id: string;
  title: string;
  /** ISO 日期或任意顯示字串 */
  date?: string;
  level?: AnnouncementLevel;
  /** 完整內容（Markdown），顯示在「完整行程」頁；支援 GFM、換行、圖片語法 */
  body: string;
  /** 可選：彈窗標題下的一句話 */
  summary?: string;
  /** 可選：彈窗裡的重點，最多顯示 3 個；沒寫就從 body 的小標題自動取 */
  highlights?: AnnouncementHighlight[];
  /** 可選：彈窗底部「怎麼用」提示 */
  howto?: string;
  /** 可選：頂部封面圖 URL（建議放 /announcements/xxx.png） */
  imageUrl?: string;
  /** 可選：動作按鈕標籤 */
  actionLabel?: string;
  /** 可選：動作按鈕點擊後開啟的 URL */
  actionUrl?: string;
  /** 預設 true；false 時彈窗沒有「稍後再看」，必須按「收下了」 */
  dismissable?: boolean;
}

export interface AnnouncementsFile {
  version?: number;
  items: Announcement[];
}

/** read = 按過「收下了」；seen = 跳過或已放進信箱，但還沒拆 */
export type AnnouncementStatus = "read" | "seen";

export interface AnnouncementAckRecord {
  id: string;
  ackedAt: number;
  /** 舊版紀錄沒有這個欄位，一律視為 read */
  status?: AnnouncementStatus;
}

const STORE = "announcementAcks";
const MAX_HIGHLIGHTS = 3;

/**
 * 從 public/announcements.xml 取得公告清單；若 XML 不存在則 fallback 到 announcements.json。
 * 失敗（離線 / 404 / 解析錯誤）回傳 null，呼叫端應靜默忽略。
 */
async function fetchAnnouncements(): Promise<AnnouncementsFile | null> {
  const base =
    typeof import.meta !== "undefined" && (import.meta as any).env?.BASE_URL
      ? (import.meta as any).env.BASE_URL
      : "/";
  // 每小時換一次 cache-busting 參數，避免 CDN 卡舊版
  const bust = Math.floor(Date.now() / (60 * 60 * 1000));

  // 優先嘗試 XML（作者偏好的格式，支援 CDATA 免 escape）
  try {
    const resp = await fetch(`${base}announcements.xml?ts=${bust}`, { cache: "no-cache" });
    if (resp.ok) {
      const text = await resp.text();
      const parsed = parseAnnouncementsXml(text);
      if (parsed) return parsed;
    }
  } catch (error) {
    console.warn("[Announcements] XML fetch 失敗，嘗試 JSON:", error);
  }

  // Fallback：舊的 JSON 格式
  try {
    const resp = await fetch(`${base}announcements.json?ts=${bust}`, { cache: "no-cache" });
    if (!resp.ok) return null;
    const data = (await resp.json()) as AnnouncementsFile;
    if (!data || !Array.isArray(data.items)) return null;
    return data;
  } catch (error) {
    console.warn("[Announcements] JSON fetch 失敗:", error);
    return null;
  }
}

/**
 * 解析 announcements.xml。期望結構：
 *
 * <announcements>
 *   <announcement id="xxx" level="info" date="2026-05-11">
 *     <title>標題</title>
 *     <summary>標題下的一句話</summary>                     <!-- 可選 -->
 *     <highlight icon="pin" title="重點">補充說明</highlight>  <!-- 可選，最多 3 個 -->
 *     <howto>長按 → 全局美化 → 主題包</howto>               <!-- 可選 -->
 *     <image>/announcements/cover.png</image>            <!-- 可選 -->
 *     <action label="按鈕文字" url="https://..." />       <!-- 可選 -->
 *     <body><![CDATA[ Markdown 內容... ]]></body>
 *   </announcement>
 * </announcements>
 */
function parseAnnouncementsXml(xmlText: string): AnnouncementsFile | null {
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(xmlText, "application/xml");

    // DOMParser 在無效 XML 時會塞一個 <parsererror> 進來
    if (doc.getElementsByTagName("parsererror").length > 0) {
      console.warn("[Announcements] XML 解析錯誤（檢查語法、未閉合標籤、或 & 符號需寫成 &amp;）");
      return null;
    }

    const nodes = Array.from(doc.getElementsByTagName("announcement"));
    const items: Announcement[] = [];
    const text = (node: Element, tag: string) =>
      node.getElementsByTagName(tag)[0]?.textContent?.trim() || undefined;

    for (const node of nodes) {
      const id = (node.getAttribute("id") || "").trim();
      if (!id) continue;

      const title = text(node, "title") || "";
      // body 用 CDATA，用 textContent 就能直接拿到原文（含換行）
      const bodyEl = node.getElementsByTagName("body")[0];
      const body = bodyEl?.textContent?.replace(/^\n+|\n+$/g, "") || "";
      if (!title || !body) continue;

      const levelAttr = (node.getAttribute("level") || "info").trim().toLowerCase();
      const level: AnnouncementLevel =
        levelAttr === "critical" || levelAttr === "important" ? levelAttr : "info";

      const date = (node.getAttribute("date") || "").trim() || undefined;

      const highlights: AnnouncementHighlight[] = [];
      for (const el of Array.from(node.getElementsByTagName("highlight"))) {
        const hlTitle = el.getAttribute("title")?.trim();
        if (!hlTitle) continue;
        highlights.push({
          title: hlTitle,
          detail: el.textContent?.trim() || undefined,
          icon: el.getAttribute("icon")?.trim() || undefined,
        });
      }

      const actionEl = node.getElementsByTagName("action")[0];
      const actionLabel = actionEl?.getAttribute("label")?.trim() || undefined;
      const actionUrl = actionEl?.getAttribute("url")?.trim() || undefined;

      const dismissableAttr = node.getAttribute("dismissable");
      const dismissable =
        dismissableAttr === null ? true : dismissableAttr.toLowerCase() !== "false";

      items.push({
        id,
        title,
        date,
        level,
        body,
        summary: text(node, "summary"),
        highlights: highlights.length ? highlights : undefined,
        howto: text(node, "howto"),
        imageUrl: text(node, "image"),
        actionLabel,
        actionUrl: actionUrl && actionLabel ? actionUrl : undefined,
        dismissable,
      });
    }

    return { version: 1, items };
  } catch (error) {
    console.warn("[Announcements] XML 解析例外:", error);
    return null;
  }
}

/** 取得所有公告（依檔案順序，最新的在最前面）；失敗回傳空陣列 */
export async function loadAnnouncements(): Promise<Announcement[]> {
  const file = await fetchAnnouncements();
  if (!file) return [];
  return file.items.filter(
    (item) =>
      !!item &&
      typeof item.id === "string" &&
      !!item.id &&
      typeof item.title === "string" &&
      typeof item.body === "string",
  );
}

/** 讀取這台裝置的公告紀錄；讀取失敗回傳 null（呼叫端不應據此判斷成新用戶） */
export async function loadAnnouncementRecords(): Promise<Map<string, AnnouncementStatus> | null> {
  try {
    const db = await getDatabase();
    const records = (await db.getAll(STORE)) as AnnouncementAckRecord[];
    return new Map(records.map((r) => [r.id, r.status ?? "read"]));
  } catch (error) {
    console.warn("[Announcements] 讀取已確認紀錄失敗:", error);
    return null;
  }
}

/** 寫入公告紀錄（seen 不會蓋掉既有的 read，由呼叫端保證） */
export async function markAnnouncements(
  ids: string[],
  status: AnnouncementStatus,
): Promise<void> {
  if (ids.length === 0) return;
  try {
    const db = await getDatabase();
    const tx = db.transaction(STORE, "readwrite");
    const ackedAt = Date.now();
    await Promise.all([
      ...ids.map((id) => tx.store.put({ id, ackedAt, status } satisfies AnnouncementAckRecord)),
      tx.done,
    ]);
  } catch (error) {
    console.warn("[Announcements] 寫入已確認紀錄失敗:", error);
  }
}

export interface AnnouncementPlan {
  /** 這次要跳的那一則 */
  popupId: string | null;
  /** 直接收進信箱、以後不再跳的 */
  markSeen: string[];
  /** 新用戶：舊公告全部當成已讀 */
  markRead: string[];
}

/**
 * 決定開 App 時要跳哪一則。items 依檔案順序，最新的在最前面。
 */
export function planAnnouncementPopup(
  items: Announcement[],
  records: Map<string, AnnouncementStatus>,
): AnnouncementPlan {
  if (records.size === 0) {
    return { popupId: null, markSeen: [], markRead: items.map((i) => i.id) };
  }
  const critical = items.find((i) => i.level === "critical" && records.get(i.id) !== "read");
  const fresh = items.filter((i) => !records.has(i.id));
  const popup = critical ?? fresh[0] ?? null;
  return {
    popupId: popup?.id ?? null,
    // critical 沒收下之前要一直跳，不標 seen
    markSeen: fresh.filter((i) => i.level !== "critical").map((i) => i.id),
    markRead: [],
  };
}

/** 去掉標題開頭的 emoji（舊公告的小標題都以 emoji 開頭） */
export function stripLeadingEmoji(text: string): string {
  return text.replace(/^[\p{Extended_Pictographic}️‍\s]+/u, "").trim();
}

/** 彈窗的重點：作者有寫就用，沒寫就取 body 的前 3 個小標題 */
export function getPopupHighlights(announcement: Announcement): AnnouncementHighlight[] {
  if (announcement.highlights?.length) {
    return announcement.highlights.slice(0, MAX_HIGHLIGHTS);
  }
  const headings = Array.from(announcement.body.matchAll(/^#{2,4}\s+(.+)$/gm))
    .map((m) => stripLeadingEmoji(m[1]))
    .filter(Boolean);
  return headings.slice(0, MAX_HIGHLIGHTS).map((title) => ({ title }));
}

/** 「完整行程」有幾站：每個 ann-section 一站；沒有區塊就數小標題 */
export function countAnnouncementStops(body: string): number {
  const sections = body.match(/class="[^"]*\bann-(?:section|feature-box|bug-box)\b/g)?.length ?? 0;
  if (sections > 0) return sections;
  return body.match(/^#{2,4}\s+/gm)?.length ?? 0;
}

/**
 * 清除所有已確認紀錄（除錯用，例如在開發者選項中提供「重新顯示所有公告」）。
 */
export async function clearAllAnnouncementAcks(): Promise<void> {
  try {
    const db = await getDatabase();
    await db.clear(STORE);
  } catch (error) {
    console.warn("[Announcements] 清除已確認紀錄失敗:", error);
  }
}
