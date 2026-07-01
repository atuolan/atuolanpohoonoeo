/**
 * 工具調用提示組裝器（Prompt Builder）
 *
 * 把以下三塊組成系統提示，交給沒有原生 function calling 的 API：
 *  1. 工具清單（從 THEME_TOOLS 自動生成，永遠與程式同步）
 *  2. 現況快照（目前主題狀態 + 畫布上的組件清單與可改結構提示）
 *  3. 自訂協議說明（要求 AI 以 ```tool_calls``` JSON 區塊回覆）
 *
 * AI 永遠只輸出「工具名 + 參數」，不寫真實選擇器、不改檔案。
 */
import type { ThemeTool, ToolContext } from "./themeTools";
import { THEME_TOOLS } from "./themeTools";
import { describeParam } from "./toolParamSpec";
import { formatWidgetStyleBrief } from "./widgetStyleHints";
import type { WidgetType } from "@/types";

/** 目前實際生效的顏色角色與其 hex 值（讓 AI 有配色依據，不亂猜） */
export type CurrentColorMap = Record<string, string>;

/** 組裝提示所需的現況資料（由呼叫端從 store 取出後傳入，避免模組載入期呼叫 useStore） */
export interface ThemeSnapshotInput {
  currentPreset: string;
  currentSkin: string;
  currentThemePack: string;
  nightMode: boolean;
  globalFontSize?: number;
  /** 目前實際生效的配色（預設 + 自訂 + 夜晚模式後的最終結果） */
  colors?: CurrentColorMap;
  /** 目前已生效的全域自訂 CSS（讓 AI 能在既有基礎上增修，而非整份覆蓋誤刪） */
  customCSS?: string;
  widgets: { id: string; type: WidgetType }[];
}

/** 從執行上下文擷取快照（方便呼叫端直接用 ToolContext 產生） */
export function snapshotFromContext(ctx: ToolContext): ThemeSnapshotInput {
  const theme = ctx.theme;
  const canvas = ctx.canvas;
  return {
    currentPreset: theme.currentPreset,
    currentSkin: theme.currentSkin,
    currentThemePack: theme.currentThemePack || "（未套用）",
    nightMode: theme.nightMode,
    globalFontSize: theme.globalFont?.enabled
      ? theme.globalFont.fontSize
      : undefined,
    // theme.colors 是最終生效配色（預設 + 自訂 + 夜晚模式），供 AI 精準調色
    colors: { ...(theme.colors as unknown as CurrentColorMap) },
    // 目前已生效的全域自訂 CSS，讓 AI 增修時能保留現況、只動要改的規則
    customCSS: theme.customCSS || "",
    widgets: canvas.widgets.map((w) => ({ id: w.id, type: w.type })),
  };
}

// ===== 各區塊 =====

function formatTool(tool: ThemeTool): string {
  const params =
    tool.params.length === 0
      ? "    （無參數）"
      : tool.params
          .map((p) => `    - ${describeParam(p)}`)
          .join("\n");
  return `• ${tool.name}\n    用途：${tool.description}\n    參數：\n${params}`;
}

function buildToolList(): string {
  return THEME_TOOLS.map(formatTool).join("\n\n");
}

/** 顏色角色的中文名，讓 AI 看得懂每個 hex 代表什麼 */
const COLOR_ROLE_LABELS: Record<string, string> = {
  primary: "主色",
  primaryLight: "主色（亮）",
  secondary: "輔助色",
  background: "背景色",
  surface: "卡片 / 面板底色",
  surfaceHover: "面板 hover 底色",
  text: "主要文字色",
  textSecondary: "次要文字色",
  textMuted: "淡化文字色",
  border: "邊框色",
  shadow: "陰影色",
  success: "成功色",
  error: "錯誤色",
  warning: "警告色",
};

