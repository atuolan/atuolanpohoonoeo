import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";

const storage = new Map<string, unknown>();

vi.mock("@/db/database", () => ({
  DB_STORES: { SETTINGS: "settings" },
  db: {
    init: vi.fn(async () => {}),
    get: vi.fn(async (_store: string, key: string) => storage.get(key)),
    put: vi.fn(async (_store: string, value: unknown, key: string) => {
      storage.set(key, value);
    }),
  },
}));

import { DEFAULT_F2F_PANEL_LAYOUT } from "@/data/faceToFacePanelLayout";
import { createDefaultPromptManagerConfig, DEFAULT_FACE_TO_FACE_PROMPT_ORDER } from "@/types/promptManager";
import { reconcileLayout } from "@/utils/f2fPanelEngine";
import { FACE_TO_FACE_PROMPT_RESET_VERSION, usePromptManagerStore } from "./promptManager";

const STYLE_ADAPTIVE = "f2f_custom_1790012658550";
const STYLE_PLAIN = "f2f_custom_1790012658590";

function currentConfig() {
  const config = createDefaultPromptManagerConfig();
  config.faceToFacePromptResetVersion = FACE_TO_FACE_PROMPT_RESET_VERSION;
  return config;
}

async function loadedStore() {
  const store = usePromptManagerStore();
  await store.loadConfig();
  return store;
}

describe("面對面設定面板：載入與遷移", () => {
  beforeEach(() => {
    storage.clear();
    setActivePinia(createPinia());
  });

  it("新用戶預設就有內建面板配置", async () => {
    const store = await loadedStore();
    expect(store.faceToFacePanelLayout).toEqual(DEFAULT_F2F_PANEL_LAYOUT);
  });

  it("舊設定沒有面板配置時補上預設配置，並一次性關閉舊人稱 marker", async () => {
    const config = currentConfig();
    delete config.faceToFacePanelLayout;
    config.faceToFacePromptOrder = structuredClone(DEFAULT_FACE_TO_FACE_PROMPT_ORDER).map((e) =>
      e.identifier === "f2fNarrativePerson" ? { ...e, enabled: true } : e,
    );
    storage.set("promptManagerConfig", config);

    const store = await loadedStore();

    expect(store.config.faceToFacePanelLayout).toEqual(DEFAULT_F2F_PANEL_LAYOUT);
    const marker = store.config.faceToFacePromptOrder!.find((e) => e.identifier === "f2fNarrativePerson");
    expect(marker?.enabled).toBe(false);
  });

  it("已有面板配置時不再改動人稱 marker", async () => {
    const config = currentConfig();
    config.faceToFacePromptOrder = structuredClone(DEFAULT_FACE_TO_FACE_PROMPT_ORDER).map((e) =>
      e.identifier === "f2fNarrativePerson" ? { ...e, enabled: true } : e,
    );
    storage.set("promptManagerConfig", config);

    const store = await loadedStore();

    const marker = store.config.faceToFacePromptOrder!.find((e) => e.identifier === "f2fNarrativePerson");
    expect(marker?.enabled).toBe(true);
  });

  it("面板配置格式錯誤時改用內建配置", async () => {
    const config = currentConfig();
    (config as { faceToFacePanelLayout?: unknown }).faceToFacePanelLayout = { version: 99 };
    storage.set("promptManagerConfig", config);

    const store = await loadedStore();

    expect(store.faceToFacePanelLayout).toEqual(DEFAULT_F2F_PANEL_LAYOUT);
  });
});

describe("面對面設定面板：寫入", () => {
  beforeEach(() => {
    storage.clear();
    setActivePinia(createPinia());
  });

  it("setFaceToFacePromptStates 一次寫入多個條目並存檔", async () => {
    const store = await loadedStore();

    await store.setFaceToFacePromptStates({ [STYLE_ADAPTIVE]: false, [STYLE_PLAIN]: true, not_exist: true });

    const order = store.faceToFacePromptOrder;
    expect(order.find((e) => e.identifier === STYLE_ADAPTIVE)?.enabled).toBe(false);
    expect(order.find((e) => e.identifier === STYLE_PLAIN)?.enabled).toBe(true);
    expect(order.some((e) => e.identifier === "not_exist")).toBe(false);
    const saved = storage.get("promptManagerConfig") as { faceToFacePromptOrder: { identifier: string; enabled: boolean }[] };
    expect(saved.faceToFacePromptOrder.find((e) => e.identifier === STYLE_PLAIN)?.enabled).toBe(true);
  });

  it("saveFaceToFacePanelLayout 儲存配置", async () => {
    const store = await loadedStore();
    const layout = { version: 1 as const, modules: [], styles: [] };

    await store.saveFaceToFacePanelLayout(layout);

    expect(store.faceToFacePanelLayout).toEqual(layout);
    expect((storage.get("promptManagerConfig") as { faceToFacePanelLayout: unknown }).faceToFacePanelLayout).toEqual(layout);
  });

  it("重置面對面提示詞時一併重置面板配置", async () => {
    const store = await loadedStore();
    await store.saveFaceToFacePanelLayout({ version: 1, modules: [], styles: [] });

    await store.resetFaceToFaceToDefault();

    expect(store.faceToFacePanelLayout).toEqual(DEFAULT_F2F_PANEL_LAYOUT);
  });
});

describe("面對面設定面板：匯入", () => {
  beforeEach(() => {
    storage.clear();
    setActivePinia(createPinia());
  });

  const prompt = (identifier: string) => ({ identifier, name: identifier, role: "system", content: "x" });

  it("匯入帶 aguaphone_panel 的 JSON 時採用其配置", async () => {
    const store = await loadedStore();

    const result = await store.importPromptsForModeFromJson("faceToFace", {
      prompts: [prompt("a"), prompt("b")],
      aguaphone_panel: {
        version: 1,
        modules: [{ id: "m", title: "M", mode: "single", options: [{ id: "o", label: "A", entries: ["a"] }] }],
        styles: [],
      },
    });

    expect(result.success).toBe(true);
    expect(store.faceToFacePanelLayout.modules.map((m) => m.id)).toEqual(["m"]);
    expect(store.faceToFacePanelLayout.modules[0].allowNone).toBe(false);
  });

  it("匯入不帶面板配置的 JSON 時採用內建配置，重新載入後模塊仍對得上", async () => {
    const store = await loadedStore();

    await store.importPromptsForModeFromJson("faceToFace", {
      prompts: [prompt(STYLE_ADAPTIVE), prompt(STYLE_PLAIN), prompt("other")],
    });
    await store.loadConfig();

    expect(store.faceToFacePanelLayout).toEqual(DEFAULT_F2F_PANEL_LAYOUT);
    const existingIds = new Set(store.faceToFacePromptOrder.map((e) => e.identifier));
    expect(
      reconcileLayout(store.faceToFacePanelLayout, existingIds).layout.modules.every(
        (m) => m.options.length > 0,
      ),
    ).toBe(true);
  });

  it("匯入其他模式時不動面板配置", async () => {
    const store = await loadedStore();

    await store.importPromptsForModeFromJson("diary", { prompts: [prompt("d")] });

    expect(store.faceToFacePanelLayout).toEqual(DEFAULT_F2F_PANEL_LAYOUT);
  });
});
