/**
 * 每種組件的「可改結構提示」
 *
 * 兩種粒度：
 *  - 簡介（formatWidgetStyleBrief）：只給一句話描述，組 prompt 時預載，省 context。
 *  - 詳情（formatWidgetStyleDetail）：完整列出可改 class、佈局變體與調樣式技巧，
 *    由「檢視組件」查詢工具按需回傳，AI 想細修某組件時才取用。
 *
 * 結構升級（per-layout）：
 *  許多組件每個 layout 在 SCSS 用 `&.layout名 .子class` 定義了該 layout 專屬的
 *  內部結構與視覺特徵。因此 WidgetLayoutVariant 除了 id / desc，還可補：
 *   - classes：該 layout 特有的內部 class（通用 class 不重複列，只列差異）
 *   - visualTraits：該 layout 的視覺基調（配色 / 邊框 / 裝飾），幫 AI 定調
 *  formatWidgetStyleDetail 帶入 currentLayout 時，會額外輸出「當前 layout 專屬
 *  結構 + 視覺特徵」，讓 AI 精準命中、做深度客製，又不浪費 context。
 *
 * 創建型工具（創建組件樣式）讓 AI 為任一組件產出裸 CSS。提示告訴 AI
 * 該組件內部有哪些主要 class 可改、各自用途，AI 只需填規則，
 * 作用域由 useWidgetCustomCSS 自動包裝（`:scope` = 組件根本身）。
 *
 * 未列出的型別回退到 GENERIC_HINT（根 / 標題 / 內容區的通用結構）。
 */
import type { WidgetType } from "@/types";

/** 佈局變體：同一組件可切換的外觀風格，各自內部細節可能不同 */
export interface WidgetLayoutVariant {
  /** 變體 ID（對應 customStyle.layout 或 clockStyle 的值） */
  id: string;
  /** 中文說明 */
  desc: string;
  /** 該 layout 特有的內部 class（通用 class 不重複列，只列差異） */
  classes?: { selector: string; usage: string }[];
  /** 該 layout 的視覺特徵（配色基調 / 邊框風格 / 裝飾元素，幫 AI 定調） */
  visualTraits?: string;
}

export interface WidgetStyleHint {
  /** 組件中文名 */
  label: string;
  /** 一句話描述外觀（簡介 / 預載用） */
  summary: string;
  /** 主要可改的 class 與用途（不含 . 前綴；:scope 代表組件根） */
  classes: { selector: string; usage: string }[];
  /** 可切換的佈局 / 樣式變體（選填） */
  layouts?: WidgetLayoutVariant[];
  /** 調樣式的實務技巧 / 注意事項（選填，詳情才附） */
  tips?: string[];
}

/** 通用提示：未特別列出的組件用這份（避免 AI 沒方向） */
export const GENERIC_HINT: WidgetStyleHint = {
  label: "組件",
  summary: "通用桌面組件，含一個根容器與內部文字 / 圖示。",
  classes: [
    { selector: ":scope", usage: "組件根容器（背景、邊框、圓角、陰影、padding）" },
    { selector: ".widget-content", usage: "內容包裹層" },
  ],
};

/**
 * 共用 7 皮膚的視覺基調（classic/pop/flat/illustration/pixel/pearl/lineart）
 * 這 7 種佈局內部 class 結構大致相同（差在視覺處理），故各組件共用這份視覺特徵描述，
 * 套進各自的 layouts[].visualTraits，避免重複維護。
 */
const SKIN7_TRAITS: Record<string, string> = {
  classic:
    "傳統簡約：半透明白底 + 毛玻璃 backdrop-filter，圓角約 16px，柔和淡陰影，靛藍(#6366f1)系高亮，文字深灰。基調乾淨留白。",
  pop:
    "普普 / 新粗野派：白底 + 粗黑邊(2px #1a1a1a) + 硬陰影(右下位移實心黑)，hover 會位移+加陰影；高亮用紫(#c4b5fd)色塊配黑框，字重極粗(900)。",
  flat:
    "平面撞色：粉色系底(#FFF0F5) + 深紫粗邊(3px #332650) + 底部硬陰影，大圓角(32px)，互動元素多為圓形 / 膠囊；高亮為深紫實心。",
  illustration:
    "復古視窗：米色底(#F6F3EB) + 黑邊 + 右下硬陰影，方正小圓角(6px)，頂部常有 ::before 仿視窗標題列裝飾；色彩低飽和、復古感。",
  pixel:
    "像素微復古：粉底 + 點陣網格背景 + 4px 邊，頂部 ::before 常有 'XXX.EXE' 標題列，字體 DotGothic16 等點陣字；虛線 / 像素感邊框。",
  pearl:
    "珍珠畫廊（維梅爾風）：深紫漸層底(#3E3A58→#332D4B) + 芥末黃邊(#FFCE05) + 角落 ::before/::after 發光星星與幾何裝飾，襯線字(Georgia)，靜謐華麗。注意：此風格忽略自訂背景 / 文字色。",
  lineart:
    "線描速寫：純白底 + 黑細線(1~1.5px)描邊 + 零陰影零彩色，圓形 / 細框，極簡手繪感。注意：此風格忽略自訂背景 / 文字色。",
};

