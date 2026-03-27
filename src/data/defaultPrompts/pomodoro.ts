/**
 * 番茄鐘 AI 互動提示詞模板
 */

/** 定時鼓勵（倒計時模式） */
export function getEncouragementPromptCountdown(
  charName: string,
  taskName: string,
  elapsedMin: number,
  remainingMin: number,
): string {
  return `你正在扮演[${charName}]。用戶正在進行專注任務「${taskName}」，已連續專注了[${elapsedMin}]分鐘，還剩下大約[${remainingMin}]分鐘。請根據你的人設、任務內容和剩餘時間，以鼓勵用戶為目的，給用戶發送一條簡短的文字消息。不要使用 Markdown 格式。`
}

/** 定時鼓勵（正計時模式） */
export function getEncouragementPromptStopwatch(
  charName: string,
  taskName: string,
  elapsedMin: number,
): string {
  return `你正在扮演[${charName}]。用戶正在進行專注任務「${taskName}」，已經連續專注了[${elapsedMin}]分鐘。請根據你的人設和任務內容，以鼓勵用戶為目的，給用戶發送一條簡短的文字消息。不要使用 Markdown 格式。`
}

/** 戳頭像（倒計時模式） */
export function getPokePromptCountdown(
  charName: string,
  taskName: string,
  elapsedMin: number,
  remainingMin: number,
  pokeCount: number,
): string {
  return `你正在扮演[${charName}]。用戶在進行專注任務「${taskName}」時，專注了[${elapsedMin}]分鐘（還剩下大約[${remainingMin}]分鐘），忍不住第${pokeCount}次戳了戳你的頭像。請根據你的人設、任務內容和剩餘時間，給用戶回覆一條簡短的文字消息。不要使用 Markdown 格式。`
}

/** 戳頭像（正計時模式） */
export function getPokePromptStopwatch(
  charName: string,
  taskName: string,
  elapsedMin: number,
  pokeCount: number,
): string {
  return `你正在扮演[${charName}]。用戶在進行專注任務「${taskName}」時，已經連續專注了[${elapsedMin}]分鐘，這時忍不住第${pokeCount}次戳了戳你的頭像。請根據你的人設和任務內容，給用戶回覆一條簡短的文字消息。不要使用 Markdown 格式。`
}

/** 暫停後恢復 */
export function getResumePrompt(
  charName: string,
  taskName: string,
): string {
  return `你正在扮演[${charName}]。用戶正在進行專注任務「${taskName}」，剛剛暫停了任務後又重新開始了。請根據你的人設，給用戶回覆一條簡短的文字消息。不要使用 Markdown 格式。`
}

/** 超過戳頭像上限的固定提示 */
export const POKE_LIMIT_MESSAGE = '傳訊次數已經到達上限啦，請再專心一點吧 ^^'