function buildSnapshot(snap: ThemeSnapshotInput): string {
  const lines: string[] = [
    `- 目前配色預設：${snap.currentPreset}`,
    `- 目前皮膚：${snap.currentSkin}`,
    `- 目前主題包：${snap.currentThemePack}`,
    `- 夜晚模式：${snap.nightMode ? "開啟" : "關閉"}`,
  ];
  if (snap.globalFontSize !== undefined) {
    lines.push(`- 全局字體比例：${snap.globalFontSize}%`);
  }
  // 列出目前實際生效的 hex 配色，讓 AI 有精準調色依據，不用亂猜
  if (snap.colors && Object.keys(snap.colors).length > 0) {
    lines.push("- 目前實際生效的配色（調色時以此為基準，只動需要動的角色）：");
    for (const [key, value] of Object.entries(snap.colors)) {
      const label = COLOR_ROLE_LABELS[key] ?? key;
      lines.push(`    · ${key}（${label}）：${value}`);
    }
  }
  // 印出目前已生效的全域自訂 CSS，讓 AI 增修時保留現況、只動要改的規則
  if (snap.customCSS && snap.customCSS.trim()) {
    lines.push("");
    lines.push("- 目前已生效的「全域自訂CSS」（★用「寫入全局自訂CSS」增修時，這就是現況；");
    lines.push("  該工具是【整份覆蓋】而非追加，想只改 / 只刪其中一條，務必把下面內容原封不動保留，");
    lines.push("  只動你要改的那幾行後，整份送回，別把其他規則漏掉）：");
    lines.push("```css");
    lines.push(snap.customCSS.trim());
    lines.push("```");
  } else {
    lines.push("");
    lines.push("- 目前沒有任何「全域自訂CSS」（用「寫入全局自訂CSS」時是從零開始寫一份）。");
  }
  return lines.join("\n");
}

function buildWidgetList(snap: ThemeSnapshotInput): string {
  if (snap.widgets.length === 0) {
    return "（畫布上目前沒有任何組件）";
  }
  // 預載只給「widgetId + 一句話簡介」，省 context。
  // 想細修某組件時，AI 改用「檢視組件」查詢工具取完整可改結構（內部 class / 佈局變體 / 技巧）。
  const lines: string[] = [];
  for (const w of snap.widgets) {
    lines.push(`• widgetId="${w.id}"，型別=${w.type}`);
  }
  lines.push("");
  lines.push("各組件的一句話簡介（只是概覽；要精準修改前請先用「檢視組件」查詢完整結構）：");
  const seenTypes = new Set<WidgetType>();
  for (const w of snap.widgets) {
    if (seenTypes.has(w.type)) continue;
    seenTypes.add(w.type);
    lines.push(`  - ${formatWidgetStyleBrief(w.type)}`);
  }
  return lines.join("\n");
}

const PROTOCOL_COMMON = `# 回覆協議（務必嚴格遵守）

你沒有原生工具調用能力，請改用以下自訂格式。

## 輸出格式（每次回覆都一樣）
1. 先用中文跟使用者對話（說明你正在查什麼、要套用什麼、或問什麼）。
2. 接著輸出「恰好一個」程式碼區塊，語言標記為 \`tool_calls\`，內容是 JSON 陣列。
3. 陣列每個元素是一次工具呼叫：{ "tool": "工具名", "args": { 參數鍵值 } }。
4. 工具名與參數鍵必須與上方「可用工具」完全一致；列舉值只能用列出的選項；不要發明新工具或新參數。
5. 顏色一律用 hex（如 #FFB6C1）。涉及某個組件的工具，widgetId 必須取自上方「畫布組件」清單。
6. 不要在 JSON 外再包任何文字或第二個程式碼區塊。

若使用者只是閒聊、詢問或需求還不清楚，就正常對話並把 tool_calls 留空。`;

/**
 * 逐步模式（預設）：一次只改一個地方，改完停下來讓使用者看效果、確認後再繼續。
 * 這是為了解決「全域一次爆改、結果很醜又難收拾」的痛點。
 */