/** 產生共用 7 皮膚的 layouts 陣列（可帶各組件專屬的 per-layout class 補充） */
function skin7Layouts(
  extra?: Partial<Record<string, { selector: string; usage: string }[]>>,
): WidgetLayoutVariant[] {
  const order = [
    "classic",
    "pop",
    "flat",
    "illustration",
    "pixel",
    "pearl",
    "lineart",
  ];
  const descMap: Record<string, string> = {
    classic: "傳統簡約留白",
    pop: "普普風 / 新粗野派立體互動",
    flat: "圓潤撞色平面感",
    illustration: "復古視窗插圖",
    pixel: "點陣像素微復古",
    pearl: "維梅爾珍珠畫廊（深紫芥末黃）",
    lineart: "純白底黑細線速寫",
  };
  return order.map((id) => ({
    id,
    desc: descMap[id],
    visualTraits: SKIN7_TRAITS[id],
    classes: extra?.[id],
  }));
}

export const WIDGET_STYLE_HINTS: Partial<Record<WidgetType, WidgetStyleHint>> = {
  clock: {
    label: "時鐘",
    summary:
      "時鐘組件，支援多種樣式（minimal / digital / analog / flip / neon / progress / binary / dotmatrix / orbit），不同樣式內部結構完全不同。",
    classes: [
      { selector: ":scope", usage: "時鐘根容器（.clock-widget），根據樣式套 .style-XXX" },
    ],
    layouts: [
      {
        id: "minimal",
        desc: "極簡：純文字時間 + 日期",
        visualTraits: "純文字、無容器裝飾，靠字級 / 字重 / 字色定調。",
        classes: [
          { selector: ".minimal-clock", usage: "極簡樣式容器" },
          { selector: ".time-display", usage: "主時間文字" },
          { selector: ".hours / .minutes / .seconds", usage: "時 / 分 / 秒數字片段" },
          { selector: ".separator", usage: "冒號分隔符" },
          { selector: ".date-display", usage: "日期文字" },
        ],
      },
      {
        id: "digital",
        desc: "數字卡片",
        visualTraits: "每位數字獨立卡片(.digit-card)，等寬字感，適合做液晶 / 卡片質感。",
        classes: [
          { selector: ".digital-clock", usage: "數字樣式容器" },
          { selector: ".time-units / .time-unit", usage: "時分秒分組 / 單組" },
          { selector: ".digit-card", usage: "單個數字卡片（背景 / 圓角 / 邊框）" },
          { selector: ".digit", usage: "卡片內數字字元" },
          { selector: ".separator-dots .dot", usage: "中間冒號的兩個圓點" },
          { selector: ".digital-date", usage: "底部日期" },
        ],
      },
      {
        id: "analog",
        desc: "指針錶盤",
        visualTraits: "圓形錶盤 + 三指針，可改錶盤底、刻度、指針色；有 .analog-dark 深色變體。",
        classes: [
          { selector: ".analog-clock", usage: "指針樣式容器（深色背景時加 .analog-dark）" },
          { selector: ".clock-face", usage: "錶盤" },
          { selector: ".hour-marker", usage: "時刻刻度" },
          { selector: ".hand", usage: "指針（.hour-hand / .minute-hand / .second-hand）" },
          { selector: ".center-dot", usage: "中心軸點" },
          { selector: ".analog-info / .analog-time / .analog-date", usage: "錶盤旁數字時間與日期" },
        ],
      },
      {
        id: "flip",
        desc: "翻頁卡片",
        visualTraits: "仿翻頁鐘，卡片中線(.flip-line)營造對折感，適合做機械翻牌質感。",
        classes: [
          { selector: ".flip-clock", usage: "翻頁樣式容器" },
          { selector: ".flip-unit", usage: "時 / 分 / 秒單元" },
          { selector: ".flip-card", usage: "翻頁卡片（背景 / 圓角）" },
          { selector: ".flip-digit", usage: "卡片數字" },
          { selector: ".flip-line", usage: "卡片中央對折線" },
          { selector: ".flip-label", usage: "時 / 分 / 秒標籤" },
          { selector: ".flip-separator", usage: "單元間冒號" },
          { selector: ".flip-date", usage: "底部日期" },
        ],
      },
      {
        id: "neon",
        desc: "霓虹發光",
        visualTraits: "暗底 + 發光數字，靠 text-shadow / box-shadow 光暈定調，色彩鮮豔。",
        classes: [
          { selector: ".neon-clock", usage: "霓虹樣式容器" },
          { selector: ".neon-glow", usage: "背景光暈層（依時間變色）" },
          { selector: ".neon-time", usage: "時間列" },
          { selector: ".neon-digit", usage: "霓虹數字（可加 text-shadow 光暈）" },
          { selector: ".neon-separator .neon-dot", usage: "發光冒號圓點" },
          { selector: ".neon-label", usage: "標籤文字" },
          { selector: ".neon-date", usage: "底部日期" },
        ],
      },
      {
        id: "progress",
        desc: "進度環",
        visualTraits: "三層 SVG 同心進度環(時/分/秒) + 中央數字 + 圖例，適合改環色 / 軌道色。",
        classes: [
          { selector: ".progress-clock", usage: "進度環樣式容器" },
          { selector: ".progress-rings .ring", usage: "SVG 環（.seconds-ring / .minutes-ring / .hours-ring）" },
          { selector: ".ring-bg / .ring-progress", usage: "環軌道 / 環進度（改 stroke 色）" },
          { selector: ".progress-center / .progress-time / .progress-seconds", usage: "中央時間文字" },
          { selector: ".progress-legend .legend-item .legend-dot", usage: "時分秒圖例與色點" },
          { selector: ".progress-date", usage: "底部日期" },
        ],
      },
      {
        id: "binary",
        desc: "二進制點陣",
        visualTraits: "以亮 / 暗圓點表示二進制位，極客風；改 .binary-dot.active 色即換點亮色。",
        classes: [
          { selector: ".binary-clock", usage: "二進制樣式容器" },
          { selector: ".binary-label", usage: "標題文字" },
          { selector: ".binary-column / .column-label / .column-value", usage: "時/分/秒欄、標籤、十進制值" },
          { selector: ".binary-grid .binary-row .binary-dot", usage: "點陣圓點（.active 為點亮）" },
          { selector: ".binary-separator", usage: "欄間分隔" },
          { selector: ".binary-date", usage: "底部日期" },
        ],
      },
      {
        id: "dotmatrix",
        desc: "點陣顯示器",
        visualTraits: "仿 LED 點陣顯示牌，每個數字由 5x7 點組成；改 .dot.active 色即換顯示色。",
        classes: [
          { selector: ".dotmatrix-clock", usage: "點陣樣式容器" },
          { selector: ".dotmatrix-label", usage: "標題文字" },
          { selector: ".dotmatrix-display / .dotmatrix-digit", usage: "顯示區 / 單個數字" },
          { selector: ".dot-row .dot", usage: "點陣單點（.active 為點亮）" },
          { selector: ".dotmatrix-colon .colon-dot", usage: "冒號圓點" },
          { selector: ".dotmatrix-date", usage: "底部日期" },
        ],
      },
      {
        id: "orbit",
        desc: "軌道環繞",
        visualTraits: "純 SVG 行星軌道環繞，隨容器縮放；改軌道 / 行星色與中央時間定調。",
        classes: [
          { selector: ".orbit-clock", usage: "軌道樣式容器" },
          { selector: ".orbit-svg", usage: "軌道 SVG（軌道圈 / 行星點）" },
          { selector: ".orbit-time", usage: "中央時間文字" },
          { selector: ".orbit-legend .legend-item .legend-dot", usage: "時分秒圖例與色點" },
          { selector: ".orbit-date", usage: "底部日期" },
        ],
      },
    ],
    tips: [
      "時鐘樣式（minimal/neon...）請用「設定時鐘樣式」工具切換，不要用 CSS 硬改。",
      "想改字色 / 字體 / 發光，針對當前樣式對應的容器（如 .neon-digit）寫規則。",
      "SVG 類樣式（progress / orbit）改顏色要針對 stroke / fill，不是 color。",
    ],
  },

  weather: {
    label: "天氣",
    summary:
      "天氣組件，含地點列、大溫度、天氣圖示與底部狀況列；有 7 種佈局風格（共用 7 皮膚）。",
    classes: [
      { selector: ":scope", usage: "天氣根容器（.weather-widget），背景 / 圓角 / padding" },
      { selector: ".weather-header", usage: "頂部列（地點 + 重整鈕）" },
      { selector: ".location", usage: "地點文字（含 📍 圖示）" },
      { selector: ".refresh-btn", usage: "重整按鈕（.refreshing 時旋轉）" },
      { selector: ".weather-main", usage: "中段主區（圖示 + 溫度）" },
      { selector: ".weather-icon", usage: "天氣圖示（可加 filter 陰影 / 變色）" },
      { selector: ".temperature", usage: "大溫度數字（改 font-size / color / 字重）" },
      { selector: ".weather-footer", usage: "底部列（天氣狀況 + 濕度）" },
      { selector: ".condition", usage: "天氣狀況文字" },
      { selector: ".humidity", usage: "濕度文字（含風圖示）" },
      { selector: ".loading-state / .error-state / .empty-state", usage: "載入 / 錯誤 / 無資料狀態" },
    ],
    layouts: skin7Layouts(),
    tips: [
      "根容器在 classic 等樣式有依天氣狀況自動套背景漸層；想固定背景請在 :scope 寫 background 並加 !important。",
      "佈局風格（classic/pop...）由 customStyle.layout 控制，請用「設定組件佈局」切換；本助手的 CSS 客製是在選定 layout 上疊加。",
      "pearl / lineart 樣式不吃 textColor，需直接對 .temperature / .condition 等寫 color。",
    ],
  },

  calendar: {
    label: "日曆",
    summary:
      "日曆組件，含月份標題、星期列與日期格；有 7 種顯示風格（共用 7 皮膚），並可獨立設定今日 / 節假日 / 一般日期顏色。",
    classes: [
      { selector: ":scope", usage: "日曆根容器（.calendar-widget）" },
      { selector: ".calendar-header", usage: "頂部月份 / 年份標題列" },
      { selector: ".month-year", usage: "月份 / 年份文字" },
      { selector: ".nav-btn", usage: "上一月 / 下一月切換鈕" },
      { selector: ".weekdays .weekday", usage: "星期標頭（日一二...）" },
      { selector: ".days-grid", usage: "日期格網格容器" },
      { selector: ".day", usage: "單一日期格" },
      { selector: ".day.today", usage: "今天的日期格（高亮）" },
      { selector: ".day.holiday", usage: "節假日的日期格" },
      { selector: ".day.other-month", usage: "非本月的灰色日期" },
    ],
    layouts: skin7Layouts(),
    tips: [
      "切換顯示風格（classic/pop/flat/illustration/pixel/pearl/lineart）請用「設定組件佈局」工具，不要硬寫 CSS。",
      "改今日 / 節假日 / 一般日期的顏色請用「設定日曆日期顏色」工具，比寫 CSS 穩定。",
      "illustration / pixel 風格頂部的標題列是 ::before 偽元素（非真實 class），無法用一般選擇器選到。",
      "pearl / lineart 風格會忽略自訂背景 / 文字色（由風格本身決定），需要時改用其它風格。",
    ],
  },

  polaroid: {
    label: "拍立得",
    summary: "拍立得照片貼紙，含照片區與底部留白；有 7 種佈局風格（共用 7 皮膚）。",
    classes: [
      { selector: ":scope", usage: "拍立得根容器（.polaroid-sticky，白邊 / 陰影）" },
      { selector: ".photo-area", usage: "照片區域" },
      { selector: ".photo", usage: "照片本身（可加濾鏡 filter）" },
      { selector: ".placeholder", usage: "未選照片時的佔位區" },
      { selector: ".change-btn", usage: "重新選擇按鈕" },
    ],
    layouts: skin7Layouts(),
    tips: [
      "想做舊照氛圍，對 .photo 加 filter: sepia() 或降飽和。",
      "佈局風格由 customStyle.layout 控制，請用「設定組件佈局」切換。",
    ],
  },

  todo: {
    label: "待辦清單",
    summary: "便利貼風待辦清單，含標題、清單項目、新增列；有 7 種佈局風格（共用 7 皮膚）。",
    classes: [
      { selector: ":scope", usage: "待辦根容器（.todo-sticky）" },
      { selector: ".sticky-header", usage: "標題列" },
      { selector: ".title-input", usage: "標題輸入框文字" },
      { selector: ".todo-item", usage: "單個待辦項目" },
      { selector: ".item-text", usage: "項目文字（.done 時為已完成）" },
      { selector: ".check-btn", usage: "勾選按鈕" },
      { selector: ".add-btn", usage: "新增按鈕" },
    ],
    layouts: skin7Layouts(),
    tips: [
      "已完成項目可針對 .item-text.done 加 text-decoration / 降透明度。",
      "佈局風格由 customStyle.layout 控制，請用「設定組件佈局」切換。",
    ],
  },

  "focus-timer": {
    label: "專注計時器",
    summary:
      "番茄鐘專注計時器，含模式指示、圓形進度環、時間顯示與控制鈕；有 7 種佈局風格（共用 7 皮膚）。",
    classes: [
      { selector: ":scope", usage: "計時器根容器（.focus-timer）" },
      { selector: ".mode-indicator", usage: "模式指示（.break 為休息模式）" },
      { selector: ".timer-circle", usage: "圓形進度區" },
      { selector: ".progress-ring", usage: "進度環 SVG" },
      { selector: ".progress-bg / .progress-bar", usage: "環軌道 / 環進度（改 stroke 色；.break 為休息色）" },
      { selector: ".timer-display", usage: "中央時間顯示區" },
      { selector: ".time", usage: "時間文字（分:秒）" },
      { selector: ".sessions", usage: "完成番茄數（🍅）" },
      { selector: ".controls", usage: "控制鈕列" },
      { selector: ".control-btn", usage: "控制鈕（.reset 重置 / .play 開始，.pause 進行中）" },
    ],
    layouts: skin7Layouts(),
    tips: [
      "進度環是 SVG，改顏色要針對 .progress-bar 的 stroke，不是 color。",
      "佈局風格由 customStyle.layout 控制，請用「設定組件佈局」切換。",
    ],
  },

  quote: {
    label: "語錄",
    summary: "語錄便利貼，含引言圖示、引言文字與作者；有 7 種佈局風格（共用 7 皮膚）。",
    classes: [
      { selector: ":scope", usage: "語錄根容器（.quote-sticky）" },
      { selector: ".quote-icon", usage: "引號裝飾圖示" },
      { selector: ".quote-text", usage: "引言主文字" },
      { selector: ".quote-author", usage: "作者署名列" },
      { selector: ".dash", usage: "作者前的破折號" },
      { selector: ".author-input", usage: "作者輸入框文字" },
    ],
    layouts: skin7Layouts(),
    tips: [
      "想要書法 / 襯線感，對 .quote-text 改 font-family 與 font-style: italic。",
      "佈局風格由 customStyle.layout 控制，請用「設定組件佈局」切換。",
    ],
  },

  "mood-diary": {
    label: "心情日記",
    summary:
      "心情日記便利貼，含心情圖示、日期、日記文字、心情選擇器與裝飾膠帶；有 7 種佈局風格（共用 7 皮膚）。",
    classes: [
      { selector: ":scope", usage: "日記根容器（.mood-diary-sticky）" },
      { selector: ".sticky-header", usage: "頂部列（心情圖示 + 日期）" },
      { selector: ".mood-icon", usage: "心情圖示" },
      { selector: ".date", usage: "日期文字" },
      { selector: ".diary-content", usage: "日記內容輸入框" },
      { selector: ".sticky-footer", usage: "底部列" },
      { selector: ".mood-selector", usage: "心情選擇按鈕組" },
      { selector: ".tape", usage: "頂部裝飾膠帶" },
    ],
    layouts: skin7Layouts(),
    tips: ["佈局風格由 customStyle.layout 控制，請用「設定組件佈局」切換。"],
  },

  "world-book": {
    label: "世界書",
    summary:
      "世界書組件，獨立佈局體系：shelf 書架 / featured 精選 / icon 圖標，另有 pearl / lineart 兩種書架變體。",
    classes: [
      { selector: ":scope", usage: "世界書根容器（.world-book-container）" },
    ],
    layouts: [
      {
        id: "shelf",
        desc: "書架模式（預設）：書脊並排 + 木質層板",
        visualTraits: "仿實體書架，彩色書脊並排，底部木紋層板，溫暖質感。",
        classes: [
          { selector: ".shelf-header", usage: "頂部列（標題 + 更多鈕）" },
          { selector: ".shelf-title", usage: "「我的世界書」標題" },
          { selector: ".more-btn", usage: "更多按鈕" },
          { selector: ".bookshelf", usage: "書脊排列容器" },
          { selector: ".book-spine", usage: "單本書脊（背景由封面色決定）" },
          { selector: ".book-spine-title", usage: "書脊上的書名" },
          { selector: ".empty-shelf", usage: "無書時的佔位" },
          { selector: ".shelf-wood", usage: "底部木質層板" },
        ],
      },
      {
        id: "featured",
        desc: "精選模式：單本 3D 立體書 + 資訊",
        visualTraits: "聚焦單本書，3D 立體書封 + 書脊綁定感，右側列資訊與條目數。",
        classes: [
          { selector: ".featured-content", usage: "精選內容容器" },
          { selector: ".book-cover-3d", usage: "3D 立體書封（背景為封面色）" },
          { selector: ".book-binding", usage: "書脊側邊綁定" },
          { selector: ".book-face / .cover-title", usage: "書封正面 / 封面標題" },
          { selector: ".book-info", usage: "右側資訊區" },
          { selector: ".info-label / .info-title", usage: "「世界書」標籤 / 書名" },
          { selector: ".entry-count", usage: "條目數量" },
          { selector: ".empty-featured", usage: "無書時的佔位" },
        ],
      },
      {
        id: "icon",
        desc: "圖標模式：仿 App 圖標",
        visualTraits: "極簡 App 圖標，透明底 + 圓角圖標方塊 + 下方標籤，融入桌面。",
        classes: [
          { selector: ".icon-layout", usage: "圖標佈局容器" },
          { selector: ".app-icon-bg", usage: "圓角圖標方塊（背景 / 漸層）" },
          { selector: ".app-label", usage: "圖標下方標籤文字" },
        ],
      },
      {
        id: "pearl",
        desc: "珍珠畫廊書架：深紫芥末黃變體",
        visualTraits:
          "沿用書架結構(.shelf-header/.bookshelf/.book-spine...)，但套維梅爾珍珠風（深紫漸層底 + 芥末黃邊 + 發光裝飾）。忽略自訂背景 / 文字色。",
      },
      {
        id: "lineart",
        desc: "線描書架：純白黑線變體",
        visualTraits:
          "沿用書架結構，但純白底 + 黑細線速寫、零彩色（書脊不套彩色封面）。忽略自訂背景 / 文字色。",
      },
    ],
    tips: [
      "佈局由 customStyle.layout 控制（shelf/featured/icon/pearl/lineart），請用「設定組件佈局」切換。",
      "pearl / lineart 是 shelf 結構的視覺變體，可改的 class 與 shelf 相同。",
    ],
  },

  music: {
    label: "音樂播放器",
    summary:
      "音樂播放器，獨立佈局體系：compact 橫條 / classic 經典卡片 / vinyl 黑膠唱片；vinyl 另有多種子風格底色。",
    classes: [
      { selector: ":scope", usage: "音樂根容器（.music-player-container）" },
      { selector: ".widget-error-toast / .error-text", usage: "播放錯誤提示" },
    ],
    layouts: [
      {
        id: "compact",
        desc: "橫條簡約：左封面 + 右資訊與控制",
        visualTraits: "緊湊橫向，左側旋轉封面，右側歌名 / 控制 / 進度，省空間。",
        classes: [
          { selector: ".album-art / .album-cover", usage: "封面區 / 封面（.spinning 播放時旋轉）" },
          { selector: ".player-content", usage: "右側內容區" },
          { selector: ".song-header / .song-details", usage: "歌曲標題列 / 詳情" },
          { selector: ".song-title / .song-artist", usage: "歌名 / 演出者" },
          { selector: ".like-btn", usage: "收藏鈕（.liked 已收藏）" },
          { selector: ".controls-row .control-btn", usage: "控制鈕列（.small 為小鈕）" },
          { selector: ".progress-container / .progress-bar / .progress-fill", usage: "進度容器 / 軌道 / 填充" },
          { selector: ".time-text", usage: "時間文字" },
        ],
      },
      {
        id: "classic",
        desc: "經典卡片：大封面置中 + 完整控制",
        visualTraits: "縱向卡片，大方形封面置中，下方歌名與整排控制鈕，唱片行播放器感。",
        classes: [
          { selector: ".classic-layout", usage: "經典佈局容器" },
          { selector: ".classic-cover-wrapper / .classic-cover", usage: "封面外框 / 封面（.playing 播放中）" },
          { selector: ".classic-info", usage: "歌曲資訊區" },
          { selector: ".song-title.big / .song-artist", usage: "大歌名 / 演出者" },
          { selector: ".classic-progress", usage: "進度區（.progress-bar / .progress-fill / .time-row）" },
          { selector: ".classic-controls .control-btn", usage: "整排控制鈕" },
          { selector: ".classic-like", usage: "收藏鈕（.liked 已收藏）" },
        ],
      },
      {
        id: "vinyl",
        desc: "黑膠唱片：旋轉唱片 + 唱臂，點擊進 App",
        visualTraits:
          "黑膠唱盤，唱片旋轉(.spinning) + 唱臂(.tonearm)落針動畫，控制浮層疊在唱片上；vinyl 另有子風格底色(由 vinylStyle 決定，如 .classic 深色漸層 / .pixel 像素粉)。",
        classes: [
          { selector: ".vinyl-layout", usage: "黑膠佈局容器（會再加子風格 class）" },
          { selector: ".vinyl-record", usage: "唱片本體（.spinning 旋轉）" },
          { selector: ".vinyl-grooves / .vinyl-label", usage: "唱片紋路 / 中央標籤" },
          { selector: ".tonearm", usage: "唱臂（.active 落針，含 .arm-base/.arm-stick/.arm-head）" },
          { selector: ".vinyl-controls-overlay", usage: "控制浮層" },
          { selector: ".vinyl-info / .v-title / .v-artist", usage: "歌曲資訊 / 歌名 / 演出者" },
          { selector: ".vinyl-buttons .control-btn / .play-btn", usage: "控制鈕 / 播放鈕" },
          { selector: ".tap-hint", usage: "「點擊進入音樂 App」提示" },
        ],
      },
    ],
    tips: [
      "佈局由 customStyle.layout 控制（compact/classic/vinyl），請用「設定組件佈局」切換。",
      "vinyl 的子風格底色由額外 class 套在 .vinyl-layout 上；想改唱片質感針對 .vinyl-record / .vinyl-grooves。",
    ],
  },

  "char-phone": {
    label: "角色手機",
    summary:
      "角色手機組件，獨立佈局體系：phone 手機介面（狀態欄 / 聊天 / 輸入欄）/ icon 仿 App 圖標。",
    classes: [
      { selector: ":scope", usage: "角色手機根容器（.char-phone-container）" },
    ],
    layouts: [
      {
        id: "phone",
        desc: "手機模式（預設）：完整手機聊天介面",
        visualTraits: "仿手機 App，含狀態欄、頂部聯絡人欄、聊天氣泡區、輸入欄與底部 Home 條。",
        classes: [
          { selector: ".phone-frame", usage: "手機外框" },
          { selector: ".status-bar", usage: "頂部狀態欄（時間 + 訊號圖示）" },
          { selector: ".time / .status-icons", usage: "狀態欄時間 / 訊號電量圖示" },
          { selector: ".app-header", usage: "聯絡人頂欄" },
          { selector: ".avatar / .contact-name / .call-btn", usage: "頭像 / 聯絡人名 / 通話鈕" },
          { selector: ".chat-area", usage: "聊天內容區" },
          { selector: ".message-bubble", usage: "訊息氣泡（含自己 / 對方變體）" },
          { selector: ".msg-time", usage: "訊息時間" },
          { selector: ".input-area / .input-box / .send-btn", usage: "輸入欄 / 輸入框 / 送出鈕" },
          { selector: ".home-indicator", usage: "底部 Home 指示條" },
        ],
      },
      {
        id: "icon",
        desc: "圖標模式：仿 App 圖標 + 未讀徽章",
        visualTraits: "極簡 App 圖標，圓角圖標方塊 + 未讀紅點徽章 + 下方標籤。",
        classes: [
          { selector: ".icon-layout", usage: "圖標佈局容器" },
          { selector: ".app-icon-bg", usage: "圓角圖標方塊" },
          { selector: ".notification-badge", usage: "未讀數紅點徽章" },
          { selector: ".app-label", usage: "圖標下方標籤" },
        ],
      },
    ],
    tips: ["佈局由 customStyle.layout 控制（phone/icon），請用「設定組件佈局」切換。"],
  },

  "habit-tracker": {
    label: "習慣追蹤",
    summary:
      "習慣追蹤組件，獨立佈局體系：list 清單 / ring 圓環 / heatmap 熱力圖 / streak 連續火焰。",
    classes: [
      { selector: ":scope", usage: "習慣追蹤根容器（.habit-tracker）" },
    ],
    layouts: [
      {
        id: "list",
        desc: "清單模式（預設）：進度條 + 習慣列表",
        visualTraits: "標準清單，頂部標題與連勝，進度條，逐項習慣含圖標 / 名稱 / 勾選圈。",
        classes: [
          { selector: ".header / .title / .streak", usage: "頂部列 / 標題 / 連勝(🔥)" },
          { selector: ".progress-section / .progress-bar / .progress-fill / .progress-text", usage: "進度區 / 軌道 / 填充 / 文字" },
          { selector: ".habits-list", usage: "習慣列表容器" },
          { selector: ".habit-item", usage: "單個習慣項（.completed 已完成）" },
          { selector: ".habit-icon / .habit-name", usage: "習慣圖標（底色用習慣色）/ 名稱" },
          { selector: ".check-circle", usage: "勾選圈（.checked 已勾）" },
        ],
      },
      {
        id: "ring",
        desc: "圓環模式：完成度大圓環 + 習慣點",
        visualTraits: "置中大 SVG 進度環顯示完成度，環下方排列各習慣圓點，視覺聚焦。",
        classes: [
          { selector: ".ring-wrap", usage: "圓環容器" },
          { selector: ".ring-svg / .ring-track / .ring-progress", usage: "環 SVG / 軌道 / 進度（改 stroke 色）" },
          { selector: ".ring-center / .ring-count / .ring-label", usage: "環中央 / 計數 / 標籤" },
          { selector: ".ring-dots .ring-dot", usage: "各習慣圓點（.done 已完成）" },
        ],
      },
      {
        id: "heatmap",
        desc: "熱力圖模式：方格貢獻圖",
        visualTraits: "仿 GitHub 貢獻圖，多週方格依完成度分 5 級深淺(.level-0~4)，底部圖例。",
        classes: [
          { selector: ".header / .title / .streak", usage: "頂部列 / 標題 / 連勝" },
          { selector: ".heatmap-grid", usage: "方格網格" },
          { selector: ".heatmap-cell", usage: "單格（.level-0~.level-4 為深淺等級）" },
          { selector: ".heatmap-footer / .heatmap-legend / .legend-cell", usage: "底部說明 / 圖例 / 圖例格" },
        ],
      },
      {
        id: "streak",
        desc: "連續火焰模式：大火焰 + 連續天數",
        visualTraits: "置中大火焰圖標 + 醒目連續天數數字，激勵感，下方排習慣圓點。",
        classes: [
          { selector: ".streak-hero", usage: "連續達成主視覺區" },
          { selector: ".flame-wrap / .flame-icon", usage: "火焰外框 / 火焰圖標" },
          { selector: ".streak-number / .streak-caption", usage: "連續天數 / 說明文字" },
          { selector: ".streak-dots .streak-dot", usage: "各習慣圓點（.done 已完成）" },
        ],
      },
    ],
    tips: [
      "佈局由 customStyle.layout 控制（list/ring/heatmap/streak），請用「設定組件佈局」切換。",
      "ring 的環是 SVG，改顏色針對 .ring-progress 的 stroke。",
    ],
  },

  "companion-pet": {
    label: "養成寵物",
    summary: "養成寵物 / 水族箱，含寵物 emoji、名稱、親密度條。",
    classes: [
      { selector: ":scope", usage: "寵物根容器（.companion-pet-widget）" },
      { selector: ".pet", usage: "寵物本體 emoji" },
      { selector: ".pet-name", usage: "寵物名稱文字" },
      { selector: ".intimacy-bar", usage: "親密度條軌道" },
      { selector: ".intimacy-fill", usage: "親密度條填充（可改漸層）" },
      { selector: ".aquarium", usage: "水族箱樣式容器" },
      { selector: ".fish", usage: "水族箱魚 emoji" },
    ],
  },

  "text-banner": {
    label: "文字橫幅",
    summary: "純文字橫幅，適合做標題 / 裝飾大字。",
    classes: [
      { selector: ":scope", usage: "橫幅根容器（.text-banner-widget）" },
      { selector: ".banner-text", usage: "橫幅主文字（改字級 / 字重 / 字距 / 漸層字）" },
    ],
    tips: ["漸層字：對 .banner-text 用 background + -webkit-background-clip: text + color: transparent。"],
  },

  "color-block": {
    label: "漸層色塊",
    summary: "純裝飾漸層色塊。",
    classes: [
      { selector: ":scope", usage: "色塊根容器（.color-block-widget），可改 background 漸層" },
    ],
  },
};

