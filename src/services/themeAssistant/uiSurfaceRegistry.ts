/**
 * UI 表面註冊表
 *
 * 為 App 內可被 AI 美化助手精準修改的「UI 表面」（彈窗 / 設定頁 / 聊天室…）建檔。
 * 這是方案 A 的資料基礎，也是唯一需要持續人工維護的部分。
 *
 * 三層結構：表面（UISurface）→ 區塊（UIRegion）→ class 明細。
 * 對應三段式漸進揭露查詢，確保單次注入 AI 的 token 量最小、且不隨表面總數成長。
 *
 * 核心原則：
 *   - `rootSelector` 與各 class 必須對應元件真實存在的 class（逐一核對 .vue 的 template/style）。
 *     填錯會導致「AI 回報成功卻沒生效」，這是本註冊表的主要維護成本與風險。
 *   - 每個區塊只登記「使用者真會想改」的視覺熱點（背景、邊框、氣泡、按鈕），
 *     刻意不做完整 DOM 鏡像，從源頭壓低 token 與維護量。
 */

/** 表面內的一個功能區塊（標題列 / 訊息區 / 輸入框…） */
export interface UIRegion {
  /** 區塊 ID（AI 用來指定要看/改哪個區塊） */
  id: string;
  /** 中文名，如「標題列」 */
  label: string;
  /** 一句話簡介（列區塊時回傳，省 context） */
  summary: string;
  /**
   * 該區塊下可改的真實 class 與用途。
   * 只在「檢視區塊結構」第三層才回傳，且受 keyword 篩選與硬上限約束。
   * selector 相對於表面根（rootSelector）的後代；`:scope` 代表表面根本身。
   */
  classes: { selector: string; usage: string }[];
  /** 該區塊調樣式的坑 / 技巧（選填，僅第三層附） */
  tips?: string[];
}

/** 一個可被美化的 UI 表面（彈窗 / 設定頁 / 聊天室…） */
export interface UISurface {
  /** 唯一 ID（AI 用來指定要改哪個表面） */
  id: string;
  /** 給 AI 與使用者看的中文名，如「AI 美化助手彈窗」 */
  label: string;
  /** 分類，供列表分組 */
  category: "modal" | "screen" | "chat" | "global";
  /** 一句話簡介（列表時回傳，省 context） */
  summary: string;
  /**
   * 表面根選擇器——該表面最外層真實存在的 class。
   * 作用域包裝時所有規則都會鎖在這個根之下，
   * 確保 AI 的 CSS 不會外溢到其他表面。
   */
  rootSelector: string;
  /**
   * 該表面的功能區塊（三段式第二層）。
   * 只收「使用者真會想改的視覺熱點」，不做完整 DOM 鏡像。
   */
  regions: UIRegion[];
}

/**
 * 首批高頻表面。所有 class 均已對照各 .vue 的 template 核實。
 * 後續可分批擴充其餘 modal 與 screen。
 */
