import { describe, expect, it } from "vitest";
import { parseF2FPanelLayout } from "@/types/f2fPanel";
import { DEFAULT_FACE_TO_FACE_PROMPT_ORDER, FACE_TO_FACE_PROMPT_DEFINITIONS } from "@/types/promptManager";
import { buildEnabledMap, deriveModuleSelection, moduleEntryIds } from "@/utils/f2fPanelEngine";
import { DEFAULT_F2F_PANEL_LAYOUT } from "./faceToFacePanelLayout";

describe("內建面對面面板配置", () => {
  it("通過 schema 驗證", () => {
    expect(parseF2FPanelLayout(DEFAULT_F2F_PANEL_LAYOUT)).toEqual(DEFAULT_F2F_PANEL_LAYOUT);
  });

  it("引用的條目都存在於預設條目與預設順序", () => {
    const defIds = new Set(FACE_TO_FACE_PROMPT_DEFINITIONS.map((p) => p.identifier));
    const orderIds = new Set(DEFAULT_FACE_TO_FACE_PROMPT_ORDER.map((e) => e.identifier));
    for (const module of DEFAULT_F2F_PANEL_LAYOUT.modules) {
      for (const id of moduleEntryIds(module)) {
        expect(defIds.has(id), `${module.id}: ${id}`).toBe(true);
        expect(orderIds.has(id), `${module.id}: ${id}`).toBe(true);
      }
    }
  });

  it("一個條目只屬於一個模塊", () => {
    const seen = new Map<string, string>();
    for (const module of DEFAULT_F2F_PANEL_LAYOUT.modules) {
      for (const id of moduleEntryIds(module)) {
        expect(seen.get(id), `${id} 同時在 ${seen.get(id)} 與 ${module.id}`).toBeUndefined();
        seen.set(id, module.id);
      }
    }
  });

  it("風格引用的模塊與選項都存在", () => {
    for (const style of DEFAULT_F2F_PANEL_LAYOUT.styles) {
      for (const [moduleId, optionIds] of Object.entries(style.selections)) {
        const module = DEFAULT_F2F_PANEL_LAYOUT.modules.find((m) => m.id === moduleId);
        expect(module, `${style.name}: ${moduleId}`).toBeDefined();
        for (const optionId of optionIds) {
          expect(module!.options.some((o) => o.id === optionId), `${style.name}: ${moduleId}.${optionId}`).toBe(true);
        }
      }
    }
  });

  it("預設開關狀態下，每個模塊都能反推出明確選擇（不是手動調整）", () => {
    const enabled = buildEnabledMap(DEFAULT_FACE_TO_FACE_PROMPT_ORDER);
    for (const module of DEFAULT_F2F_PANEL_LAYOUT.modules) {
      expect(deriveModuleSelection(module, enabled).status, module.id).toBe("matched");
    }
  });

  it("預設順序關閉舊的人稱 marker", () => {
    const entry = DEFAULT_FACE_TO_FACE_PROMPT_ORDER.find((e) => e.identifier === "f2fNarrativePerson");
    expect(entry?.enabled).toBe(false);
  });
});
