/**
 * 給提示詞用的「經過多久」文字，比噗浪用的 formatElapsed 細：
 * 一小時以上會帶分鐘（洗澡洗了 1 小時和 1 小時 50 分鐘，對角色來說差很多）。
 */
export function formatGap(ms: number): string {
  const minutes = Math.max(0, Math.floor(ms / 60000));
  if (minutes < 1) return "不到 1 分鐘";
  if (minutes < 60) return `${minutes} 分鐘`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    const rest = minutes % 60;
    return rest ? `${hours} 小時 ${rest} 分鐘` : `${hours} 小時`;
  }
  const days = Math.floor(hours / 24);
  const restHours = hours % 24;
  return restHours ? `${days} 天 ${restHours} 小時` : `${days} 天`;
}

/** {{charStatus}}：狀態文字後面帶上設定了多久，讓 AI 知道狀態是不是已經過時 */
export function formatCharStatusForPrompt(
  text: string | undefined,
  updatedAt: number | undefined,
  now: number = Date.now(),
): string {
  if (!text) return "還沒設定";
  if (typeof updatedAt !== "number" || !Number.isFinite(updatedAt)) return text;
  return `${text}（${formatGap(now - updatedAt)}前設定）`;
}
