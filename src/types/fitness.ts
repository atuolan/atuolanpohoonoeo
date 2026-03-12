/**
 * 健身陪伴系統類型定義
 */

// ===== 角色健身設定 =====
export interface CharacterFitnessConfig {
  /** 是否啟用健身夥伴功能 */
  enabled: boolean
  /** 角色類型 */
  role: 'coach' | 'partner' | 'cheerleader'
  /** 互動風格 */
  style: 'strict' | 'gentle' | 'playful'
  /** 自訂健身提示詞 */
  customPrompts?: string
}

// ===== 運動類型 =====
export type ExerciseType = 'strength' | 'cardio' | 'flexibility' | 'other'

// ===== 單組記錄 =====
export interface SetRecord {
  /** 次數 */
  reps: number
  /** 重量（公斤） */
  weight?: number
  /** 是否完成 */
  completed: boolean
}

// ===== 單項運動 =====
export interface Exercise {
  /** 運動 ID */
  id: string
  /** 運動名稱 */
  name: string
  /** 運動類型 */
  type: ExerciseType
  /** 組數記錄（力量訓練用） */
  sets?: SetRecord[]
  /** 時長（分鐘，有氧用） */
  duration?: number
  /** 距離（公里，跑步等用） */
  distance?: number
  /** 備註 */
  notes?: string
}

// ===== 訓練心情 =====
export type WorkoutMood = 'great' | 'good' | 'tired' | 'struggling'

// ===== 訓練記錄 =====
export interface WorkoutLog {
  /** 記錄 ID */
  id: string
  /** 日期 YYYY-MM-DD */
  date: string
  /** 訓練夥伴角色 ID */
  partnerId?: string
  /** 運動項目 */
  exercises: Exercise[]
  /** 總時長（分鐘） */
  totalDuration: number
  /** 備註 */
  notes?: string
  /** 訓練心情 */
  mood?: WorkoutMood
  /** 創建時間 */
  createdAt: number
}

// ===== 餐點類型 =====
export type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack'

// ===== 食物項目 =====
export interface FoodItem {
  /** 食物名稱 */
  name: string
  /** 份量描述 */
  portion?: string
  /** 熱量（大卡） */
  calories?: number
}

// ===== 單餐記錄 =====
export interface Meal {
  /** 餐點類型 */
  type: MealType
  /** 食物列表 */
  foods: FoodItem[]
  /** 用餐時間 HH:mm */
  time?: string
}

// ===== 飲食記錄 =====
export interface MealLog {
  /** 記錄 ID */
  id: string
  /** 日期 YYYY-MM-DD */
  date: string
  /** 餐點列表 */
  meals: Meal[]
  /** 總熱量 */
  totalCalories?: number
  /** 備註 */
  notes?: string
  /** 創建時間 */
  createdAt: number
}

// ===== 身體數據 =====
export interface BodyMetrics {
  /** 記錄 ID */
  id: string
  /** 日期 YYYY-MM-DD */
  date: string
  /** 體重（公斤） */
  weight?: number
  /** 身高（公分） */
  height?: number
  /** 胸圍（公分） */
  chest?: number
  /** 腰圍（公分） */
  waist?: number
  /** 臀圍（公分） */
  hip?: number
  /** 體脂率（%） */
  bodyFat?: number
  /** 備註 */
  notes?: string
  /** 創建時間 */
  createdAt: number
}

// ===== 健身設定 =====
export interface FitnessSettings {
  /** 預設訓練夥伴 ID */
  defaultPartnerId?: string
  /** 預設訓練時間（秒） */
  defaultWorkTime: number
  /** 預設休息時間（秒） */
  defaultRestTime: number
  /** 音效開關 */
  soundEnabled: boolean
  /** 提醒開關 */
  reminderEnabled: boolean
  /** 提醒時間 HH:mm */
  reminderTime?: string
  /** 提醒日期（0-6，0=週日） */
  reminderDays: number[]
  /** 每週訓練目標次數 */
  weeklyGoal?: number
}

// ===== 預設運動項目 =====
export interface PresetExercise {
  /** 運動名稱 */
  name: string
  /** 運動類型 */
  type: ExerciseType
  /** 圖標 */
  icon?: string
}

// ===== 訓練計時器狀態 =====
export type TimerPhase = 'idle' | 'working' | 'resting' | 'completed'

export interface WorkoutTimerState {
  /** 當前階段 */
  phase: TimerPhase
  /** 剩餘時間（秒） */
  timeLeft: number
  /** 當前組數 */
  currentSet: number
  /** 總組數 */
  totalSets: number
  /** 當前運動 */
  currentExercise?: Exercise
  /** 是否運行中 */
  isRunning: boolean
}

// ===== 健身統計 =====
export interface FitnessStats {
  /** 本週訓練次數 */
  weeklyWorkouts: number
  /** 連續訓練天數 */
  streak: number
  /** 本月總訓練時長（分鐘） */
  monthlyDuration: number
  /** 最近體重變化 */
  weightChange?: number
}

// ===== 角色健身互動訊息類型 =====
export type FitnessMessageType = 
  | 'start'           // 開始訓練
  | 'rest'            // 組間休息
  | 'setComplete'     // 完成一組
  | 'workoutComplete' // 訓練結束
  | 'streak'          // 連續打卡
  | 'reminder'        // 提醒訓練
  | 'weightProgress'  // 體重進步
  | 'encouragement'   // 一般鼓勵
