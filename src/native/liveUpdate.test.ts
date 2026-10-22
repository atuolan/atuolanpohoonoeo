/// <reference types="vitest/globals" />

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { nextTick, reactive } from "vue";

const generation = reactive({ hasActiveGeneration: false });
const updater = {
  list: vi.fn(),
  current: vi.fn(),
  download: vi.fn(),
  set: vi.fn(),
  delete: vi.fn(),
};
const showUpdateReadyHint = vi.fn();
const showFloatingToast = vi.fn();

vi.mock("@capacitor/app", () => ({
  App: { getInfo: async () => ({ build: "9" }) },
}));
vi.mock("@capacitor/core", () => ({
  CapacitorHttp: {
    get: async () => ({
      status: 200,
      data: { version: "new", minNativeBuild: 1, files: [{ file_name: "index.html", file_hash: "aa" }] },
    }),
  },
}));
vi.mock("@capgo/capacitor-updater", () => ({ CapacitorUpdater: updater }));
vi.mock("@/stores/aiGeneration", () => ({ useAIGenerationStore: () => generation }));
vi.mock("@/utils/floatingToast", () => ({ showFloatingToast }));
vi.mock("./platform", () => ({ LIVE_UPDATE_ORIGINS: ["https://example.test"] }));
vi.mock("./webVersion", () => ({ readWebVersion: async () => "old" }));
vi.mock("./updateReadyHint", () => ({ showUpdateReadyHint }));

const bundle = { id: "b1", version: "new", downloaded: "", checksum: "", status: "pending" };

function stubBrowser(page: string | null) {
  const store = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => store.set(k, v),
    removeItem: (k: string) => store.delete(k),
  });
  vi.stubGlobal("window", { history: { state: page === null ? null : { __aguaphone: true, page } } });
  vi.stubGlobal("document", { visibilityState: "visible" });
}

async function loadModule() {
  vi.resetModules();
  return import("./liveUpdate");
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(0);
  generation.hasActiveGeneration = false;
  updater.list.mockResolvedValue({ bundles: [] });
  updater.current.mockResolvedValue({ bundle: { id: "builtin" } });
  updater.download.mockResolvedValue(bundle);
  updater.set.mockResolvedValue(undefined);
  updater.delete.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("checkForLiveUpdate 下載好之後", () => {
  it("剛開 App、停在主畫面、沒在生成：直接換上", async () => {
    stubBrowser(null);
    const { checkForLiveUpdate } = await loadModule();
    vi.setSystemTime(20_000);
    await checkForLiveUpdate();
    expect(updater.set).toHaveBeenCalledWith({ id: "b1" });
    expect(showUpdateReadyHint).not.toHaveBeenCalled();
  });

  it("已經進了別的頁面：不換，跳提示；點了才換", async () => {
    stubBrowser("chat");
    const { checkForLiveUpdate } = await loadModule();
    await checkForLiveUpdate();
    expect(updater.set).not.toHaveBeenCalled();
    expect(showUpdateReadyHint).toHaveBeenCalledTimes(1);

    showUpdateReadyHint.mock.calls[0][0]();
    await Promise.resolve();
    expect(updater.set).toHaveBeenCalledWith({ id: "b1" });
  });

  it("開 App 超過 30 秒才下載好：就算在主畫面也只跳提示", async () => {
    stubBrowser("home");
    const { checkForLiveUpdate } = await loadModule();
    vi.setSystemTime(31_000);
    await checkForLiveUpdate();
    expect(updater.set).not.toHaveBeenCalled();
    expect(showUpdateReadyHint).toHaveBeenCalledTimes(1);
  });

  it("生成中：先不提示，等回完才跳", async () => {
    stubBrowser("home");
    generation.hasActiveGeneration = true;
    const { checkForLiveUpdate } = await loadModule();
    await checkForLiveUpdate();
    expect(updater.set).not.toHaveBeenCalled();
    expect(showUpdateReadyHint).not.toHaveBeenCalled();

    generation.hasActiveGeneration = false;
    await nextTick();
    expect(showUpdateReadyHint).toHaveBeenCalledTimes(1);
  });

  it("點提示時剛好又在生成：不換，回完再提示一次", async () => {
    stubBrowser("chat");
    const { checkForLiveUpdate } = await loadModule();
    await checkForLiveUpdate();
    generation.hasActiveGeneration = true;
    showUpdateReadyHint.mock.calls[0][0]();
    expect(updater.set).not.toHaveBeenCalled();
    expect(showFloatingToast).toHaveBeenCalled();

    generation.hasActiveGeneration = false;
    await nextTick();
    expect(showUpdateReadyHint).toHaveBeenCalledTimes(2);
  });

  it("同一版回前景再檢查不重複提示", async () => {
    stubBrowser("chat");
    const { checkForLiveUpdate } = await loadModule();
    await checkForLiveUpdate();
    updater.list.mockResolvedValue({ bundles: [bundle] });
    await checkForLiveUpdate();
    expect(updater.download).toHaveBeenCalledTimes(1);
    expect(showUpdateReadyHint).toHaveBeenCalledTimes(1);
  });
});
