// 從 ChatScreen.vue 提取的純工具函數（無副作用、無 store 依賴）

export function hashString(value: string): string {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

export function isShadowBubbleOf(
  msg: { id: string; shadowSourceId?: string; isHtmlBlock?: boolean },
  sourceId: string,
): boolean {
  if (msg.shadowSourceId === sourceId) return true;
  if (msg.isHtmlBlock && msg.id.startsWith(`${sourceId}_html_`)) return true;
  if (msg.id.startsWith(`${sourceId}_seg_`)) return true;
  return false;
}

/**
 * 按「對話輪次」從尾端裁切訊息列表。
 * 一輪 = 一個完整回合（用戶發言 + AI 的整段回覆）。
 * 一輪的 AI 回覆 = 一段「連續的 AI 氣泡」（中間沒有插入 user 訊息），
 * 不論 AI 把回覆拆成多少條氣泡、是否帶 turnId，都只計為一輪。
 * 之所以不依賴 turnId/shadowSourceId：實際資料中 AI 連發的多條氣泡
 * 往往各自帶不同 turnId（獨立主動發送），用 turnId 去重會嚴重多算。
 *
 * @param msgs        訊息列表（時間順序，舊→新）
 * @param maxTurns    要保留的輪次數
 * @returns 從末尾保留 maxTurns 輪後的訊息子陣列
 */
export function sliceMessagesByTurns<T extends { role: string }>(
  msgs: T[],
  maxTurns: number,
): T[] {
  if (maxTurns <= 0) return [];
  let aiBlocks = 0;
  let startIndex = 0;
  // 緊鄰其後（索引較大側）剛訪問過的訊息是否為 AI，用來判斷 AI 連續塊邊界
  let nextIsAi = false;

  for (let i = msgs.length - 1; i >= 0; i--) {
    const role = msgs[i].role;
    if (role === "ai") {
      // 反向掃描時，連續 AI 塊的「最新一條」即新塊的起點
      if (!nextIsAi) {
        aiBlocks++;
        if (aiBlocks > maxTurns) {
          // 這個 AI 塊已超出保留範圍，從它之後（含其前的 user）開始
          startIndex = i + 1;
          break;
        }
      }
      nextIsAi = true;
    } else if (role === "user") {
      nextIsAi = false;
    }
    // 其他角色（system 等）不打斷 AI 連續塊，也不改變 nextIsAi
    startIndex = i;
  }
  return msgs.slice(startIndex);
}

/**
 * 統計訊息列表中包含的「對話輪次」數量。
 * 一輪 = 一段連續的 AI 氣泡，與 sliceMessagesByTurns 採同一套規則，
 * 確保「顯示的輪數」與「實際裁切的輪數」一致。
 *
 * @param msgs 訊息列表
 * @returns AI 連續塊（輪次）數量
 */
export function countTurns(msgs: Array<{ role: string }>): number {
  let turns = 0;
  let prevIsAi = false;
  for (const msg of msgs) {
    if (msg.role === "ai") {
      if (!prevIsAi) turns++;
      prevIsAi = true;
    } else if (msg.role === "user") {
      prevIsAi = false;
    }
    // 其他角色不打斷 AI 連續塊
  }
  return turns;
}

export function formatClaimAmount(amount: number): string {
  if (!Number.isFinite(amount)) return "0";
  return amount
    .toFixed(2)
    .replace(/\.00$/, "")
    .replace(/(\.\d)0$/, "$1");
}

export function hexToRgba(hex: string, alpha: number): string {
  const h = hex.replace("#", "");
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export const _delay = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

export function _messageRenderDelay(total: number): number {
  if (total <= 2) return 2000;
  if (total <= 5) return 800;
  if (total <= 10) return 400;
  return 200;
}

export function extractModeRequestReason(attrs: string): string | undefined {
  const reasonMatch = attrs.match(/\breason=(['"])([\s\S]*?)\1/i);
  const reason = reasonMatch?.[2]?.trim();
  return reason || undefined;
}

export function getPreviewText(content: string): string {
  const text = content
    .replace(/\[img:.*?\]/g, "[圖片]")
    .replace(/\[sticker:.*?\]/g, "[表情包]");
  return text.length > 50 ? text.substring(0, 50) + "..." : text;
}

export function _escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
