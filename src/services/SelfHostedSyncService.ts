import { db, DB_STORES } from "@/db/database";
import { getAllQzonePosts, getSetting, saveQzonePost, saveSetting, deleteQzonePost } from "@/db/operations";
import {
  createChatRecord,
  deleteChatCascade,
  loadAllChats,
  loadChatById,
  loadChatsByCharacter,
  refreshChatDerivedMetadata,
  saveChatMetadata,
} from "@/storage/chatStorage";
import { deleteMessage, loadMessages, saveMessages } from "@/storage/chatMessageStorage";
import { loadSettingsData, saveSettingsData } from "@/storage/settingsStorage";
import {
  toSyncCharacterEnvelope,
  toSyncChatMessageEnvelope,
  toSyncChatRecordEnvelope,
  toSyncConversationSummaryEnvelope,
  toSyncDiaryEntryEnvelope,
  toSyncIdbStoreSnapshotEnvelope,
  toSyncImportantEventsLogEnvelope,
  toSyncLorebookEnvelope,
  toSyncPromptLibraryItemEnvelope,
  toSyncQZonePostEnvelope,
  toSyncQZoneSettingsEnvelope,
  toSyncSettingsFullEnvelope,
  toSyncSettingsPreferencesEnvelope,
  toSyncStickerCategoryEnvelope,
  toSyncUserDataEnvelope,
} from "@/services/selfHostedSyncMappers";
import { clearDeletedEntities, loadDeletedEntities, withSuppressedSelfHostedAutoSync } from "@/services/selfHostedSyncState";
import { useSelfHostedSyncStore } from "@/stores/selfHostedSync";
import { useSettingsStore } from "@/stores/settings";
import type {
  SelfHostedSyncEntityEnvelope,
  SelfHostedSyncPullResponse,
  SyncCharacterPayload,
  SyncChatMessagePayload,
  SyncChatRecordPayload,
  SyncConversationSummaryPayload,
  SyncDiaryEntryPayload,
  SyncIdbStoreSnapshotPayload,
  SyncImportantEventsLogPayload,
  SyncLorebookPayload,
  SyncPromptLibraryItemPayload,
  SyncQZonePostPayload,
  SyncQZoneSettingsPayload,
  SyncSettingsFullPayload,
  SyncSettingsPreferencesPayload,
  SyncStickerCategoryPayload,
  SyncUserDataPayload,
} from "@/types/selfHostedSync";
import type { Chat, ChatMessage } from "@/types/chat";
import type { QZoneSettings, AutoInteractionConfig } from "@/types/qzone";
import type { StoredCharacter } from "@/types/character";
import type { Lorebook } from "@/types/worldinfo";
import type { PromptDefinition } from "@/types/promptManager";
import type { StickerCategory } from "@/types/sticker";
import type { UserData } from "@/stores/user";
import type { ImportantEventsLog } from "@/types/importantEvents";
import type { ConversationSummary, DiaryEntry } from "@/db/database";

export interface SelfHostedSyncRunResult {
  pushed: number;
  pulled: number;
  serverTime?: number;
}

interface SelfHostedPullOptions {
  forceOverwrite?: boolean;
}

export class SelfHostedSyncService {
  private static readonly ENABLE_GENERIC_STORE_SNAPSHOTS = false;

  private static readonly SNAPSHOT_STORE_NAMES = [
    DB_STORES.SETTINGS,
    DB_STORES.PROMPT_LIBRARY,
    DB_STORES.CHARACTERS,
    DB_STORES.LOREBOOKS,
    DB_STORES.THEMES,
    DB_STORES.LAYOUTS,
    DB_STORES.STICKERS,
    DB_STORES.IMPORTANT_EVENTS,
    DB_STORES.SUMMARIES,
    DB_STORES.DIARIES,
    DB_STORES.HOLIDAY_RECORDS,
    DB_STORES.CALENDAR_EVENTS,
    DB_STORES.AUTH_STATE,
    DB_STORES.GAME_STATES,
    DB_STORES.PENDING_CALLS,
    DB_STORES.CALL_HISTORY,
    DB_STORES.RENDERER_RULES,
    DB_STORES.BOOKS,
    DB_STORES.BOOK_PROGRESS,
    DB_STORES.CHAT_AFFINITY_STATES,
    DB_STORES.CHARACTER_AFFECTIONS,
    DB_STORES.PEEK_PHONE_DATA,
    DB_STORES.APP_SETTINGS,
  ] as const;

  private static readonly EXCLUDED_APP_SETTINGS_IDS = new Set<string>([
    "main-settings",
    "self-hosted-sync-settings",
    "self-hosted-sync-deleted-entities",
  ]);

  async pushAll(): Promise<SelfHostedSyncRunResult> {
    const syncStore = useSelfHostedSyncStore();
    await syncStore.loadSettings();
    await syncStore.ensureDeviceId();

    syncStore.markSyncStarted();

    try {
      const client = syncStore.createClient();
      const items = await this.collectPushItems();
      const response = await client.pushItems({
        deviceId: syncStore.deviceId,
        items,
      });
      await clearDeletedEntities(
        items
          .filter((item) => item.deletedAt !== null)
          .map((item) => ({ entityType: item.entityType, entityId: item.entityId })),
      );
      await syncStore.markSyncSucceeded(response.serverTime);
      return {
        pushed: response.accepted,
        pulled: 0,
        serverTime: response.serverTime,
      };
    } catch (error) {
      await syncStore.markSyncFailed(error);
      throw error;
    }
  }

