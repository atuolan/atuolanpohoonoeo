import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";

vi.mock("@/storage/settingsStorage", () => ({
  SETTINGS_ID: "main-settings",
  loadSettingsData: vi.fn(),
  saveSettingsData: vi.fn(),
}));

import { useSettingsStore } from "./settings";

describe("settings prompt post-processing profiles", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.useFakeTimers();
    vi.setSystemTime(new Date(1000));
  });

  afterEach(() => {
    vi.useRealTimers();
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
    expect(store.api.toolsEnabled).toBe(true);
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
