import { ref, watch, type Ref } from "vue";

/**
 * 依文字區塊實際分到的高度，算出放得下幾整行，給 line-clamp 用。
 * 格子比預期矮時只少顯示幾行，不會把最後一行切成半截。
 *
 * 文字區塊必須用 `flex: 1 1 0; min-height: 0` 之類的方式填滿剩餘空間，
 * 量到的高度才是「可用空間」而不是「文字本身的高度」。
 *
 * @param maxLines 最多顯示幾行（空間再大也不超過）；不傳代表不設上限
 */
export function useFitLineCount(
  elRef: Ref<HTMLElement | null>,
  maxLines = Infinity,
): Ref<number> {
  // 量到之前先給一個合理的行數（CSS 變數不能是 Infinity）
  const lineCount = ref(Number.isFinite(maxLines) ? maxLines : 3);

  function measure() {
    const el = elRef.value;
    if (!el) return;
    const style = getComputedStyle(el);
    const lineHeight =
      parseFloat(style.lineHeight) || parseFloat(style.fontSize) * 1.5 || 20;
    // 留一點誤差給小數點像素，剛好放得下的那一行不要被算掉
    const fit = Math.floor((el.clientHeight + 1) / lineHeight);
    lineCount.value = Math.max(1, Math.min(maxLines, fit));
  }

  // 文字區塊出現時（含空狀態切換回來）開始量高度，離開時停止觀察
  watch(
    elRef,
    (el, _prev, onCleanup) => {
      if (!el) return;
      measure();
      if (typeof ResizeObserver === "undefined") return;
      const observer = new ResizeObserver(measure);
      observer.observe(el);
      onCleanup(() => observer.disconnect());
    },
    { flush: "post" },
  );

  return lineCount;
}
