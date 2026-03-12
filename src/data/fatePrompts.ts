/**
 * 塔羅占卜 AI 解讀 Prompt 模板
 */
import type { FateDrawnCard, FateSpread } from '@/types/fate'

/** 構建完整解讀 prompt */
export function buildFateInterpretationPrompt(
  question: string,
  spread: FateSpread,
  drawnCards: FateDrawnCard[],
): string {
  const cardsDescription = drawnCards.map((drawn, index) => {
    const position = spread.positions[index]
    const orientation = drawn.isReversed ? '逆位' : '正位'
    const keywords = drawn.isReversed
      ? drawn.card.keywords.reversed.join('、')
      : drawn.card.keywords.upright.join('、')
    const meaning = drawn.isReversed
      ? drawn.card.meaning.reversed
      : drawn.card.meaning.upright

    return `【${position.nameCn}】${drawn.card.nameCn}（${orientation}）
- 關鍵詞：${keywords}
- 含義：${meaning}`
  }).join('\n\n')

  return `你是一位經驗豐富的塔羅牌解讀師，擁有深厚的神秘學知識和敏銳的直覺。請為以下塔羅牌占卜提供極為專業、深入、詳盡且富有洞察力的解讀。

## 問卜者的問題
${question}

## 使用的牌陣
${spread.nameCn}（${spread.name}）
${spread.description}

## 抽到的牌
${cardsDescription}

## 解讀要求（請務必詳細展開每一項）

### 一、整體能量概述
- 簡要概述整體牌面的能量走向和核心主題
- 分析牌面中各元素（大阿爾克那/小阿爾克那、正位/逆位）的比例與整體氛圍
- 指出牌面中最突出的能量模式

### 二、逐張牌詳細解讀
對每一張牌，請提供以下內容：
1. **牌面本身的含義**：這張牌在塔羅體系中的核心象徵、圖像意涵
2. **在此位置的特殊意義**：結合牌陣位置（如「現狀」「挑戰」「未來」等）的具體解讀
3. **與問題的關聯**：這張牌如何直接回應問卜者的問題
4. **正位/逆位的影響**：正位或逆位帶來的能量差異和具體影響
5. **深層心理暗示**：這張牌可能揭示的潛意識訊息或隱藏的情緒

### 三、牌與牌之間的關聯分析
- 分析相鄰牌位之間的互動關係和能量流動
- 指出牌面中是否存在重複的元素、數字或花色，以及其意義
- 分析是否有牌之間形成對立、互補或強化的關係
- 找出牌面中的「故事線」——從過去到未來的敘事脈絡

### 四、針對問題的詳細回答
- 直接、明確地回答問卜者的問題
- 分析問題的不同面向（例如：時機、障礙、有利因素、可能的結果）
- 提供多種可能的發展方向及其概率感受

### 五、具體建議與解決方法
- 提供至少 3-5 條具體、可操作的建議
- 針對牌面揭示的挑戰，給出具體的應對策略
- 建議問卜者在心態、行動、時機上應如何調整
- 如果有需要注意的風險或陷阱，明確指出並給出預防方法

### 六、心態指引
- 分析問卜者目前可能的心理狀態
- 指出需要調整的心態或信念
- 提供情緒和精神層面的支持與鼓勵
- 給出有助於內在成長的反思問題

### 七、總結與祝福
- 用簡潔有力的語言總結整個解讀的核心訊息
- 給予問卜者溫暖的祝福和鼓勵

## 格式要求
- 使用繁體中文回答
- 適當使用神秘學術語，但確保易於理解
- 語氣溫和、富有同理心，但也要誠實直接
- 使用 Markdown 格式（標題、粗體、列表等）讓解讀結構清晰
- 請盡可能詳盡地展開每一個部分，不要省略或簡化

請開始你的解讀：`
}
