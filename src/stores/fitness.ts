/**
 * 健身陪伴系統 Store
 */

import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { db, DB_STORES } from '@/db/database'
import type {
  WorkoutLog,
  MealLog,
  BodyMetrics,
  FitnessSettings,
  FitnessStats,
  CharacterFitnessConfig,
  Exercise,
  WorkoutTimerState,
  TimerPhase,
  MealType,
  FoodItem,
} from '@/types/fitness'
import dayjs from 'dayjs'

// 預設設定
const DEFAULT_SETTINGS: FitnessSettings = {
  defaultWorkTime: 45,      // 45 秒
  defaultRestTime: 30,      // 30 秒
  soundEnabled: true,
  reminderEnabled: false,
  reminderDays: [1, 3, 5],  // 週一三五
  weeklyGoal: 3,
}

export const useFitnessStore = defineStore('fitness', () => {
  // ===== 狀態 =====
  const workoutLogs = ref<WorkoutLog[]>([])
  const mealLogs = ref<MealLog[]>([])
  const bodyMetrics = ref<BodyMetrics[]>([])
  const settings = ref<FitnessSettings>({ ...DEFAULT_SETTINGS })
  const characterConfigs = ref<Map<string, CharacterFitnessConfig>>(new Map())
  const isLoaded = ref(false)

  // 計時器狀態
  const timerState = ref<WorkoutTimerState>({
    phase: 'idle',
    timeLeft: DEFAULT_SETTINGS.defaultWorkTime,
    currentSet: 0,
    totalSets: 0,
    isRunning: false,
  })

  // ===== 計算屬性 =====
  
  // 今日訓練記錄
  const todayWorkout = computed(() => {
    const today = dayjs().format('YYYY-MM-DD')
    return workoutLogs.value.find(log => log.date === today)
  })

  // 本週訓練次數
  const weeklyWorkouts = computed(() => {
    const startOfWeek = dayjs().startOf('week')
    return workoutLogs.value.filter(log => 
      dayjs(log.date).isAfter(startOfWeek) || dayjs(log.date).isSame(startOfWeek, 'day')
    ).length
  })

  // 連續訓練天數
  const streak = computed(() => {
    if (workoutLogs.value.length === 0) return 0
    
    const sortedLogs = [...workoutLogs.value].sort((a, b) => 
      dayjs(b.date).valueOf() - dayjs(a.date).valueOf()
    )
    
    let count = 0
    let currentDate = dayjs()
    
    // 如果今天沒訓練，從昨天開始算
    if (!todayWorkout.value) {
      currentDate = currentDate.subtract(1, 'day')
    }
    
    for (const log of sortedLogs) {
      if (dayjs(log.date).isSame(currentDate, 'day')) {
        count++
        currentDate = currentDate.subtract(1, 'day')
      } else if (dayjs(log.date).isBefore(currentDate, 'day')) {
        break
      }
    }
    
    return count
  })

  // 統計資料
  const stats = computed<FitnessStats>(() => {
    const monthStart = dayjs().startOf('month')
    const monthlyLogs = workoutLogs.value.filter(log =>
      dayjs(log.date).isAfter(monthStart) || dayjs(log.date).isSame(monthStart, 'day')
    )
    
    const monthlyDuration = monthlyLogs.reduce((sum, log) => sum + log.totalDuration, 0)
    
    // 計算體重變化
    let weightChange: number | undefined
    if (bodyMetrics.value.length >= 2) {
      const sorted = [...bodyMetrics.value]
        .filter(m => m.weight !== undefined)
        .sort((a, b) => dayjs(b.date).valueOf() - dayjs(a.date).valueOf())
      
      if (sorted.length >= 2 && sorted[0].weight && sorted[1].weight) {
        weightChange = Number((sorted[0].weight - sorted[1].weight).toFixed(1))
      }
    }
    
    return {
      weeklyWorkouts: weeklyWorkouts.value,
      streak: streak.value,
      monthlyDuration,
      weightChange,
    }
  })

  // 啟用健身功能的角色列表
  const fitnessPartners = computed(() => {
    const partners: { id: string; config: CharacterFitnessConfig }[] = []
    characterConfigs.value.forEach((config, id) => {
      if (config.enabled) {
        partners.push({ id, config })
      }
    })
    return partners
  })

  // ===== 資料庫操作 =====
  
  async function loadFromDB() {
    if (isLoaded.value) return
    
    try {
      // 載入設定
      const storedSettings = await db.get<FitnessSettings>(DB_STORES.SETTINGS, 'fitness-settings')
      if (storedSettings) {
        settings.value = { ...DEFAULT_SETTINGS, ...storedSettings }
      }
      
      // 載入角色健身設定
      const storedConfigs = await db.get<Record<string, CharacterFitnessConfig>>(
        DB_STORES.SETTINGS, 
        'fitness-character-configs'
      )
      if (storedConfigs) {
        characterConfigs.value = new Map(Object.entries(storedConfigs))
      }

      // 載入所有健身相關資料
      const allSettings = await db.getAll<{ id?: string }>(DB_STORES.SETTINGS)
      
      for (const item of allSettings) {
        if (!item.id) continue
        
        if (item.id.startsWith('workout-')) {
          workoutLogs.value.push(item as unknown as WorkoutLog)
        } else if (item.id.startsWith('meal-')) {
          mealLogs.value.push(item as unknown as MealLog)
        } else if (item.id.startsWith('body-')) {
          bodyMetrics.value.push(item as unknown as BodyMetrics)
        }
      }
      
      isLoaded.value = true
      console.log('[Fitness] 資料載入完成')
    } catch (error) {
      console.error('[Fitness] 載入失敗:', error)
    }
  }

  async function saveSettings() {
    try {
      await db.put(DB_STORES.SETTINGS, JSON.parse(JSON.stringify(settings.value)), 'fitness-settings')
    } catch (error) {
      console.error('[Fitness] 儲存設定失敗:', error)
    }
  }

  async function saveCharacterConfigs() {
    try {
      const configsObj = Object.fromEntries(characterConfigs.value)
      // 轉換為純物件以避免 Vue reactive 物件無法被 IndexedDB clone
      const plainObj = JSON.parse(JSON.stringify(configsObj))
      await db.put(DB_STORES.SETTINGS, plainObj, 'fitness-character-configs')
    } catch (error) {
      console.error('[Fitness] 儲存角色設定失敗:', error)
    }
  }

  // ===== 訓練記錄操作 =====
  
  async function addWorkoutLog(log: Omit<WorkoutLog, 'id' | 'createdAt'>) {
    const newLog: WorkoutLog = {
      ...log,
      id: `workout-${Date.now()}`,
      createdAt: Date.now(),
    }
    workoutLogs.value.push(newLog)
    
    // 儲存到 DB
    try {
      await db.put(DB_STORES.SETTINGS, JSON.parse(JSON.stringify(newLog)), `workout-${newLog.id}`)
    } catch (error) {
      console.error('[Fitness] 儲存訓練記錄失敗:', error)
    }
    
    return newLog
  }

  async function updateWorkoutLog(id: string, updates: Partial<WorkoutLog>) {
    const index = workoutLogs.value.findIndex(log => log.id === id)
    if (index === -1) return
    
    workoutLogs.value[index] = { ...workoutLogs.value[index], ...updates }
    
    try {
      await db.put(DB_STORES.SETTINGS, JSON.parse(JSON.stringify(workoutLogs.value[index])), `workout-${id}`)
    } catch (error) {
      console.error('[Fitness] 更新訓練記錄失敗:', error)
    }
  }

  // ===== 飲食記錄操作 =====

  async function addFoodToMeal(date: string, mealType: MealType, food: FoodItem) {
    let mealLog = mealLogs.value.find(log => log.date === date)
    
    if (!mealLog) {
      // 建立新的日期記錄
      mealLog = {
        id: `meal-${Date.now()}`,
        date,
        meals: [],
        createdAt: Date.now(),
      }
      mealLogs.value.push(mealLog)
    }
    
    // 找到對應餐點或建立新的
    let meal = mealLog.meals.find(m => m.type === mealType)
    if (!meal) {
      meal = { type: mealType, foods: [] }
      mealLog.meals.push(meal)
    }
    
    meal.foods.push(food)
    
    // 更新總熱量
    mealLog.totalCalories = mealLog.meals.reduce((sum, m) => 
      sum + m.foods.reduce((mealSum, f) => mealSum + (f.calories || 0), 0), 0
    )
    
    // 儲存
    try {
      await db.put(DB_STORES.SETTINGS, JSON.parse(JSON.stringify(mealLog)), `meal-${mealLog.id}`)
    } catch (error) {
      console.error('[Fitness] 儲存飲食記錄失敗:', error)
    }
  }

  async function removeFoodFromMeal(date: string, mealType: MealType, foodIndex: number) {
    const mealLog = mealLogs.value.find(log => log.date === date)
    if (!mealLog) return
    
    const meal = mealLog.meals.find(m => m.type === mealType)
    if (!meal) return
    
    meal.foods.splice(foodIndex, 1)
    
    // 更新總熱量
    mealLog.totalCalories = mealLog.meals.reduce((sum, m) => 
      sum + m.foods.reduce((mealSum, f) => mealSum + (f.calories || 0), 0), 0
    )
    
    // 儲存
    try {
      await db.put(DB_STORES.SETTINGS, JSON.parse(JSON.stringify(mealLog)), `meal-${mealLog.id}`)
    } catch (error) {
      console.error('[Fitness] 更新飲食記錄失敗:', error)
    }
  }

  // ===== 身體數據操作 =====

  async function addBodyMetrics(metrics: Omit<BodyMetrics, 'id' | 'createdAt'>) {
    // 檢查同一天是否已有記錄
    const existingIndex = bodyMetrics.value.findIndex(m => m.date === metrics.date)
    
    if (existingIndex !== -1) {
      // 更新現有記錄
      bodyMetrics.value[existingIndex] = {
        ...bodyMetrics.value[existingIndex],
        ...metrics,
      }
      try {
        await db.put(
          DB_STORES.SETTINGS, 
          JSON.parse(JSON.stringify(bodyMetrics.value[existingIndex])), 
          `body-${bodyMetrics.value[existingIndex].id}`
        )
      } catch (error) {
        console.error('[Fitness] 更新身體數據失敗:', error)
      }
    } else {
      // 新增記錄
      const newMetrics: BodyMetrics = {
        ...metrics,
        id: `body-${Date.now()}`,
        createdAt: Date.now(),
      }
      bodyMetrics.value.push(newMetrics)
      
      try {
        await db.put(DB_STORES.SETTINGS, JSON.parse(JSON.stringify(newMetrics)), `body-${newMetrics.id}`)
      } catch (error) {
        console.error('[Fitness] 儲存身體數據失敗:', error)
      }
    }
  }

  // ===== 角色健身設定 =====
  
  function getCharacterFitnessConfig(characterId: string): CharacterFitnessConfig | undefined {
    return characterConfigs.value.get(characterId)
  }

  function setCharacterFitnessConfig(characterId: string, config: CharacterFitnessConfig) {
    characterConfigs.value.set(characterId, config)
    saveCharacterConfigs()
  }

  function removeCharacterFitnessConfig(characterId: string) {
    characterConfigs.value.delete(characterId)
    saveCharacterConfigs()
  }

  function isCharacterFitnessEnabled(characterId: string): boolean {
    const config = characterConfigs.value.get(characterId)
    return config?.enabled ?? false
  }

  // ===== 計時器操作 =====
  
  function startTimer(exercise: Exercise, sets: number) {
    timerState.value = {
      phase: 'working',
      timeLeft: settings.value.defaultWorkTime,
      currentSet: 1,
      totalSets: sets,
      currentExercise: exercise,
      isRunning: true,
    }
  }

  function pauseTimer() {
    timerState.value.isRunning = false
  }

  function resumeTimer() {
    timerState.value.isRunning = true
  }

  function completeSet() {
    if (timerState.value.currentSet >= timerState.value.totalSets) {
      // 全部完成
      timerState.value.phase = 'completed'
      timerState.value.isRunning = false
    } else {
      // 進入休息
      timerState.value.phase = 'resting'
      timerState.value.timeLeft = settings.value.defaultRestTime
    }
  }

  function nextSet() {
    timerState.value.currentSet++
    timerState.value.phase = 'working'
    timerState.value.timeLeft = settings.value.defaultWorkTime
  }

  function resetTimer() {
    timerState.value = {
      phase: 'idle',
      timeLeft: settings.value.defaultWorkTime,
      currentSet: 0,
      totalSets: 0,
      isRunning: false,
    }
  }

  function tickTimer() {
    if (!timerState.value.isRunning || timerState.value.timeLeft <= 0) return
    timerState.value.timeLeft--
  }

  // ===== 更新設定 =====
  
  function updateSettings(newSettings: Partial<FitnessSettings>) {
    settings.value = { ...settings.value, ...newSettings }
    saveSettings()
  }

  return {
    // 狀態
    workoutLogs,
    mealLogs,
    bodyMetrics,
    settings,
    characterConfigs,
    timerState,
    isLoaded,
    
    // 計算屬性
    todayWorkout,
    weeklyWorkouts,
    streak,
    stats,
    fitnessPartners,
    
    // 方法
    loadFromDB,
    addWorkoutLog,
    updateWorkoutLog,
    addFoodToMeal,
    removeFoodFromMeal,
    addBodyMetrics,
    getCharacterFitnessConfig,
    setCharacterFitnessConfig,
    removeCharacterFitnessConfig,
    isCharacterFitnessEnabled,
    startTimer,
    pauseTimer,
    resumeTimer,
    completeSet,
    nextSet,
    resetTimer,
    tickTimer,
    updateSettings,
  }
})
