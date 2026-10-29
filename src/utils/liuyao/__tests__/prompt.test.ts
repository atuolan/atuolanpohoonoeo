import { loadZhouyi } from "@/data/liuyao/zhouyi";
import type { GanzhiTime } from "@/types/liuyao";
import { describe, expect, it } from "vitest";
import { analyzeChart } from "../analysis";
import { paipan } from "../paipan";
import { buildLiuyaoPrompt, formatChartTable, LIUYAO_RULES } from "../prompt";

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
  lunarText: "農曆九月二十 未時",
};

describe("buildLiuyaoPrompt", async () => {
  const chart = paipan([8, 7, 7, 9, 7, 7], time);
  const facts = analyzeChart(chart);
  const original = await loadZhouyi(44);
  const changed = await loadZhouyi(57);

  it("卦盤表上爻在上，動爻標出變爻", () => {
    const table = formatChartTable(chart).split("\n");
    expect(table[0]).toContain("上爻：螣蛇 父母戌土 陽");
    expect(table[2]).toContain("四爻：朱雀 官鬼午火 陽 ○老陽動 應");
    expect(table[2]).toContain("→ 變出 父母未土 陰");
    expect(table[4]).toContain("（伏：妻財寅木）");
    expect(table[5]).toContain("初爻：白虎 父母丑土 陰 世");
  });

  it("占卜師：系統放依據與輸出要求，使用者訊息放資料與事實", () => {
    const p = buildLiuyaoPrompt({ chart, facts, question: "這份工作能談成嗎？", category: "career", original, changed });
    expect(p.system).toContain("精研《增刪卜易》");
    expect(p.system).toContain(LIUYAO_RULES);
    expect(p.system).toContain("【應期】");
    expect(p.user).toContain("問題：這份工作能談成嗎？");
    expect(p.user).toContain("問事類別：事業");
    expect(p.user).toContain("四柱：丙午年 戊戌月 庚寅日 癸未時");
    expect(p.user).toContain("本卦：天風姤（乾宮・一世，宮屬金）");
    expect(p.user).toContain("變卦：巽為風（巽宮・本宮，宮屬木）");
    expect(p.user).toContain("四爻 官鬼午火：月建戌（洩，休囚）；日辰寅（生，長生於日）；有氣");
    expect(p.user).toContain("旬空（不為空：旺相不為空、動不為空、日辰生扶不為空）");
    expect(p.user).toContain("動化未土：化空、化合");
    expect(p.user).toContain("伏神 妻財寅木：飛神生伏");
    expect(p.user).toContain("判斷：可出");
    expect(p.user).toContain("五爻 兄弟申金");
    expect(p.user).toContain("暗動");
    expect(p.user).toContain("寅午戌火局湊齊");
    expect(p.user).toContain("外卦反吟");
    expect(p.user).toContain("世應：應生世、應爻旬空");
    expect(p.user).toContain("本卦《天風姤》卦辭：女壯，勿用取女。");
    expect(p.user).toContain("動爻 九四：包无魚，起凶。");
    expect(p.user).toContain("變卦《巽為風》卦辭：");
  });

  it("角色解卦：帶人設、口吻規則", () => {
    const p = buildLiuyaoPrompt({
      chart,
      facts,
      question: "",
      category: null,
      reader: { name: "小夜", description: "神社的巫女", personality: "嘴硬心軟", userName: "阿明" },
    });
    expect(p.system).toContain("你現在是「小夜」，正在替 阿明 解一個六爻卦。");
    expect(p.system).toContain("神社的巫女");
    expect(p.system).toContain("斷卦依據、分析步驟與結論不能因此省略或改變");
    expect(p.user).toContain("問題：（未填）");
    expect(p.user).not.toContain("問事類別");
    expect(p.user).not.toContain("【周易原文】");
  });
});
