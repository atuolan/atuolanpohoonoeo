/** 這一輪角色回了幾則訊息（用來加未讀數） */
export function countTurnAiMessages(
  messages: ReadonlyArray<{ role: string; turnId?: string }>,
  turnId?: string,
): number {
  if (turnId) {
    const n = messages.filter((m) => m.role === "ai" && m.turnId === turnId).length;
    if (n > 0) return n;
  }
  // 沒有輪次標記的舊訊息：從最後往前數到使用者的訊息為止
  let n = 0;
  for (let i = messages.length - 1; i >= 0; i--) {
    const role = messages[i].role;
    if (role === "ai") n++;
    else if (role === "user") break;
  }
  return n;
}
