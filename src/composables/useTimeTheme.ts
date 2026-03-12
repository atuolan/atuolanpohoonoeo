import { ref, computed, onMounted, onUnmounted } from 'vue'
import type { TimePhase } from '@/types'

// 時間動態主題 composable
export function useTimeTheme() {
  const currentHour = ref(new Date().getHours())
  let intervalId: number | null = null

  // 計算當前時間段
  const timePhase = computed<TimePhase>(() => {
    const hour = currentHour.value
    if (hour >= 5 && hour < 8) return 'dawn'      // 清晨 05-08
    if (hour >= 8 && hour < 12) return 'morning'  // 上午 08-12
    if (hour >= 12 && hour < 17) return 'afternoon' // 下午 12-17
    if (hour >= 17 && hour < 20) return 'evening' // 傍晚 17-20
    if (hour >= 20 && hour < 23) return 'night'   // 夜晚 20-23
    return 'midnight'                              // 深夜 23-05
  })

  // 根據時間段返回背景顏色
  const backgroundColor = computed(() => {
    switch (timePhase.value) {
      case 'dawn': return '#FFF8F0'      // 暖白
      case 'morning': return '#F8FAFC'   // 清白
      case 'afternoon': return '#FAFAFA' // 米白
      case 'evening': return '#FEF3E2'   // 暖橘
      case 'night': return '#1E293B'     // 深藍
      case 'midnight': return '#0F172A'  // 純黑
      default: return '#FAFAFA'
    }
  })

  // 文字顏色（根據背景明暗自動調整）
  const textColor = computed(() => {
    return ['night', 'midnight'].includes(timePhase.value) ? '#F8FAFC' : '#1F2937'
  })

  const textSecondaryColor = computed(() => {
    return ['night', 'midnight'].includes(timePhase.value) ? '#94A3B8' : '#6B7280'
  })

  // 是否為暗色模式
  const isDark = computed(() => {
    return ['night', 'midnight'].includes(timePhase.value)
  })

  // 更新時間
  function updateTime() {
    currentHour.value = new Date().getHours()
  }

  onMounted(() => {
    updateTime()
    // 每分鐘更新一次
    intervalId = window.setInterval(updateTime, 60000)
  })

  onUnmounted(() => {
    if (intervalId) {
      clearInterval(intervalId)
    }
  })

  return {
    currentHour,
    timePhase,
    backgroundColor,
    textColor,
    textSecondaryColor,
    isDark
  }
}
