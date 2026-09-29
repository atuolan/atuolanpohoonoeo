import { describe, expect, it } from "vitest";
import type { F2FPanelLayout, F2FPanelModule } from "@/types/f2fPanel";
import {
  activeOptionIds,
  applyModuleSelection,
  applyStyle,
  buildEnabledMap,
  deriveModuleSelection,
  describeStyleImpact,
  entryOwners,
  findActiveStyleId,
  nextSelection,
  pruneStyles,
  reconcileLayout,
  styleMatches,
} from "./f2fPanelEngine";

const single: F2FPanelModule = {
  id: "style",
  title: "文學風格",
  mode: "single",
  allowNone: false,
  options: [
    { id: "a", label: "A", entries: ["e1"] },
    { id: "b", label: "B", entries: ["e2"] },
  ],
};

const multi: F2FPanelModule = {
  id: "tone",
  title: "文學主調",
  mode: "multi",
  allowNone: false,
  options: [
    { id: "x", label: "X", entries: ["t1"] },
    { id: "y", label: "Y", entries: ["t2"] },
  ],
};

// 「英文」「日文」共用「外語必開」條目
const linked: F2FPanelModule = {
  id: "dialogue",
  title: "對白外語",
  mode: "single",
  allowNone: true,
  options: [
    { id: "en", label: "英文", entries: ["en", "need"] },
    { id: "ja", label: "日文", entries: ["ja", "need"] },
  ],
};

const ALL_IDS = ["e1", "e2", "t1", "t2", "en", "ja", "need"];
function on(...ids: string[]) {
  return new Map(ALL_IDS.map((id) => [id, ids.includes(id)]));
}

const layout: F2FPanelLayout = {
  version: 1,
  modules: [single, multi, linked],
  styles: [
    { id: "s1", name: "風格一", desc: "", selections: { style: ["b"], tone: ["x", "y"] } },
    { id: "s2", name: "風格二", desc: "", selections: { style: ["a"] } },
  ],
};

describe("buildEnabledMap", () => {
  it("以 identifier 對應啟用狀態", () => {
    const map = buildEnabledMap([
      { identifier: "e1", enabled: true },
      { identifier: "e2", enabled: false },
    ]);
    expect(map.get("e1")).toBe(true);
    expect(map.get("e2")).toBe(false);
  });
});

describe("deriveModuleSelection", () => {
  it("單選：只開一個選項時為 matched", () => {
    expect(deriveModuleSelection(single, on("e1"))).toEqual({ status: "matched", optionIds: ["a"] });
  });
  it("單選：同時開兩個選項時為 manual", () => {
    expect(deriveModuleSelection(single, on("e1", "e2"))).toEqual({ status: "manual" });
  });
  it("單選：全部關閉時為 matched 空陣列", () => {
    expect(deriveModuleSelection(single, on())).toEqual({ status: "matched", optionIds: [] });
  });
  it("複選：列出所有開啟的選項", () => {
    expect(deriveModuleSelection(multi, on("t1", "t2"))).toEqual({ status: "matched", optionIds: ["x", "y"] });
  });
  it("連動選項：所有條目都開才算選中", () => {
    expect(deriveModuleSelection(linked, on("en", "need"))).toEqual({ status: "matched", optionIds: ["en"] });
  });
  it("連動選項：只開了共用條目時為 manual", () => {
    expect(deriveModuleSelection(linked, on("need"))).toEqual({ status: "manual" });
  });
});

describe("activeOptionIds", () => {
  it("列出條目全開的選項，不論是否符合單選規則", () => {
    expect(activeOptionIds(single, on("e1", "e2"))).toEqual(["a", "b"]);
  });
});

describe("applyModuleSelection", () => {
  it("單選：選中的開、其餘關", () => {
    expect(applyModuleSelection(single, ["b"])).toEqual({ e1: false, e2: true });
  });
  it("連動：共用條目跟著開", () => {
    expect(applyModuleSelection(linked, ["ja"])).toEqual({ en: false, ja: true, need: true });
  });
  it("空選擇：模塊內全部關閉", () => {
    expect(applyModuleSelection(linked, [])).toEqual({ en: false, ja: false, need: false });
  });
});

describe("nextSelection", () => {
  it("單選：點別的選項會切換", () => {
    expect(nextSelection(single, ["a"], "b")).toEqual(["b"]);
  });
  it("單選且不允許不選：點已選的保持不變", () => {
    expect(nextSelection(single, ["a"], "a")).toEqual(["a"]);
  });
  it("單選且允許不選：點已選的取消", () => {
    expect(nextSelection(linked, ["en"], "en")).toEqual([]);
  });
  it("單選：手動調整成多個時，點其中一個只留它", () => {
    expect(nextSelection(single, ["a", "b"], "a")).toEqual(["a"]);
  });
  it("複選：切換加入與移除", () => {
    expect(nextSelection(multi, ["x"], "y")).toEqual(["x", "y"]);
    expect(nextSelection(multi, ["x", "y"], "x")).toEqual(["y"]);
  });
});

