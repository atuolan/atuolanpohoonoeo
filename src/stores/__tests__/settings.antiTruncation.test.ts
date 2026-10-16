import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";

const storage = vi.hoisted(() => ({ loadSettingsData: vi.fn(), saveSettingsData: vi.fn() }));
vi.mock("@/storage/settingsStorage", () => ({ SETTINGS_ID: "main-settings", ...storage }));

import { useSettingsStore } from "@/stores/settings";

describe("settings 防截斷開關", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    storage.loadSettingsData.mockReset();
    storage.saveSettingsData.mockReset();
  });

  it("defaults to off and toggles", () => {
    const store = useSettingsStore();
    expect(store.antiTruncation).toBe(false);
    store.toggleAntiTruncation();
    expect(store.antiTruncation).toBe(true);
  });

  it("loads and saves the flag", async () => {
    storage.loadSettingsData.mockResolvedValue({ antiTruncation: true });
    const store = useSettingsStore();
    await store.loadSettings();
    expect(store.antiTruncation).toBe(true);
    await store.saveSettings();
    expect(storage.saveSettingsData).toHaveBeenCalledWith(expect.objectContaining({ antiTruncation: true }));
  });
});
