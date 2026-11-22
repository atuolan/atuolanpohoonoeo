/** 標籤屬性：雙引號、單引號都認，值裡可以有另一種引號；空值當沒寫。有好幾個名字時取第一個有值的 */
export function readTagAttr(attrs: string | undefined, ...names: string[]): string | undefined {
  for (const name of names) {
    const match = (attrs || "").match(new RegExp(`(?:^|\\s)${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, "i"));
    const value = (match?.[1] ?? match?.[2] ?? "").trim();
    if (value) return value;
  }
  return undefined;
}

/** 負面提示詞屬性的寫法：negative="..."，模型偶爾寫成 negative_prompt */
export const NEGATIVE_ATTR_NAMES = ["negative", "negative_prompt"];

/** 標籤的屬性部分（引號裡可以有 >），放進正則用；第 1 組是整段屬性 */
export const TAG_ATTRS_PATTERN = String.raw`(\s(?:[^>"']|"[^"]*"|'[^']*')*?)?`;
