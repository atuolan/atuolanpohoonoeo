import { onMounted, onUnmounted, type Ref } from 'vue'

/**
 * 右滑返回 composable（簡潔版 - 無視覺反饋）
 * 
 * 特點：
 * 1. 清晰的手勢判斷邏輯（來自 Aguaphone1）
 * 2. 達到閾值後直接觸發返回，讓 Vue transition 處理頁面切換
 * 3. 無視覺反饋，保持簡潔
 * 
 * @param onBack 觸發返回的回調
 * @param enabled 響應式 ref，為 false 時停用（如主頁面）
 */
export function useSwipeBack(onBack: () => void, enabled?: Ref<boolean>) {
  // 左側邊緣偵測寬度（px）
  const EDGE_WIDTH = 90
  // 觸發返回的閾值（px）
  const THRESHOLD = 80

  let startX = 0
  let startY = 0
  let tracking = false
  let fired = false
  let decided = false
  let swipeStartedFromEdge = false

  /**
   * 檢查觸控目標是否在受保護區域內（modal、input 等）
   */
  function isInProtectedArea(target: EventTarget | null): boolean {
    if (!target || !(target instanceof Element)) return false
    
    const protectedSelectors = [
      '.modal-overlay',
      '.modal-content', 
      '.modal-container',
      '.input-area',
      '[data-no-swipe-back]',
    ]
    
    return protectedSelectors.some(selector => target.closest(selector) !== null)
  }

  /**
   * 重置所有狀態
   */
  function resetState() {
    tracking = false
    fired = false
    decided = false
    swipeStartedFromEdge = false
  }

  function onTouchStart(e: TouchEvent) {
    if (enabled && !enabled.value) return
    if (isInProtectedArea(e.target)) return
    
    const touch = e.touches[0]
    // 只追蹤從左側邊緣開始的觸摸
    if (touch.clientX > EDGE_WIDTH) return
    
    startX = touch.clientX
    startY = touch.clientY
    tracking = true
    fired = false
    decided = false
    swipeStartedFromEdge = true
  }

  function onTouchMove(e: TouchEvent) {
    if (!tracking || fired) return
    if (!swipeStartedFromEdge) return
    
    const touch = e.touches[0]
    const dx = touch.clientX - startX
    const dy = touch.clientY - startY
    const absDx = Math.abs(dx)
    const absDy = Math.abs(dy)

    // 等累積足夠位移再判定方向
    if (!decided && absDx < 10 && absDy < 10) return

    if (!decided) {
      decided = true
      // 垂直位移大於水平位移，判定為滾動
      if (absDy > absDx) {
        tracking = false
        return
      }
      // 向左滑不處理
      if (dx < 0) {
        tracking = false
        return
      }
    }

    // 檢查是否達到閾值
    if (dx >= THRESHOLD) {
      // 阻止默認行為
      e.preventDefault()
      // 觸發返回
      fired = true
      tracking = false
      onBack()
    }
  }

  function onTouchEnd() {
    resetState()
  }

  // --- Pointer events (desktop drag) ---
  let pointerTracking = false
  let pointerFired = false
  let pointerStartX = 0
  let pointerStartY = 0
  let pointerDecided = false

  function onPointerDown(e: PointerEvent) {
    if (enabled && !enabled.value) return
    if (e.button !== 0) return
    if (e.clientX > EDGE_WIDTH) return
    
    pointerStartX = e.clientX
    pointerStartY = e.clientY
    pointerTracking = true
    pointerFired = false
    pointerDecided = false
    swipeStartedFromEdge = true
  }

  function onPointerMove(e: PointerEvent) {
    if (!pointerTracking || pointerFired) return
    if (!swipeStartedFromEdge) return
    
    const dx = e.clientX - pointerStartX
    const dy = e.clientY - pointerStartY
    const absDx = Math.abs(dx)
    const absDy = Math.abs(dy)

    if (!pointerDecided && absDx < 10 && absDy < 10) return

    if (!pointerDecided) {
      pointerDecided = true
      if (absDy > absDx || dx < 0) {
        pointerTracking = false
        return
      }
    }

    // 檢查是否達到閾值
    if (dx >= THRESHOLD) {
      pointerFired = true
      pointerTracking = false
      onBack()
    }
  }

  function onPointerUp() {
    pointerTracking = false
    pointerFired = false
    pointerDecided = false
    swipeStartedFromEdge = false
  }

  onMounted(() => {
    document.addEventListener('touchstart', onTouchStart, { passive: true, capture: true })
    document.addEventListener('touchmove', onTouchMove, { passive: false, capture: true })
    document.addEventListener('touchend', onTouchEnd, { passive: true, capture: true })
    document.addEventListener('touchcancel', onTouchEnd, { passive: true, capture: true })
    document.addEventListener('pointerdown', onPointerDown, { passive: true, capture: true })
    document.addEventListener('pointermove', onPointerMove, { passive: true, capture: true })
    document.addEventListener('pointerup', onPointerUp, { passive: true, capture: true })
    console.log('[SwipeBack] Clean swipe back active (no visual feedback)')
  })

  onUnmounted(() => {
    document.removeEventListener('touchstart', onTouchStart, { capture: true } as EventListenerOptions)
    document.removeEventListener('touchmove', onTouchMove, { capture: true } as EventListenerOptions)
    document.removeEventListener('touchend', onTouchEnd, { capture: true } as EventListenerOptions)
    document.removeEventListener('touchcancel', onTouchEnd, { capture: true } as EventListenerOptions)
    document.removeEventListener('pointerdown', onPointerDown, { capture: true } as EventListenerOptions)
    document.removeEventListener('pointermove', onPointerMove, { capture: true } as EventListenerOptions)
    document.removeEventListener('pointerup', onPointerUp, { capture: true } as EventListenerOptions)
  })
}
