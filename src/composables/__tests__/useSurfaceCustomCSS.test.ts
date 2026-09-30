import { describe, expect, it } from "vitest";
import { GLOBAL_SCOPE_PREFIX } from "@/utils/cssScoping";
import { scopeSurfaceCSS } from "../useSurfaceCustomCSS";

const P = GLOBAL_SCOPE_PREFIX;

describe("scopeSurfaceCSS", () => {
  it("表面根與其後代都加上能涵蓋 body 底下彈窗的前綴", () => {
    expect(
      scopeSurfaceCSS(
        "global-theme-modal",
        ":scope { background: red; }\n.modal-header { color: blue; }",
      ),
    ).toBe(
      `${P} .global-theme-modal { background: red; }\n\n${P} .global-theme-modal .modal-header { color: blue; }`,
    );
  });

  it("未登記的表面回空字串", () => {
    expect(scopeSurfaceCSS("no-such-surface", ".a { color: red; }")).toBe("");
  });
});
