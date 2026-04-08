import { describe, expect, it } from "vitest";
import { detectAndConvertMvuConfig } from "../ImportExportService";
import type { CharacterBookEntry } from "@/types/character";

function createEntry(partial: Partial<CharacterBookEntry>): CharacterBookEntry {
  return {
    id: 1,
    keys: [],
    secondary_keys: [],
    comment: "",
    content: "",
    constant: false,
    selective: false,
    insertion_order: 100,
    enabled: true,
    position: "after_char",
    use_regex: false,
    extensions: {
      position: 0,
      exclude_recursion: false,
      probability: 100,
      useProbability: true,
      depth: 4,
      selectiveLogic: 0,
      group: "",
      group_override: false,
      group_weight: 100,
      prevent_recursion: false,
      delay_until_recursion: false,
      scan_depth: null,
      match_whole_words: null,
      use_group_scoring: null,
      case_sensitive: null,
      automation_id: "",
      role: 0,
      vectorized: false,
    },
    ...partial,
  };
}

describe("detectAndConvertMvuConfig post-mutation rule extraction", () => {
  it("extracts derive_boolean and clamp_max_when rules from mvu_update text", () => {
    const entries: CharacterBookEntry[] = [
      createEntry({
        id: 1,
        comment: "[initvar]",
        content: `时间系统:\n  日期: 未知\n卓云和个人状态:\n  好感度: 0\n  戒备值: 100\n  $爱意值已解锁: false\n  爱意值: 0`,
      }),
      createEntry({
        id: 2,
        comment: "[mvu_update]变量更新规则",
        content: `变量更新规则:\n  rule:\n    - '\${好感度} (路径: /卓云和个人状态/好感度): 注意：戒备≥60时，好感上限被限制在50！'\n    - '\${$爱意值已解锁} (路径: /卓云和个人状态/$爱意值已解锁): 单向锁定标志，只能 false→true，绝对禁止 true→false。当好感度>=50 且 戒备值<=40 时设为 true。一旦为 true 永不可逆。'\n    - '\${戒备值} (路径: /卓云和个人状态/戒备值): 基础戒备极高。'`,
      }),
    ];

    const config = detectAndConvertMvuConfig(entries, "char-1");
    expect(config).not.toBeNull();
    expect(config?.postMutationRules).toHaveLength(2);

    const deriveRule = config?.postMutationRules.find(
      (rule) => rule.type === "derive_boolean",
    );
    expect(deriveRule).toMatchObject({
      type: "derive_boolean",
      targetPath: "卓云和个人状态.$爱意值已解锁",
      trueValue: "true",
      falseValue: "false",
      lockOnTrue: true,
      mode: "all",
    });
    expect(deriveRule?.conditions).toEqual(
      expect.arrayContaining([
        {
          path: "卓云和个人状态.好感度",
          operator: "gte",
          value: 50,
        },
        {
          path: "卓云和个人状态.戒备值",
          operator: "lte",
          value: 40,
        },
      ]),
    );

    const clampRule = config?.postMutationRules.find(
      (rule) => rule.type === "clamp_max_when",
    );
    expect(clampRule).toMatchObject({
      type: "clamp_max_when",
      targetPath: "卓云和个人状态.好感度",
      max: 50,
      mode: "all",
      conditions: [
        {
          path: "卓云和个人状态.戒备值",
          operator: "gte",
          value: 60,
        },
      ],
    });
  });
});
