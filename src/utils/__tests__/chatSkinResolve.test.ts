import { describe, expect, it } from "vitest";
import {
  buildChatSkinAttrs,
  buildChatSkinVars,
  hasAnyChatSkin,
  normalizeChatSkinOverrides,
  resolveChatSkins,
  type ResolveChatSkinsInput,
} from "@/utils/chatSkinResolve";

const ALL = ["greenbubble-message", "greenbubble-wallpaper", "greenbubble-header", "greenbubble-input"];

function input(partial: Partial<ResolveChatSkinsInput> = {}): ResolveChatSkinsInput {
  return { chatId: "c1", owned: ALL, equipped: {}, ownColors: {}, ...partial };
}

describe("resolveChatSkins", () => {
  it("什麼都沒裝 → 空", () => {
    const r = resolveChatSkins(input());
    expect(r).toEqual({});
    expect(hasAnyChatSkin(r)).toBe(false);
  });

  it("全域有裝 → 用全域", () => {
    const r = resolveChatSkins(input({ equipped: { header: "greenbubble-header" } }));
    expect(r.header?.piece.id).toBe("greenbubble-header");
    expect(r.header?.ownColors).toBe(false);
    expect(r.header?.tryOn).toBe(false);
    expect(r.message).toBeUndefined();
  });

  it("單聊指定 none → 這個聊天不裝", () => {
    const r = resolveChatSkins(
      input({ equipped: { header: "greenbubble-header" }, chatOverrides: { slots: { header: "none" } } }),
    );
    expect(r.header).toBeUndefined();
  });

  it("單聊指定別件 → 用指定的", () => {
    const r = resolveChatSkins(input({ chatOverrides: { slots: { message: "greenbubble-message" } } }));
    expect(r.message?.piece.id).toBe("greenbubble-message");
  });

  it("沒擁有、找不到、欄位不對 → 當成不裝", () => {
    expect(resolveChatSkins(input({ owned: [], equipped: { header: "greenbubble-header" } })).header).toBeUndefined();
    expect(resolveChatSkins(input({ equipped: { header: "no-such" } })).header).toBeUndefined();
    expect(resolveChatSkins(input({ equipped: { header: "greenbubble-input" } })).header).toBeUndefined();
  });

  it("試穿優先，而且不用擁有", () => {
    const r = resolveChatSkins(
      input({
        owned: [],
        chatOverrides: { slots: { input: "none" } },
        tryOn: { chatId: "c1", slot: "input", pieceId: "greenbubble-input" },
      }),
    );
    expect(r.input?.piece.id).toBe("greenbubble-input");
    expect(r.input?.tryOn).toBe(true);
    expect(r.input?.ownColors).toBe(false);
  });

  it("試穿只在那個聊天生效", () => {
    const r = resolveChatSkins(
      input({ owned: [], tryOn: { chatId: "other", slot: "input", pieceId: "greenbubble-input" } }),
    );
    expect(r.input).toBeUndefined();
  });

  it("自己的顏色：單聊設定優先於全域；背景沒有這個開關", () => {
    const equipped = { header: "greenbubble-header", wallpaper: "greenbubble-wallpaper" };
    const global = resolveChatSkins(input({ equipped, ownColors: { header: true, wallpaper: true } }));
    expect(global.header?.ownColors).toBe(true);
    expect(global.wallpaper?.ownColors).toBe(false);
    const chat = resolveChatSkins(
      input({ equipped, ownColors: { header: true }, chatOverrides: { ownColors: { header: false } } }),
    );
    expect(chat.header?.ownColors).toBe(false);
  });
});

describe("buildChatSkinVars / buildChatSkinAttrs", () => {
  const resolved = resolveChatSkins(
    input({ equipped: { header: "greenbubble-header", wallpaper: "greenbubble-wallpaper" }, ownColors: { header: true } }),
  );

  it("自己的顏色打開的欄位不輸出變數；夜間用夜間那套", () => {
    const day = buildChatSkinVars(resolved, false);
    expect(day["--chat-wallpaper"]).toBe("#ededed");
    expect(day["--skin-header-bg"]).toBeUndefined();
    expect(buildChatSkinVars(resolved, true)["--chat-wallpaper"]).toBe("#111111");
  });

  it("每個有裝的欄位都有 data 屬性，自己的顏色另外標記", () => {
    expect(buildChatSkinAttrs(resolved)).toEqual({
      "data-skin-wallpaper": "greenbubble",
      "data-skin-header": "greenbubble",
      "data-skin-header-own-colors": "",
    });
  });
});

describe("normalizeChatSkinOverrides", () => {
  it("拿掉空值與不認得的欄位", () => {
    expect(normalizeChatSkinOverrides(undefined)).toEqual({});
    expect(
      normalizeChatSkinOverrides({
        slots: { header: "greenbubble-header", message: "" } as never,
        ownColors: { input: true, bogus: true } as never,
      }),
    ).toEqual({ slots: { header: "greenbubble-header" }, ownColors: { input: true } });
  });
});