  async pullAll(
    since?: number,
    options?: SelfHostedPullOptions,
  ): Promise<SelfHostedSyncRunResult> {
    const syncStore = useSelfHostedSyncStore();
    await syncStore.loadSettings();

    syncStore.markSyncStarted();

    try {
      const client = syncStore.createClient();
      const response = await client.pullItems(since);
      const applied = await this.applyPullResponse(response, options);
      await syncStore.markSyncSucceeded(response.serverTime);
      return {
        pushed: 0,
        pulled: applied,
        serverTime: response.serverTime,
      };
    } catch (error) {
      await syncStore.markSyncFailed(error);
      throw error;
    }
  }

  async syncNow(): Promise<SelfHostedSyncRunResult> {
    const syncStore = useSelfHostedSyncStore();
    await syncStore.loadSettings();
    const previousLastSyncAt = syncStore.lastSyncAt ?? undefined;

    const pushResult = await this.pushAll();
    const pullResult = await this.pullAll(previousLastSyncAt);

    return {
      pushed: pushResult.pushed,
      pulled: pullResult.pulled,
      serverTime: pullResult.serverTime ?? pushResult.serverTime,
    };
  }

  private async collectPushItems(): Promise<SelfHostedSyncEntityEnvelope[]> {
    const items: SelfHostedSyncEntityEnvelope[] = [];

    const settings = await loadSettingsData();
    if (settings) {
      items.push(toSyncSettingsPreferencesEnvelope(settings));
      items.push(toSyncSettingsFullEnvelope(settings));
    }

    const qzoneSettings = await getSetting<QZoneSettings>("qzone-settings");
    const qzoneAutoInteraction = await getSetting<AutoInteractionConfig>(
      "qzone-auto-interaction",
    );
    const qzoneSettingsUpdatedAt = Math.max(
      settings?.updatedAt ?? 0,
      this.computeUpdatedAt(qzoneSettings),
      this.computeUpdatedAt(qzoneAutoInteraction),
    );
    if (qzoneSettings || qzoneAutoInteraction) {
      items.push(
        toSyncQZoneSettingsEnvelope(
          qzoneSettings ?? this.createDefaultQZoneSettings(),
          qzoneAutoInteraction ?? this.createDefaultQZoneAutoInteraction(),
          qzoneSettingsUpdatedAt || Date.now(),
        ),
      );
    }

    const qzonePosts = await getAllQzonePosts();
    for (const post of qzonePosts) {
      items.push(toSyncQZonePostEnvelope(post));
    }

    const characters = await db.getAll<StoredCharacter>(DB_STORES.CHARACTERS);
    for (const character of characters) {
      items.push(toSyncCharacterEnvelope(character));
    }

    const lorebooks = await db.getAll<Lorebook>(DB_STORES.LOREBOOKS);
    for (const lorebook of lorebooks) {
      items.push(toSyncLorebookEnvelope(lorebook));
    }

    const promptLibraryItems = await db.getAll<PromptDefinition>(DB_STORES.PROMPT_LIBRARY);
    for (const item of promptLibraryItems) {
      items.push(toSyncPromptLibraryItemEnvelope(item));
    }

    const stickerCategories = await db.getAll<StickerCategory>(DB_STORES.STICKERS);
    for (const category of stickerCategories) {
      items.push(toSyncStickerCategoryEnvelope(category));
    }

    const userData = await db.get<UserData>(DB_STORES.APP_SETTINGS, "user-data");
    if (userData) {
      items.push(toSyncUserDataEnvelope(userData));
    }

    const summaries = await db.getAll<ConversationSummary>(DB_STORES.SUMMARIES);
    for (const summary of summaries) {
      items.push(toSyncConversationSummaryEnvelope(summary));
    }

    const importantEventsLogs = await db.getAll<ImportantEventsLog>(DB_STORES.IMPORTANT_EVENTS);
    for (const log of importantEventsLogs) {
      items.push(toSyncImportantEventsLogEnvelope(log));
    }

    const diaries = await db.getAll<DiaryEntry>(DB_STORES.DIARIES);
    for (const diary of diaries) {
      items.push(toSyncDiaryEntryEnvelope(diary));
    }

    if (SelfHostedSyncService.ENABLE_GENERIC_STORE_SNAPSHOTS) {
      for (const storeName of SelfHostedSyncService.SNAPSHOT_STORE_NAMES) {
        const snapshot = await this.collectStoreSnapshot(storeName);
        if (snapshot) {
          items.push(snapshot);
        }
      }
    } else {
      const deletedAt = Date.now();
      for (const storeName of SelfHostedSyncService.SNAPSHOT_STORE_NAMES) {
        items.push({
          entityType: "idb_store_snapshot",
          entityId: storeName,
          schemaVersion: 1,
          updatedAt: deletedAt,
          deletedAt,
          payload: {
            storeName,
          },
        });
      }
    }

    const chats = await loadAllChats();
    for (const chat of chats) {
      items.push(toSyncChatRecordEnvelope(chat));
      const messages = await loadMessages(chat.id);
      for (const message of messages) {
        items.push(toSyncChatMessageEnvelope(chat.id, message));
      }
    }

    const deletedItems = await loadDeletedEntities();
    for (const deletedItem of deletedItems) {
      items.push({
        entityType: deletedItem.entityType,
        entityId: deletedItem.entityId,
        schemaVersion: 1,
        updatedAt: deletedItem.updatedAt,
        deletedAt: deletedItem.deletedAt,
        payload: deletedItem.payload,
      });
    }

    return items;
  }

