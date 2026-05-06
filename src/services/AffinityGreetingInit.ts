/**
 * 開場白（greeting）內嵌的 MVU `<UpdateVariable><JSONPatch>` 區塊
 * 作為該開場白「該聊天起始狀態」的初始值覆寫。
 *
 * 慣例參考：tavern_helper 中的 MVU 卡片（譚堯 / 姐姐大人）—
 * 每一個 first_mes / alternate_greeting 末尾通常會有：
 *
 *   <UpdateVariable>
 *   <Analysis>...</Analysis>
 *   <JSONPatch>
 *   [
 *     { "op": "replace", "path": "/角色/亲密值", "value": 0 },
 *     ...
 *   ]
 *   </JSONPatch>
 *   </UpdateVariable>
 *
 * 不同 greeting 描述不同場景（陌生 / 曖昧 / 戀人），其數值差異可能很大；
 * 直接把這個 patch 套到該聊天的 affinity state，作為該分支 / 新檔的起點。
 */
import type { CharacterAffinityConfig } from "@/schemas/affinity";
import type { useAffinityStore } from "@/stores/affinity";
import { parseAffinityUpdateTags } from "@/services/ResponseParser";

type AffinityStore = ReturnType<typeof useAffinityStore>;

/**
 * 從 greeting 字串中抽出 MVU `<UpdateVariable><JSONPatch>` 區塊轉換成的
 * affinity 更新 entries。回傳空陣列代表 greeting 沒有內嵌起始值宣告。
 *
 * 內部直接重用 ResponseParser.parseAffinityUpdateTags，所以同時支援
 * `<update>` / `<UpdateVariable>` / `<affinity-update>` 三種格式；只要
 * greeting 末尾按 MVU 慣例附上區塊即可。
 */
export function extractGreetingInitUpdates(
  greetingContent: string,
): ReturnType<typeof parseAffinityUpdateTags> {
  if (!greetingContent || typeof greetingContent !== "string") return [];
  return parseAffinityUpdateTags(greetingContent);
}

/**
 * 將 greeting 內嵌的初始 patch 套用到指定 chatId 的 affinity state。
 *
 * 流程：
 *   1. 確保 affinityStore 已初始化、config 已載入。
 *   2. 強制以角色預設值（含 mvuInitialData）重置 chatId 的狀態，避免殘留。
 *   3. 解析 greeting 中的 <UpdateVariable><JSONPatch>，透過 batchUpdateByPath 套用。
 *   4. 套用後 saveState。
 *
 * 若該角色尚未啟用好感度系統，靜默跳過。
 *
 * @returns 套用的 update 數量；0 代表沒有 patch 或角色未啟用。
 */
export async function applyGreetingInitToAffinity(
  affinityStore: AffinityStore,
  chatId: string,
  characterId: string,
  greetingContent: string,
): Promise<number> {
  if (!chatId || !characterId) return 0;

  try {
    await affinityStore.initialize();
    let config: CharacterAffinityConfig | null = affinityStore.getConfig(characterId) ?? null;
    if (!config) {
      config = await affinityStore.loadConfig(characterId);
    }
    if (!config?.enabled) return 0;

    // 強制重置為角色預設值（含 mvuInitialData），避免舊狀態殘留
    await affinityStore.initializeFromConfig(chatId, config, { force: true });

    const updates = extractGreetingInitUpdates(greetingContent);
    if (updates.length > 0) {
      affinityStore.resetMvuDeltaData(chatId);
      affinityStore.batchUpdateByPath(chatId, updates);
    }

    // greeting 即是「最後一筆已套用的 AI 訊息」，標記避免進入聊天時 rescan 重複套用
    // 注意：呼叫端若知道實際 message id，應在呼叫後改用 setLastRescannedMessageId 覆蓋
    await affinityStore.saveState(chatId);
    return updates.length;
  } catch (error) {
    console.error(
      "[AffinityGreetingInit] 套用 greeting 初始值失敗:",
      chatId,
      error,
    );
    return 0;
  }
}

/**
 * 直接以角色預設值（metric.initial / mvuInitialData）重置某 chatId 的好感度。
 * AffinityPanel「重置為角色預設值」按鈕使用。
 */
export async function resetAffinityToCharacterDefaults(
  affinityStore: AffinityStore,
  chatId: string,
  characterId: string,
): Promise<boolean> {
  if (!chatId || !characterId) return false;
  try {
    await affinityStore.initialize();
    let config: CharacterAffinityConfig | null = affinityStore.getConfig(characterId) ?? null;
    if (!config) {
      config = await affinityStore.loadConfig(characterId);
    }
    if (!config?.enabled) return false;
    await affinityStore.initializeFromConfig(chatId, config, { force: true });
    affinityStore.setLastRescannedMessageId(chatId, undefined);
    await affinityStore.saveState(chatId);
    return true;
  } catch (error) {
    console.error("[AffinityGreetingInit] 重置好感度失敗:", chatId, error);
    return false;
  }
}
