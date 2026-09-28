/**
 * 延後讀取變量
 *
 * 提示詞條目依順序由上往下展開宏，排在上方的 {{getvar::}} 讀不到下方條目 setvar 的值。
 * {{延後讀取::變量名}} 不是註冊的宏，展開時會原樣保留；
 * 等整份提示詞組好（所有 setvar 都跑完）後，再用這裡替換成聊天變量。
 */

const DEFERRED_VARIABLE_PATTERN = /\{\{延後讀取::(.+?)\}\}/g;

export function hasDeferredVariables(text: string): boolean {
  return text.includes("{{延後讀取::");
}

/**
 * 替換訊息中的 {{延後讀取::變量名}}。
 * readVariable 回傳已展開宏的變量值；同一次呼叫中相同變量只讀取一次。
 */
export async function resolveDeferredVariables<T extends { content: string }>(
  messages: T[],
  readVariable: (name: string) => Promise<string>,
): Promise<T[]> {
  const cache = new Map<string, string>();

  const resolved: T[] = [];
  for (const message of messages) {
    if (typeof message.content !== "string" || !hasDeferredVariables(message.content)) {
      resolved.push(message);
      continue;
    }

    for (const match of message.content.matchAll(DEFERRED_VARIABLE_PATTERN)) {
      const name = match[1].trim();
      if (!cache.has(name)) {
        cache.set(name, await readVariable(name));
      }
    }

    resolved.push({
      ...message,
      content: message.content.replace(
        DEFERRED_VARIABLE_PATTERN,
        (_match, name: string) => cache.get(name.trim()) ?? "",
      ),
    });
  }
  return resolved;
}