  private async applyPullResponse(
    response: SelfHostedSyncPullResponse,
    options?: SelfHostedPullOptions,
  ): Promise<number> {
    let applied = 0;
    const forceOverwrite = options?.forceOverwrite === true;

    return withSuppressedSelfHostedAutoSync(async () => {
      const settingsItems = response.items.filter(
      (item): item is SelfHostedSyncEntityEnvelope<"settings_preferences", SyncSettingsPreferencesPayload> =>
        item.entityType === "settings_preferences" && item.deletedAt === null,
      );

      const settingsFullItems = response.items.filter(
      (item): item is SelfHostedSyncEntityEnvelope<"settings_full", SyncSettingsFullPayload> =>
        item.entityType === "settings_full" && item.deletedAt === null,
      );

      const chatRecordItems = response.items.filter(
      (item): item is SelfHostedSyncEntityEnvelope<"chat_record", SyncChatRecordPayload> =>
        item.entityType === "chat_record" && item.deletedAt === null,
      );

      const chatMessageItems = response.items.filter(
      (item): item is SelfHostedSyncEntityEnvelope<"chat_message", SyncChatMessagePayload> =>
        item.entityType === "chat_message" && item.deletedAt === null,
      );

      const qzoneSettingsItems = response.items.filter(
      (item): item is SelfHostedSyncEntityEnvelope<"qzone_settings", SyncQZoneSettingsPayload> =>
        item.entityType === "qzone_settings" && item.deletedAt === null,
      );

      const qzonePostItems = response.items.filter(
      (item): item is SelfHostedSyncEntityEnvelope<"qzone_post", SyncQZonePostPayload> =>
        item.entityType === "qzone_post" && item.deletedAt === null,
      );

      const characterItems = response.items.filter(
      (item): item is SelfHostedSyncEntityEnvelope<"character", SyncCharacterPayload> =>
        item.entityType === "character" && item.deletedAt === null,
      );

      const lorebookItems = response.items.filter(
      (item): item is SelfHostedSyncEntityEnvelope<"lorebook", SyncLorebookPayload> =>
        item.entityType === "lorebook" && item.deletedAt === null,
      );

      const promptLibraryItems = response.items.filter(
      (item): item is SelfHostedSyncEntityEnvelope<"prompt_library_item", SyncPromptLibraryItemPayload> =>
        item.entityType === "prompt_library_item" && item.deletedAt === null,
      );

      const stickerCategoryItems = response.items.filter(
      (item): item is SelfHostedSyncEntityEnvelope<"sticker_category", SyncStickerCategoryPayload> =>
        item.entityType === "sticker_category" && item.deletedAt === null,
      );

      const userDataItems = response.items.filter(
      (item): item is SelfHostedSyncEntityEnvelope<"user_data", SyncUserDataPayload> =>
        item.entityType === "user_data" && item.deletedAt === null,
      );

      const conversationSummaryItems = response.items.filter(
      (item): item is SelfHostedSyncEntityEnvelope<"conversation_summary", SyncConversationSummaryPayload> =>
        item.entityType === "conversation_summary" && item.deletedAt === null,
      );

      const importantEventsLogItems = response.items.filter(
      (item): item is SelfHostedSyncEntityEnvelope<"important_events_log", SyncImportantEventsLogPayload> =>
        item.entityType === "important_events_log" && item.deletedAt === null,
      );

      const diaryEntryItems = response.items.filter(
      (item): item is SelfHostedSyncEntityEnvelope<"diary_entry", SyncDiaryEntryPayload> =>
        item.entityType === "diary_entry" && item.deletedAt === null,
      );

      const storeSnapshotItems = SelfHostedSyncService.ENABLE_GENERIC_STORE_SNAPSHOTS
        ? response.items.filter(
        (item): item is SelfHostedSyncEntityEnvelope<"idb_store_snapshot", SyncIdbStoreSnapshotPayload> =>
          item.entityType === "idb_store_snapshot" && item.deletedAt === null,
        )
        : [];

      const deletedItems = response.items.filter(
      (item): item is SelfHostedSyncEntityEnvelope => item.deletedAt !== null,
      );

      for (const item of settingsItems) {
      const changed = await this.applySettingsPreferences(item.payload, forceOverwrite);
      if (changed) applied += 1;
      }

      for (const item of settingsFullItems) {
      const changed = await this.applySettingsFull(item.payload, forceOverwrite);
      if (changed) applied += 1;
      }

      for (const item of qzoneSettingsItems) {
      const changed = await this.applyQZoneSettings(item.payload, forceOverwrite);
      if (changed) applied += 1;
      }

      for (const item of characterItems) {
      const changed = await this.applyCharacter(item.payload, forceOverwrite);
      if (changed) applied += 1;
      }

      for (const item of lorebookItems) {
      const changed = await this.applyLorebook(item.payload, forceOverwrite);
      if (changed) applied += 1;
      }

      for (const item of promptLibraryItems) {
      const changed = await this.applyPromptLibraryItem(item.payload, forceOverwrite);
      if (changed) applied += 1;
      }

      for (const item of stickerCategoryItems) {
      const changed = await this.applyStickerCategory(item.payload, forceOverwrite);
      if (changed) applied += 1;
      }

      for (const item of userDataItems) {
      const changed = await this.applyUserData(item.payload, forceOverwrite);
      if (changed) applied += 1;
      }

      for (const item of conversationSummaryItems) {
      const changed = await this.applyConversationSummary(item.payload, forceOverwrite);
      if (changed) applied += 1;
      }

      for (const item of importantEventsLogItems) {
      const changed = await this.applyImportantEventsLog(item.payload, forceOverwrite);
      if (changed) applied += 1;
      }

      for (const item of diaryEntryItems) {
      const changed = await this.applyDiaryEntry(item.payload, forceOverwrite);
      if (changed) applied += 1;
      }

      for (const item of storeSnapshotItems) {
        const changed = await this.applyStoreSnapshot(item.payload);
        if (changed) applied += 1;
      }

      for (const item of chatRecordItems) {
      const changed = await this.applyChatRecord(item.payload, forceOverwrite);
      if (changed) applied += 1;
      }

      const affectedChatIds = new Set<string>(chatRecordItems.map((item) => item.payload.id));

      const messageGroups = new Map<string, SyncChatMessagePayload[]>();
      for (const item of chatMessageItems) {
      const group = messageGroups.get(item.payload.chatId) ?? [];
      group.push(item.payload);
      messageGroups.set(item.payload.chatId, group);
      affectedChatIds.add(item.payload.chatId);
      }

      for (const [chatId, payloads] of messageGroups) {
      const changed = await this.applyChatMessages(chatId, payloads, forceOverwrite);
      if (changed > 0) {
        applied += changed;
      }
      }

      for (const item of qzonePostItems) {
      const changed = await this.applyQZonePost(item.payload, forceOverwrite);
      if (changed) applied += 1;
      }

      for (const item of deletedItems) {
      const changed = await this.applyDeletedEntity(item, forceOverwrite);
      if (changed) applied += 1;
      }

      await this.refreshActiveChatIfAffected(affectedChatIds);

      return applied;
    });
  }

