/**
 * 預設運動項目清單
 */

import type { PresetExercise } from '@/types/fitness'

// 力量訓練
export const strengthExercises: PresetExercise[] = [
  { name: '深蹲', type: 'strength' },
  { name: '臥推', type: 'strength' },
  { name: '硬舉', type: 'strength' },
  { name: '肩推', type: 'strength' },
  { name: '划船', type: 'strength' },
  { name: '引體向上', type: 'strength' },
  { name: '二頭彎舉', type: 'strength' },
  { name: '三頭下壓', type: 'strength' },
  { name: '腿推', type: 'strength' },
  { name: '腿彎舉', type: 'strength' },
  { name: '小腿提踵', type: 'strength' },
  { name: '啞鈴飛鳥', type: 'strength' },
  { name: '側平舉', type: 'strength' },
  { name: '弓箭步', type: 'strength' },
  { name: '伏地挺身', type: 'strength' },
  { name: '仰臥起坐', type: 'strength' },
  { name: '棒式', type: 'strength' },
  { name: '捲腹', type: 'strength' },
]

// 有氧運動
export const cardioExercises: PresetExercise[] = [
  { name: '跑步', type: 'cardio' },
  { name: '快走', type: 'cardio' },
  { name: '騎腳踏車', type: 'cardio' },
  { name: '游泳', type: 'cardio' },
  { name: '跳繩', type: 'cardio' },
  { name: '橢圓機', type: 'cardio' },
  { name: '划船機', type: 'cardio' },
  { name: '登山機', type: 'cardio' },
  { name: '有氧舞蹈', type: 'cardio' },
  { name: '拳擊有氧', type: 'cardio' },
  { name: 'HIIT', type: 'cardio' },
]

// 柔軟度訓練
export const flexibilityExercises: PresetExercise[] = [
  { name: '瑜伽', type: 'flexibility' },
  { name: '皮拉提斯', type: 'flexibility' },
  { name: '伸展運動', type: 'flexibility' },
  { name: '滾筒放鬆', type: 'flexibility' },
]

// 所有預設運動
export const allPresetExercises: PresetExercise[] = [
  ...strengthExercises,
  ...cardioExercises,
  ...flexibilityExercises,
]

// 依類型分組
export const exercisesByType = {
  strength: strengthExercises,
  cardio: cardioExercises,
  flexibility: flexibilityExercises,
}
