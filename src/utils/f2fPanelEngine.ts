/**
 * 面對面設定面板的純邏輯
 *
 * - 面板配置只存結構；條目開關永遠以 faceToFacePromptOrder 為準
 * - reconcileLayout：把配置和現有條目對齊，條目被刪除時自動略過
 * - deriveModuleSelection：從條目開關反推模塊選擇（對不上時為「手動調整」）
 * - applyModuleSelection / applyStyle：產生要寫回的條目開關
 */
import type { F2FPanelLayout, F2FPanelModule, F2FPanelStyle } from "@/types/f2fPanel";
import type { PromptOrderEntry } from "@/types/promptManager";

/** identifier → 是否啟用 */
export type EnabledMap = Map<string, boolean>;
/** identifier → 要寫入的啟用狀態 */
export type StateChanges = Record<string, boolean>;
export type ModuleSelection = { status: "matched"; optionIds: string[] } | { status: "manual" };

export function buildEnabledMap(order: PromptOrderEntry[]): EnabledMap {
  return new Map(order.map((entry) => [entry.identifier, entry.enabled]));
}

/** 模塊涉及的所有條目（去重） */
export function moduleEntryIds(module: F2FPanelModule): string[] {
  return [...new Set(module.options.flatMap((option) => option.entries))];
}

/** 條目全部開啟的選項，不檢查單選規則 */
export function activeOptionIds(module: F2FPanelModule, enabled: EnabledMap): string[] {
  return module.options
    .filter((option) => option.entries.every((id) => enabled.get(id) === true))
    .map((option) => option.id);
}

export function deriveModuleSelection(module: F2FPanelModule, enabled: EnabledMap): ModuleSelection {
  const activeIds = activeOptionIds(module, enabled);
  const covered = new Set(
    module.options.filter((option) => activeIds.includes(option.id)).flatMap((option) => option.entries),
  );
  // 有條目開著、卻不屬於任何選中的選項 → 使用者手動改過
  const hasUncovered = moduleEntryIds(module).some((id) => enabled.get(id) === true && !covered.has(id));
  if (hasUncovered) return { status: "manual" };
  if (module.mode === "single" && activeIds.length > 1) return { status: "manual" };
  return { status: "matched", optionIds: activeIds };
}

/** 選中的選項涉及的條目開啟，模塊內其餘條目關閉 */
export function applyModuleSelection(module: F2FPanelModule, optionIds: string[]): StateChanges {
  const turnOn = new Set(
    module.options.filter((option) => optionIds.includes(option.id)).flatMap((option) => option.entries),
  );
  return Object.fromEntries(moduleEntryIds(module).map((id) => [id, turnOn.has(id)]));
}

/** 點擊某選項後的新選擇 */
export function nextSelection(module: F2FPanelModule, current: string[], optionId: string): string[] {
  const selected = current.includes(optionId);
  if (module.mode === "single") {
    if (selected && current.length === 1) return module.allowNone ? [] : current;
    return [optionId];
  }
  return selected ? current.filter((id) => id !== optionId) : [...current, optionId];
}

/**
 * 把配置和現有條目對齊：移除失效條目、失效選項與失效的風格選擇；模塊本身即使變空也保留
 *
 * 選項的第一個條目是主條目：主條目不存在時整個選項移除；
 * 只有連動條目不存在時保留選項、移除該連動條目。
 * （否則「日文＋外語必開」的日文被刪後，會剩下只含「外語必開」的選項，和其他外語選項互相衝突）
 */
export function reconcileLayout(
  layout: F2FPanelLayout,
  existingIds: Set<string>,
): { layout: F2FPanelLayout; staleCount: number } {
  let staleCount = 0;
  const modules = layout.modules.map((module) => {
    const options = module.options.flatMap((option) => {
      const entries = option.entries.filter((id) => existingIds.has(id));
      staleCount += option.entries.length - entries.length;
      return existingIds.has(option.entries[0]) ? [{ ...option, entries }] : [];
    });
    return { ...module, options };
  });

  const optionIdsByModule = new Map(modules.map((module) => [module.id, new Set(module.options.map((o) => o.id))]));
  const styles = layout.styles.flatMap((style) => {
    const selections: Record<string, string[]> = {};
    for (const [moduleId, optionIds] of Object.entries(style.selections)) {
      const validIds = optionIdsByModule.get(moduleId);
      if (!validIds) continue;
      const kept = optionIds.filter((id) => validIds.has(id));
      // 原本有選、卻全部失效：這個模塊的選擇已沒有意義；原本就是空選擇（全部關閉）則保留
      if (kept.length === 0 && optionIds.length > 0) continue;
      selections[moduleId] = kept;
    }
    return Object.keys(selections).length > 0 ? [{ ...style, selections }] : [];
  });

  return { layout: { ...layout, modules, styles }, staleCount };
}

export function applyStyle(layout: F2FPanelLayout, style: F2FPanelStyle): StateChanges {
  const changes: StateChanges = {};
  for (const module of layout.modules) {
    const optionIds = style.selections[module.id];
    if (optionIds) Object.assign(changes, applyModuleSelection(module, optionIds));
  }
  return changes;
}

function sameIds(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((id) => b.includes(id));
}

export function styleMatches(layout: F2FPanelLayout, style: F2FPanelStyle, enabled: EnabledMap): boolean {
  const moduleIds = Object.keys(style.selections);
  if (moduleIds.length === 0) return false;
  return moduleIds.every((moduleId) => {
    const module = layout.modules.find((m) => m.id === moduleId);
    if (!module) return false;
    const selection = deriveModuleSelection(module, enabled);
    return selection.status === "matched" && sameIds(selection.optionIds, style.selections[moduleId]);
  });
}

export function findActiveStyleId(layout: F2FPanelLayout, enabled: EnabledMap): string | null {
  return layout.styles.find((style) => styleMatches(layout, style, enabled))?.id ?? null;
}

/** identifier → 所屬 moduleId */
export function entryOwners(layout: F2FPanelLayout): Map<string, string> {
  const owners = new Map<string, string>();
  for (const module of layout.modules) {
    for (const id of moduleEntryIds(module)) owners.set(id, module.id);
  }
  return owners;
}

export function createPanelId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

/** 去掉 Vue 響應式代理的深拷貝（structuredClone 無法複製 Proxy） */
export function clonePlain<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
