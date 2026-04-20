import { db, DB_STORES } from "@/db/database";
import { scheduleSelfHostedAutoSync } from "@/services/selfHostedSyncState";
import type { SettingsData } from "@/stores/settings";

const SETTINGS_ID = "main-settings";

export async function loadSettingsData(): Promise<SettingsData | undefined> {
  await db.init();
  return db.get<SettingsData>(DB_STORES.APP_SETTINGS, SETTINGS_ID);
}

export async function saveSettingsData(data: SettingsData): Promise<void> {
  await db.init();
  await db.put(DB_STORES.APP_SETTINGS, data);
  scheduleSelfHostedAutoSync();
}

export { SETTINGS_ID };