/** 取得指定型別的提示（找不到回退通用） */
export function getWidgetStyleHint(type: WidgetType): WidgetStyleHint {
  return WIDGET_STYLE_HINTS[type] ?? GENERIC_HINT;
}

/**
 * 簡介：只給型別 + 一句話描述。組系統提示時預載每個組件用這份，省 context。
 * 想細修時再用「檢視組件」工具取詳情。
 */
export function formatWidgetStyleBrief(type: WidgetType): string {
  const hint = getWidgetStyleHint(type);
  return `${type}（${hint.label}）：${hint.summary}`;
}

/** 找出當前 layout 對應的變體（容錯：clockStyle 與 layout 同源） */
function findLayoutVariant(
  hint: WidgetStyleHint,
  currentLayout?: string,
): WidgetLayoutVariant | undefined {
  if (!currentLayout || !hint.layouts?.length) return undefined;
  return hint.layouts.find((l) => l.id === currentLayout);
}

/**
 * 詳情：完整列出可改 class、佈局變體與技巧。
 * 由「檢視組件」查詢工具按需回傳。
 *
 * 傳入 currentLayout 時，額外輸出「當前 layout 專屬結構 + 視覺特徵」，
 * 讓 AI 精準針對該 layout 的內部 class 做深度客製。
 */