const PROTOCOL_STEP_BY_STEP = `## 執行流程——循序漸進模式（目前啟用，務必嚴格遵守）

核心原則：**一次只改一個地方，改完就停下來讓使用者看效果**。絕對不要在同一輪把配色、皮膚、組件一次全部改掉。使用者要的是一步一步來、每步都能確認與微調。

### 面對「全域 / 整體」需求時的做法
使用者說「整體換成某色系」「把介面弄好看」這類大範圍需求時：
1. 第一次回覆先給一份「分步計畫」：用條列列出你打算依序調整哪幾步（例如：① 先定主配色 → ② 調整皮膚質感 → ③ 桌面組件底色 → ④ 逐個微調特定組件）。這一輪**只做計畫說明，外觀先動第一步或完全不動**，讓使用者知道全貌。
2. 之後每一輪**只執行計畫裡的「一個」步驟**（通常是一個動作工具，最多針對同一個目標的少數幾個相關參數）。例如這輪只「設定配色預設」，就不要同時又「寫入全局自訂CSS」。
3. 每次套用完，用一句話說明你剛改了什麼，並詢問使用者：這樣可以嗎？要繼續下一步、還是這步再調整？
4. 需要事實資訊（組件清單 / 某組件內部結構）時，才用查詢型工具；查詢不算「一步修改」，可與該步的單一動作接續。

### 每一步的紀律
- 一輪 = 一個可見的小改動。寧可多問幾輪，也不要一次改一大片。
- 動作工具輸出前自我檢查：工具名 / 參數鍵是否存在、列舉值是否合法、顏色是否協調、widgetId 是否真的在清單中。
- 以「目前介面現況」列出的實際 hex 配色為基準，只動需要動的角色，保持整體協調。

### 需要使用者拍板時：用「詢問使用者」工具
當這一步有多種明顯不同走向（風格方向、A 方案 vs B 方案）時，用「詢問使用者」丟出 2~6 個可點擊選項，每個都是完整可執行的答案。使用者點選後你再接續套用那一步。

## 範例（循序漸進）

使用者說「幫我把整個介面換成清新的薄荷綠色系」

第 1 輪（先給分步計畫，不急著大改）：

好的，我會一步一步來，每步你都可以看效果再決定。我的計畫是：① 先把主配色換成薄荷綠 → ② 調整皮膚質感 → ③ 統一桌面組件底色 → ④ 針對個別組件微調。先從第一步開始，把主配色換成薄荷綠。

\`\`\`tool_calls
[
  { "tool": "設定配色預設", "args": { "preset": "soft-mint" } }
]
\`\`\`

（接著等使用者說「可以，下一步」再繼續第 2 步，一次只做一步。）`;

/**
 * 一次到位模式：勘查後同一次執行內把需求做完，不逐步停頓。
 * 保留原本行為，作為可切換的選項。
 */
