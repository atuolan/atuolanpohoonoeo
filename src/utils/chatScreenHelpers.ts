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

/** 計算某條訊息所屬「邏輯輪次」的去重 key。
 * - shadow segment（正則拆分產生的影子氣泡）歸併到源訊息
 * - 有 turnId 的訊息（同一輪 AI 可能分多條氣泡）歸併到同一 turnId
 * - 都沒有時退回訊息自身 id（每條獨立成輪，保底相容）
 */
function turnKeyOf(msg: {
  id: string;
  turnId?: string;
  shadowSourceId?: string;
}): string {
  if (msg.shadowSourceId) return `src:${msg.shadowSourceId}`;
  if (msg.turnId) return `turn:${msg.turnId}`;
  return `id:${msg.id}`;
}

/**
 * 按「對話輪次」從尾端裁切訊息列表。
 * 一輪 = 一個完整回合（用戶發言 + AI 的整段回覆）。
 * 同一輪 AI 即使被拆成多條氣泡（共享 turnId 或為 shadow segment），只計為一輪。
 *
 * @param msgs        訊息列表（時間順序，舊→新）
 * @param maxTurns    要保留的輪次數
 * @returns 從末尾保留 maxTurns 輪後的訊息子陣列
 */
export function sliceMessagesByTurns<
  T extends { id: string; role: string; turnId?: string; shadowSourceId?: string },
>(msgs: T[], maxTurns: number): T[] {
  if (maxTurns <= 0) return [];
  let turnCount = 0;
  let startIndex = msgs.length;
  // 已計入的 AI 輪次 key，避免同一輪多條氣泡被重複計數
  const countedTurnKeys = new Set<string>();

  for (let i = msgs.length - 1; i >= 0; i--) {
    const msg = msgs[i];
    if (msg.role === "ai") {
      const key = turnKeyOf(msg);
      // 同一輪 AI 的多條氣泡只在第一次遇到時 +1
      if (!countedTurnKeys.has(key)) {
        countedTurnKeys.add(key);
        turnCount++;
      }
      if (turnCount >= maxTurns) {
        // 往前找到這輪對應的 user 訊息作為起點
        for (let j = i - 1; j >= 0; j--) {
          if (msgs[j].role === "user") {
            startIndex = j;
            break;
          }
        }
        if (startIndex === msgs.length) {
          startIndex = i;
        }
        break;
      }
    }
    startIndex = i;
  }
  return msgs.slice(startIndex);
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
