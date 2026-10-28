/**
 * 送禮標籤：<送禮物 card="小卡">名稱｜一句描述</送禮物>
 * card 和描述都可以省略；舊格式 <送禮物>名稱</送禮物> 照樣能讀
 */

export interface ParsedGiftTag {
  name: string;
  description?: string;
  card?: string;
}

/** 第一個送禮標籤（不加 g，給 match 用） */
export const GIFT_TAG_RE = /<送禮物(\s[^>]*)?>([\s\S]*?)<\/送禮物>/i;
/** 全部送禮標籤（給 replace 用） */
export const GIFT_TAGS_RE = /<送禮物(\s[^>]*)?>[\s\S]*?<\/送禮物>/gi;

const CARD_ATTR_RE = /card\s*=\s*(?:"([^"]*)"|'([^']*)'|“([^”]*)”)/i;

export function parseGiftTag(text: string): ParsedGiftTag | null {
  const m = text.match(GIFT_TAG_RE);
  if (!m) return null;
  const [rawName, ...rest] = m[2].split(/[｜|]/);
  const name = rawName.trim();
  if (!name) return null;
  const result: ParsedGiftTag = { name };
  const description = rest.join("｜").trim();
  if (description) result.description = description;
  const cardMatch = m[1]?.match(CARD_ATTR_RE);
  const card = (cardMatch?.[1] ?? cardMatch?.[2] ?? cardMatch?.[3] ?? "").trim();
  if (card) result.card = card;
  return result;
}

export function formatGiftTag(gift: ParsedGiftTag): string {
  const card = gift.card?.trim();
  const attr = card ? ` card="${card.replace(/"/g, "”")}"` : "";
  const body = gift.description?.trim() ? `${gift.name}｜${gift.description.trim()}` : gift.name;
  return `<送禮物${attr}>${body}</送禮物>`;
}
