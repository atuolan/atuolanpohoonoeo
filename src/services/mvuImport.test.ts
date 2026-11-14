import { describe, expect, it } from "vitest";

import {
  detectAndConvertMvuConfig,
  inferRangeFromDescription,
  parseInitvarContent,
} from "./ImportExportService";

const entry = (comment: string, content: string, enabled = true) =>
  ({ comment, content, enabled, keys: [], extensions: {} }) as never;

describe("MVU 卡導入", () => {
  it("[值, 說明] 格式會被讀成指標，說明帶進來，範圍從說明推", () => {
    const config = detectAndConvertMvuConfig(
      [
        entry(
          "[initvar]變量初始化",
          `悠纪:
  好感度: [20, "悠紀對主角的好感，範圍0~100，被誇獎時增加"]
  心情: [0, "情緒 [-1,1]"]
  金錢: [5000, "持有的錢"]
  身份: ["學生", "目前身份"]
  $meta:
    extensible: true`,
          false,
        ),
      ],
      "c1",
    )!;
    const byName = Object.fromEntries(config.metrics.map((m) => [m.name, m]));
    expect(Object.keys(byName)).toEqual(["好感度", "心情", "金錢", "身份"]);
    expect(byName.好感度).toMatchObject({
      path: "悠纪.好感度",
      initial: 20,
      min: 0,
      max: 100,
      bounded: true,
      description: "悠紀對主角的好感，範圍0~100，被誇獎時增加",
    });
    expect(byName.心情).toMatchObject({ min: -1, max: 1, bounded: true });
    // 金錢沒寫範圍、也不像好感度 → 不夾範圍（以前會被夾成 100）
    expect(byName.金錢).toMatchObject({ initial: 5000, bounded: false });
    expect(byName.身份).toMatchObject({ type: "string", initial: "學生" });
  });

  it("卡片世界書已經有啟用的更新規則條目時，不再另外送一份", () => {
    const config = detectAndConvertMvuConfig(
      [
        entry("[initvar]", `角色:\n  好感度: 10`, false),
        entry("變量更新規則", "請在回覆最後輸出 <UpdateVariable> _.set('角色.好感度', 舊, 新); </UpdateVariable>"),
      ],
      "c1",
    )!;
    expect(config.injectRules).toBe(false);
    expect(config.injectStatus).toBe(true);
    expect(config.updateFormat).toBe("mvu");
  });

  it("多個 [initvar] 會合併，JSON5 註解也讀得懂", () => {
    const config = detectAndConvertMvuConfig(
      [
        entry("[initvar] 主角", `{ "主角": { "金幣": 10 } }`, false),
        entry("[InitVar] 女主", `{\n  // 女主角\n  "女主": { "好感度": 30, },\n}`, false),
      ],
      "c1",
    )!;
    expect(config.metrics.map((m) => m.path)).toEqual(["主角.金幣", "女主.好感度"]);
    expect(config.mvuInitialData).toEqual({ 主角: { 金幣: 10 }, 女主: { 好感度: 30 } });
  });

  it("說明裡的「每次 1-3」不會被當成範圍", () => {
    expect(inferRangeFromDescription("每次變化1-3")).toBeNull();
    expect(inferRangeFromDescription("范围 -100 到 100")).toEqual({ min: -100, max: 100 });
  });

  it("initvar 包在程式碼框裡也能讀", () => {
    expect(parseInitvarContent("```yaml\na:\n  b: 1\n```")).toEqual({ a: { b: 1 } });
  });
});
