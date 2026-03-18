/**
 * 雷諾曼牌 AI 解讀 Prompt
 */
import { getLenormandCardById } from "@/data/lenormandCards";
import type { LenormandDrawnCard, LenormandSpread } from "@/types/lenormand";

/** 將單張牌的完整牌義格式化為 AI 可讀的文字區塊 */
function formatCardDetail(dc: LenormandDrawnCard): string {
  const { card, position } = dc;

  // 找出此牌與其他抽到的牌的組合意義（如果有）
  const lines: string[] = [
    `【${position.nameCn}】${card.symbol} ${card.nameCn}（第 ${card.number} 號）`,
    `關鍵詞：${card.keywords.join("、")}`,
    `核心含義：${card.meaning.general}`,
    `感情：${card.meaning.love}`,
    `工作：${card.meaning.work}`,
    `建議：${card.meaning.advice}`,
  ];

  return lines.join("\n");
}

/** 找出兩張牌之間的組合意義 */
function findCombinationMeaning(
  cardAId: string,
  cardBId: string,
): string | null {
  const cardA = getLenormandCardById(cardAId);
  if (!cardA) return null;
  return cardA.combinations[cardBId] ?? null;
}

/** 從抽到的牌中提取所有相鄰牌組合 */
function buildCombinationsText(drawnCards: LenormandDrawnCard[]): string {
  if (drawnCards.length < 2) return "";

  const pairs: string[] = [];

  // 相鄰牌組合
  for (let i = 0; i < drawnCards.length - 1; i++) {
    const a = drawnCards[i];
    const b = drawnCards[i + 1];
    const meaning =
      findCombinationMeaning(a.card.id, b.card.id) ??
      findCombinationMeaning(b.card.id, a.card.id);
    if (meaning) {
      pairs.push(
        `${a.card.symbol}${a.card.nameCn} + ${b.card.symbol}${b.card.nameCn}：${meaning}`,
      );
    }
  }

  // 三張牌時也檢查首尾組合
  if (drawnCards.length === 3) {
    const a = drawnCards[0];
    const c = drawnCards[2];
    const meaning =
      findCombinationMeaning(a.card.id, c.card.id) ??
      findCombinationMeaning(c.card.id, a.card.id);
    if (meaning) {
      pairs.push(
        `${a.card.symbol}${a.card.nameCn} + ${c.card.symbol}${c.card.nameCn}（首尾）：${meaning}`,
      );
    }
  }

  if (pairs.length === 0) return "";
  return `\n## 牌組組合提示\n${pairs.join("\n")}`;
}

export function buildLenormandInterpretationPrompt(
  question: string,
  spread: LenormandSpread,
  drawnCards: LenormandDrawnCard[],
): string {
  const cardsDesc = drawnCards.map(formatCardDetail).join("\n\n");
  const combinationsText = buildCombinationsText(drawnCards);

  return `你是一位精通雷諾曼牌的占卜師。雷諾曼牌是一套 36 張的符號牌，每張牌都有具體的象徵意義，解讀時要將牌與牌之間的關係和組合一起考慮。

## 問卜者的問題
${question}

## 牌陣：${spread.nameCn}
${spread.description}

## 抽到的牌（含完整牌義）
${cardsDesc}
${combinationsText}

## 雷諾曼解讀原則
- 雷諾曼牌偏向具體、實際的解讀，不像塔羅那麼抽象
- 相鄰的牌要一起解讀，組合意義很重要
- 中心牌（如果有）代表核心問題
- 解讀要貼近日常生活，給出具體的方向
- 沒有逆位，正負面解讀取決於周圍的牌

## 解讀要求
1. 整體解讀：將所有牌的意義結合問題進行整體解讀
2. 牌與牌的關係：特別注意相鄰牌之間的組合意義
3. 具體建議：給出實際可行的建議
4. 語氣：溫和直接，像朋友聊天一樣自然
5. 長度：2000 字以內

請開始你的解讀：`;
}
