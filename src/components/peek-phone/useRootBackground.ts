/**
 * iOS 主畫面 App 裡，#app 的高度有時比螢幕矮一截，底下會露出 body 的底色（米色）。
 * 一般頁面背景本來就偏米色看不出來，頭盔TA 是深色的就很明顯。
 * 頭盔TA 開著時，把那塊換成畫面最底下的顏色；全部離開後換回原本的。
 *
 * 換頁時新頁面可能先掛上、舊頁面才卸下，所以用堆疊：最後掛上的說了算。
 */

import { onScopeDispose, watch, type Ref } from "vue";

interface Entry {
  color: string;
}

const active: Entry[] = [];
let original: { html: string; body: string } | null = null;

function apply(): void {
  const top = active[active.length - 1];
  const html = document.documentElement.style;
  const body = document.body.style;
  if (top) {
    html.background = top.color;
    body.background = top.color;
  } else if (original) {
    html.background = original.html;
    body.background = original.body;
    original = null;
  }
}

export function useRootBackground(color: Ref<string>): void {
  if (typeof document === "undefined") return;
  if (active.length === 0) {
    original = {
      html: document.documentElement.style.background,
      body: document.body.style.background,
    };
  }
  const entry: Entry = { color: color.value };
  active.push(entry);

  watch(
    color,
    (c) => {
      entry.color = c;
      apply();
    },
    { immediate: true },
  );

  onScopeDispose(() => {
    const i = active.indexOf(entry);
    if (i !== -1) active.splice(i, 1);
    apply();
  });
}