export const UI_SURFACES: UISurface[] = [
  {
    id: "theme-assistant-modal",
    label: "AI 美化助手彈窗",
    category: "modal",
    summary: "與 AI 對話美化介面的浮動視窗，含標題列、訊息區、輸入框。",
    rootSelector: ".ai-theme-modal",
    regions: [
      {
        id: "header",
        label: "標題列",
        summary: "頂部標題與右側按鈕群（清空 / 縮小 / 關閉）。",
        classes: [
          { selector: ".ai-theme-header", usage: "標題列底色邊框" },
          { selector: ".ai-theme-header .title", usage: "標題文字" },
          { selector: ".header-actions", usage: "右側按鈕群容器" },
          { selector: ".header-actions .text-btn", usage: "清空按鈕" },
          { selector: ".header-actions .icon-btn", usage: "縮小按鈕" },
          { selector: ".header-actions .close-btn", usage: "關閉按鈕" },
        ],
        tips: ["按鈕文字色與底色對比要足夠"],
      },
      {
        id: "messages",
        label: "訊息區",
        summary: "對話捲動區與使用者 / AI 氣泡。",
        classes: [
          { selector: ".ai-theme-body", usage: "捲動區背景" },
          { selector: ".msg-row.user .bubble", usage: "使用者氣泡" },
          { selector: ".msg-row.assistant .bubble", usage: "AI 氣泡" },
        ],
        tips: ["氣泡改深色記得同步調文字色"],
      },
      {
        id: "input",
        label: "輸入區",
        summary: "底部輸入框、送出鈕與建議標籤。",
        classes: [
          { selector: ".ai-theme-footer", usage: "輸入區容器" },
          { selector: ".ai-theme-input", usage: "文字輸入框" },
          { selector: ".send-btn", usage: "送出按鈕" },
          { selector: ".suggestion-chip", usage: "建議標籤" },
        ],
      },
    ],
  },
  {
    id: "global-theme-modal",
    label: "全局美化配置彈窗",
    category: "modal",
    summary: "設定整個 App 外觀的彈窗，含分頁標籤與各設定區。",
    rootSelector: ".global-theme-modal",
    regions: [
      {
        id: "header",
        label: "標題列",
        summary: "頂部標題與右側動作按鈕。",
        classes: [
          { selector: ".modal-header", usage: "標題列容器" },
          { selector: ".modal-title", usage: "標題文字" },
          { selector: ".modal-close", usage: "關閉按鈕" },
        ],
      },
      {
        id: "tabs",
        label: "分頁標籤",
        summary: "顏色 / 桌布 / 字體等切換標籤。",
        classes: [
          { selector: ".soft-tabs", usage: "標籤列容器" },
          { selector: ".tab-item", usage: "單個標籤" },
          { selector: ".tab-item.active", usage: "選中的標籤" },
        ],
      },
      {
        id: "content",
        label: "內容區",
        summary: "各分頁的設定內容與標題。",
        classes: [
          { selector: ".modal-content", usage: "內容捲動區" },
          { selector: ".settings-section", usage: "單一設定區塊" },
          { selector: ".section-title", usage: "小節標題" },
        ],
      },
      {
        id: "footer",
        label: "底部按鈕",
        summary: "底部的重設 / 儲存等按鈕。",
        classes: [
          { selector: ".modal-footer", usage: "按鈕列容器" },
          { selector: ".soft-btn", usage: "一般按鈕" },
          { selector: ".soft-btn.secondary", usage: "次要按鈕" },
        ],
      },
    ],
  },
  {
    id: "theme-settings-modal",
    label: "外觀 / 聊天外觀設定彈窗",
    category: "modal",
    summary: "調整聊天室或全域外觀的設定彈窗，含即時預覽。",
    rootSelector: ".theme-settings-modal",
    regions: [
      {
        id: "header",
        label: "標題列",
        summary: "頂部標題與關閉按鈕。",
        classes: [
          { selector: ".modal-header", usage: "標題列容器" },
          { selector: ".modal-title", usage: "標題文字" },
          { selector: ".modal-close", usage: "關閉按鈕" },
        ],
      },
      {
        id: "content",
        label: "內容區",
        summary: "各設定區與預覽。",
        classes: [
          { selector: ".modal-content", usage: "內容捲動區" },
          { selector: ".preview-header", usage: "預覽的聊天標題列" },
        ],
      },
      {
        id: "footer",
        label: "底部按鈕",
        summary: "底部的重設 / 儲存按鈕。",
        classes: [
          { selector: ".modal-footer", usage: "按鈕列容器" },
          { selector: ".soft-btn", usage: "一般按鈕" },
        ],
      },
    ],
  },
  {
    id: "chat-info-modal",
    label: "聊天資訊彈窗",
    category: "modal",
    summary: "顯示單人或群聊資訊的彈窗。",
    rootSelector: ".chat-info-modal",
    regions: [
      {
        id: "header",
        label: "標題列",
        summary: "頂部標題。",
        classes: [{ selector: ".modal-header", usage: "標題列容器" }],
      },
      {
        id: "content",
        label: "內容區",
        summary: "角色 / 群組資訊內容。",
        classes: [{ selector: ".modal-content", usage: "內容捲動區" }],
      },
    ],
  },
  {
    id: "list-settings-modal",
    label: "清單設定彈窗",
    category: "modal",
    summary: "調整清單佈局的設定彈窗。",
    rootSelector: ".list-settings-modal",
    regions: [
      {
        id: "header",
        label: "標題列",
        summary: "頂部標題。",
        classes: [{ selector: ".modal-header", usage: "標題列容器" }],
      },
      {
        id: "content",
        label: "內容區",
        summary: "佈局設定內容。",
        classes: [{ selector: ".modal-content", usage: "內容捲動區" }],
      },
      {
        id: "footer",
        label: "底部按鈕",
        summary: "底部的恢復預設等按鈕。",
        classes: [
          { selector: ".modal-footer", usage: "按鈕列容器" },
          { selector: ".reset-btn", usage: "恢復預設按鈕" },
        ],
      },
    ],
  },
];

