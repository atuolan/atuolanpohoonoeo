/**
 * 只開像素小屋的測試頁（開發用，不會打包進 App）：
 * npm run dev 之後開 /scripts/pixel-house/harness/index.html
 * 不經過登入，量耗電、試點擊用。點了要去哪個 App 記在 window.__navigations。
 */
import { createPinia } from "pinia";
import { createApp, h } from "vue";
import PixelHouseHome from "@/components/pixelHouse/PixelHouseHome.vue";

const navigations: unknown[][] = [];
(window as unknown as { __navigations: unknown[][] }).__navigations = navigations;

createApp({
  render: () =>
    h(PixelHouseHome, {
      onNavigate: (...args: unknown[]) => navigations.push(args),
      onOpenGlobalTheme: () => navigations.push(["global-theme"]),
    }),
})
  .use(createPinia())
  .mount("#app");
