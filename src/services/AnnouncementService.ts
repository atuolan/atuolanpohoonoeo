/**
 * 作者公告系統
 *
 * 發布流程：
 * 1. 編輯 public/announcements.json，新增/修改一筆 item。
 * 2. 圖片可放在 public/announcements/，在 JSON 用 /announcements/xxx.png 引用。
 * 3. git push → Cloudflare Pages 自動部署，所有用戶下次開 App 就會看到。
 *
 * 顯示邏輯：
 * - App 啟動 Auth 通過後 fetch announcements.json。
 * - 過濾已在 IndexedDB announcementAcks 中的 id。
 * - 仍有未確認 → 顯示彈窗；點「我已知曉」寫入 DB，永不再彈。
 * - 想再次提示同內容 → 換新 id。
 */
import { getDatabase } from "@/db/database";

export type AnnouncementLevel = "info" | "important" | "critical";

export interface Announcement {
  /** 唯一 id，已確認後永遠以此為準 */
  id: string;
  title: string;
  /** ISO 日期或任意顯示字串 */
  date?: string;
  level?: AnnouncementLevel;
  /** Markdown 內容；支援 GFM、換行、圖片語法 */
  body: string;
  /** 可選：頂部封面圖 URL（建議放 /announcements/xxx.png） */
  imageUrl?: string;
  /** 可選：底部動作按鈕標籤 */
  actionLabel?: string;
  /** 可選：動作按鈕點擊後開啟的 URL */
  actionUrl?: string;
  /** 預設 true；若為 false 仍可關閉，但會強調樣式 */
  dismissable?: boolean;
}

export interface AnnouncementsFile {
  version?: number;
  items: Announcement[];
}

export interface AnnouncementAckRecord {
  id: string;
  ackedAt: number;
}

const STORE = "announcementAcks";

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

    for (const node of nodes) {
      const id = (node.getAttribute("id") || "").trim();
      if (!id) continue;

      const titleEl = node.getElementsByTagName("title")[0];
      const bodyEl = node.getElementsByTagName("body")[0];
      const title = titleEl?.textContent?.trim() || "";
      // body 用 CDATA，用 textContent 就能直接拿到原文（含換行）
      const body = bodyEl?.textContent?.replace(/^\n+|\n+$/g, "") || "";
      if (!title || !body) continue;

      const levelAttr = (node.getAttribute("level") || "info").trim().toLowerCase();
      const level: AnnouncementLevel =
        levelAttr === "critical" || levelAttr === "important" ? levelAttr : "info";

      const date = (node.getAttribute("date") || "").trim() || undefined;

      const imageEl = node.getElementsByTagName("image")[0];
      const imageUrl = imageEl?.textContent?.trim() || undefined;

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
        imageUrl,
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

async function getAckedIds(): Promise<Set<string>> {
  try {
    const db = await getDatabase();
    const records = await db.getAll(STORE);
    return new Set(records.map((r) => r.id));
  } catch (error) {
    console.warn("[Announcements] 讀取已確認紀錄失敗:", error);
    return new Set();
  }
}

/**
 * 取得當前用戶尚未確認的公告清單，依 JSON 順序回傳。
 */
export async function loadPendingAnnouncements(): Promise<Announcement[]> {
  const file = await fetchAnnouncements();
  if (!file) return [];
  const acked = await getAckedIds();
  const pending: Announcement[] = [];
  for (const item of file.items) {
    if (!item || typeof item.id !== "string" || !item.id) continue;
    if (acked.has(item.id)) continue;
    if (typeof item.title !== "string" || typeof item.body !== "string") continue;
    pending.push(item);
  }
  return pending;
}

/**
 * 標記某則公告已確認，寫入 IndexedDB。
 */
export async function acknowledgeAnnouncement(id: string): Promise<void> {
  if (!id) return;
  try {
    const db = await getDatabase();
    await db.put(STORE, { id, ackedAt: Date.now() } satisfies AnnouncementAckRecord);
  } catch (error) {
    console.warn("[Announcements] 寫入已確認紀錄失敗:", error);
  }
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
