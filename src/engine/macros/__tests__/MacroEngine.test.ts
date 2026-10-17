import { describe, expect, it } from "vitest";
import { MacroEngine } from "@/engine/macros/MacroEngine";

function createEngine() {
  const local = new Map<string, string>();
  const engine = new MacroEngine();
  engine.setContext({
    charName: "阿瓜",
    userName: "小明",
    customVariables: { lastUserMessage: "早安", userPersona: "學生" },
  });
  engine.registerVarMacros(
    {
      getLocal: (name) => local.get(name) ?? "",
      setLocal: (name, value) => void local.set(name, value),
      addLocal: (name, value) => void local.set(name, (local.get(name) ?? "") + value),
      incLocal: () => "",
      decLocal: () => "",
      getGlobal: () => "",
      setGlobal: () => {},
      addGlobal: () => {},
      incGlobal: () => "",
      decGlobal: () => "",
    },
    () => "online",
  );
  return { engine, local };
}

describe("MacroEngine 巢狀宏", () => {
  it("setvar 的值裡有 {{user}}／{{char}} 時先展開，不會把後半段漏到正文", async () => {
    const { engine, local } = createEngine();
    const out = await engine.substitute("{{setvar::視角::以「我」指稱 {{user}}，看著{{char}}}}{{trim}}X");
    expect(out).toBe("X");
    expect(local.get("online__視角")).toBe("以「我」指稱 小明，看著阿瓜");
  });

  it("多行的 setvar 值完整保存，後面的 getvar 讀得到", async () => {
    const { engine } = createEngine();
    const out = await engine.substitute(
      "{{setvar::字數::\n{{char}}【訊息數量】\n- 簡單回應：1-2 條訊息}}\n\n{{getvar::字數}}",
    );
    expect(out).toBe("\n\n\n阿瓜【訊息數量】\n- 簡單回應：1-2 條訊息");
  });

  it("依文字順序執行：前面的 setvar 先生效，後面的 getvar 才讀", async () => {
    const { engine } = createEngine();
    const out = await engine.substitute("[{{getvar::a}}]{{setvar::a::{{user}}的}}[{{getvar::a}}]");
    expect(out).toBe("[][小明的]");
  });

  it("addvar 累加帶巢狀宏的值", async () => {
    const { engine, local } = createEngine();
    await engine.substitute("{{addvar::主調::拉扯|}}{{addvar::主調::{{char}}曖昧|}}");
    expect(local.get("online__主調")).toBe("拉扯|阿瓜曖昧|");
  });

  it("替換值裡的 $& 等符號原樣保留", async () => {
    const { engine } = createEngine();
    engine.setContext({ customVariables: { lastUserMessage: "價格 $& 與 $1" } });
    expect(await engine.substitute("<{{lastUserMessage}}>")).toBe("<價格 $& 與 $1>");
  });
});

describe("MacroEngine 名稱與無效寫法", () => {
  it("宏名稱不分大小寫", async () => {
    const { engine } = createEngine();
    expect(await engine.substitute("{{lastusermessage}}／{{USER}}／{{userpersona}}")).toBe("早安／小明／學生");
  });

  it("未註冊的宏原樣保留（含裡面的巢狀宏）", async () => {
    const { engine } = createEngine();
    expect(await engine.substitute("{{延後讀取::視角}}{{未知::{{user}}}}")).toBe(
      "{{延後讀取::視角}}{{未知::{{user}}}}",
    );
  });

  it("不是宏的大括號、沒有收尾的大括號都原樣保留，不影響後面的宏", async () => {
    const { engine } = createEngine();
    expect(await engine.substitute("{{#if x}}{{user}}{{/if}} {{roll 1d6}} {{ 未收尾 {{char}}")).toBe(
      "{{#if x}}小明{{/if}} {{roll 1d6}} {{ 未收尾 阿瓜",
    );
  });

  it("同一個宏出現多次都會替換", async () => {
    const { engine } = createEngine();
    expect(await engine.substitute("{{user}}、{{user}}、{{char}}")).toBe("小明、小明、阿瓜");
  });
});
