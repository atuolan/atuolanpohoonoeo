import { db, DB_STORES } from "@/db/database";
import type {
  SelfHostedSyncDeletedEntityRecord,
  SelfHostedSyncEntityType,
} from "@/types/selfHostedSync";

const DELETED_ENTITIES_KEY = "self-hosted-sync-deleted-entities";
const AUTO_SYNC_TIMER_MS = 5000;

interface DeletedEntitiesState {
  id: string;
  records: SelfHostedSyncDeletedEntityRecord[];
}

let pendingAutoSyncTimer: ReturnType<typeof setTimeout> | null = null;
let autoSyncInFlight: Promise<void> | null = null;
let autoSyncSuppressionDepth = 0;

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
  if (autoSyncSuppressionDepth > 0) {
    return;
  }

  if (pendingAutoSyncTimer) {
    clearTimeout(pendingAutoSyncTimer);
  }

  pendingAutoSyncTimer = setTimeout(() => {
    pendingAutoSyncTimer = null;
    void runScheduledSelfHostedAutoSync();
  }, AUTO_SYNC_TIMER_MS);
}

export async function runScheduledSelfHostedAutoSync(): Promise<void> {
  if (autoSyncInFlight) {
    return autoSyncInFlight;
  }

  autoSyncInFlight = (async () => {
    try {
      const { useSelfHostedSyncStore } = await import("@/stores/selfHostedSync");
      const syncStore = useSelfHostedSyncStore();
      await syncStore.loadSettings();
      if (!syncStore.enabled || !syncStore.isAuthenticated) {
        return;
      }
      await syncStore.syncNow();
    } catch (error) {
      console.warn("[SelfHostedSync] 自動同步失敗:", error);
    } finally {
      autoSyncInFlight = null;
    }
  })();

  return autoSyncInFlight;
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
