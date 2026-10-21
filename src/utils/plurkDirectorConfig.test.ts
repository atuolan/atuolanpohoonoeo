import { describe, expect, it } from "vitest";
import { DEFAULT_AUTO_INTERACTION_CONFIG, type QZoneSettings } from "@/types/qzone";
import { DEFAULT_DIRECTOR_CONFIG, getMutedIds, getRole, isInRoutine, migrateDirectorConfig } from "./plurkDirectorConfig";

const settings: QZoneSettings = { nickname: "", avatar: "", background: "" };

describe("migrateDirectorConfig", () => {
  it("沒有舊設定就用預設", () => {
    expect(migrateDirectorConfig(settings, DEFAULT_AUTO_INTERACTION_CONFIG)).toEqual({
      ...DEFAULT_DIRECTOR_CONFIG,
      dailyCap: 25,
    });
  });
  it("帶入舊的開關、黑名單、每日上限、聊天記錄設定、自動回覆", () => {
    const cfg = migrateDirectorConfig(
      { ...settings, enableChatContext: false, chatContextCount: 30, autoAIReply: false },
      {
        ...DEFAULT_AUTO_INTERACTION_CONFIG,
        enabled: true,
        maxPostsPerDay: 4,
        maxCommentsPerDay: 10,
        characterSelection: { mode: "random", blacklist: ["x"] },
      },
    );
    expect(cfg.mode).toBe("free");
    expect(cfg.roles).toEqual({ x: "mute" });
    expect(cfg.dailyCap).toBe(14);
    expect(cfg.memoryEnabled).toBe(false);
    expect(cfg.memoryCount).toBe(30);
    expect(cfg.repliesAfterUser).toBe(false);
  });
});

describe("isInRoutine", () => {
  it("不限", () => expect(isInRoutine("any", 3)).toBe(true));
  it("白天 9–24", () => {
    expect(isInRoutine("day", 9)).toBe(true);
    expect(isInRoutine("day", 23)).toBe(true);
    expect(isInRoutine("day", 8)).toBe(false);
  });
  it("夜貓子跨夜 18–4", () => {
    expect(isInRoutine("night", 2)).toBe(true);
    expect(isInRoutine("night", 18)).toBe(true);
    expect(isInRoutine("night", 4)).toBe(false);
    expect(isInRoutine("night", 12)).toBe(false);
  });
});

describe("getRole / getMutedIds", () => {
  it("沒設定＝常出現；不出現的集合", () => {
    const cfg = { ...DEFAULT_DIRECTOR_CONFIG, roles: { a: "mute" as const, b: "reply" as const } };
    expect(getRole(cfg, "c")).toBe("often");
    expect([...getMutedIds(cfg)]).toEqual(["a"]);
  });
});
