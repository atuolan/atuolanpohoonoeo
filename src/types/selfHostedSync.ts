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

export const SELF_HOSTED_SYNC_ENTITY_TYPES = [
  "chat_record",
  "chat_message",
  "settings_preferences",
  "settings_profiles",
  "settings_full",
  "qzone_post",
  "qzone_settings",
  "character",
  "lorebook",
  "prompt_library_item",
  "sticker_category",
  "user_data",
  "conversation_summary",
  "important_events_log",
  "diary_entry",
  "idb_store_snapshot",
] as const;

export type SelfHostedSyncEntityType =
  (typeof SELF_HOSTED_SYNC_ENTITY_TYPES)[number];

export const SELF_HOSTED_SYNC_SCHEMA_VERSIONS = {
  chat_record: 1,
  chat_message: 1,
  settings_preferences: 1,
  settings_profiles: 1,
  settings_full: 1,
  qzone_post: 1,
  qzone_settings: 1,
  character: 1,
  lorebook: 1,
  prompt_library_item: 1,
  sticker_category: 1,
  user_data: 1,
  conversation_summary: 1,
  important_events_log: 1,
  diary_entry: 1,
  idb_store_snapshot: 1,
} as const;

export interface SelfHostedSyncEntityEnvelope<
  TType extends SelfHostedSyncEntityType = SelfHostedSyncEntityType,
  TPayload = unknown,
> {
  entityType: TType;
  entityId: string;
  schemaVersion: number;
  createdAt?: number;
  updatedAt: number;
  deletedAt: number | null;
  payload: TPayload;
}

export interface SelfHostedSyncPushRequest {
  deviceId: string;
  items: SelfHostedSyncEntityEnvelope[];
}

export interface SelfHostedSyncPushResponse {
  ok: boolean;
  serverTime: number;
  accepted: number;
  rejected?: Array<{
    entityType: SelfHostedSyncEntityType;
    entityId: string;
    reason: string;
  }>;
}

export interface SelfHostedSyncPullResponse {
  serverTime: number;
  items: SelfHostedSyncEntityEnvelope[];
  hasMore?: boolean;
  nextSince?: number | null;
}

export interface SelfHostedSyncLoginRequest {
  username: string;
  password: string;
  deviceId: string;
}

export interface SelfHostedSyncRegisterRequest {
  username: string;
  password: string;
  deviceId: string;
}

export interface SelfHostedSyncAuthResponse {
  accessToken: string;
  refreshToken: string;
  userId: string;
  expiresIn: number;
}

export interface SelfHostedSyncRefreshRequest {
  refreshToken: string;
  deviceId: string;
}

export interface SelfHostedSyncStatusResponse {
  ok: boolean;
  serverTime: number;
  apiVersion?: string;
  userId?: string;
}

export interface SelfHostedSyncMetaDeviceInfo {
  deviceId: string;
  lastPushAt: number | null;
  lastSeenAt: number | null;
}

export interface SelfHostedSyncMetaResponse {
  ok: boolean;
  serverTime: number;
  userId: string;
  latestUpdateAt: number | null;
  devices: SelfHostedSyncMetaDeviceInfo[];
}

export interface SelfHostedSyncHealthResponse {
  ok: boolean;
  serverTime?: number;
  version?: string;
}

export type SelfHostedSyncEntityCountMap = Partial<
  Record<SelfHostedSyncEntityType, number>
>;

export interface SelfHostedSyncContentSnapshot {
  totalActiveItems: number;
  countsByEntityType: SelfHostedSyncEntityCountMap;
  capturedAt: number;
}

export type SelfHostedSyncGuardAction = "push" | "pull";

export interface SelfHostedSyncGuardAlert {
  recommendedAction: SelfHostedSyncGuardAction;
  reason: "local_data_loss" | "remote_data_loss";
  message: string;
  localSnapshot: SelfHostedSyncContentSnapshot;
  remoteSnapshot: SelfHostedSyncContentSnapshot;
  triggeredAt: number;
}

export type LocalOnlyChatFields = Pick<Chat, "unreadCount">;

export type SyncableChatRecordSource = Omit<
  Chat,
  keyof LocalOnlyChatFields | "messages" | "messageCount" | "lastMessagePreview"
>;

export type SyncChatRecordPayload = Pick<
  SyncableChatRecordSource,
  | "id"
  | "name"
  | "characterId"
  | "createdAt"
  | "updatedAt"
  | "isGroupChat"
  | "metadata"
  | "groupMetadata"
  | "systemPromptOverride"
  | "jailbreakOverride"
  | "enablePhoneDecision"
  | "doNotDisturb"
  | "faceToFaceMode"
  | "thirdPersonMode"
  | "enableRealTimeAwareness"
  | "fakeTimeMode"
  | "fakeTimeLoop"
  | "fakeTimeOffset"
  | "minimaxTTSEnabled"
  | "minimaxTTSOverride"
  | "isBranch"
  | "pinnedToList"
  | "summarySettings"
  | "locationOverride"
