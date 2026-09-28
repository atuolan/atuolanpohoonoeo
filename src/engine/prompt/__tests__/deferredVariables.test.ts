import { describe, expect, it, vi } from "vitest";
import { MacroEngine } from "@/engine/macros/MacroEngine";
import { resolveDeferredVariables } from "@/engine/prompt/deferredVariables";

type Msg = { role: string; content: string };

function createVarEngine() {
  const local = new Map<string, string>();
  const engine = new MacroEngine();
  engine.setContext({ charName: "涅芙", userName: "勇者" });
  engine.registerVarMacros(
    {
      getLocal: (name) => local.get(name) ?? "",
      setLocal: (name, value) => void local.set(name, value),
      addLocal: () => {},
      incLocal: () => "",
      decLocal: () => "",
      getGlobal: () => "",
      setGlobal: () => {},
      addGlobal: () => {},
      incGlobal: () => "",
      decGlobal: () => "",
    },
    () => "f2f",
  );
  const readVariable = async (name: string) => {
    const value = await engine.substitute(`{{getvar::${name}}}`);
    return value ? engine.substitute(value) : "";
  };
  return { engine, local, readVariable };
}

describe("resolveDeferredVariables", () => {
  it("上方條目可以讀到下方條目 setvar 的值（getvar 讀不到）", async () => {
    const { engine, readVariable } = createVarEngine();
    // 依條目順序展開宏，與 PromptBuilder 相同
    const entries = [
      "對白語言：{{getvar::對白語言}}／延後：{{延後讀取::對白語言}}",
      "{{setvar::對白語言::日文}}",
    ];
    const messages: Msg[] = [];
    for (const entry of entries) {
      messages.push({ role: "system", content: await engine.substitute(entry) });
    }

    const resolved = await resolveDeferredVariables(messages, readVariable);
    expect(resolved[0].content).toBe("對白語言：／延後：日文");
  });

  it("變量值裡的宏會再展開", async () => {
    const { local, readVariable } = createVarEngine();
    local.set("f2f__視角", "以{{user}}的視角看{{char}}");
    const resolved = await resolveDeferredVariables(
      [{ role: "system", content: "{{延後讀取::視角}}" }],
      readVariable,
    );
    expect(resolved[0].content).toBe("以勇者的視角看涅芙");
  });

  it("未設定的變量替換為空字串，名稱前後空白會忽略", async () => {
    const { engine, readVariable } = createVarEngine();
    await engine.substitute("{{setvar::轉述::開}}");
    const resolved = await resolveDeferredVariables(
      [{ role: "user", content: "[{{延後讀取:: 轉述 }}][{{延後讀取::不存在}}]" }],
      readVariable,
    );
    expect(resolved[0].content).toBe("[開][]");
  });

  it("沒有佔位符的訊息原樣保留，相同變量只讀一次", async () => {
    const read = vi.fn(async () => "值");
    const plain: Msg = { role: "system", content: "無佔位符" };
    const resolved = await resolveDeferredVariables(
      [plain, { role: "user", content: "{{延後讀取::a}}{{延後讀取::a}}" }],
      read,
    );
    expect(resolved[0]).toBe(plain);
    expect(resolved[1].content).toBe("值值");
    expect(read).toHaveBeenCalledTimes(1);
  });
});
