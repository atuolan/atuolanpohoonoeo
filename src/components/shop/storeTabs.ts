/**
 * 商店的分頁：原本的「購物」和「外賣」合成一個商店。
 * 東西買了之後去哪裡決定放哪一區：
 * - 外送・禮物：實體的東西，吃的、用的、送他的（外送寄到你或他的所在地；禮物先放背包，在聊天裡送）
 * - 裝扮・道具：用在 App 和小遊戲上的（聊天裝扮、頭像框、魚竿、加成道具）
 * 小屋的擺件、家具款式、衣服在小屋裡買，不在這裡。
 */

export type StoreGroupId = "goods" | "style";

export type StoreTabId =
  // 外送（DeliveryMallPanel）
  | "food"
  | "kind"
  | "spicy"
  // 購物（ShopItemsPanel）
  | "gift"
  | "care"
  | "chatskin"
  | "frame"
  | "rod"
  | "consumable"
  // 禮物櫃（GiftCabinet）
  | "cabinet";

export interface StoreTab {
  id: StoreTabId;
  group: StoreGroupId;
  label: string;
  /** 分頁上方的一行說明：這裡賣什麼、買了會怎樣 */
  caption: string;
}

export const STORE_GROUPS: { id: StoreGroupId; label: string }[] = [
  { id: "goods", label: "外送・禮物" },
  { id: "style", label: "裝扮・道具" },
];

export const STORE_TABS: StoreTab[] = [
  { id: "food", group: "goods", label: "美食廣場", caption: "主食、飲料、甜點，就近外送" },
  { id: "kind", group: "goods", label: "良心商店", caption: "日用品、保養品，寄到你或他的所在地" },
  { id: "spicy", group: "goods", label: "邪氣商店", caption: "成人用品，寄到你或他的所在地" },
  { id: "gift", group: "goods", label: "禮物", caption: "買了放進背包，在聊天裡打開禮物送他" },
  { id: "care", group: "goods", label: "照顧他", caption: "他在忙、在睡的時候用，在聊天裡打開禮物送過去" },
  { id: "cabinet", group: "goods", label: "禮物櫃", caption: "你送他的、他送你的禮物" },
  { id: "chatskin", group: "style", label: "聊天裝扮", caption: "聊天畫面的外觀，買之前可以先試穿" },
  { id: "frame", group: "style", label: "頭像框", caption: "聊天裡頭像外面的框" },
  { id: "rod", group: "style", label: "魚竿", caption: "釣魚小遊戲用" },
  { id: "consumable", group: "style", label: "道具", caption: "打工、釣魚的效率加成" },
];

const TAB_BY_ID = new Map(STORE_TABS.map((t) => [t.id, t]));

export const DEFAULT_STORE_TAB: StoreTabId = "food";

export function isStoreTabId(value: unknown): value is StoreTabId {
  return typeof value === "string" && TAB_BY_ID.has(value as StoreTabId);
}

export function getStoreTab(id: StoreTabId): StoreTab {
  return TAB_BY_ID.get(id)!;
}

export function storeTabsInGroup(group: StoreGroupId): StoreTab[] {
  return STORE_TABS.filter((t) => t.group === group);
}

export function isDeliveryTab(id: StoreTabId): id is "food" | "kind" | "spicy" {
  return id === "food" || id === "kind" || id === "spicy";
}

// ===== 打開商店時停在哪一頁 =====

const LAST_TAB_KEY = "store_last_tab";

export function loadLastStoreTab(): StoreTabId | null {
  try {
    const saved = localStorage.getItem(LAST_TAB_KEY);
    return isStoreTabId(saved) ? saved : null;
  } catch {
    return null;
  }
}

export function saveLastStoreTab(id: StoreTabId): void {
  try {
    localStorage.setItem(LAST_TAB_KEY, id);
  } catch {
    // 存不了就下次從預設開
  }
}

// 從別的地方指定要開哪一頁（聊天的禮物抽屜「去商店買」、主題設定「去買聊天裝扮」）。
// 下一次打開商店時用掉，只用一次。
let nextTab: StoreTabId | null = null;

export function setNextStoreTab(id: StoreTabId): void {
  nextTab = id;
}

export function takeNextStoreTab(): StoreTabId | null {
  const id = nextTab;
  nextTab = null;
  return id;
}

/** 決定這次打開停在哪一頁：別處指定的 > 入口指定的（外賣 → 美食廣場）> 上次停的 > 預設 */
export function resolveInitialStoreTab(options: {
  requested?: StoreTabId | null;
  entry?: StoreTabId | null;
  last?: StoreTabId | null;
}): StoreTabId {
  return options.requested ?? options.entry ?? options.last ?? DEFAULT_STORE_TAB;
}