  private async applySettingsPreferences(
    payload: SyncSettingsPreferencesPayload,
    forceOverwrite = false,
  ): Promise<boolean> {
    const local = await loadSettingsData();
    if (!forceOverwrite && local && (local.updatedAt ?? 0) >= payload.updatedAt) {
      return false;
    }

    const settingsStore = useSettingsStore();
    await settingsStore.loadSettings();

    settingsStore.language = payload.language;
    settingsStore.doNotDisturb = payload.doNotDisturb;
    settingsStore.faceToFaceMode = payload.faceToFaceMode;
    settingsStore.nightMode = payload.nightMode;
    settingsStore.setCustomQuickActions(payload.customQuickActions);
    settingsStore.embeddingMode = payload.embeddingMode ?? settingsStore.embeddingMode;
    settingsStore.vectorMemoryEnabled =
      payload.vectorMemoryEnabled ?? settingsStore.vectorMemoryEnabled;
    settingsStore.nearbyPlacesLimit = payload.nearbyPlacesLimit;
    settingsStore.nearbyPlacesRadius = payload.nearbyPlacesRadius;

    await settingsStore.saveSettings();
    return true;
  }

  private async applyCharacter(
    payload: SyncCharacterPayload,
    forceOverwrite = false,
  ): Promise<boolean> {
    const existing = await db.get<StoredCharacter>(DB_STORES.CHARACTERS, payload.id);
    if (
      !forceOverwrite &&
      existing &&
      this.computeUpdatedAt(existing) >= this.computeUpdatedAt(payload)
    ) {
      return false;
    }

    await db.put(DB_STORES.CHARACTERS, JSON.parse(JSON.stringify(payload)));

    try {
      const { useCharactersStore } = await import("@/stores/characters");
      const charactersStore = useCharactersStore();
      await charactersStore.loadCharacters();
    } catch (error) {
      console.warn("[SelfHostedSyncService] 刷新角色 store 失敗:", error);
    }

    return true;
  }

  private async applyLorebook(
    payload: SyncLorebookPayload,
    forceOverwrite = false,
  ): Promise<boolean> {
    const existing = await db.get<Lorebook>(DB_STORES.LOREBOOKS, payload.id);
    if (
      !forceOverwrite &&
      existing &&
      this.computeUpdatedAt(existing) >= this.computeUpdatedAt(payload)
    ) {
      return false;
    }

    await db.put(DB_STORES.LOREBOOKS, JSON.parse(JSON.stringify(payload)));

    try {
      const { useLorebooksStore } = await import("@/stores/lorebooks");
      const lorebooksStore = useLorebooksStore();
      await lorebooksStore.loadLorebooks();
    } catch (error) {
      console.warn("[SelfHostedSyncService] 刷新世界書 store 失敗:", error);
    }

    return true;
  }

  private async applyPromptLibraryItem(
    payload: SyncPromptLibraryItemPayload,
    forceOverwrite = false,
  ): Promise<boolean> {
    const existing = await db.get<PromptDefinition>(
      DB_STORES.PROMPT_LIBRARY,
      payload.identifier,
    );
    if (!forceOverwrite && existing && JSON.stringify(existing) === JSON.stringify(payload)) {
      return false;
    }

    await db.put(
      DB_STORES.PROMPT_LIBRARY,
      JSON.parse(JSON.stringify(payload)),
      payload.identifier,
    );

    try {
      const { usePromptLibraryStore } = await import("@/stores/promptLibrary");
      const promptLibraryStore = usePromptLibraryStore();
      await promptLibraryStore.load();
    } catch (error) {
      console.warn("[SelfHostedSyncService] 刷新提示詞庫 store 失敗:", error);
    }

    return true;
  }

