import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";

vi.mock("@/storage/settingsStorage", () => ({
  SETTINGS_ID: "main-settings",
  loadSettingsData: vi.fn(),
  saveSettingsData: vi.fn(),
}));

import { useSettingsStore } from "./settings";
import { createDefaultAPISettings } from "@/types/settings";
import { loadSettingsData, saveSettingsData } from "@/storage/settingsStorage";

describe("settings prompt post-processing profiles", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.useFakeTimers();
    vi.setSystemTime(new Date(1000));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("disables role tools by default", () => {
    expect(createDefaultAPISettings().toolsEnabled).toBe(false);
  });

  it("uses API defaults when switching to a legacy profile without new fields", () => {
    const store = useSettingsStore();
    store.api.promptPostProcessing = "strict";
    store.api.toolProtocol = "disabled";
    store.api.toolsEnabled = false;
    const legacy = store.createProfile("Legacy");
    delete (legacy.api as { promptPostProcessing?: unknown }).promptPostProcessing;
    delete (legacy.api as { toolProtocol?: unknown }).toolProtocol;
    delete (legacy.api as { toolsEnabled?: unknown }).toolsEnabled;

    store.api.promptPostProcessing = "merge";
    store.api.toolProtocol = "text";
    store.api.toolsEnabled = false;
    store.switchProfile(legacy.id);

    expect(store.api.promptPostProcessing).toBe("none");
    expect(store.api.toolProtocol).toBe("auto");
    expect(store.api.toolsEnabled).toBe(false);
  });

  it("keeps prompt post-processing values isolated per profile", () => {
    const store = useSettingsStore();
    store.api.promptPostProcessing = "strict_tools";
    const first = store.createProfile("Strict");

    store.api.promptPostProcessing = "single";
    vi.advanceTimersByTime(1000);
    const second = store.createProfile("Single");

    store.switchProfile(first.id);
    expect(store.api.promptPostProcessing).toBe("strict_tools");
    store.switchProfile(second.id);
    expect(store.api.promptPostProcessing).toBe("single");
  });
});

describe("settings profile management", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.mocked(loadSettingsData).mockResolvedValue(undefined as never);
    vi.mocked(saveSettingsData).mockReset();
  });

  async function loadedStore() {
    const store = useSettingsStore();
    await store.loadSettings();
    expect(store.isLoaded).toBe(true);
    return store;
  }

  function lastSavedProfiles() {
    const calls = vi.mocked(saveSettingsData).mock.calls;
    return (calls[calls.length - 1][0] as { profiles: { id: string; api: { model: string } }[] }).profiles;
  }

  it("does not write the unsaved form into the current profile unless asked", async () => {
    const store = await loadedStore();
    store.api.model = "saved-model";
    const profile = store.createProfile("Main");

    store.api.model = "draft-model";
    await store.saveSettings();
    expect(lastSavedProfiles().find((p) => p.id === profile.id)?.api.model).toBe(
      "saved-model",
    );

    await store.saveSettings({ syncProfile: true });
    expect(lastSavedProfiles().find((p) => p.id === profile.id)?.api.model).toBe(
      "draft-model",
    );
  });

  it("gives profiles created in the same millisecond distinct ids", async () => {
    const store = await loadedStore();
    const a = store.createProfile("A");
    const b = store.createProfile("B");
    const c = store.duplicateProfile(a.id);
    const d = store.addProfile("D", createDefaultAPISettings(), {});
    const ids = new Set([a.id, b.id, c?.id, d.id]);
    expect(ids.size).toBe(4);
  });

  it("inserts a duplicate right below its source without switching", async () => {
    const store = await loadedStore();
    const a = store.createProfile("A");
    const b = store.createProfile("B");
    const copy = store.duplicateProfile(a.id, "A copy");

    expect(store.profiles.map((p) => p.name)).toEqual(["A", "A copy", "B"]);
    expect(store.currentProfileId).toBe(b.id);
    expect(copy?.api).not.toBe(a.api);
  });

  it("adds imported profiles without changing the current one", async () => {
    const store = await loadedStore();
    store.api.model = "current-model";
    const current = store.createProfile("Current");

    store.addProfile(
      "Imported",
      { ...createDefaultAPISettings(), model: "imported-model" },
      { temperature: 0.3 },
    );
    await store.saveSettings({ syncProfile: true });

    expect(store.currentProfileId).toBe(current.id);
    const imported = store.profiles.find((p) => p.name === "Imported");
    expect(imported?.api.model).toBe("imported-model");
    expect(imported?.generation.temperature).toBe(0.3);
  });

  it("restores a deleted current profile to its original slot", async () => {
    const store = await loadedStore();
    const a = store.createProfile("A");
    store.api.model = "b-model";
    const b = store.createProfile("B");
    store.createProfile("C");
    store.switchProfile(b.id);

    const deleted = store.deleteProfile(b.id);
    expect(deleted).toMatchObject({ index: 1, wasCurrent: true });
    expect(store.currentProfileId).toBe(a.id);

    store.restoreProfile(deleted!);
    expect(store.profiles.map((p) => p.name)).toEqual(["A", "B", "C"]);
    expect(store.currentProfileId).toBe(b.id);
    expect(store.api.model).toBe("b-model");
  });

  it("clears optional api fields the target profile does not have", async () => {
    const store = await loadedStore();
    const plain = store.createProfile("Plain");
    store.api.customHeaders = { "X-Test": "1" };
    store.api.directConnect = true;
    store.createProfile("Custom");

    store.switchProfile(plain.id);
    expect(store.api.customHeaders).toBeUndefined();
    expect(store.api.directConnect).toBeUndefined();
  });
});
