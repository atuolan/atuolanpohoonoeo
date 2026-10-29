import type { GanzhiTime, LiuyaoReading } from "@/types/liuyao";
import { describe, expect, it } from "vitest";
import { paipan } from "../paipan";
import { buildLiuyaoShareSnapshot, describeLiuyaoShareForPrompt, liuyaoShareSummary } from "../share";

const time: GanzhiTime = {
  timestamp: new Date(2026, 9, 29, 14, 5).getTime(),
  year: "丙午",
  month: "戊戌",
  day: "庚寅",
  hour: "癸未",
  monthZhi: "戌",
  dayGan: "庚",
  dayZhi: "寅",
  xunKong: ["午", "未"],
  lunarText: "",
};

const reading: LiuyaoReading = {
  id: "r1",
  question: "這份工作能談成嗎？",
  category: "career",
  method: "auto",
  values: [8, 7, 7, 9, 7, 7],
  castTime: time.timestamp,
  readerCharacterId: "c1",
  readerName: "小夜",
  interpretation: "【卦象】\n**天風姤**，不期而遇。",
  createdAt: 0,
};

describe("六爻卡片", () => {
  const snap = buildLiuyaoShareSnapshot(reading, paipan(reading.values, time));

  it("快照", () => {
    expect(snap).toMatchObject({
      readingId: "r1",
      originalName: "天風姤",
      changedName: "巽為風",
      movingPositions: [4],
      readerName: "小夜",
      excerpt: "【卦象】\n天風姤，不期而遇。",
    });
  });

  it("摘要", () => {
    expect(liuyaoShareSummary(snap)).toBe("[六爻] 天風姤 → 巽為風｜這份工作能談成嗎？");
  });

  it("給解卦的角色本人看", () => {
    const text = describeLiuyaoShareForPrompt(snap, { userName: "阿明", charId: "c1" });
    expect(text).toContain("[阿明 傳來一張六爻卦象卡片：10/29 起卦問「這份工作能談成嗎？」（事業），得 天風姤 → 巽為風（四爻動）。");
    expect(text).toContain("這卦是你替 阿明 解的，你當時的解讀摘要：");
  });

  it("給別的角色看", () => {
    const text = describeLiuyaoShareForPrompt(snap, { userName: "阿明", charId: "c2" });
    expect(text).toContain("小夜的解讀摘要：");
  });

  it("沒有解讀、安靜卦", () => {
    const s = buildLiuyaoShareSnapshot(
      { ...reading, values: [7, 7, 7, 8, 8, 8], interpretation: "", readerCharacterId: undefined, readerName: undefined },
      paipan([7, 7, 7, 8, 8, 8], time),
    );
    expect(describeLiuyaoShareForPrompt(s, { userName: "阿明" })).toBe(
      "[阿明 傳來一張六爻卦象卡片：10/29 起卦問「這份工作能談成嗎？」（事業），得 地天泰（六爻安靜）。]",
    );
  });
});
