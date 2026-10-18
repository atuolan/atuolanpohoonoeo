import { describe, expect, it } from "vitest";
import { buildCaughtNote, peekSecretEventContent } from "@/utils/peekLinks";

const found = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ key: `k${i}`, label: `秘密${i}`, detail: i === 0 ? "" : `內容${i}` }));

describe("被他發現的那筆", () => {
  it("沒找到秘密也算被發現", () => {
    expect(buildCaughtNote([], "小栩", "沈既白")).toBe("小栩剛剛偷看了沈既白的手機，被沈既白發現了。");
  });

  it("列出看到的，最多 5 個", () => {
    const note = buildCaughtNote(found(7), "小栩", "沈既白");
    expect(note).toContain("看到了：\n・秘密0\n・秘密1：內容1");
    expect(note).toContain("・秘密4：內容4");
    expect(note).not.toContain("秘密5");
    expect(note).toContain("……還有 2 個");
  });

  it("記進記憶的句子", () => {
    expect(peekSecretEventContent({ key: "k", label: "鎖屏密碼 0912", detail: "第一次見面" }, "小栩", "沈既白")).toBe(
      "小栩偷看沈既白的手機，知道了「鎖屏密碼 0912」：第一次見面",
    );
  });
});
