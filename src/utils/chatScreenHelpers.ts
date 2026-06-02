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
