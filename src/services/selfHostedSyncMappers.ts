import type { Chat, ChatMessage } from "@/types/chat";
import type { SettingsData } from "@/stores/settings";
import type { AutoInteractionConfig, QZonePost, QZoneSettings } from "@/types/qzone";
import type { StoredCharacter } from "@/types/character";
import type { Lorebook } from "@/types/worldinfo";
import type { PromptDefinition } from "@/types/promptManager";
import type { StickerCategory } from "@/types/sticker";
import type { UserData } from "@/stores/user";
import type { ImportantEventsLog } from "@/types/importantEvents";
import type { ConversationSummary, DiaryEntry } from "@/db/database";
import {
  SELF_HOSTED_SYNC_SCHEMA_VERSIONS,
  type SelfHostedSyncCharacterEnvelope,
  type SelfHostedSyncConversationSummaryEnvelope,
  type SelfHostedSyncChatMessageEnvelope,
  type SelfHostedSyncChatRecordEnvelope,
  type SelfHostedSyncDiaryEntryEnvelope,
  type SelfHostedSyncIdbStoreSnapshotEnvelope,
  type SelfHostedSyncImportantEventsLogEnvelope,
  type SelfHostedSyncLorebookEnvelope,
  type SelfHostedSyncPromptLibraryItemEnvelope,
  type SelfHostedSyncQZonePostEnvelope,
  type SelfHostedSyncQZoneSettingsEnvelope,
  type SelfHostedSyncSettingsFullEnvelope,
  type SelfHostedSyncSettingsPreferencesEnvelope,
  type SelfHostedSyncStickerCategoryEnvelope,
  type SelfHostedSyncUserDataEnvelope,
  type SyncCharacterPayload,
  type SyncConversationSummaryPayload,
  type SyncChatMessagePayload,
  type SyncableChatRecordSource,
  type SyncChatRecordPayload,
  type SyncDiaryEntryPayload,
  type SyncIdbStoreSnapshotPayload,
  type SyncImportantEventsLogPayload,
  type SyncLorebookPayload,
  type SyncPromptLibraryItemPayload,
  type SyncQZoneSettingsPayload,
  type SyncSettingsPreferencesPayload,
  type SyncStickerCategoryPayload,
  type SyncUserDataPayload,
} from "@/types/selfHostedSync";

export function toSyncChatRecordPayload(chat: SyncableChatRecordSource): SyncChatRecordPayload {
  return {
    id: chat.id,
    name: chat.name,
    characterId: chat.characterId,
    createdAt: chat.createdAt,
    updatedAt: chat.updatedAt,
    isGroupChat: chat.isGroupChat,
    metadata: chat.metadata,
    groupMetadata: chat.groupMetadata,
    systemPromptOverride: chat.systemPromptOverride,
    jailbreakOverride: chat.jailbreakOverride,
    enablePhoneDecision: chat.enablePhoneDecision,
    doNotDisturb: chat.doNotDisturb,
    faceToFaceMode: chat.faceToFaceMode,
    thirdPersonMode: chat.thirdPersonMode,
    enableRealTimeAwareness: chat.enableRealTimeAwareness,
    fakeTimeMode: chat.fakeTimeMode,
    fakeTimeLoop: chat.fakeTimeLoop,
    fakeTimeOffset: chat.fakeTimeOffset,
    minimaxTTSEnabled: chat.minimaxTTSEnabled,
    imageSearchEnabled: chat.imageSearchEnabled,
    minimaxTTSOverride: chat.minimaxTTSOverride,
    isBranch: chat.isBranch,
    pinnedToList: chat.pinnedToList,
    summarySettings: chat.summarySettings,
    locationOverride: chat.locationOverride,
    charAvatarOverride: chat.charAvatarOverride,
    userAvatarOverride: chat.userAvatarOverride,
    coupleAvatarLibrary: chat.coupleAvatarLibrary,
    activeCoupleAvatarId: chat.activeCoupleAvatarId,
  };
}

export function toSyncChatRecordEnvelope(
  chat: SyncableChatRecordSource,
  options?: { deletedAt?: number | null },
): SelfHostedSyncChatRecordEnvelope {
  return {
    entityType: "chat_record",
    entityId: chat.id,
    schemaVersion: SELF_HOSTED_SYNC_SCHEMA_VERSIONS.chat_record,
    createdAt: chat.createdAt,
    updatedAt: chat.updatedAt,
    deletedAt: options?.deletedAt ?? null,
    payload: toSyncChatRecordPayload(chat),
  };
}

export function toSyncChatMessagePayload(
  chatId: string,
  message: ChatMessage,
): SyncChatMessagePayload {
  const { imageData: _imageData, audioWaveform: _audioWaveform, ...rest } = message;
  return {
    ...rest,
    chatId,
  };
}