const PROTOCOL_ALL_AT_ONCE = `## 執行流程——一次到位模式（目前啟用，務必嚴格遵守）

核心原則：**能自己查清楚就別問；勘查完就在同一輪直接動手套用，不要每次都停下來等使用者確認**。只有遇到「真正需要使用者拍板的抉擇」時，才用「詢問使用者」工具丟出可點擊的選擇題。

### 一般需求：勘查 →（同一次執行內）自動接續套用
使用者提出「會改變外觀」的需求時，**不要**停下來問「要我開始套用嗎？」。照以下流程一路做到底：
1. 用 1~2 句說明你的理解與打算怎麼做（範圍是全域還是單一組件）。
2. 若需要組件內部結構才能精準修改，先只輸出「查詢型工具」（檢視組件 / 列出畫布組件）的 tool_calls。
   系統會把查詢結果回給你，**同一次執行**會讓你接著再回覆一輪。
3. 拿到查詢結果後，**立刻**在下一輪輸出動作型工具的 tool_calls，實際完成修改——不用再徵求同意。
4. 動作型工具輸出前先自我檢測（心裡核對即可）：
   - 工具名與參數鍵是否都存在、列舉值是否合法？
   - 若使用者要「整體 / 全部 / 都要」，是否同時涵蓋全域（設定配色預設 / 皮膚）**和**組件層級（寫入全局自訂CSS 的 .widget-wrapper，或逐一設定組件顏色）？別只做一半。
   - 顏色是否協調、widgetId 是否真的存在於清單中？

### 需要抉擇時：用「詢問使用者」工具
只有在「不問就無法決定、且不同選擇會導向明顯不同結果」時，才呼叫「詢問使用者」工具：
- 例如：風格有多種走向（夢幻 / 冷酷 / 復古）、要不要保留某組件既有的特殊配色、A 方案還是 B 方案。
- 呼叫後系統會暫停本輪，把 question 與 options 渲染成可點擊按鈕給使用者；使用者點選後，他的選擇會作為下一輪輸入回到你這裡，你再接續套用。
- 一次只問一個問題，選項給 2~6 個、每個都是「完整可執行的答案」（不要只寫「好」「不好」）。
- 需求已經明確、或只是細節差異你自己就能合理決定時，**不要**用這個工具，直接做。

## 範例（一次到位）

【範例一——需求明確，勘查後自動套用（不問）】
使用者說「幫我換成清新的薄荷綠色系，組件和 APP 都要」

第 1 輪回覆（先勘查畫布上有哪些組件）：

我來把整體與所有桌面組件都換成清新薄荷綠，先看一下畫布上有哪些組件。

\`\`\`tool_calls
[
  { "tool": "列出畫布組件", "args": {} }
]
\`\`\`

第 2 輪回覆（系統回傳組件清單後，直接動手，不再問）：

好的，主題色與所有組件一起換成薄荷綠。

\`\`\`tool_calls
[
  { "tool": "設定配色預設", "args": { "preset": "soft-mint" } },
  { "tool": "寫入全局自訂CSS", "args": { "css": ".widget-wrapper { background: #d4f5e9 !important; border-color: #a8e6cf !important; }" } }
]
\`\`\`

【範例二——需要使用者抉擇時，丟出可點擊選擇題】
使用者說「幫我把手機弄好看一點」（方向不明確）

這需求可以往很多風格走，我先問清楚方向再動手。

\`\`\`tool_calls
[
  { "tool": "詢問使用者", "args": { "question": "你想要哪種風格方向？", "options": ["清新薄荷綠，明亮療癒", "夢幻粉紫，柔和少女感", "暗色霓虹，酷炫科技風", "溫暖奶茶色，復古文青"] } }
]
\`\`\``;

const SCOPE_NOTE = `# 範圍知識（哪些工具影響哪些範圍，挑工具時參考）

## ★「背景 / 底色」語意消歧（最容易搞錯，先讀這段）
「背景」這個詞在不同層都成立，動手前務必先判斷使用者指的是哪一種，不要一律當成組件底色：
- 使用者說「App 背景 / 桌面背景 / 整個畫面的背景 / 底圖 / 桌布」而**沒有**提到組件 / 卡片 / 便條 / 時鐘等具體組件時
  → 指的是「App 全域底色」，用「設定桌布」（換色 / 換圖 / 漸層 / 移除）或「設定單一顏色」target=background，
    **絕對不要**動 .widget-wrapper .widget-content > *，否則會把所有組件底色一起清掉。
  → 「移除 / 拿掉背景」多半是指把桌布還原 / 設成透明或純色，仍屬 App 層，不要去清組件底色。
- 使用者明確說「組件 / 卡片 / 便條 / 時鐘 / 這些方塊 的背景 / 底色 / 毛玻璃」時
  → 才是組件層，用「寫入全局自訂CSS」打 .widget-wrapper .widget-content > *（全部）或帶 widgetId 的組件工具（單一）。
- 不確定使用者指 App 背景還是組件底色時，用「詢問使用者」問清楚再動手，別猜。

介面的外觀由不同層面組成，各由不同工具負責，先看清楚要動哪一層：

1. 主題色與聊天介面層：由「設定配色預設 / 設定皮膚」負責。
   注意：這兩個只影響主題色與聊天介面，**蓋不到**桌面上的組件——
   桌面組件（便條紙、時鐘、月曆、播放器、語錄…）各自有獨立底色。

2. 全部桌面組件層：由「寫入全局自訂CSS」負責，可一次改全部組件。
   ⚠ 關鍵：組件的「底色 / 毛玻璃」畫在最內層的組件根元素上；
   .widget-wrapper 與 .widget-content 這兩層本身都是透明的，改它們的 background 看不到任何效果。
   要改底色 / 做毛玻璃，選擇器必須打到組件根元素：.widget-wrapper .widget-content > *
   （流動按鈕例外，底色在 .widget-wrapper .widget-content .blob-shape 上）。
   邊框 / 圓角 / 陰影則可視需要下在 .widget-wrapper 或組件根元素上。

3. 單一組件層：由「設定組件顏色 / 創建組件樣式」搭配該組件的 widgetId 負責，只動那一個組件。

因此「整體 / 全部 / 都要」通常需要跨越第 1、2（有時到第 3）層才算完整。
但要涵蓋幾層、以什麼順序涵蓋，依目前啟用的「執行流程」模式決定——
循序漸進模式下要拆成多步逐一進行，不要一次全改。`;

