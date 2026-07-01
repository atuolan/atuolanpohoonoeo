/**
 * 工具註冊表（Tool Registry）
 *
 * 每個工具是一筆宣告式定義：名稱 + 說明 + 參數規格 + 執行函式。
 * AI 只輸出「工具名 + 參數」，由 ThemeAssistantService 驗證後呼叫 execute，
 * execute 再派發到既有的 theme / canvas store setter——不新增任何底層樣式邏輯。
 *
 * 列舉值一律 import 既有常數（themePresets / skinPresets / themePacks…），
 * 確保永遠與程式同步，不硬編。
 */
import type { ToolParamSpec } from "./toolParamSpec";
import { validateArgs } from "./toolParamSpec";
import { useThemeStore, type ThemeColors } from "@/stores/theme";
import { useCanvasStore } from "@/stores/canvas";
import { themePresets } from "@/stores/theme";
import { skinPresets } from "@/styles/skin-presets";
import { themePacks } from "@/styles/theme-packs";
import { shapePresets } from "@/styles/shape-presets";
import { styleLayouts } from "@/components/panels/widget-settings/widgetSettingsOptions";
import { formatWidgetStyleDetail } from "./widgetStyleHints";
import type { WidgetType } from "@/types";

// ===== 執行上下文 =====

/** execute 取得的 store 句柄（由呼叫端在執行時注入，避免模組載入期呼叫 useStore） */
export interface ToolContext {
  theme: ReturnType<typeof useThemeStore>;
  canvas: ReturnType<typeof useCanvasStore>;
}

// ===== 工具定義 =====

export interface ThemeTool {
  /** 給 AI 看的工具名（中文易懂、唯一） */
  name: string;
  /** 何時用這個工具 */
  description: string;
  /** 參數規格 */
  params: ToolParamSpec[];
  /**
   * 是否為「查詢型」工具（唯讀，不改外觀）。
   * 查詢型工具改實作 query() 回傳資訊文字餵回給 AI，供其判斷後再決定怎麼修改；
   * 不影響「是否套用」「能否還原」。
   */
  query?: boolean;
  /**
   * 是否為「詢問型」工具（不改外觀，向使用者提出一個選擇題並暫停本輪）。
   * 執行後由 UI 渲染成可點擊的選項，等使用者回答後才進入下一輪。
   */
  ask?: boolean;
  /**
   * 是否為「截圖自檢」工具（唯讀，不改外觀）。
   * 觸發後由前端截取首頁實際畫面，把圖片回餵給 AI 做視覺檢查，
   * 讓它親眼確認上一步修改是否真的生效，再決定要不要補救。
   */
  screenshot?: boolean;
  /** 派發到既有 store setter（args 已通過驗證 / 正規化）。動作型工具須實作。 */
  execute?(args: Record<string, unknown>, ctx: ToolContext): void;
  /** 查詢型工具：回傳要餵回給 AI 的資訊文字。 */
  inspect?(args: Record<string, unknown>, ctx: ToolContext): string;
}

// ===== 列舉值來源（import 既有常數，永遠同步） =====

const PRESET_VALUES = Object.keys(themePresets);
const SKIN_VALUES = Object.keys(skinPresets);
const PACK_VALUES = themePacks.map((p) => p.id);
const COLOR_KEYS: (keyof ThemeColors)[] = [
  "primary",
  "primaryLight",
  "secondary",
  "background",
  "surface",
  "surfaceHover",
  "text",
  "textSecondary",
  "textMuted",
  "border",
  "shadow",
  "success",
  "error",
  "warning",
];
const CLOCK_STYLE_VALUES = [
  "minimal",
  "digital",
  "analog",
  "flip",
  "neon",
  "progress",
  "binary",
  "dotmatrix",
  "orbit",
];
const WALLPAPER_TYPE_VALUES = [
  "color",
  "gradient",
  "image",
  "pattern",
  "time-theme",
];
const AVATAR_SHAPE_VALUES = ["circle", "square", "rounded"];
const AVATAR_SIZE_VALUES = ["small", "medium", "large"];
const SHAPE_VALUES = shapePresets.map((s) => s.id);
const SHAPE_LABELS = shapePresets.map((s) => `${s.id}（${s.name}）`).join("、");
// 共用 7 皮膚的佈局風格（拍立得 / 日曆 / 天氣 / 待辦 / 語錄 / 心情 / 專注計時器共用）
const STYLE_LAYOUT_VALUES = styleLayouts.map((l) => l.id);
const STYLE_LAYOUT_LABELS = styleLayouts
  .map((l) => `${l.id}（${l.name}：${l.desc}）`)
  .join("、");

