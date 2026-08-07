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

  it("uses none when switching to a legacy profile without a mode", () => {
    const store = useSettingsStore();
    store.api.promptPostProcessing = "strict";
    const legacy = store.createProfile("Legacy");
    delete (legacy.api as { promptPostProcessing?: unknown }).promptPostProcessing;

    store.api.promptPostProcessing = "merge";
    store.switchProfile(legacy.id);

    expect(store.api.promptPostProcessing).toBe("none");
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