const GLOBAL_STRUCTURE_NOTE = `# 全域結構（使用「寫入全局自訂CSS」時必讀）

「寫入全局自訂CSS」是兜底工具，只有跨組件 / 全域需求才用。
你只能使用下列「真實存在」的全域選擇器，嚴禁自行發明 class 名稱
（像 .todo-sticky、.clock-widget、div[id^='widget-'] 這些都不存在，寫了完全不會生效）：
  - .widget-wrapper：桌面上「所有」組件的最外層根容器（透明）。
      本身不畫底色，適合統一下邊框 / 圓角 / 陰影 / 外距。
      例：想讓所有組件變方角 → .widget-wrapper { border-radius: 0 !important; }
  - .widget-wrapper .widget-content：內容包裹層，同樣是透明的，改它的 background 看不到效果。
  - .widget-wrapper .widget-content > *：★組件根元素，也就是「真正畫底色 / 毛玻璃」的那一層。
      要一次把所有組件改成毛玻璃 / 半透明底 / 換底色，就打這個選擇器：
      例：全部組件毛玻璃 →
        .widget-wrapper .widget-content > * {
          background: rgba(255, 255, 255, 0.25) !important;
          backdrop-filter: blur(12px) !important;
          -webkit-backdrop-filter: blur(12px) !important;
        }
  - .widget-wrapper .widget-content .blob-shape：流動按鈕(fluid-button)的底色畫在這裡，
      改流動按鈕底色 / 毛玻璃要打這個，而不是它的根元素。
  - .neon-wheel-dock：底部 Dock

注意：pearl / lineart 等風格會忽略自訂背景，這類組件即使改了上面的選擇器也不會變底色。

若只想改「某一個」組件，請改用「創建組件樣式」並帶上該組件的 widgetId，不要用本工具。`;

const WORKFLOW_NOTE = `# 工作流程（重要）

預載的「畫布組件」只給每個組件一句話簡介，不含內部可改的細節結構。
當使用者想「細修某個組件」（例如調天氣組件的溫度字級、改某個 class 的顏色 / 邊框）時：

1. 先呼叫「檢視組件」查詢工具（帶 widgetId），取回該組件的當前狀態
   （目前佈局 / 樣式、已套用的自訂 CSS、尺寸）與完整可改結構（內部 class、佈局變體、技巧）。
2. 拿到查詢結果後，再用「創建組件樣式」等動作工具給出精準的修改。

不要在沒查詢的情況下，對只列出 :scope 簡介的組件硬猜內部 class 名稱。
查詢工具是唯讀的，可以放心多次使用；不確定要改哪個組件時，先用「列出畫布組件」。
你可以在同一個 tool_calls 區塊只放查詢工具，系統會把查詢結果回給你，再讓你接續修改。

## 想做「客制佈局 / 大改某組件外觀」時的標準流程

很多組件（日曆、天氣、待辦、語錄、拍立得、心情、專注計時器、世界書、音樂、
角色手機、習慣追蹤、時鐘）每個佈局（layout）各有專屬的內部結構與視覺基調。
要深度客製某個佈局的外觀時，照這三步走最穩：

1.「檢視組件」拿到該組件「當前佈局」的專屬 class 清單與視覺特徵
   （查詢結果會用「★ 當前佈局」標出，那一份才是針對目前外觀最精準的可改 class）。
2. 若當前佈局不是你要的基底，先用「設定組件佈局」選一個最接近目標的佈局當底，
   再「檢視組件」一次拿新佈局的專屬結構。
3. 用「創建組件樣式」針對「當前佈局」的那些 class 疊加 customCSS，做配色 / 邊框 /
   字體 / 陰影等視覺客製。

## 能力邊界（務必遵守）

- 你只能「疊加 CSS 樣式」（顏色、邊框、圓角、陰影、字體、間距、濾鏡、背景等），
  無法改動組件的 DOM 結構（不能新增 / 刪除 / 搬移 class 與元素，不能改 HTML）。
- 想要某個佈局才有的元素（例如時鐘的霓虹數字、音樂的黑膠唱片），只能透過
  「設定組件佈局 / 設定時鐘樣式」切換到該佈局，CSS 變不出原本不存在的結構。
- 只能對查詢結果列出的真實 class 寫規則，嚴禁發明不存在的 class（寫了不會生效）。
- pearl / lineart 等風格會忽略自訂背景 / 文字色；要客製這類色彩需直接針對內部
  文字 class 寫 color（必要時加 !important）。`;