/** 依 id 取得表面（找不到回 undefined） */
export function getSurface(surfaceId: string): UISurface | undefined {
  return UI_SURFACES.find((s) => s.id === surfaceId);
}

/** 依 surfaceId + regionId 取得區塊（找不到回 undefined） */
export function getRegion(
  surfaceId: string,
  regionId: string,
): UIRegion | undefined {
  return getSurface(surfaceId)?.regions.find((r) => r.id === regionId);
}

/** 所有表面 id（供工具 enum 綁定） */
export function allSurfaceIds(): string[] {
  return UI_SURFACES.map((s) => s.id);
}

/**
 * 第一層：列出所有表面的精簡資訊（不含 region / class）。
 */
export function listSurfacesBrief(): {
  id: string;
  label: string;
  category: string;
  summary: string;
}[] {
  return UI_SURFACES.map((s) => ({
    id: s.id,
    label: s.label,
    category: s.category,
    summary: s.summary,
  }));
}

/**
 * 第二層：列出指定表面的區塊（只含 id / label / summary，不含 class）。
 * 找不到表面回 null。
 */
export function listRegionsBrief(
  surfaceId: string,
): { id: string; label: string; summary: string }[] | null {
  const surface = getSurface(surfaceId);
  if (!surface) return null;
  return surface.regions.map((r) => ({
    id: r.id,
    label: r.label,
    summary: r.summary,
  }));
}

/** 第三層檢視區塊的回傳結構 */
export interface RegionInspectResult {
  surfaceId: string;
  regionId: string;
  regionLabel: string;
  rootSelector: string;
  classes: { selector: string; usage: string }[];
  tips?: string[];
  /** 因硬上限或 keyword 篩選而被截斷時為 true */
  truncated: boolean;
  /** 篩選 / 截斷後的提示（給 AI 的引導） */
  note?: string;
}

/** 第三層檢視區塊回傳的 class 硬上限（token 防爆最後一道閘） */
export const MAX_CLASSES_PER_INSPECT = 15;

/**
 * 第三層：檢視指定區塊的真實 class 明細。
 * - keyword：選填，只回 selector 或 usage 命中關鍵字（不分大小寫）的子集。
 * - 超過 MAX_CLASSES_PER_INSPECT 時截斷，並在 note 提示用 keyword 縮小範圍。
 * 找不到表面 / 區塊回 null。
 */
export function inspectRegion(
  surfaceId: string,
  regionId: string,
  keyword?: string,
): RegionInspectResult | null {
  const surface = getSurface(surfaceId);
  if (!surface) return null;
  const region = surface.regions.find((r) => r.id === regionId);
  if (!region) return null;

  let classes = region.classes;
  let note: string | undefined;

  // keyword 篩選
  const kw = keyword?.trim().toLowerCase();
  if (kw) {
    const filtered = classes.filter(
      (c) =>
        c.selector.toLowerCase().includes(kw) ||
        c.usage.toLowerCase().includes(kw),
    );
    classes = filtered;
    if (filtered.length === 0) {
      note = `沒有符合關鍵字「${keyword}」的 class；可改用不帶 keyword 查看全部。`;
    }
  }

  // 硬上限截斷
  let truncated = false;
  if (classes.length > MAX_CLASSES_PER_INSPECT) {
    classes = classes.slice(0, MAX_CLASSES_PER_INSPECT);
    truncated = true;
    note = `class 過多，僅回傳前 ${MAX_CLASSES_PER_INSPECT} 條；請用 keyword 縮小範圍。`;
  }

  return {
    surfaceId: surface.id,
    regionId: region.id,
    regionLabel: region.label,
    rootSelector: surface.rootSelector,
    classes,
    tips: region.tips,
    truncated,
    note,
  };
}
