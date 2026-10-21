/** 噗浪發語詞：清單、顏色、舊資料對照 */

export interface PlurkQualifier {
  label: string;
  en: string;
  color: string;
}

export const PLURK_QUALIFIERS: PlurkQualifier[] = [
  { label: "說", en: "says", color: "#C7442B" },
  { label: "正在", en: "is", color: "#8F6A0B" },
  { label: "想", en: "thinks", color: "#6B4FB8" },
  { label: "覺得", en: "feels", color: "#276E9F" },
  { label: "好奇", en: "wonders", color: "#2E4E9E" },
  { label: "愛", en: "loves", color: "#B4233F" },
  { label: "喜歡", en: "likes", color: "#B83A72" },
  { label: "分享", en: "shares", color: "#9A4A3F" },
  { label: "給", en: "gives", color: "#7A2E2E" },
  { label: "討厭", en: "hates", color: "#3A3A40" },
  { label: "想要", en: "wants", color: "#2F7A4F" },
  { label: "希望", en: "wishes", color: "#227A62" },
  { label: "需要", en: "needs", color: "#5E7426" },
  { label: "打算", en: "will", color: "#8A4C9E" },
  { label: "期待", en: "hopes", color: "#A13E8F" },
  { label: "問", en: "asks", color: "#4A6B2A" },
  { label: "已經", en: "has", color: "#6B6B70" },
  { label: "曾經", en: "was", color: "#7A6A5A" },
];

export const FREESTYLE = "";

export const QUALIFIER_NEUTRAL_COLOR = "#6B6B70";

const BY_LABEL = new Map<string, PlurkQualifier>(PLURK_QUALIFIERS.map((q) => [q.label, q]));

const LABEL_BY_EN = new Map<string, string>(PLURK_QUALIFIERS.map((q) => [q.en.toLowerCase(), q.label]));

export function normalizeQualifier(q?: string | null): string {
  if (q == null) {
    return FREESTYLE;
  }
  const trimmed = q.trim();
  if (!trimmed) {
    return FREESTYLE;
  }
  if (BY_LABEL.has(trimmed)) {
    return trimmed;
  }
  if (trimmed === "會") {
    return "打算";
  }
  const byEn = LABEL_BY_EN.get(trimmed.toLowerCase());
  if (byEn) {
    return byEn;
  }
  return trimmed;
}

export function isKnownQualifier(q?: string | null): boolean {
  const normalized = normalizeQualifier(q);
  return normalized !== FREESTYLE && BY_LABEL.has(normalized);
}

export function getQualifierColor(q?: string | null): string | null {
  const normalized = normalizeQualifier(q);
  if (normalized === FREESTYLE) {
    return null;
  }
  const item = BY_LABEL.get(normalized);
  return item ? item.color : QUALIFIER_NEUTRAL_COLOR;
}