  private async applyStickerCategory(
    payload: SyncStickerCategoryPayload,
    forceOverwrite = false,
  ): Promise<boolean> {
    const existing = await db.get<StickerCategory>(DB_STORES.STICKERS, payload.id);
    if (!forceOverwrite && existing && JSON.stringify(existing) === JSON.stringify(payload)) {
      return false;
    }

    await db.put(DB_STORES.STICKERS, JSON.parse(JSON.stringify(payload)));

    try {
      const { useStickerStore } = await import("@/stores/sticker");
      const stickerStore = useStickerStore();
      stickerStore.initialized = false;
      await stickerStore.init();
    } catch (error) {
      console.warn("[SelfHostedSyncService] 刷新表情包 store 失敗:", error);
    }

    return true;
  }

  private async applyUserData(
    payload: SyncUserDataPayload,
    forceOverwrite = false,
  ): Promise<boolean> {
    const existing = await db.get<UserData>(DB_STORES.APP_SETTINGS, payload.id);
    if (
      !forceOverwrite &&
      existing &&
      this.computeUpdatedAt(existing) >= this.computeUpdatedAt(payload)
    ) {
      return false;
    }

    await db.put(DB_STORES.APP_SETTINGS, JSON.parse(JSON.stringify(payload)));

    try {
      const { useUserStore } = await import("@/stores/user");
      const userStore = useUserStore();
      await userStore.loadUserData();
    } catch (error) {
      console.warn("[SelfHostedSyncService] 刷新使用者資料 store 失敗:", error);
    }

    return true;
  }

  private async applyConversationSummary(
    payload: SyncConversationSummaryPayload,
    forceOverwrite = false,
  ): Promise<boolean> {
    const existing = await db.get<ConversationSummary>(DB_STORES.SUMMARIES, payload.id);
    if (
      !forceOverwrite &&
      existing &&
      this.computeUpdatedAt(existing) >= this.computeUpdatedAt(payload)
    ) {
      return false;
    }

    await db.put(DB_STORES.SUMMARIES, JSON.parse(JSON.stringify(payload)));
    return true;
  }

  private async applyImportantEventsLog(
    payload: SyncImportantEventsLogPayload,
    forceOverwrite = false,
  ): Promise<boolean> {
    const existing = await db.get<ImportantEventsLog>(DB_STORES.IMPORTANT_EVENTS, payload.id);
    if (
      !forceOverwrite &&
      existing &&
      this.computeUpdatedAt(existing) >= this.computeUpdatedAt(payload)
    ) {
      return false;
    }

    await db.put(DB_STORES.IMPORTANT_EVENTS, JSON.parse(JSON.stringify(payload)));
    return true;
  }

  private async applyDiaryEntry(
    payload: SyncDiaryEntryPayload,
    forceOverwrite = false,
  ): Promise<boolean> {
    const existing = await db.get<DiaryEntry>(DB_STORES.DIARIES, payload.id);
    if (
      !forceOverwrite &&
      existing &&
      this.computeUpdatedAt(existing) >= this.computeUpdatedAt(payload)
    ) {
      return false;
    }

    await db.put(DB_STORES.DIARIES, JSON.parse(JSON.stringify(payload)));
    return true;
  }

  private async collectStoreSnapshot(
    storeName: (typeof SelfHostedSyncService.SNAPSHOT_STORE_NAMES)[number],
  ): Promise<SelfHostedSyncEntityEnvelope | null> {
    const entries = await this.loadSnapshotEntries(storeName);
    const updatedAt = this.computeSnapshotUpdatedAt(entries);
    return toSyncIdbStoreSnapshotEnvelope(storeName, entries, updatedAt);
  }

  private async loadSnapshotEntries(
    storeName: string,
  ): Promise<SyncIdbStoreSnapshotPayload["entries"]> {
    const records = await db.getAll<unknown>(storeName);
    const keys = await db.getAllKeys(storeName);
    return records
      .map((value, index) => ({
        key: this.getRecordKey(storeName, value, keys[index]),
        value: JSON.parse(JSON.stringify(value)),
      }))
      .filter((entry) => this.shouldIncludeSnapshotEntry(storeName, entry.key, entry.value));
  }

  private shouldIncludeSnapshotEntry(storeName: string, key: string, _value: unknown): boolean {
    if (storeName !== DB_STORES.APP_SETTINGS) {
      return true;
    }

    return !SelfHostedSyncService.EXCLUDED_APP_SETTINGS_IDS.has(key);
  }

  private async applyStoreSnapshot(payload: SyncIdbStoreSnapshotPayload): Promise<boolean> {
    if (!SelfHostedSyncService.SNAPSHOT_STORE_NAMES.includes(payload.storeName as never)) {
      return false;
    }

    const currentEntries = await this.loadSnapshotEntries(payload.storeName);
    const currentHash = JSON.stringify(currentEntries);
    const incomingHash = JSON.stringify(payload.entries);
    if (currentHash === incomingHash) {
      return false;
    }

    const preservedEntries =
      payload.storeName === DB_STORES.APP_SETTINGS
        ? currentEntries.filter((entry) =>
            SelfHostedSyncService.EXCLUDED_APP_SETTINGS_IDS.has(entry.key),
          )
        : [];

    await db.clear(payload.storeName);
    for (const entry of payload.entries) {
      await this.restoreSnapshotEntry(payload.storeName, entry);
    }
    for (const entry of preservedEntries) {
      await this.restoreSnapshotEntry(payload.storeName, entry);
    }
    return true;
  }

