/**
 * 雷諾曼牌陣定義
 */
import type { LenormandSpread } from "@/types/lenormand";

export const lenormandSpreads: LenormandSpread[] = [
  {
    id: "single",
    name: "Single Card",
    nameCn: "單張牌",
    description: "抽一張牌，快速獲得方向性指引。適合日常問題或簡單的是非判斷。",
    positions: [
      {
        id: "p1",
        name: "Answer",
        nameCn: "答案",
        description: "問題的核心答案",
      },
    ],
  },
  {
    id: "three-card",
    name: "Three Card",
    nameCn: "三張牌",
    description: "過去、現在、未來的三張牌陣，了解事情的發展脈絡。",
    positions: [
      {
        id: "p1",
        name: "Past",
        nameCn: "過去",
        description: "影響現在的過去因素",
      },
      { id: "p2", name: "Present", nameCn: "現在", description: "目前的狀況" },
      {
        id: "p3",
        name: "Future",
        nameCn: "未來",
        description: "可能的發展方向",
      },
    ],
  },
  {
    id: "five-card",
    name: "Five Card Cross",
    nameCn: "五張十字牌陣",
    description: "十字形五張牌，全面了解問題的各個面向。",
    positions: [
      { id: "p1", name: "Center", nameCn: "核心", description: "問題的核心" },
      {
        id: "p2",
        name: "Left",
        nameCn: "過去/原因",
        description: "過去的影響或原因",
      },
      {
        id: "p3",
        name: "Right",
        nameCn: "未來/結果",
        description: "未來的走向或結果",
      },
      { id: "p4", name: "Top", nameCn: "建議", description: "最佳行動建議" },
      {
        id: "p5",
        name: "Bottom",
        nameCn: "潛在因素",
        description: "隱藏的影響因素",
      },
    ],
  },
  {
    id: "nine-card",
    name: "Nine Card Square",
    nameCn: "九宮格牌陣",
    description: "3×3 的九張牌陣，雷諾曼最經典的牌陣，全面深入解讀。",
    positions: [
      { id: "p1", name: "TL", nameCn: "左上", description: "過去的影響" },
      { id: "p2", name: "TC", nameCn: "上中", description: "外在環境" },
      { id: "p3", name: "TR", nameCn: "右上", description: "未來趨勢" },
      { id: "p4", name: "ML", nameCn: "左中", description: "內在狀態" },
      { id: "p5", name: "MC", nameCn: "中心", description: "核心問題" },
      { id: "p6", name: "MR", nameCn: "右中", description: "外在行動" },
      { id: "p7", name: "BL", nameCn: "左下", description: "潛意識" },
      { id: "p8", name: "BC", nameCn: "下中", description: "結果" },
      { id: "p9", name: "BR", nameCn: "右下", description: "最終建議" },
    ],
  },
];

export function getDefaultLenormandSpread(): LenormandSpread {
  return lenormandSpreads[0];
}
