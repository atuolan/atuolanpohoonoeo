import { describe, expect, it } from "vitest";
import {
  buildRecipientDestination,
  formatWaimaiDestination,
  resolvePlaceText,
} from "@/services/waimaiLocation";

describe("從地點文字認出國家", () => {
  it("中文城市、英文國家、英文城市都認得", () => {
    expect(resolvePlaceText("東京")).toMatchObject({ countryCode: "JP", city: "東京" });
    expect(resolvePlaceText("台北")).toMatchObject({ countryCode: "TW", city: "台北市" });
    expect(resolvePlaceText("Taipei, Taiwan")).toMatchObject({ countryCode: "TW", city: "台北" });
    expect(resolvePlaceText("Tokyo")).toMatchObject({ countryCode: "JP", city: "東京" });
    expect(resolvePlaceText("Brooklyn, United States of America")).toMatchObject({
      countryCode: "US",
      city: "Brooklyn",
    });
  });

  it("只寫國家時城市留空；香港不會被認成中國", () => {
    expect(resolvePlaceText("日本")).toMatchObject({ countryCode: "JP", city: "" });
    expect(resolvePlaceText("中國香港")).toMatchObject({ countryCode: "HK" });
  });

  it("認不出來回傳 null", () => {
    expect(resolvePlaceText("月球背面")).toBeNull();
    expect(resolvePlaceText("")).toBeNull();
  });
});

describe("依收件人決定收貨地", () => {
  const base = { charName: "阿澈", userPlace: "台北, Taiwan" };

  it("送給自己用使用者城市，送給角色用角色所在地", () => {
    const me = buildRecipientDestination({ ...base, recipient: "me", charPlace: "東京" });
    expect(me.destination).toMatchObject({ recipientName: "我", countryCode: "TW" });
    expect(me.note).toBe("");

    const char = buildRecipientDestination({ ...base, recipient: "char", charPlace: "東京" });
    expect(char.destination).toMatchObject({ recipientName: "阿澈", countryCode: "JP", city: "東京" });
    expect(char.note).toBe("");
  });

  it("角色沒設所在地：當成在使用者附近，並說明", () => {
    const r = buildRecipientDestination({ ...base, recipient: "char", charPlace: "" });
    expect(r.destination.countryCode).toBe("TW");
    expect(r.note).toContain("先當成在你附近");
  });

  it("使用者沒設城市：用台灣並說明", () => {
    const r = buildRecipientDestination({ charName: "阿澈", recipient: "me", userPlace: "" });
    expect(r.destination.countryCode).toBe("TW");
    expect(r.note).toContain("先用台灣計算");
  });

  it("認不出國家：當成國內並保留原文字", () => {
    const r = buildRecipientDestination({ ...base, recipient: "char", charPlace: "霧之谷" });
    expect(r.destination).toMatchObject({ countryCode: "TW", city: "霧之谷" });
    expect(r.note).toContain("認不出「霧之谷」");
  });

  it("這一單手動改的地點優先", () => {
    const r = buildRecipientDestination({ ...base, recipient: "char", charPlace: "東京", overridePlace: "首爾" });
    expect(r.destination).toMatchObject({ countryCode: "KR", recipientName: "阿澈" });
  });
});

describe("收貨地文字", () => {
  it("新訂單只有國家城市，舊訂單帶詳細地址", () => {
    expect(formatWaimaiDestination({ countryName: "日本", city: "東京", addressLine: "" })).toBe("日本 東京");
    expect(formatWaimaiDestination({ countryName: "台灣", city: "", addressLine: "" })).toBe("台灣");
    expect(formatWaimaiDestination({ countryName: "台灣", city: "台北市", addressLine: "市府路 1 號" })).toBe(
      "台灣 台北市｜市府路 1 號",
    );
  });
});