describe("reconcileLayout", () => {
  it("主條目不存在時移除整個選項，並計算失效數量", () => {
    const existing = new Set(["e1", "t1", "t2", "en", "need"]);
    const { layout: result, staleCount } = reconcileLayout(layout, existing);
    expect(result.modules[0].options.map((o) => o.id)).toEqual(["a"]);
    // 「日文」的主條目 ja 不在了；即使共用的 need 還在，也不能留下只含 need 的選項
    expect(result.modules[2].options.map((o) => o.id)).toEqual(["en"]);
    expect(staleCount).toBe(2); // e2、ja
  });

  it("只有連動條目不存在時保留選項，移除該連動條目", () => {
    const existing = new Set(ALL_IDS.filter((id) => id !== "need"));
    const { layout: result, staleCount } = reconcileLayout(layout, existing);
    expect(result.modules[2].options).toEqual([
      { id: "en", label: "英文", entries: ["en"] },
      { id: "ja", label: "日文", entries: ["ja"] },
    ]);
    expect(staleCount).toBe(2);
  });

  it("模塊即使變空也保留", () => {
    const { layout: result } = reconcileLayout(layout, new Set(["t1", "t2"]));
    expect(result.modules.map((m) => m.id)).toEqual(["style", "tone", "dialogue"]);
    expect(result.modules[0].options).toEqual([]);
  });

  it("風格只保留仍存在的選項；某模塊的選擇全部失效時移除該模塊，風格變空時移除風格", () => {
    const { layout: result } = reconcileLayout(layout, new Set(["e1", "t1", "t2"]));
    // s1 的 style:["b"] 失效 → 移除 style；tone 保留
    expect(result.styles.find((s) => s.id === "s1")!.selections).toEqual({ tone: ["x", "y"] });
    // s2 的 style:["a"] 仍有效
    expect(result.styles.find((s) => s.id === "s2")!.selections).toEqual({ style: ["a"] });

    const { layout: empty } = reconcileLayout(layout, new Set(["t1"]));
    expect(empty.styles.map((s) => s.id)).toEqual(["s1"]);
    expect(empty.styles[0].selections).toEqual({ tone: ["x"] });
  });

  it("保留風格中刻意的空選擇（代表全部關閉）", () => {
    const withNone: F2FPanelLayout = {
      ...layout,
      styles: [{ id: "n", name: "無外語", desc: "", selections: { dialogue: [] } }],
    };
    const { layout: result } = reconcileLayout(withNone, new Set(ALL_IDS));
    expect(result.styles[0].selections).toEqual({ dialogue: [] });
  });
});

describe("風格", () => {
  it("applyStyle 只改風格包含的模塊", () => {
    expect(applyStyle(layout, layout.styles[0])).toEqual({ e1: false, e2: true, t1: true, t2: true });
  });
  it("styleMatches：包含的模塊全部符合才算", () => {
    expect(styleMatches(layout, layout.styles[0], on("e2", "t1", "t2", "en", "need"))).toBe(true);
    expect(styleMatches(layout, layout.styles[0], on("e2", "t1"))).toBe(false);
  });
  it("styleMatches：模塊為手動調整時不符合", () => {
    expect(styleMatches(layout, layout.styles[1], on("e1", "e2"))).toBe(false);
  });
  it("findActiveStyleId 回傳第一個符合的風格", () => {
    expect(findActiveStyleId(layout, on("e1"))).toBe("s2");
    expect(findActiveStyleId(layout, on("e1", "e2"))).toBeNull();
  });
});

describe("entryOwners", () => {
  it("回傳條目所屬模塊", () => {
    const owners = entryOwners(layout);
    expect(owners.get("e2")).toBe("style");
    expect(owners.get("need")).toBe("dialogue");
    expect(owners.has("unknown")).toBe(false);
  });
});

describe("reconcileLayout：一個條目只屬於一個模塊", () => {
  it("後面模塊中已被前面模塊佔用的條目會被移除；主條目被佔用時移除整個選項", () => {
    const duplicated: F2FPanelLayout = {
      version: 1,
      modules: [
        { id: "m1", title: "一", mode: "single", allowNone: false, options: [{ id: "a", label: "A", entries: ["e1"] }] },
        {
          id: "m2",
          title: "二",
          mode: "single",
          allowNone: false,
          options: [
            { id: "b", label: "B", entries: ["e1"] },
            { id: "c", label: "C", entries: ["e2", "e1"] },
          ],
        },
      ],
      styles: [],
    };
    const { layout: result, staleCount } = reconcileLayout(duplicated, new Set(["e1", "e2"]));
    expect(result.modules[0].options).toEqual([{ id: "a", label: "A", entries: ["e1"] }]);
    expect(result.modules[1].options).toEqual([{ id: "c", label: "C", entries: ["e2"] }]);
    expect(staleCount).toBe(2);
  });

  it("同一模塊內的選項仍可共用條目", () => {
    const { layout: result, staleCount } = reconcileLayout(layout, new Set(ALL_IDS));
    expect(result.modules[2].options).toEqual(linked.options);
    expect(staleCount).toBe(0);
  });
});

describe("pruneStyles / describeStyleImpact", () => {
  it("模塊移除選項後，列出選擇被刪減的風格", () => {
    const edited: F2FPanelModule = { ...single, options: [single.options[0]] }; // 移除 b
    const pruned = pruneStyles([edited, multi, linked], layout.styles);
    expect(pruned.find((s) => s.id === "s1")!.selections).toEqual({ tone: ["x", "y"] });
    expect(pruned.find((s) => s.id === "s2")!.selections).toEqual({ style: ["a"] });
    expect(describeStyleImpact(layout.styles, pruned)).toEqual({ changed: ["風格一"], removed: [] });
  });

  it("模塊被刪除後，只控制該模塊的風格會被移除", () => {
    const pruned = pruneStyles([multi, linked], layout.styles);
    expect(pruned.map((s) => s.id)).toEqual(["s1"]);
    expect(describeStyleImpact(layout.styles, pruned)).toEqual({ changed: ["風格一"], removed: ["風格二"] });
  });

  it("沒有變化時回報空清單", () => {
    expect(describeStyleImpact(layout.styles, pruneStyles(layout.modules, layout.styles))).toEqual({
      changed: [],
      removed: [],
    });
  });
});