export function toSyncChatMessageEnvelope(
  chatId: string,
  message: ChatMessage,
  options?: { deletedAt?: number | null },
): SelfHostedSyncChatMessageEnvelope {
  return {
    entityType: "chat_message",
    entityId: message.id,
    schemaVersion: SELF_HOSTED_SYNC_SCHEMA_VERSIONS.chat_message,
    createdAt: message.createdAt,
    updatedAt: message.updatedAt,
    deletedAt: options?.deletedAt ?? null,
    payload: toSyncChatMessagePayload(chatId, message),
  };
}

export function toSyncSettingsPreferencesPayload(
  settings: SettingsData,
): SyncSettingsPreferencesPayload {
  return {
    language: settings.language,
    doNotDisturb: settings.doNotDisturb,
    faceToFaceMode: settings.faceToFaceMode,
    nightMode: settings.nightMode,
    customQuickActions: settings.customQuickActions.map((item) => ({
      label: item.label,
      text: item.text,
      hint: item.hint,
    })),
    embeddingMode: settings.embeddingMode,
    vectorMemoryEnabled: settings.vectorMemoryEnabled,
    nearbyPlacesLimit: settings.nearbyPlacesLimit,
    nearbyPlacesRadius: settings.nearbyPlacesRadius,
    updatedAt: settings.updatedAt,
  };
}

export function toSyncSettingsPreferencesEnvelope(
  settings: SettingsData,
): SelfHostedSyncSettingsPreferencesEnvelope {
  return {
    entityType: "settings_preferences",
    entityId: settings.id,
    schemaVersion: SELF_HOSTED_SYNC_SCHEMA_VERSIONS.settings_preferences,
    updatedAt: settings.updatedAt,
    deletedAt: null,
    payload: toSyncSettingsPreferencesPayload(settings),
  };
}

export function toSyncSettingsFullEnvelope(
  settings: SettingsData,
): SelfHostedSyncSettingsFullEnvelope {
  return {
    entityType: "settings_full",
    entityId: settings.id,
    schemaVersion: SELF_HOSTED_SYNC_SCHEMA_VERSIONS.settings_full,
    updatedAt: settings.updatedAt,
    deletedAt: null,
    payload: JSON.parse(JSON.stringify(settings)),
  };
}

export function toSyncQZonePostEnvelope(
  post: QZonePost,
  options?: { deletedAt?: number | null },
): SelfHostedSyncQZonePostEnvelope {
  return {
    entityType: "qzone_post",
    entityId: post.id,
    schemaVersion: SELF_HOSTED_SYNC_SCHEMA_VERSIONS.qzone_post,
    createdAt: post.timestamp,
    updatedAt: post.timestamp,
    deletedAt: options?.deletedAt ?? null,
    payload: JSON.parse(JSON.stringify(post)),
  };
}

export function toSyncCharacterPayload(
  character: StoredCharacter,
): SyncCharacterPayload {
  return JSON.parse(JSON.stringify(character));
}

export function toSyncCharacterEnvelope(
  character: StoredCharacter,
  options?: { deletedAt?: number | null },
): SelfHostedSyncCharacterEnvelope {
  return {
    entityType: "character",
    entityId: character.id,
    schemaVersion: SELF_HOSTED_SYNC_SCHEMA_VERSIONS.character,
    createdAt: character.createdAt,
    updatedAt: character.updatedAt,
    deletedAt: options?.deletedAt ?? null,
    payload: toSyncCharacterPayload(character),
  };
}

export function toSyncLorebookPayload(lorebook: Lorebook): SyncLorebookPayload {
  return JSON.parse(JSON.stringify(lorebook));
}

export function toSyncLorebookEnvelope(
  lorebook: Lorebook,
  options?: { deletedAt?: number | null },
): SelfHostedSyncLorebookEnvelope {
  return {
    entityType: "lorebook",
    entityId: lorebook.id,
    schemaVersion: SELF_HOSTED_SYNC_SCHEMA_VERSIONS.lorebook,
    createdAt: lorebook.createdAt,
    updatedAt: lorebook.updatedAt,
    deletedAt: options?.deletedAt ?? null,
    payload: toSyncLorebookPayload(lorebook),
  };
}

export function toSyncPromptLibraryItemPayload(
  item: PromptDefinition,
): SyncPromptLibraryItemPayload {
  return JSON.parse(JSON.stringify(item));
}

export function toSyncPromptLibraryItemEnvelope(
  item: PromptDefinition,
  options?: { deletedAt?: number | null },
): SelfHostedSyncPromptLibraryItemEnvelope {
  return {
    entityType: "prompt_library_item",
    entityId: item.identifier,
    schemaVersion: SELF_HOSTED_SYNC_SCHEMA_VERSIONS.prompt_library_item,
    updatedAt: Date.now(),
    deletedAt: options?.deletedAt ?? null,
    payload: toSyncPromptLibraryItemPayload(item),
  };
}

export function toSyncStickerCategoryPayload(
  category: StickerCategory,
): SyncStickerCategoryPayload {
  return JSON.parse(JSON.stringify(category));
}

