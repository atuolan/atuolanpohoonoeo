/**
 * 番茄鐘（專注計時器）類型定義
 */

// ===== 任務設定 =====

/** 番茄鐘任務的個別設定 */
export interface PomodoroTaskSettings {
  /** 綁定的 AI 角色 ID */
  boundCharId: string | null
  /** 用戶人設 ID */
  userPersonaId: string | null
  /** AI 自動鼓勵間隔（分鐘） */
  encouragementIntervalMin: number
  /** 戳頭像次數上限 */
  pokeLimit: number
  /** 專注畫面背景圖（data URL） */
  focusBackground: string
  /** 任務卡片背景圖（data URL） */
  cardBackground: string
  /** 計時器文字顏色 */
  timerColor: string
  /** 標題/副標題文字顏色 */
  textColor: string
  /** 播放按鈕顏色 */
  buttonColor: string
}

// ===== 任務 =====

/** 番茄鐘任務 */
export interface PomodoroTask {
  id: string
  name: string
  mode: 'countdown' | 'stopwatch'
  /** 倒計時分鐘數（正計時為 0） */
  durationMinutes: number
  createdAt: number
  settings: PomodoroTaskSettings
}

// ===== Session（純記憶體，不持久化） =====

/** 專注期間的 AI 互動記錄 */
export interface PomodoroInteraction {
  type: 'poke' | 'encouragement' | 'resume'
  role: 'user' | 'assistant'
  content: string
  timestamp: number
}

// ===== 工廠函數 =====

export function createDefaultTaskSettings(): PomodoroTaskSettings {
  return {
    boundCharId: null,
    userPersonaId: null,
    encouragementIntervalMin: 25,
    pokeLimit: 5,
    focusBackground: '',
    cardBackground: '',
    timerColor: '',
    textColor: '',
    buttonColor: '',
  }
}

export function createPomodoroTask(
  name: string,
  mode: 'countdown' | 'stopwatch',
  durationMinutes: number,
  settings?: Partial<PomodoroTaskSettings>,
): PomodoroTask {
  return {
    id: `pomodoro_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    name,
    mode,
    durationMinutes,
    createdAt: Date.now(),
    settings: { ...createDefaultTaskSettings(), ...settings },
  }
}
