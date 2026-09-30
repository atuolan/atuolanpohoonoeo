import { describe, expect, it } from "vitest";
import {
  GLOBAL_SCOPE_PREFIX,
  boostCSSSpecificity,
  scopeCSS,
  splitSelectorList,
  splitTopLevelBlocks,
} from "../cssScoping";

const P = GLOBAL_SCOPE_PREFIX;

describe("splitSelectorList", () => {
  it("只在頂層逗號切開", () => {
    expect(splitSelectorList(".a, .b")).toEqual([".a", " .b"]);
  });

  it("括號、方括號、字串內的逗號不切", () => {
    expect(splitSelectorList(":is(.a, .b) .c")).toEqual([":is(.a, .b) .c"]);
    expect(splitSelectorList(".x:not(.a, .b), .y")).toEqual([
      ".x:not(.a, .b)",
      " .y",
    ]);
    expect(splitSelectorList('[data-tags="a,b"]')).toEqual([
      '[data-tags="a,b"]',
    ]);
  });
});

describe("splitTopLevelBlocks", () => {
  it("字串裡的大括號不影響分塊", () => {
    expect(
      splitTopLevelBlocks('.a::before { content: "}"; }\n.b { color: red; }'),
    ).toEqual(['.a::before { content: "}"; }', ".b { color: red; }"]);
  });

  it("頂層分號結尾的陳述式自成一塊", () => {
    expect(
      splitTopLevelBlocks('@import url("https://x/y.css");\n.foo { color: red; }'),
    ).toEqual(['@import url("https://x/y.css");', ".foo { color: red; }"]);
  });

  it("多出來的 } 不會拖累後面的規則", () => {
    expect(
      splitTopLevelBlocks(".a { color: red; } }\n.b { color: blue; }"),
    ).toEqual([".a { color: red; }", ".b { color: blue; }"]);
  });
});

describe("boostCSSSpecificity", () => {
  it("一般選擇器加上能涵蓋 body 底下彈窗的前綴", () => {
    expect(boostCSSSpecificity(".soft-modal { background: red; }")).toBe(
      `${P} .soft-modal { background: red; }`,
    );
  });

  it("空字串回空字串", () => {
    expect(boostCSSSpecificity("")).toBe("");
    expect(boostCSSSpecificity("   ")).toBe("");
  });

  it(":is() / :not() / 屬性值內的逗號不會把選擇器拆壞", () => {
    expect(boostCSSSpecificity(":is(.a, .b) .c { color: red; }")).toBe(
      `${P} :is(.a, .b) .c { color: red; }`,
    );
    expect(boostCSSSpecificity(".x:not(.a, .b) { color: red; }")).toBe(
      `${P} .x:not(.a, .b) { color: red; }`,
    );
    expect(boostCSSSpecificity('[data-tags="a,b"] { color: red; }')).toBe(
      `${P} [data-tags="a,b"] { color: red; }`,
    );
  });

  it("逗號分隔的多選擇器逐一處理，:root / html / body 開頭的保留", () => {
    expect(boostCSSSpecificity("body, .foo { color: red; }")).toBe(
      `body,\n${P} .foo { color: red; }`,
    );
    expect(boostCSSSpecificity(":root { --x: 1; }")).toBe(":root { --x: 1; }");
    expect(
      boostCSSSpecificity("body.is-night-mode .card { color: red; }"),
    ).toBe("body.is-night-mode .card { color: red; }");
  });

  it("已自帶 #app 或前綴的選擇器不重複加", () => {
    expect(boostCSSSpecificity("#app .a { color: red; }")).toBe(
      "#app .a { color: red; }",
    );
    expect(boostCSSSpecificity(`${P} .a { color: red; }`)).toBe(
      `${P} .a { color: red; }`,
    );
  });

  it("註解後面接 body 規則時，body 仍被認得", () => {
    expect(
      boostCSSSpecificity("/* 背景 */\nbody { background: red; }"),
    ).toBe("/* 背景 */\nbody { background: red; }");
  });

  it("註解後面接 @keyframes / @media 時，at-rule 不會被當成選擇器", () => {
    expect(
      boostCSSSpecificity(
        "/* 動畫 */\n@keyframes spin { from { opacity: 0; } to { opacity: 1; } }",
      ),
    ).toBe(
      "/* 動畫 */\n@keyframes spin { from { opacity: 0; } to { opacity: 1; } }",
    );
    expect(
      boostCSSSpecificity(
        "/* 窄螢幕 */\n@media (max-width: 400px) { .a { color: red; } }",
      ),
    ).toBe(
      `/* 窄螢幕 */\n@media (max-width: 400px) {\n${P} .a { color: red; }\n}`,
    );
  });

  it("@import 後面的規則照樣被提升", () => {
    expect(
      boostCSSSpecificity('@import url("https://x/y.css");\n.foo { color: red; }'),
    ).toBe(`@import url("https://x/y.css");\n\n${P} .foo { color: red; }`);
  });

  it("@container / @layer 內的規則也被提升", () => {
    expect(
      boostCSSSpecificity("@container (min-width: 1px) { .a { color: red; } }"),
    ).toBe(`@container (min-width: 1px) {\n${P} .a { color: red; }\n}`);
    expect(boostCSSSpecificity("@layer theme { .a { color: red; } }")).toBe(
      `@layer theme {\n${P} .a { color: red; }\n}`,
    );
  });

  it("字串裡有 } 時，後面的規則不受影響", () => {
    expect(
      boostCSSSpecificity('.a::before { content: "}"; }\n.b { color: red; }'),
    ).toBe(`${P} .a::before { content: "}"; }\n\n${P} .b { color: red; }`);
  });

  it("註解內的大括號不影響分塊，註解原樣保留", () => {
    expect(
      boostCSSSpecificity(".a { color: red; }\n/* } { */\n.b { color: blue; }"),
    ).toBe(
      `${P} .a { color: red; }\n\n/* } { */\n${P} .b { color: blue; }`,
    );
  });
});

describe("scopeCSS", () => {
  const options = {
    scopeRoots: ["#app .root > *", "#app .root .blob"],
    descendantPrefix: "#app .root",
  };

  it(":scope 展開成所有根，一般選擇器加後代前綴", () => {
    expect(scopeCSS(":scope { color: red; }", options)).toBe(
      "#app .root > *,\n#app .root .blob { color: red; }",
    );
    expect(scopeCSS(":scope:hover { color: red; }", options)).toBe(
      "#app .root > *:hover,\n#app .root .blob:hover { color: red; }",
    );
    expect(scopeCSS(".title { color: red; }", options)).toBe(
      "#app .root .title { color: red; }",
    );
  });

  it(":is() 內的逗號不會把選擇器拆壞", () => {
    expect(scopeCSS(":is(.a, .b) .c { color: red; }", options)).toBe(
      "#app .root :is(.a, .b) .c { color: red; }",
    );
  });

  it("註解後面接 @keyframes 時原樣保留", () => {
    expect(
      scopeCSS(
        "/* 動畫 */\n@keyframes spin { to { opacity: 1; } }\n.a { animation: spin 1s; }",
        options,
      ),
    ).toBe(
      "/* 動畫 */\n@keyframes spin { to { opacity: 1; } }\n\n#app .root .a { animation: spin 1s; }",
    );
  });

  it("空字串回空字串", () => {
    expect(scopeCSS("", options)).toBe("");
  });
});
