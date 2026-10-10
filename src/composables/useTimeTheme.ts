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
      case 'night': return '#1F1A17'     // 深可可
      case 'midnight': return '#131110'  // 純黑
      default: return '#FAFAFA'
    }
  })

  // 根據時間段返回桌布漸層（兩團柔光 + 底色漸層，第一個色碼需與明暗一致，供亮度偵測使用）
  const backgroundGradient = computed(() => {
    const mesh = (blobA: string, blobB: string, from: string, to: string) =>
      `radial-gradient(ellipse 70% 55% at 12% 8%, ${blobA} 0%, transparent 70%), ` +
      `radial-gradient(ellipse 65% 60% at 90% 92%, ${blobB} 0%, transparent 70%), ` +
      `linear-gradient(165deg, ${from} 0%, ${to} 100%)`
    switch (timePhase.value) {
      case 'dawn': return mesh('#FFD9C4', '#FFE1E6', '#FFF6EF', '#FFF0EF')      // 蜜桃 × 櫻花粉
      case 'morning': return mesh('#DDF2E3', '#FFF3C4', '#F7FBF5', '#FDFAEE')   // 薄荷 × 檸檬
      case 'afternoon': return mesh('#FFEFC7', '#E3EED8', '#FBF9F3', '#F6F7EE') // 奶油 × 鼠尾草
      case 'evening': return mesh('#FFD2B3', '#F9D6DC', '#FFF3E8', '#FCECEB')   // 杏橘 × 玫瑰
      case 'night': return mesh('#4A3528', '#33402F', '#1F1A17', '#27211D')     // 可可 × 苔綠
      case 'midnight': return mesh('#36281F', '#252D23', '#131110', '#1A1614')  // 深咖 × 墨綠
      default: return mesh('#FFEFC7', '#E3EED8', '#FBF9F3', '#F6F7EE')
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
    backgroundGradient,
    textColor,
    textSecondaryColor,
    isDark
  }
}
