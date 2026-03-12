/**
 * 角色主動發訊息 Composable
 */

import { ref, computed } from 'vue'
import { proactiveMessageService, type ProactiveMessageSettings } from '@/services/ProactiveMessageService'

export function useProactiveMessage(characterId: string) {
  const settings = ref<ProactiveMessageSettings | undefined>(
    proactiveMessageService.getSettings(characterId)
  )

  // 如果沒有設置，異步初始化
  if (!settings.value) {
    proactiveMessageService.initializeSettings(characterId).then(initialized => {
      settings.value = initialized
    })
  }

  // 預設時間間隔選項（分鐘）
  const intervalPresets = [
    { label: '30 分鐘', value: 30 },
    { label: '1 小時', value: 60 },
    { label: '2 小時', value: 120 },
    { label: '3 小時', value: 180 },
    { label: '6 小時', value: 360 },
    { label: '12 小時', value: 720 },
    { label: '24 小時', value: 1440 }
  ]

  // 下次發送時間文字
  const nextTimeText = computed(() => {
    if (!settings.value) return '未啟用'
    return proactiveMessageService.formatNextTime(settings.value)
  })

  // 是否啟用
  const isEnabled = computed(() => settings.value?.enabled || false)

  // 更新設置
  const updateSettings = (newSettings: Partial<ProactiveMessageSettings>) => {
    proactiveMessageService.updateSettings(characterId, newSettings)
    settings.value = proactiveMessageService.getSettings(characterId)
  }

  // 切換啟用狀態
  const toggleEnabled = () => {
    const newEnabled = !settings.value?.enabled
    const updates: Partial<ProactiveMessageSettings> = { enabled: newEnabled }
    
    // 如果是開啟，立即計算下次發送時間並確保服務已啟動
    if (newEnabled && settings.value) {
      const now = Date.now()
      updates.nextScheduledTime = now + (settings.value.intervalMinutes * 60 * 1000)
      // 確保服務已啟動
      proactiveMessageService.start()
    }
    
    updateSettings(updates)
  }

  // 設置時間間隔
  const setInterval = (minutes: number) => {
    updateSettings({ intervalMinutes: minutes })
  }

  // 設置夜間免打擾
  const setDoNotDisturb = (enabled: boolean, start?: string, end?: string) => {
    const update: Partial<ProactiveMessageSettings> = {
      doNotDisturbEnabled: enabled
    }
    if (start) update.doNotDisturbStart = start
    if (end) update.doNotDisturbEnd = end
    updateSettings(update)
  }

  // 設置是否顯示通知
  const setShowNotification = (show: boolean) => {
    updateSettings({ showNotification: show })
  }

  // 立即觸發一次（用於測試）
  const triggerNow = async () => {
    if (!settings.value) return
    
    // 確保服務已啟動
    proactiveMessageService.start()
    
    // 直接調用發送方法，不依賴定時檢查
    await proactiveMessageService.sendProactiveMessageNow(characterId)
  }

  // 格式化時間間隔顯示
  const formatInterval = (minutes: number): string => {
    if (minutes < 60) {
      return `${minutes} 分鐘`
    }
    const hours = Math.floor(minutes / 60)
    const mins = minutes % 60
    if (mins === 0) {
      return `${hours} 小時`
    }
    return `${hours} 小時 ${mins} 分鐘`
  }

  return {
    settings,
    intervalPresets,
    nextTimeText,
    isEnabled,
    updateSettings,
    toggleEnabled,
    setInterval,
    setDoNotDisturb,
    setShowNotification,
    triggerNow,
    formatInterval
  }
}