export function formatWidgetStyleDetail(
  type: WidgetType,
  currentLayout?: string,
): string {
  const hint = getWidgetStyleHint(type);
  const lines: string[] = [
    `組件型別：${type}（${hint.label}）`,
    `外觀說明：${hint.summary}`,
    "",
    "通用可改結構（不分佈局都有；填規則時用這些選擇器，:scope 代表組件根本身）：",
    ...hint.classes.map((c) => `  - ${c.selector}：${c.usage}`),
  ];

  const current = findLayoutVariant(hint, currentLayout);
  if (current) {
    lines.push("");
    lines.push(`★ 當前佈局「${current.id}」（${current.desc}）的專屬結構與視覺特徵：`);
    if (current.visualTraits) {
      lines.push(`  視覺特徵：${current.visualTraits}`);
    }
    if (current.classes?.length) {
      lines.push("  專屬可改 class：");
      lines.push(...current.classes.map((c) => `    - ${c.selector}：${c.usage}`));
    } else {
      lines.push("  （此佈局沿用上方通用結構，差別在視覺處理；針對通用 class 寫規則即可）");
    }
    lines.push("");
    lines.push("→ 做深度客製時，請針對「當前佈局」的這些 class 與視覺基調疊加 CSS，最易精準命中。");
  }

  if (hint.layouts?.length) {
    lines.push("");
    lines.push("所有可用的佈局 / 樣式變體（切換請用佈局工具）：");
    lines.push(
      ...hint.layouts.map((l) => {
        const mark = current && l.id === current.id ? "（目前）" : "";
        return `  - ${l.id}${mark}：${l.desc}`;
      }),
    );
  }

  if (hint.tips?.length) {
    lines.push("");
    lines.push("細修技巧 / 注意：");
    lines.push(...hint.tips.map((t) => `  - ${t}`));
  }
  return lines.join("\n");
}

/**
 * 舊名相容：保留 formatWidgetStyleHint 作為詳情輸出別名，
 * 避免其它呼叫端中斷。
 */
export const formatWidgetStyleHint = formatWidgetStyleDetail;