// ===== 工具清單 =====

export const THEME_TOOLS: ThemeTool[] = [
  // ---- A. 列舉型工具 ----
  {
    name: "設定配色預設",
    description: "整組換掉介面主配色。想要某種色系氛圍時用。",
    params: [
      {
        name: "preset",
        type: "enum",
        values: PRESET_VALUES,
        description: "配色預設 ID",
      },
    ],
    execute(args, ctx) {
      ctx.theme.setPreset(args.preset as string);
    },
  },
  {
    name: "設定皮膚",
    description:
      "改變整體「形態質感」：圓角、陰影、模糊、按壓回饋。soft 柔和、glass 玻璃通透、flat 扁平、plump 圓潤膨脹。",
    params: [
      {
        name: "skin",
        type: "enum",
        values: SKIN_VALUES,
        description: "皮膚 ID",
      },
    ],
    execute(args, ctx) {
      ctx.theme.setSkin(args.skin as string);
    },
  },
  {
    name: "套用主題包",
    description:
      "一鍵套用整組風格（配色 + 皮膚 + 桌布 + 氣泡）。使用者描述一個完整風格時優先用。",
    params: [
      {
        name: "pack",
        type: "enum",
        values: PACK_VALUES,
        description: "主題包 ID",
      },
    ],
    execute(args, ctx) {
      const pack = themePacks.find((p) => p.id === args.pack);
      if (pack) {
        ctx.theme.applyThemePack(pack);
        // 同步套用主題包的組件版面 / 皮膚
        ctx.canvas.applyThemePackLayouts(pack);
      }
    },
  },
  {
    name: "設定夜晚模式",
    description: "開啟 / 關閉夜晚模式（自動調暗）。",
    params: [
      { name: "enabled", type: "boolean", description: "true 開啟、false 關閉" },
    ],
    execute(args, ctx) {
      ctx.theme.setNightMode(args.enabled as boolean);
    },
  },
  {
    name: "重置主題",
    description: "把所有外觀設定還原為預設（後悔藥）。使用者說「全部還原 / 重來」時用。",
    params: [],
    execute(_args, ctx) {
      ctx.theme.resetToDefault();
    },
  },

  // ---- B. 生成式 / 數值型工具 ----
  {
    name: "設定單一顏色",
    description:
      "只改某一個顏色角色（如主色、背景、文字色），其餘不動。需要精準調色時用。\n【透明 / 半透明】顏色可用 8 碼 hex 帶透明度（#RRGGBBAA，例如全透明 #00000000、半透明白 #FFFFFF80）。\n【注意】target=background 改的是「App 全域底色」，若使用者有設桌布(wallpaper)會被桌布蓋住而看不出變化；想讓「桌面組件」變透明 / 毛玻璃，不要用這個工具，改用「寫入全局自訂CSS」打 .widget-wrapper .widget-content > *。",
    params: [
      {
        name: "target",
        type: "enum",
        values: COLOR_KEYS as string[],
        description: "要改的顏色角色",
      },
      {
        name: "color",
        type: "color",
        description: "hex 顏色值；支援 3/6 碼不透明色，及 4/8 碼含透明度（如全透明 #00000000）",
      },
    ],
    execute(args, ctx) {
      ctx.theme.setCustomColor(args.target as keyof ThemeColors, args.color as string);
    },
  },
  {
    name: "設定氣泡圓角",
    description: "調整聊天氣泡的圓角大小。",
    params: [
      {
        name: "radius",
        type: "number",
        min: 0,
        max: 40,
        integer: true,
        description: "圓角 px",
      },
    ],
    execute(args, ctx) {
      ctx.theme.updateBubbleStyle({ borderRadius: args.radius as number });
    },
  },
  {
    name: "設定氣泡顏色",
    description: "改使用者 / AI 聊天氣泡的背景色。",
    params: [
      {
        name: "userBgColor",
        type: "color",
        required: false,
        description: "使用者氣泡背景色",
      },
      {
        name: "aiBgColor",
        type: "color",
        required: false,
        description: "AI 氣泡背景色",
      },
    ],
    execute(args, ctx) {
      const updates: Record<string, unknown> = {};
      if (args.userBgColor) updates.userBgColor = args.userBgColor;
      if (args.aiBgColor) updates.aiBgColor = args.aiBgColor;
      if (Object.keys(updates).length) ctx.theme.updateBubbleStyle(updates);
    },
  },
  {
    name: "設定頭像樣式",
    description: "調整聊天頭像的形狀 / 大小 / 邊框。",
    params: [
      {
        name: "shape",
        type: "enum",
        values: AVATAR_SHAPE_VALUES,
        required: false,
        description: "頭像形狀",
      },
      {
        name: "size",
        type: "enum",
        values: AVATAR_SIZE_VALUES,
        required: false,
        description: "頭像大小",
      },
      {
        name: "borderColor",
        type: "color",
        required: false,
        description: "邊框顏色",
      },
      {
        name: "borderWidth",
        type: "number",
        min: 0,
        max: 8,
        integer: true,
        required: false,
        description: "邊框寬度 px",
      },
    ],
    execute(args, ctx) {
      const updates: Record<string, unknown> = {};
      for (const k of ["shape", "size", "borderColor", "borderWidth"]) {
        if (args[k] !== undefined) updates[k] = args[k];
      }
      if (Object.keys(updates).length) ctx.theme.updateAvatarStyle(updates);
    },
  },
  {
    name: "設定桌布",
    description:
      "改桌面 / 背景。type=color 用純色、gradient 用漸層字串、time-theme 隨時間自動變化。",
    params: [
      {
        name: "type",
        type: "enum",
        values: WALLPAPER_TYPE_VALUES,
        description: "桌布類型",
      },
      {
        name: "value",
        type: "color",
        allowGradient: true,
        required: false,
        description: "顏色 / 漸層字串（type 為 color/gradient 時填；time-theme 可省略）",
      },
      {
        name: "blur",
        type: "number",
        min: 0,
        max: 20,
        integer: true,
        required: false,
        description: "模糊度",
      },
      {
        name: "opacity",
        type: "number",
        min: 0,
        max: 100,
        integer: true,
        required: false,
        description: "透明度",
      },
    ],
    execute(args, ctx) {
      const updates: Record<string, unknown> = { type: args.type };
      for (const k of ["value", "blur", "opacity"]) {
        if (args[k] !== undefined) updates[k] = args[k];
      }
      ctx.theme.updateWallpaperStyle(updates);
    },
  },
  {
    name: "設定全局字體大小",
    description: "等比放大 / 縮小整個介面的字體（100 = 原始大小）。",
    params: [
      {
        name: "fontSize",
        type: "number",
        min: 50,
        max: 200,
        integer: true,
        description: "字體比例 %",
      },
    ],
    execute(args, ctx) {
      ctx.theme.updateGlobalFont({ enabled: true, fontSize: args.fontSize as number });
    },
  },
  {
    name: "設定時鐘樣式",
    description: "把某個時鐘組件換成指定樣式。需要 widgetId（由聊天上下文提供）。",
    params: [
      { name: "widgetId", type: "string", description: "目標時鐘組件 ID" },
      {
        name: "clockStyle",
        type: "enum",
        values: CLOCK_STYLE_VALUES,
        description: "時鐘樣式",
      },
    ],
    execute(args, ctx) {
      ctx.canvas.updateWidgetData(args.widgetId as string, {
        clockStyle: args.clockStyle as string,
      });
    },
  },
  {
    name: "設定圖標形狀",
    description:
      `改變桌面組件的外框形狀（如圓形、正方形、圓角方形、超橢圓、星形、愛心…）。可選 ${SHAPE_LABELS}。省略 widgetId 時一次套用到畫布上所有組件；帶 widgetId 時只改該組件。使用者說「把桌面圖標 / 組件變成方形 / 圓形…」時用這個。`,
    params: [
      {
        name: "shape",
        type: "enum",
        values: SHAPE_VALUES,
        description: "形狀 ID",
      },
      {
        name: "widgetId",
        type: "string",
        required: false,
        description: "目標組件 ID；省略則套用到全部組件",
      },
    ],
    execute(args, ctx) {
      const shape = args.shape as string;
      const id = args.widgetId as string | undefined;
      if (id) {
        ctx.canvas.updateWidgetCustomStyle(id, { shape });
      } else {
        for (const w of ctx.canvas.widgets) {
          ctx.canvas.updateWidgetCustomStyle(w.id, { shape });
        }
      }
    },
  },
  {
    name: "設定組件佈局",
    description:
      `切換組件的整體顯示風格（佈局皮膚）。適用於拍立得 / 日曆 / 天氣 / 待辦 / 語錄 / 心情日記 / 專注計時器這類共用 7 皮膚的組件。可選 ${STYLE_LAYOUT_LABELS}。需要 widgetId。使用者說「把日曆換成像素風 / 復古風 / 線描風…」時用這個，不要硬寫 CSS。`,
    params: [
      { name: "widgetId", type: "string", description: "目標組件 ID" },
      {
        name: "layout",
        type: "enum",
        values: STYLE_LAYOUT_VALUES,
        description: "佈局風格 ID",
      },
    ],
    execute(args, ctx) {
      ctx.canvas.updateWidgetCustomStyle(args.widgetId as string, {
        layout: args.layout as string,
      });
    },
  },
  {
    name: "設定日曆日期顏色",
    description:
      "調整日曆組件的日期配色：今日高亮色、節假日色、一般日期色。三者皆選填，只改有填的；想還原某項為自動（跟隨主題）就傳空字串。需要 widgetId。",
    params: [
      { name: "widgetId", type: "string", description: "目標日曆組件 ID" },
      {
        name: "today",
        type: "color",
        required: false,
        description: "今日高亮背景色",
      },
      {
        name: "holiday",
        type: "color",
        required: false,
        description: "節假日文字色",
      },
      {
        name: "weekday",
        type: "color",
        required: false,
        description: "一般日期文字色",
      },
    ],
    execute(args, ctx) {
      const id = args.widgetId as string;
      const w = ctx.canvas.widgets.find((x) => x.id === id);
      const prev = ((w?.data as Record<string, unknown> | undefined)
        ?.calendarColors ?? {}) as Record<string, string>;
      const next = { ...prev };
      for (const k of ["today", "holiday", "weekday"]) {
        if (args[k] !== undefined) next[k] = args[k] as string;
      }
      ctx.canvas.updateWidgetData(id, { calendarColors: next });
    },
  },
  {
    name: "設定組件顏色",
    description:
      "調整單一組件的背景色 / 文字色 / 邊框色（不影響其它組件）。背景可用純色或漸層字串。各參數皆選填，只改有填的。需要 widgetId。日曆的日期格顏色請改用「設定日曆日期顏色」。",
    params: [
      { name: "widgetId", type: "string", description: "目標組件 ID" },
      {
        name: "backgroundColor",
        type: "color",
        allowGradient: true,
        required: false,
        description: "背景色（hex 或漸層字串）",
      },
      {
        name: "textColor",
        type: "color",
        required: false,
        description: "文字色",
      },
      {
        name: "borderColor",
        type: "color",
        required: false,
        description: "邊框色",
      },
      {
        name: "borderWidth",
        type: "number",
        min: 0,
        max: 12,
        integer: true,
        required: false,
        description: "邊框寬度 px",
      },
    ],
    execute(args, ctx) {
      const updates: Record<string, unknown> = {};
      const bg = args.backgroundColor as string | undefined;
      if (bg) {
        if (/^(linear|radial|conic)-gradient\(/.test(bg)) {
          updates.backgroundGradient = bg;
        } else {
          updates.backgroundColor = bg;
        }
      }
      if (args.textColor !== undefined) updates.textColor = args.textColor;
      if (args.borderColor !== undefined) updates.borderColor = args.borderColor;
      if (args.borderWidth !== undefined) updates.borderWidth = args.borderWidth;
      if (Object.keys(updates).length) {
        ctx.canvas.updateWidgetCustomStyle(args.widgetId as string, updates);
      }
    },
  },

  // ---- C. 創建型工具（通用機制） ----
  {
    name: "創建組件樣式",
    description:
      "為任一組件創造原本不存在的專屬外觀，也是「只改某一個組件底色 / 毛玻璃 / 透明度」的首選工具。你只提供裸 CSS 規則內容，作用域由系統自動鎖到該組件，你不需要也不能寫真實選擇器或全域選擇器。需要 widgetId。\n【:scope = 真正畫底色那一層】:scope 已對應到該組件「真正畫底色 / 毛玻璃」的可見層（一般組件是 .widget-content > *；流動按鈕則自動含內層 .blob-shape），特異性也夠高，因此 :scope { background: transparent !important; } 能確實蓋掉全域底色。想單獨拿掉某個組件的底色 / 邊框 / 陰影，直接對這個組件下 :scope { background: transparent !important; backdrop-filter: none !important; box-shadow: none !important; border-color: transparent !important; } 即可，不必動全域 CSS。\n【流動按鈕】流動按鈕(fluid-button)的薄荷綠圓塊底色畫在內層 .blob-shape 上，:scope 已自動同時對映到 .blob-shape，因此對流動按鈕下 :scope { background: transparent !important; backdrop-filter: none !important; box-shadow: none !important; } 就會直接清掉那個圓塊底色，不需要、也不用另外去寫 .blob-shape。",
    params: [
      { name: "widgetId", type: "string", description: "目標組件 ID" },
      {
        name: "css",
        type: "css",
        description:
          "裸 CSS 規則，使用組件可改結構提示中的 class（如 .time-display { ... }）；:scope 代表該組件真正畫底色 / 毛玻璃的可見根元素，:scope { background: transparent !important } 可蓋掉全域底色",
      },
    ],
    execute(args, ctx) {
      ctx.canvas.updateWidgetData(args.widgetId as string, {
        customCSS: args.css as string,
      });
    },
  },
  {
    name: "清除組件樣式",
    description: "移除某個組件先前由「創建組件樣式」加上的專屬外觀。",
    params: [{ name: "widgetId", type: "string", description: "目標組件 ID" }],
    execute(args, ctx) {
      ctx.canvas.updateWidgetData(args.widgetId as string, { customCSS: "" });
    },
  },

  // ---- 兜底工具 ----
  {
    name: "寫入全局自訂CSS",
    description:
      "連組件工具都蓋不到的「跨組件 / 全域」自由需求才用（例如想一次改變畫布上所有組件的外觀）。內容會經特異性提升後注入全域。\n【★整份覆蓋，不是追加】本工具會用你這次送的 CSS「整包取代」目前全域自訂CSS，舊規則不會保留。若你只是要「改其中一條 / 刪掉某一條」（例如只拿掉流動按鈕的底色），務必先看「目前介面現況」裡印出的『目前已生效的全域自訂CSS』，把那份原封不動保留，只動 / 只刪你要處理的那幾行，再整份送回；千萬不要只送你這次想改的那一小段，否則其他組件的圓角 / 邊框 / 毛玻璃會全部消失。若現況顯示目前沒有全域自訂CSS，才是從零寫一份。\n【反向護欄 — 先判斷「背景」指哪一層】使用者若只說「App 背景 / 桌面背景 / 整個畫面背景 / 底圖 / 桌布」而**沒有**提到組件 / 卡片 / 便條 / 時鐘等具體組件，那是「App 全域底色」，請改用「設定桌布」或「設定單一顏色」target=background，**不要**用本工具去打 .widget-wrapper .widget-content > *，否則會把所有組件底色一起清掉。只有使用者明確說「組件 / 卡片 / 這些方塊 的背景 / 底色 / 毛玻璃」時，才用本工具改組件層。\n【重要】只能使用下列真實存在的全域選擇器，嚴禁自行發明 class 名稱（如 .todo-sticky、.clock-widget、div[id^='widget-'] 等都不存在，寫了完全不會生效）：\n  - .widget-wrapper：所有桌面組件的最外層根容器（透明，本身不畫底色；適合統一下邊框 / 圓角 / 陰影 / 外距，例如想讓全部組件變方角就寫 .widget-wrapper { border-radius: 0 !important; }）\n  - .widget-wrapper .widget-content：內容包裹層，同樣透明，改它的 background 看不到效果\n  - .widget-wrapper .widget-content > *：★組件根元素，「真正畫底色 / 毛玻璃」的那一層。要一次把所有組件換底色 / 做半透明毛玻璃就打這個選擇器，例：.widget-wrapper .widget-content > * { background: rgba(255,255,255,0.25) !important; backdrop-filter: blur(12px) !important; -webkit-backdrop-filter: blur(12px) !important; }\n  - .widget-wrapper .widget-content .blob-shape：流動按鈕(fluid-button)的底色畫在這裡，改流動按鈕底色 / 毛玻璃要打這個\n  - .neon-wheel-dock：底部 Dock\n注意：pearl / lineart 等風格會忽略自訂背景，這類組件改底色不會生效。\n【語法務必正確】rgba()/hsla() 一定要寫滿 4 個值（R,G,B,A），例如半透明白是 rgba(255,255,255,0.25) 而非 rgba(255,255,0.25)；少一個值整條宣告會被瀏覽器丟棄而完全不生效。\n若只想改「某一個」組件，請改用「創建組件樣式」並帶上 widgetId，不要用本工具。",
    params: [
      {
        name: "css",
        type: "string",
        maxLength: 8000,
        validateCSS: true,
        description:
          "完整 CSS（含選擇器）。改底色 / 毛玻璃要打組件根元素 .widget-wrapper .widget-content > *（流動按鈕用 .widget-wrapper .widget-content .blob-shape）；邊框 / 圓角 / 陰影可下在 .widget-wrapper。只能用這些真實全域選擇器，禁止發明不存在的 class。rgba()/hsla() 務必寫滿 4 個值（如 rgba(255,255,255,0.25)），少一值整條會被丟棄",
      },
    ],
    execute(args, ctx) {
      ctx.theme.updateCustomCSS(args.css as string);
    },
  },

  // ---- D. 查詢型工具（唯讀，回傳資訊餵回給 AI） ----
  {
    name: "檢視組件",
    description:
      "想細修某個組件前先用它。回傳該組件的當前狀態（型別、目前佈局 / 樣式、已套用的自訂 CSS、尺寸）以及完整的可改結構（內部 class、佈局變體、調樣式技巧）。預載的現況只有一句話簡介，需要精準修改時務必先查詢這個再動手。",
    params: [{ name: "widgetId", type: "string", description: "目標組件 ID" }],
    query: true,
    inspect(args, ctx) {
      const id = args.widgetId as string;
      const w = ctx.canvas.widgets.find((x) => x.id === id);
      if (!w) {
        const ids = ctx.canvas.widgets.map((x) => `"${x.id}"`).join(" / ");
        return `找不到 widgetId="${id}"。目前畫布上的組件有：${ids || "（無）"}`;
      }
      const data = (w.data ?? {}) as Record<string, unknown>;
      const customStyle = (data.customStyle ?? {}) as Record<string, unknown>;
      // 原始 layout 值（用來比對 per-layout 結構；找不到時為空字串）
      const rawLayout =
        (customStyle.layout as string) || (data.clockStyle as string) || "";
      const layout = rawLayout || "（預設）";
      const customCSS = (data.customCSS as string) || "";
      const lines: string[] = [
        `# 組件當前狀態`,
        `- widgetId：${w.id}`,
        `- 型別：${w.type}`,
        `- 目前佈局 / 樣式：${layout}`,
        `- 尺寸（網格）：${w.width} × ${w.height}`,
        customCSS
          ? `- 目前已套用的自訂 CSS：\n\`\`\`css\n${customCSS}\n\`\`\``
          : `- 目前沒有任何自訂 CSS`,
        "",
        formatWidgetStyleDetail(w.type as WidgetType, rawLayout || undefined),
      ];
      return lines.join("\n");
    },
  },
  {
    name: "列出畫布組件",
    description:
      "列出目前畫布上所有組件的 widgetId、型別與一句話簡介。不確定要改哪個組件、或要拿 widgetId 時用。",
    params: [],
    query: true,
    inspect(_args, ctx) {
      const widgets = ctx.canvas.widgets;
      if (widgets.length === 0) return "畫布上目前沒有任何組件。";
      const lines = widgets.map((w) => {
        const data = (w.data ?? {}) as Record<string, unknown>;
        const customStyle = (data.customStyle ?? {}) as Record<string, unknown>;
        const layout =
          (customStyle.layout as string) || (data.clockStyle as string) || "";
        const hasCSS = !!(data.customCSS as string);
        const tags = [layout && `佈局=${layout}`, hasCSS && "已有自訂CSS"]
          .filter(Boolean)
          .join("，");
        return `• widgetId="${w.id}"，型別=${w.type}${tags ? `（${tags}）` : ""}`;
      });
      return ["# 畫布組件清單", ...lines].join("\n");
    },
  },

  // ---- E. 詢問型工具（暫停本輪，向使用者提出可點擊的選擇題） ----
  {
    name: "詢問使用者",
    description:
      "在需要使用者做「關鍵抉擇」時用（例如風格方向有多種走向、要不要保留某組件的既有色、二選一的配色方案）。呼叫後會暫停本輪，把問題與選項渲染成可點擊按鈕給使用者；使用者點選後，他的選擇會作為下一輪輸入回到你這裡。一次只問一個問題。若需求已明確、不涉及抉擇，就「不要」用這個工具，直接接續勘查與套用。",
    params: [
      { name: "question", type: "string", description: "要問使用者的問題（一句話）" },
      {
        name: "options",
        type: "stringArray",
        maxItems: 6,
        description: "供使用者點選的答案選項（2~6 個），每個是一句完整可執行的答案",
      },
    ],
    ask: true,
  },

  // ---- F. 截圖自檢型工具（唯讀，觸發前端截取首頁畫面回餵給 AI 做視覺檢查） ----
  {
    name: "截圖自檢",
    description:
      "截取首頁目前的實際畫面，回餵給你親眼檢查上一步修改是否真的生效。**改完會影響視覺的關鍵步驟後**（尤其是清背景 / 去背 / 改底色 / 毛玻璃這類「使用者說沒生效」的情況），可用它自我確認，而不必一直問使用者「有沒有效」。截圖是你當下看到的真實渲染結果（含全域自訂CSS、各組件樣式都已套用），若發現改動沒生效或跑版，就依畫面繼續補救。注意：截圖較耗資源，只在需要確認關鍵視覺結果時用，不要每一步都截。",
    params: [],
    screenshot: true,
  },
];

// ===== 查找 / 驗證輔助 =====

const TOOL_MAP = new Map(THEME_TOOLS.map((t) => [t.name, t]));

export function getTool(name: string): ThemeTool | undefined {
  return TOOL_MAP.get(name);
}

/** 驗證並執行單一工具呼叫；回傳結果供 UI 顯示 */
export interface ToolExecResult {
  ok: boolean;
  tool: string;
  /** 是否為查詢型工具（唯讀，不算「已套用變更」） */
  isQuery?: boolean;
  /** 是否為詢問型工具（暫停本輪，等使用者點選回答） */
  isAsk?: boolean;
  /** 是否為截圖自檢型工具（觸發前端截首頁畫面回餵給 AI 做視覺檢查） */
  isScreenshot?: boolean;
  /** 詢問型工具：要問使用者的問題 */
  askQuestion?: string;
  /** 詢問型工具：供使用者點選的選項 */
  askOptions?: string[];
  /** 正規化後實際套用的參數 */
  appliedArgs?: Record<string, unknown>;
  /** 查詢型工具回傳、要餵回給 AI 的資訊文字 */
  info?: string;
  error?: string;
}

export function executeToolCall(
  name: string,
  rawArgs: Record<string, unknown>,
  ctx: ToolContext,
): ToolExecResult {
  const tool = getTool(name);
  if (!tool) {
    return { ok: false, tool: name, error: `未知的工具「${name}」` };
  }

  const validation = validateArgs(tool.params, rawArgs ?? {});
  if (!validation.ok) {
    return {
      ok: false,
      tool: name,
      error: validation.errors.join("；"),
    };
  }

  // 詢問型工具：不改外觀，回傳問題與選項供 UI 渲染成可點擊按鈕
  if (tool.ask) {
    return {
      ok: true,
      tool: name,
      isAsk: true,
      appliedArgs: validation.args,
      askQuestion: validation.args.question as string,
      askOptions: (validation.args.options as string[]) ?? [],
    };
  }

  // 截圖自檢型工具：不改外觀，僅標記由服務層觸發前端截圖並以 vision 圖片回餵
  if (tool.screenshot) {
    return {
      ok: true,
      tool: name,
      isScreenshot: true,
      appliedArgs: validation.args,
    };
  }

  // 查詢型工具：呼叫 inspect 取回資訊文字，不改外觀
  if (tool.query) {
    if (!tool.inspect) {
      return { ok: false, tool: name, isQuery: true, error: `查詢工具「${name}」未實作 inspect` };
    }
    try {
      const info = tool.inspect(validation.args, ctx);
      return {
        ok: true,
        tool: name,
        isQuery: true,
        appliedArgs: validation.args,
        info,
      };
    } catch (e) {
      return {
        ok: false,
        tool: name,
        isQuery: true,
        error: e instanceof Error ? e.message : String(e),
      };
    }
  }

  // 動作型工具：派發到 store setter
  if (!tool.execute) {
    return { ok: false, tool: name, error: `工具「${name}」未實作 execute` };
  }
  try {
    tool.execute(validation.args, ctx);
    return { ok: true, tool: name, appliedArgs: validation.args };
  } catch (e) {
    return {
      ok: false,
      tool: name,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}
