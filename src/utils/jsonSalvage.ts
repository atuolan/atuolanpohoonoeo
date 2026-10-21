/**
 * 從可能被截斷的 JSON 文字中，搶救指定陣列欄位裡「已經完整」的物件。
 * 逐字掃描並處理字串與跳脫字元，忽略解析失敗與未閉合的片段。
 */
export function salvageArrayItems(raw: string, key: string): Record<string, unknown>[] {
  const result: Record<string, unknown>[] = [];
  if (!raw) return result;

  const text = raw.replace(/```(?:json)?/gi, "");
  const marker = `"${key}"`;
  const keyAt = text.indexOf(marker);
  if (keyAt < 0) return result;

  let i = keyAt + marker.length;
  while (i < text.length && /\s/.test(text[i])) i++;
  if (text[i] === ":") i++;
  while (i < text.length && /\s/.test(text[i])) i++;
  if (text[i] !== "[") return result;

  let depth = 0;
  let start = -1;
  let inString = false;
  let escaped = false;

  for (let j = i + 1; j < text.length; j++) {
    const ch = text[j];

    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }

    if (ch === '"') {
      inString = true;
    } else if (ch === "{") {
      if (depth === 0) start = j;
      depth++;
    } else if (ch === "}" && depth > 0) {
      depth--;
      if (depth === 0 && start >= 0) {
        const chunk = text.slice(start, j + 1);
        start = -1;
        try {
          const parsed: unknown = JSON.parse(chunk);
          if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
            result.push(parsed as Record<string, unknown>);
          }
        } catch {
          // 解析失敗的片段直接略過，繼續往下找
        }
      }
    } else if (ch === "]" && depth === 0) {
      break;
    }
  }

  return result;
}