export function toSyncStickerCategoryEnvelope(
  category: StickerCategory,
  options?: { deletedAt?: number | null },
): SelfHostedSyncStickerCategoryEnvelope {
  return {
    entityType: "sticker_category",
    entityId: category.id,
    schemaVersion: SELF_HOSTED_SYNC_SCHEMA_VERSIONS.sticker_category,
    updatedAt: Date.now(),
    deletedAt: options?.deletedAt ?? null,
    payload: toSyncStickerCategoryPayload(category),
  };
}

export function toSyncUserDataPayload(userData: UserData): SyncUserDataPayload {
  return JSON.parse(JSON.stringify(userData));
}

export function toSyncUserDataEnvelope(
  userData: UserData,
  options?: { deletedAt?: number | null },
): SelfHostedSyncUserDataEnvelope {
  return {
    entityType: "user_data",
    entityId: userData.id,
    schemaVersion: SELF_HOSTED_SYNC_SCHEMA_VERSIONS.user_data,
    updatedAt: userData.updatedAt,
    deletedAt: options?.deletedAt ?? null,
    payload: toSyncUserDataPayload(userData),
  };
}

export function toSyncConversationSummaryPayload(
  summary: ConversationSummary,
): SyncConversationSummaryPayload {
  return JSON.parse(JSON.stringify(summary));
}

export function toSyncConversationSummaryEnvelope(
  summary: ConversationSummary,
  options?: { deletedAt?: number | null },
): SelfHostedSyncConversationSummaryEnvelope {
  return {
    entityType: "conversation_summary",
    entityId: summary.id,
    schemaVersion: SELF_HOSTED_SYNC_SCHEMA_VERSIONS.conversation_summary,
    createdAt: summary.createdAt,
    updatedAt: summary.updatedAt ?? summary.createdAt ?? Date.now(),
    deletedAt: options?.deletedAt ?? null,
    payload: toSyncConversationSummaryPayload(summary),
  };
}

export function toSyncImportantEventsLogPayload(
  log: ImportantEventsLog,
): SyncImportantEventsLogPayload {
  return JSON.parse(JSON.stringify(log));
}

export function toSyncImportantEventsLogEnvelope(
  log: ImportantEventsLog,
  options?: { deletedAt?: number | null },
): SelfHostedSyncImportantEventsLogEnvelope {
  return {
    entityType: "important_events_log",
    entityId: log.id,
    schemaVersion: SELF_HOSTED_SYNC_SCHEMA_VERSIONS.important_events_log,
    createdAt: log.createdAt,
    updatedAt: log.updatedAt ?? log.createdAt ?? Date.now(),
    deletedAt: options?.deletedAt ?? null,
    payload: toSyncImportantEventsLogPayload(log),
  };
}

export function toSyncDiaryEntryPayload(diary: DiaryEntry): SyncDiaryEntryPayload {
  return JSON.parse(JSON.stringify(diary));
}

export function toSyncDiaryEntryEnvelope(
  diary: DiaryEntry,
  options?: { deletedAt?: number | null },
): SelfHostedSyncDiaryEntryEnvelope {
  return {
    entityType: "diary_entry",
    entityId: diary.id,
    schemaVersion: SELF_HOSTED_SYNC_SCHEMA_VERSIONS.diary_entry,
    createdAt: diary.createdAt,
    updatedAt: diary.updatedAt ?? diary.createdAt ?? Date.now(),
    deletedAt: options?.deletedAt ?? null,
    payload: toSyncDiaryEntryPayload(diary),
  };
}

export function toSyncQZoneSettingsPayload(
  settings: QZoneSettings,
  autoInteractionConfig: AutoInteractionConfig,
  updatedAt: number,
): SyncQZoneSettingsPayload {
  return {
    settings: JSON.parse(JSON.stringify(settings)),
    autoInteractionConfig: JSON.parse(JSON.stringify(autoInteractionConfig)),
    updatedAt,
  };
}

export function toSyncQZoneSettingsEnvelope(
  settings: QZoneSettings,
  autoInteractionConfig: AutoInteractionConfig,
  updatedAt: number,
): SelfHostedSyncQZoneSettingsEnvelope {
  return {
    entityType: "qzone_settings",
    entityId: "qzone-settings",
    schemaVersion: SELF_HOSTED_SYNC_SCHEMA_VERSIONS.qzone_settings,
    updatedAt,
    deletedAt: null,
    payload: toSyncQZoneSettingsPayload(settings, autoInteractionConfig, updatedAt),
  };
}

export function toSyncIdbStoreSnapshotEnvelope(
  storeName: string,
  entries: SyncIdbStoreSnapshotPayload["entries"],
  updatedAt: number,
): SelfHostedSyncIdbStoreSnapshotEnvelope {
  return {
    entityType: "idb_store_snapshot",
    entityId: storeName,
    schemaVersion: SELF_HOSTED_SYNC_SCHEMA_VERSIONS.idb_store_snapshot,
    updatedAt,
    deletedAt: null,
    payload: {
      storeName,
      entries: JSON.parse(JSON.stringify(entries)),
      updatedAt,
    },
  };
}