  private async restoreSnapshotEntry(
    storeName: string,
    entry: SyncIdbStoreSnapshotPayload["entries"][number],
  ): Promise<void> {
    const value = JSON.parse(JSON.stringify(entry.value));
    if (this.storeRequiresExplicitKey(storeName)) {
      await db.put(storeName, value, entry.key);
      return;
    }

    await db.put(storeName, value);
  }

  private async applySettingsFull(
    payload: SyncSettingsFullPayload,
    forceOverwrite = false,
  ): Promise<boolean> {
    const local = await loadSettingsData();
    if (!forceOverwrite && local && (local.updatedAt ?? 0) >= payload.updatedAt) {
      return false;
    }

    await saveSettingsData(JSON.parse(JSON.stringify(payload)));

    const settingsStore = useSettingsStore();
    settingsStore.isLoaded = false;
    await settingsStore.loadSettings();
    return true;
  }

  private async applyChatRecord(
    payload: SyncChatRecordPayload,
    forceOverwrite = false,
  ): Promise<boolean> {
    const existing = await loadChatById(payload.id);
    if (!forceOverwrite && existing && (existing.updatedAt ?? 0) >= payload.updatedAt) {
      return false;
    }

    const nextChat: Chat = {
      id: payload.id,
      name: payload.name,
      characterId: payload.characterId,
      messages: existing?.messages ?? [],
      metadata: payload.metadata ?? existing?.metadata ?? {},
      createdAt: payload.createdAt,
      updatedAt: payload.updatedAt,
      isGroupChat: payload.isGroupChat,
      groupMetadata: payload.groupMetadata,
      systemPromptOverride: payload.systemPromptOverride,
      jailbreakOverride: payload.jailbreakOverride,
      enablePhoneDecision: payload.enablePhoneDecision,
      doNotDisturb: payload.doNotDisturb,
      faceToFaceMode: payload.faceToFaceMode,
      thirdPersonMode: payload.thirdPersonMode,
      enableRealTimeAwareness: payload.enableRealTimeAwareness,
      fakeTimeMode: payload.fakeTimeMode,
      fakeTimeLoop: payload.fakeTimeLoop,
      fakeTimeOffset: payload.fakeTimeOffset,
      minimaxTTSEnabled: payload.minimaxTTSEnabled,
      minimaxTTSOverride: payload.minimaxTTSOverride,
      isBranch: payload.isBranch,
      pinnedToList: payload.pinnedToList,
      summarySettings: payload.summarySettings,
      locationOverride: payload.locationOverride,
      messageCount: existing?.messageCount,
      lastMessagePreview: existing?.lastMessagePreview,
      unreadCount: existing?.unreadCount,
      appearance: existing?.appearance,
      blockState: existing?.blockState,
      charAvatarOverride: existing?.charAvatarOverride,
      userAvatarOverride: existing?.userAvatarOverride,
      coupleAvatarLibrary: existing?.coupleAvatarLibrary,
      activeCoupleAvatarId: existing?.activeCoupleAvatarId,
    };

    await saveChatMetadata(nextChat);
    await refreshChatDerivedMetadata(nextChat.id);
    return true;
  }

  private async applyChatMessages(
    chatId: string,
    incomingPayloads: SyncChatMessagePayload[],
    forceOverwrite = false,
  ): Promise<number> {
    const localMessages = await loadMessages(chatId);
    const merged = new Map<string, ChatMessage>();

    for (const message of localMessages) {
      merged.set(message.id, message);
    }

    let changed = 0;

    for (const payload of incomingPayloads) {
      const existing = merged.get(payload.id);
      if (forceOverwrite || !existing || (existing.updatedAt ?? 0) < payload.updatedAt) {
        merged.set(payload.id, this.toLocalChatMessage(payload));
        changed += 1;
      }
    }

    if (changed === 0) {
      return 0;
    }

    const nextMessages = [...merged.values()].sort(
      (a, b) => (a.createdAt || 0) - (b.createdAt || 0),
    );
    await saveMessages(chatId, nextMessages);
    await refreshChatDerivedMetadata(chatId);
    return changed;
  }

  private async applyQZoneSettings(
    payload: SyncQZoneSettingsPayload,
    forceOverwrite = false,
  ): Promise<boolean> {
    const localSettings = await getSetting<QZoneSettings>("qzone-settings");
    const localAutoInteraction = await getSetting<AutoInteractionConfig>(
      "qzone-auto-interaction",
    );
    const localUpdatedAt = Math.max(
      this.computeUpdatedAt(localSettings),
      this.computeUpdatedAt(localAutoInteraction),
    );
    if (!forceOverwrite && localUpdatedAt >= payload.updatedAt) {
      return false;
    }

    await saveSetting("qzone-settings", JSON.parse(JSON.stringify(payload.settings)));
    await saveSetting(
      "qzone-auto-interaction",
      JSON.parse(JSON.stringify(payload.autoInteractionConfig)),
    );

    try {
      const { useQzoneStore } = await import("@/stores/qzone");
      const qzoneStore = useQzoneStore();
      qzoneStore.settings = JSON.parse(JSON.stringify(payload.settings));
      qzoneStore.autoInteractionConfig = JSON.parse(
        JSON.stringify(payload.autoInteractionConfig),
      );
    } catch (error) {
      console.warn("[SelfHostedSyncService] 刷新噗浪設定 store 失敗:", error);
    }

    return true;
  }

