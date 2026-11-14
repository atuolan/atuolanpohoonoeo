/**
 * 好感度設定的快速範本：點一下就加進一個常用指標（名稱、範圍、說明、階段都填好）
 */
import type { AffinityMetricConfig } from "@/schemas/affinity";

export interface AffinityPreset {
  key: string;
  label: string;
  metric: Omit<AffinityMetricConfig, "id">;
}

export const AFFINITY_PRESETS: AffinityPreset[] = [
  {
    key: "affection",
    label: "好感度",
    metric: {
      name: "好感度",
      path: "",
      type: "number",
      min: 0,
      max: 100,
      initial: 30,
      options: [],
      bounded: true,
      maxChange: 5,
      description:
        "對使用者的喜歡程度。被關心、被誇獎、一起度過開心的時光會增加；被冷落、被冒犯、被欺騙會減少。",
      stages: [
        { name: "陌生", minValue: 0, description: "保持距離，說話客氣、有點防備" },
        { name: "熟悉", minValue: 20, description: "願意聊天、會開點小玩笑" },
        { name: "好感", minValue: 45, description: "主動找話題，在意對方的情緒" },
        { name: "曖昧", minValue: 70, description: "容易害羞、會吃醋，想要更多相處" },
        { name: "戀慕", minValue: 90, description: "毫不掩飾心意，非常依賴對方" },
      ],
    },
  },
  {
    key: "trust",
    label: "信任度",
    metric: {
      name: "信任度",
      path: "",
      type: "number",
      min: 0,
      max: 100,
      initial: 20,
      options: [],
      bounded: true,
      maxChange: 5,
      description:
        "相信使用者的程度。遵守承諾、說實話、保守秘密會增加；說謊、背叛會大幅減少。",
      stages: [
        { name: "戒備", minValue: 0, description: "不談自己的事，對提議保持懷疑" },
        { name: "普通", minValue: 30, description: "願意合作，但重要的事還會保留" },
        { name: "信任", minValue: 60, description: "會說心裡話，願意依靠對方" },
        { name: "託付", minValue: 85, description: "把最重要的秘密和決定交給對方" },
      ],
    },
  },
  {
    key: "mood",
    label: "心情",
    metric: {
      name: "心情",
      path: "",
      type: "string",
      min: 0,
      max: 100,
      initial: "平靜",
      options: ["開心", "平靜", "低落", "生氣", "害羞"],
      bounded: true,
      maxChange: 0,
      description: "角色現在的情緒，依照這一輪發生的事改變。",
      stages: [],
    },
  },
  {
    key: "relation",
    label: "關係",
    metric: {
      name: "關係",
      path: "",
      type: "string",
      min: 0,
      max: 100,
      initial: "陌生人",
      options: ["陌生人", "朋友", "曖昧", "戀人"],
      bounded: true,
      maxChange: 0,
      description: "兩人目前的關係，只有劇情裡明確發生轉變（告白、絕交…）時才改。",
      stages: [],
    },
  },
];

/** 依範本建立一個新指標（id 不重複） */
export function createMetricFromPreset(key: string): AffinityMetricConfig | null {
  const preset = AFFINITY_PRESETS.find((p) => p.key === key);
  if (!preset) return null;
  return {
    ...JSON.parse(JSON.stringify(preset.metric)),
    id: `metric_${preset.key}_${Date.now()}`,
  };
}
