import { db, DB_STORES } from "@/db/database";
import type {
  SelfHostedSyncDeletedEntityRecord,
  SelfHostedSyncEntityType,
} from "@/types/selfHostedSync";

const DELETED_ENTITIES_KEY = "self-hosted-sync-deleted-entities";
const SELF_HOSTED_PUSH_DEBOUNCE_MS = 1500;
const SELF_HOSTED_PUSH_MIN_INTERVAL_MS = 5000;

interface DeletedEntitiesState {
  id: string;
  records: SelfHostedSyncDeletedEntityRecord[];
}

let autoSyncSuppressionDepth = 0;
let hasPendingLocalChanges = false;
let scheduledAutoSyncTimer: ReturnType<typeof setTimeout> | null = null;
let scheduledAutoSyncInFlight: Promise<void> | null = null;
let lastScheduledAutoSyncAt = 0;

function clearScheduledAutoSyncTimer(): void {
  if (scheduledAutoSyncTimer) {
    clearTimeout(scheduledAutoSyncTimer);
    scheduledAutoSyncTimer = null;
  }
}

function queueScheduledSelfHostedAutoSync(delayMs = SELF_HOSTED_PUSH_DEBOUNCE_MS): void {
  clearScheduledAutoSyncTimer();
  scheduledAutoSyncTimer = setTimeout(() => {
    scheduledAutoSyncTimer = null;
    void runScheduledSelfHostedAutoSync();
  }, delayMs);
}

export async function loadDeletedEntities(): Promise<SelfHostedSyncDeletedEntityRecord[]> {
  await db.init();
  const state = await db.get<DeletedEntitiesState>(
    DB_STORES.APP_SETTINGS,
    DELETED_ENTITIES_KEY,
  );
  return Array.isArray(state?.records) ? state.records : [];
}

export async function saveDeletedEntities(
  records: SelfHostedSyncDeletedEntityRecord[],
): Promise<void> {
  await db.init();
  await db.put(DB_STORES.APP_SETTINGS, {
    id: DELETED_ENTITIES_KEY,
    records,
  } satisfies DeletedEntitiesState);
}

export async function recordDeletedEntity(
  record: SelfHostedSyncDeletedEntityRecord,
): Promise<void> {
  const records = await loadDeletedEntities();
  const next = records.filter(
    (item) => !(item.entityType === record.entityType && item.entityId === record.entityId),
  );
  next.push(record);
  await saveDeletedEntities(next);
}

export async function clearDeletedEntities(
  items: Array<Pick<SelfHostedSyncDeletedEntityRecord, "entityType" | "entityId">>,
): Promise<void> {
  if (items.length === 0) return;
  const records = await loadDeletedEntities();
  const next = records.filter(
    (record) =>
      !items.some(
        (item) => item.entityType === record.entityType && item.entityId === record.entityId,
      ),
  );
  if (next.length === records.length) return;
  await saveDeletedEntities(next);
}

export async function clearDeletedEntitiesByType(
  entityType: SelfHostedSyncEntityType,
): Promise<void> {
  const records = await loadDeletedEntities();
  const next = records.filter((record) => record.entityType !== entityType);
  if (next.length === records.length) return;
  await saveDeletedEntities(next);
}

export function scheduleSelfHostedAutoSync(): void {
  // Phase 1（P2P 手動同步）：關閉自動推送，只保留 dirty 標記供未來 UI 徽章使用。
  // 保留函式本體與呼叫點，避免同時改動上百處業務程式碼。
  if (autoSyncSuppressionDepth > 0) {
    return;
  }
  hasPendingLocalChanges = true;
}

export async function runScheduledSelfHostedAutoSync(): Promise<void> {
  void autoSyncSuppressionDepth;
  void scheduledAutoSyncInFlight;
  void lastScheduledAutoSyncAt;
  void SELF_HOSTED_PUSH_MIN_INTERVAL_MS;
  clearScheduledAutoSyncTimer();
  return;
}

export async function withSuppressedSelfHostedAutoSync<T>(
  action: () => Promise<T>,
): Promise<T> {
  autoSyncSuppressionDepth += 1;
  try {
    return await action();
  } finally {
    autoSyncSuppressionDepth = Math.max(0, autoSyncSuppressionDepth - 1);
  }
}

export function hasPendingSelfHostedLocalChanges(): boolean {
  return hasPendingLocalChanges;
}

export function clearPendingSelfHostedLocalChanges(): void {
  hasPendingLocalChanges = false;
  clearScheduledAutoSyncTimer();
}
