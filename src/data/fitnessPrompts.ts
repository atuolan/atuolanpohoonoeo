/**
 * 健身陪伴系統 - 角色互動提示詞
 */

import type { FitnessMessageType } from '@/types/fitness'

// 角色風格對應的語氣
type StyleMessages = {
  strict: string[]
  gentle: string[]
  playful: string[]
}

// 各情境的預設訊息
export const fitnessMessages: Record<FitnessMessageType, StyleMessages> = {
  start: {
    strict: [
      '準備好了嗎？今天的訓練開始！',
      '不要偷懶，給我認真做！',
      '目標明確，開始行動！',
    ],
    gentle: [
      '今天也一起加油吧～',
      '準備好了嗎？我們慢慢來～',
      '深呼吸，開始囉！',
    ],
    playful: [
      '衝啊！今天要變更強！',
      '嘿嘿，準備好流汗了嗎？',
      '來吧來吧，動起來！',
    ],
  },
  rest: {
    strict: [
      '休息時間，喝口水，準備下一組。',
      '不要休息太久，保持專注。',
      '趁現在調整呼吸。',
    ],
    gentle: [
      '休息一下，記得喝水喔～',
      '辛苦了，放鬆一下吧～',
      '深呼吸，你做得很好～',
    ],
    playful: [
      '喘口氣～馬上又要開始囉！',
      '水水水！補充水分！',
      '休息是為了走更長的路～',
    ],
  },
  setComplete: {
    strict: [
      '很好，繼續保持。',
      '這組完成，下一組。',
      '不錯，但還能更好。',
    ],
    gentle: [
      '做得好！還有幾組，加油～',
      '太棒了！繼續保持喔～',
      '很厲害呢！',
    ],
    playful: [
      '讚讚讚！超棒的！',
      'Nice！繼續衝！',
      '哇喔～好厲害！',
    ],
  },
  workoutComplete: {
    strict: [
      '今天的訓練完成，做得不錯。',
      '任務達成，明天繼續。',
      '很好，記得補充蛋白質。',
    ],
    gentle: [
      '辛苦了！今天的訓練圓滿完成～',
      '你好棒！好好休息吧～',
      '完成了呢！給自己一個擁抱～',
    ],
    playful: [
      '耶！大成功！你超棒的！',
      '完成！今天的你閃閃發光！',
      '太厲害了吧！給你一百分！',
    ],
  },
  streak: {
    strict: [
      '連續 {days} 天，繼續保持這個紀律。',
      '不錯，{days} 天了，別鬆懈。',
      '{days} 天的堅持，值得肯定。',
    ],
    gentle: [
      '哇～已經連續 {days} 天了呢！好厲害～',
      '連續 {days} 天！你真的很努力！',
      '{days} 天的堅持，我都看在眼裡喔～',
    ],
    playful: [
      '連續 {days} 天！你是訓練狂魔嗎！',
      '{days} 天！破紀錄破紀錄！',
      '哇塞 {days} 天！太猛了吧！',
    ],
  },
  reminder: {
    strict: [
      '該訓練了，不要找藉口。',
      '時間到了，動起來。',
      '別偷懶，今天的份還沒做。',
    ],
    gentle: [
      '嗨～今天要不要一起運動呢？',
      '好久沒見到你了...要不要動一動？',
      '想你了～一起訓練吧？',
    ],
    playful: [
      '喂喂喂！你是不是忘記我了！',
      '人呢人呢？來運動啦！',
      '懶蟲！快起來動一動！',
    ],
  },
  weightProgress: {
    strict: [
      '體重有變化，繼續努力。',
      '數據顯示有進步，保持下去。',
      '方向正確，不要停。',
    ],
    gentle: [
      '有在進步呢！繼續保持～',
      '看到你的努力成果了！好開心～',
      '慢慢來，你做得很好～',
    ],
    playful: [
      '哇！有變化耶！太棒了！',
      '進步進步！繼續衝！',
      '看到成果了吧！嘿嘿～',
    ],
  },
  encouragement: {
    strict: [
      '加油，你可以的。',
      '專注，不要分心。',
      '相信自己的訓練。',
    ],
    gentle: [
      '你很棒喔，繼續加油～',
      '我相信你可以的！',
      '不管結果如何，你都很努力了～',
    ],
    playful: [
      '加油加油！你最棒！',
      '衝啊！我在這裡幫你加油！',
      '你可以的你可以的！',
    ],
  },
}

/**
 * 取得隨機訊息
 */
export function getRandomFitnessMessage(
  type: FitnessMessageType,
  style: 'strict' | 'gentle' | 'playful' = 'gentle',
  replacements?: Record<string, string | number>
): string {
  const messages = fitnessMessages[type][style]
  let message = messages[Math.floor(Math.random() * messages.length)]
  
  // 替換變數
  if (replacements) {
    Object.entries(replacements).forEach(([key, value]) => {
      message = message.replace(`{${key}}`, String(value))
    })
  }
  
  return message
}

/**
 * 生成健身資訊提示詞（注入聊天用）
 */
export function generateFitnessContextPrompt(data: {
  todayWorkout?: string
  streak?: number
  weeklyProgress?: number
  recentWeight?: { current: number; change: number }
}): string {
  const lines: string[] = []
  
  lines.push('【{{user}} 的健身資料】')
  
  if (data.todayWorkout) {
    lines.push(`今日訓練：${data.todayWorkout}`)
  }
  
  if (data.streak && data.streak > 0) {
    lines.push(`連續訓練天數：${data.streak} 天`)
  }
  
  if (data.weeklyProgress !== undefined) {
    lines.push(`本週目標完成度：${data.weeklyProgress}%`)
  }
  
  if (data.recentWeight) {
    const changeText = data.recentWeight.change > 0 
      ? `+${data.recentWeight.change}` 
      : String(data.recentWeight.change)
    lines.push(`最近體重：${data.recentWeight.current} kg (${changeText} kg)`)
  }
  
  lines.push('')
  lines.push('{{char}} 作為 {{user}} 的訓練夥伴，會適時關心並鼓勵 {{user}} 的健身進度。')
  
  return lines.join('\n')
}
