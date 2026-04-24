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
  online?: boolean;
  /** 由 client 自動從 User-Agent 偵測的機型描述，例如「iPhone」「Pixel 7」「Windows Chrome」 */
  model?: string | null;
  /** 使用者自訂的裝置名稱，例如「客廳手機」 */
  customName?: string | null;
}

export interface SelfHostedSyncDeviceInfoUpdateRequest {
  model?: string | null;
  customName?: string | null;
}

export interface SelfHostedSyncDeviceInfoUpdateResponse {
  ok: boolean;
  device: SelfHostedSyncMetaDeviceInfo;
}

export interface SelfHostedSyncMetaResponse {
  ok: boolean;
  serverTime: number;
  userId: string;
  latestUpdateAt: number | null;
  devices: SelfHostedSyncMetaDeviceInfo[];
  onlineDeviceIds?: string[];
  onlineCount?: number;
  entityCounts?: SelfHostedSyncEntityCountMap;
  totalActiveItems?: number;
  totalDeletedItems?: number;
}

export interface SelfHostedSyncHealthResponse {
  ok: boolean;
  serverTime?: number;
  version?: string;
}

// ===== Peer-to-peer sync protocol =====

export const PEER_SYNC_SERVER_ID = "@server";

export interface PeerManifestEntry {
  entityType: SelfHostedSyncEntityType;
  entityId: string;
  updatedAt: number;
  deletedAt: number | null;
}

export interface PeerEntityRef {
  entityType: SelfHostedSyncEntityType;
  entityId: string;
}

export interface PeerManifestRequest {
  type: "peer:manifest-request";
  requestId: string;
  targetDeviceId: string;
  /**
   * 若指定，則只回傳這些類別的 entry。用來在 hash 比對後
   * 只請求有差異的類別的完整 manifest，省流量。
   */
  entityTypes?: SelfHostedSyncEntityType[];
}

export interface PeerManifestResponse {
  type: "peer:manifest-response";
  requestId: string;
  sourceDeviceId: string;
  entries: PeerManifestEntry[];
  totalCount: number;
  /** 回覆所屬的類別範圍（echo，方便呼叫端確認） */
  entityTypes?: SelfHostedSyncEntityType[];
}

/** 每個 entityType 的完整快照指紋（hash 僅依 entityId + updatedAt + deletedAt 組成） */
export interface PeerBucketHash {
  entityType: SelfHostedSyncEntityType;
  count: number;
  hash: string;
}

export interface PeerHashRequest {
  type: "peer:hash-request";
  requestId: string;
  targetDeviceId: string;
}

export interface PeerHashResponse {
  type: "peer:hash-response";
  requestId: string;
  sourceDeviceId: string;
  buckets: PeerBucketHash[];
  /** 全域總和指紋（可在 buckets 都比對完之後再用來做健全性檢查） */
  rootHash: string;
  totalCount: number;
}

export interface PeerFetchRequest {
  type: "peer:fetch-request";
  requestId: string;
  targetDeviceId: string;
  entityRefs: PeerEntityRef[];
  cursor?: number | null;
}

export interface PeerFetchResponse {
  type: "peer:fetch-response";
  requestId: string;
  sourceDeviceId: string;
  envelopes: SelfHostedSyncEntityEnvelope[];
  hasMore: boolean;
  nextCursor: number | null;
}

export interface PeerApplyRequest {
  type: "peer:apply-request";
  requestId: string;
  targetDeviceId: string;
  envelopes: SelfHostedSyncEntityEnvelope[];
  mode?: "overwrite";
}

export interface PeerApplyResponse {
  type: "peer:apply-response";
  requestId: string;
  sourceDeviceId: string;
  applied: number;
  rejected: Array<{
    entityType: SelfHostedSyncEntityType | string;
    entityId: string;
    reason: string;
  }>;
  serverTime?: number;
}

export interface PeerErrorMessage {
  type: "peer:error";
  requestId: string | null;
  reason: string;
  detail?: unknown;
}

export type PeerMessage =
  | PeerHashRequest
  | PeerHashResponse
  | PeerManifestRequest
  | PeerManifestResponse
  | PeerFetchRequest
  | PeerFetchResponse
  | PeerApplyRequest
  | PeerApplyResponse
  | PeerErrorMessage;

export interface PeerSyncDiff {
  // 本機獨有（對方沒有）
  onlyLocal: PeerManifestEntry[];
  // 對方獨有（本機沒有）
  onlyRemote: PeerManifestEntry[];
  // 兩側都有但 updatedAt 不同
  conflicts: Array<{
    local: PeerManifestEntry;
    remote: PeerManifestEntry;
  }>;
  // 兩側完全一致（數量統計用）
  identicalCount: number;
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