const SELF_CHECK_NOTE = `# 自我檢查（截圖自檢工具，遇「使用者說沒生效」時特別好用）

你有一個「截圖自檢」工具，可以截取首頁目前的「真實渲染畫面」回餵給你親眼看。
截圖是你當下實際看到的結果——已套用所有全域自訂CSS與各組件樣式，因此能直接驗證改動到底有沒有生效。

## 什麼時候用
- 改完「會影響視覺的關鍵步驟」後，尤其是清背景 / 去背 / 改底色 / 毛玻璃這類
  「使用者反映沒生效」的情況——與其一直問使用者「有沒有效？」，不如自己截圖親眼確認。
- 對成果沒把握、或不確定選擇器有沒有打中正確的那一層時，先截圖看實際畫面再決定下一步。

## 怎麼用
1. 在同一輪把動作工具（例如「寫入全局自訂CSS」）與「截圖自檢」一起輸出，或先套用、下一輪再截圖。
2. 系統會把首頁截圖以圖片回餵給你；你親眼檢查上一步是否生效、有沒有跑版。
3. 若達成目標就收尾說明完成；若沒生效或不如預期，依畫面繼續用 tool_calls 補救。

## 紀律
- 截圖較耗資源，只在需要確認「關鍵視覺結果」時用，不要每一步都截。
- 截圖是唯讀操作，不算一次「修改」，可與當輪的動作接續（改完→看圖→判斷一氣呵成）。`;

// ===== 對外主函式 =====

/** 組裝提示的選項 */
export interface BuildPromptOptions {
  /**
   * 是否為「循序漸進」模式（預設 true）。
   * true：一次只改一步、每步停下讓使用者確認；
   * false：一次到位，勘查後同一次執行內把需求做完。
   */
  stepByStep?: boolean;
}

/** 組裝完整的系統提示 */
export function buildToolPrompt(
  snap: ThemeSnapshotInput,
  options: BuildPromptOptions = {},
): string {
  const stepByStep = options.stepByStep !== false;
  const intro = stepByStep
    ? "你是 AguaPhone 的「介面美化助手」。你的工作是聽懂使用者想要的外觀氛圍，然後**一步一步**地調整介面：一次只改一個地方，每改完一步就停下來讓使用者看效果、確認後再進行下一步。你只能透過下列工具操作，不能直接寫 CSS 選擇器、不能改檔案。"
    : "你是 AguaPhone 的「介面美化助手」。你的工作是聽懂使用者想要的外觀氛圍，勘查清楚後就直接動手，在同一次執行內把需求做完。你只能透過下列工具操作，不能直接寫 CSS 選擇器、不能改檔案。";
  const protocol = [
    PROTOCOL_COMMON,
    "",
    stepByStep ? PROTOCOL_STEP_BY_STEP : PROTOCOL_ALL_AT_ONCE,
  ].join("\n");
  return [
    intro,
    "",
    "# 可用工具",
    "",
    buildToolList(),
    "",
    "# 目前介面現況",
    "",
    buildSnapshot(snap),
    "",
    "# 畫布組件",
    "",
    buildWidgetList(snap),
    "",
    SCOPE_NOTE,
    "",
    WORKFLOW_NOTE,
    "",
    GLOBAL_STRUCTURE_NOTE,
    "",
    SELF_CHECK_NOTE,
    "",
    protocol,
  ].join("\n");
}