>;

export interface SyncChatMessagePayload extends Omit<ChatMessage, "imageData" | "audioWaveform"> {
  chatId: string;
}

export interface SyncSettingsPreferencesPayload {
  language: "zh-TW" | "zh-CN";
  doNotDisturb: boolean;
  faceToFaceMode: boolean;
  nightMode: boolean;
  customQuickActions: Array<{
    label: string;
    text: string;
    hint: string;
  }>;
  embeddingMode?: "local" | "api";
  vectorMemoryEnabled?: boolean;
  nearbyPlacesLimit: number;
  nearbyPlacesRadius: number;
  updatedAt: number;
}

export type SyncSettingsFullPayload = SettingsData;

export type SyncQZonePostPayload = QZonePost;

export type SyncCharacterPayload = StoredCharacter;

export type SyncLorebookPayload = Lorebook;

export type SyncPromptLibraryItemPayload = PromptDefinition;

export type SyncStickerCategoryPayload = StickerCategory;

export type SyncUserDataPayload = UserData;

export type SyncConversationSummaryPayload = ConversationSummary;

export type SyncImportantEventsLogPayload = ImportantEventsLog;

export type SyncDiaryEntryPayload = DiaryEntry;

export interface SyncQZoneSettingsPayload {
  settings: QZoneSettings;
  autoInteractionConfig: AutoInteractionConfig;
  updatedAt: number;
}

export interface SyncIdbStoreSnapshotEntry {
  key: string;
  value: unknown;
}

export interface SyncIdbStoreSnapshotPayload {
  storeName: string;
  entries: SyncIdbStoreSnapshotEntry[];
  updatedAt: number;
}

export interface SelfHostedSyncDeletedEntityRecord<
  TType extends SelfHostedSyncEntityType = SelfHostedSyncEntityType,
> {
  entityType: TType;
  entityId: string;
  updatedAt: number;
  deletedAt: number;
  payload: unknown;
}

export type SelfHostedSyncChatRecordEnvelope = SelfHostedSyncEntityEnvelope<
  "chat_record",
  SyncChatRecordPayload
>;

export type SelfHostedSyncChatMessageEnvelope = SelfHostedSyncEntityEnvelope<
  "chat_message",
  SyncChatMessagePayload
>;

export type SelfHostedSyncSettingsPreferencesEnvelope = SelfHostedSyncEntityEnvelope<
  "settings_preferences",
  SyncSettingsPreferencesPayload
>;

export type SelfHostedSyncSettingsFullEnvelope = SelfHostedSyncEntityEnvelope<
  "settings_full",
  SyncSettingsFullPayload
>;

export type SelfHostedSyncQZonePostEnvelope = SelfHostedSyncEntityEnvelope<
  "qzone_post",
  SyncQZonePostPayload
>;

export type SelfHostedSyncCharacterEnvelope = SelfHostedSyncEntityEnvelope<
  "character",
  SyncCharacterPayload
>;

export type SelfHostedSyncLorebookEnvelope = SelfHostedSyncEntityEnvelope<
  "lorebook",
  SyncLorebookPayload
>;

export type SelfHostedSyncPromptLibraryItemEnvelope = SelfHostedSyncEntityEnvelope<
  "prompt_library_item",
  SyncPromptLibraryItemPayload
>;

export type SelfHostedSyncStickerCategoryEnvelope = SelfHostedSyncEntityEnvelope<
  "sticker_category",
  SyncStickerCategoryPayload
>;

export type SelfHostedSyncUserDataEnvelope = SelfHostedSyncEntityEnvelope<
  "user_data",
  SyncUserDataPayload
>;

export type SelfHostedSyncConversationSummaryEnvelope = SelfHostedSyncEntityEnvelope<
  "conversation_summary",
  SyncConversationSummaryPayload
>;

export type SelfHostedSyncImportantEventsLogEnvelope = SelfHostedSyncEntityEnvelope<
  "important_events_log",
  SyncImportantEventsLogPayload
>;

export type SelfHostedSyncDiaryEntryEnvelope = SelfHostedSyncEntityEnvelope<
  "diary_entry",
  SyncDiaryEntryPayload
>;

export type SelfHostedSyncQZoneSettingsEnvelope = SelfHostedSyncEntityEnvelope<
  "qzone_settings",
  SyncQZoneSettingsPayload
>;

export type SelfHostedSyncIdbStoreSnapshotEnvelope = SelfHostedSyncEntityEnvelope<
  "idb_store_snapshot",
  SyncIdbStoreSnapshotPayload
>;