  private async applyQZonePost(
    payload: SyncQZonePostPayload,
    forceOverwrite = false,
  ): Promise<boolean> {
    const existingPosts = await getAllQzonePosts();
    const existing = existingPosts.find((post) => post.id === payload.id);
    if (
      !forceOverwrite &&
      existing &&
      this.computeUpdatedAt(existing) >= this.computeUpdatedAt(payload)
    ) {
      return false;
    }

    await saveQzonePost(JSON.parse(JSON.stringify(payload)));

    try {
      const { useQzoneStore } = await import("@/stores/qzone");
      const qzoneStore = useQzoneStore();
      const next = qzoneStore.posts.filter((post) => post.id !== payload.id);
      next.unshift(JSON.parse(JSON.stringify(payload)));
      qzoneStore.posts = next;
    } catch (error) {
      console.warn("[SelfHostedSyncService] 刷新噗浪貼文 store 失敗:", error);
    }

    return true;
  }

  private async applyDeletedEntity(
    item: SelfHostedSyncEntityEnvelope,
    forceOverwrite = false,
  ): Promise<boolean> {
    const deletedAt = item.deletedAt ?? 0;
    switch (item.entityType) {
      case "chat_record": {
        const existing = await loadChatById(item.entityId);
        if (!existing || (!forceOverwrite && (existing.updatedAt ?? 0) > deletedAt)) {
          return false;
        }
        await deleteChatCascade(item.entityId, {
          suppressSyncDeletionRecord: true,
        });
        return true;
      }
      case "chat_message": {
        const payload = item.payload as Partial<SyncChatMessagePayload> | null;
        if (!payload?.chatId) {
          return false;
        }
        const messages = await loadMessages(payload.chatId);
        const existing = messages.find((message) => message.id === item.entityId);
        if (!existing || (!forceOverwrite && (existing.updatedAt ?? 0) > deletedAt)) {
          return false;
        }
        await deleteMessage(item.entityId, {
          chatId: payload.chatId,
          deletedAt,
          suppressSyncDeletionRecord: true,
        });
        return true;
      }
      case "qzone_post": {
        const existingPosts = await getAllQzonePosts();
        const existing = existingPosts.find((post) => post.id === item.entityId);
        if (!existing || (!forceOverwrite && this.computeUpdatedAt(existing) > deletedAt)) {
          return false;
        }
        await deleteQzonePost(item.entityId);
        return true;
      }
      case "character": {
        const existing = await db.get<StoredCharacter>(DB_STORES.CHARACTERS, item.entityId);
        if (!existing || (!forceOverwrite && this.computeUpdatedAt(existing) > deletedAt)) {
          return false;
        }
        await db.delete(DB_STORES.CHARACTERS, item.entityId);
        try {
          const { useCharactersStore } = await import("@/stores/characters");
          const charactersStore = useCharactersStore();
          await charactersStore.loadCharacters();
        } catch (error) {
          console.warn("[SelfHostedSyncService] 刪除後刷新角色 store 失敗:", error);
        }
        return true;
      }
      case "lorebook": {
        const existing = await db.get<Lorebook>(DB_STORES.LOREBOOKS, item.entityId);
        if (!existing || (!forceOverwrite && this.computeUpdatedAt(existing) > deletedAt)) {
          return false;
        }
        await db.delete(DB_STORES.LOREBOOKS, item.entityId);
        try {
          const { useLorebooksStore } = await import("@/stores/lorebooks");
          const lorebooksStore = useLorebooksStore();
          await lorebooksStore.loadLorebooks();
        } catch (error) {
          console.warn("[SelfHostedSyncService] 刪除後刷新世界書 store 失敗:", error);
        }
        return true;
      }
      case "prompt_library_item": {
        const existing = await db.get<PromptDefinition>(DB_STORES.PROMPT_LIBRARY, item.entityId);
        if (!existing) {
          return false;
        }
        await db.delete(DB_STORES.PROMPT_LIBRARY, item.entityId);
        try {
          const { usePromptLibraryStore } = await import("@/stores/promptLibrary");
          const promptLibraryStore = usePromptLibraryStore();
          await promptLibraryStore.load();
        } catch (error) {
          console.warn("[SelfHostedSyncService] 刪除後刷新提示詞庫 store 失敗:", error);
        }
        return true;
      }
      case "sticker_category": {
        const existing = await db.get<StickerCategory>(DB_STORES.STICKERS, item.entityId);
        if (!existing) {
          return false;
        }
        await db.delete(DB_STORES.STICKERS, item.entityId);
        try {
          const { useStickerStore } = await import("@/stores/sticker");
          const stickerStore = useStickerStore();
          stickerStore.initialized = false;
          await stickerStore.init();
        } catch (error) {
          console.warn("[SelfHostedSyncService] 刪除後刷新表情包 store 失敗:", error);
        }
        return true;
      }
      case "user_data": {
        const existing = await db.get<UserData>(DB_STORES.APP_SETTINGS, item.entityId);
        if (!existing || (!forceOverwrite && this.computeUpdatedAt(existing) > deletedAt)) {
          return false;
        }
        await db.delete(DB_STORES.APP_SETTINGS, item.entityId);
        try {
          const { useUserStore } = await import("@/stores/user");
          const userStore = useUserStore();
          await userStore.loadUserData();
        } catch (error) {
          console.warn("[SelfHostedSyncService] 刪除後刷新使用者資料 store 失敗:", error);
        }
        return true;
      }
      case "conversation_summary": {
        const existing = await db.get<ConversationSummary>(DB_STORES.SUMMARIES, item.entityId);
        if (!existing || (!forceOverwrite && this.computeUpdatedAt(existing) > deletedAt)) {
          return false;
        }
        await db.delete(DB_STORES.SUMMARIES, item.entityId);
        return true;
      }
      case "important_events_log": {
        const existing = await db.get<ImportantEventsLog>(DB_STORES.IMPORTANT_EVENTS, item.entityId);
        if (!existing || (!forceOverwrite && this.computeUpdatedAt(existing) > deletedAt)) {
          return false;
        }
        await db.delete(DB_STORES.IMPORTANT_EVENTS, item.entityId);
        return true;
      }
      case "diary_entry": {
        const existing = await db.get<DiaryEntry>(DB_STORES.DIARIES, item.entityId);
        if (!existing || (!forceOverwrite && this.computeUpdatedAt(existing) > deletedAt)) {
          return false;
        }
        await db.delete(DB_STORES.DIARIES, item.entityId);
        return true;
      }
      default:
        return false;
    }
  }

