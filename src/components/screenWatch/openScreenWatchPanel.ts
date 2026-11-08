import { h, render, type AppContext } from "vue";
import ScreenWatchPanel from "./ScreenWatchPanel.vue";

let container: HTMLElement | null = null;

/** 打開「分享螢幕」面板（掛在 body 上，不用改聊天畫面的模板） */
export function openScreenWatchPanel(
  props: { chatId: string; characterName: string },
  appContext?: AppContext | null,
): void {
  closeScreenWatchPanel();
  container = document.createElement("div");
  document.body.appendChild(container);
  const vnode = h(ScreenWatchPanel, { ...props, onClose: closeScreenWatchPanel });
  if (appContext) vnode.appContext = appContext;
  render(vnode, container);
}

export function closeScreenWatchPanel(): void {
  if (!container) return;
  render(null, container);
  container.remove();
  container = null;
}