  private toLocalChatMessage(payload: SyncChatMessagePayload): ChatMessage {
    const { chatId: _chatId, ...message } = payload;
    return {
      ...message,
    } as ChatMessage;
  }

  private async refreshActiveChatIfAffected(
    affectedChatIds: Set<string>,
  ): Promise<void> {
    if (!affectedChatIds.size) return;

    try {
      const { useChatStore } = await import("@/stores/chat");
      const chatStore = useChatStore();
      const currentChatId = chatStore.currentChat?.id;
      if (!currentChatId || !affectedChatIds.has(currentChatId)) {
        return;
      }

      const latestChat = await loadChatById(currentChatId);
      if (!latestChat) return;

      const latestMessages = await loadMessages(currentChatId);
      chatStore.loadChat({
        ...latestChat,
        messages: latestMessages,
      });
    } catch (error) {
      console.warn("[SelfHostedSyncService] 刷新當前聊天失敗:", error);
    }
  }

  private computeUpdatedAt(value: unknown): number {
    if (!value || typeof value !== "object") {
      return 0;
    }

    const candidate = (value as Record<string, unknown>).updatedAt;
    if (typeof candidate === "number") {
      return candidate;
    }

    const timestamp = (value as Record<string, unknown>).timestamp;
    if (typeof timestamp === "number") {
      return timestamp;
    }

    return 0;
  }

  private computeSnapshotUpdatedAt(
    entries: SyncIdbStoreSnapshotPayload["entries"],
  ): number {
    let maxUpdatedAt = 0;
    for (const entry of entries) {
      maxUpdatedAt = Math.max(maxUpdatedAt, this.computeUpdatedAt(entry.value));
    }
    return maxUpdatedAt || Date.now();
  }

  private getRecordKey(
    storeName: string,
    value: unknown,
    rawKey?: IDBValidKey,
  ): string {
    if (typeof rawKey === "string") {
      return rawKey;
    }

    if (value && typeof value === "object") {
      const record = value as Record<string, unknown>;
      if (typeof record.id === "string") return record.id;
      if (typeof record.identifier === "string") return record.identifier;
      if (storeName === DB_STORES.BOOK_PROGRESS && typeof record.bookId === "string") {
        return record.bookId;
      }
      if (storeName === DB_STORES.CHAT_AFFINITY_STATES && typeof record.chatId === "string") {
        return record.chatId;
      }
      if (storeName === DB_STORES.CHARACTER_AFFECTIONS && typeof record.characterId === "string") {
        return record.characterId;
      }
    }

    return JSON.stringify(value);
  }

  private storeRequiresExplicitKey(storeName: string): boolean {
    return (
      storeName === DB_STORES.SETTINGS ||
      storeName === DB_STORES.PROMPT_LIBRARY
    );
  }

  private createDefaultQZoneSettings(): QZoneSettings {
    return {
      nickname: "",
      avatar: "",
      background: "",
      themeMode: "auto",
      autoAIReply: true,
      enableChatContext: true,
      chatContextCount: 10,
    };
  }

  private createDefaultQZoneAutoInteraction(): AutoInteractionConfig {
    return {
      enabled: false,
      postInterval: 60,
      commentInterval: 30,
      maxPostsPerDay: 5,
      maxCommentsPerDay: 20,
      characterSelection: {
        mode: "random",
        blacklist: [],
      },
      conversation: {
        mentionResponse: {
          enabled: true,
          mode: "immediate",
        },
      },
    };
  }
}

let selfHostedSyncService: SelfHostedSyncService | null = null;

export function getSelfHostedSyncService(): SelfHostedSyncService {
  if (!selfHostedSyncService) {
    selfHostedSyncService = new SelfHostedSyncService();
  }
  return selfHostedSyncService;
}
