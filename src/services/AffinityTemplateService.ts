/**
 * 好感度 EJS 模板渲染服務
 *
 * 將好感度狀態渲染為文本，注入到 AI prompt 中。
 * 支援用戶自定義 EJS 模板和預設模板。
 */
import ejs from "ejs";
import type {
  AffinityMetricConfig,
  CharacterAffinityConfig,
  ChatAffinityState,
  MetricValue,
} from "@/schemas/affinity";
import { computePercentage, computeStage } from "@/schemas/affinity";

// ===== 模板上下文類型 =====

export interface AffinityMetricView {
  id: string;
  name: string;
  type: string;
  value: MetricValue;
  min: number;
  max: number;
  percentage: number;
  stage: string | null;
  options: string[];
}

export interface AffinityTemplateContext {
  metrics: AffinityMetricView[];
  values: Record<string, MetricValue>;
  stages: Record<string, string | null>;
}

// ===== 預設模板 =====

export const DEFAULT_PROMPT_TEMPLATE = `[角色數值狀態]
<% for (const m of metrics) { -%>
- <%= m.name %>：<%= m.value %>/<%= m.max %><% if (m.stage) { %>（<%= m.stage %>）<% } %>
<% } -%>`.trim();

export const DEFAULT_UPDATE_INSTRUCTION = `在每次回覆的最後，如果對話中發生了影響角色情感的事件，請用以下格式輸出數值變化：
<affinity-update 指標名="±變化量" reason="原因"/>
例如：<affinity-update 好感度="+3" reason="用戶說了溫暖的話"/>
對於字串型指標，直接賦值：<affinity-update 识破身份="已识破" reason="用戶發現了真相"/>
注意：
- 數字型變化量請使用 +/- 號開頭的整數
- 每次變化幅度建議在 ±1~±10 之間
- 只有在劇情中有明確事件時才更新，不要每次都更新
- 可以同時更新多個指標`;

// ===== 服務類 =====

class AffinityTemplateService {
  /**
   * 構建模板上下文
   */
  buildContext(
    config: CharacterAffinityConfig,
    state: ChatAffinityState,
  ): AffinityTemplateContext {
    const metrics: AffinityMetricView[] = config.metrics.map((m) => {
      const value = state.values[m.id] ?? m.initial;
      return {
        id: m.id,
        name: m.name,
        type: m.type,
        value,
        min: m.min,
        max: m.max,
        percentage: computePercentage(value, m.min, m.max),
        stage: computeStage(value, m.stages),
        options: m.options,
      };
    });

    const values: Record<string, MetricValue> = {};
    const stages: Record<string, string | null> = {};
    for (const m of metrics) {
      values[m.name] = m.value;
      stages[m.name] = m.stage;
    }

    return { metrics, values, stages };
  }

  /**
   * 渲染好感度 prompt（注入到 AI 上下文的文本）
   */
  renderAffinityPrompt(
    config: CharacterAffinityConfig,
    state: ChatAffinityState,
  ): string {
    if (!config.enabled || config.metrics.length === 0) return "";

    const template = config.promptTemplate || DEFAULT_PROMPT_TEMPLATE;
    const context = this.buildContext(config, state);

    try {
      return ejs.render(template, context, { async: false });
    } catch (error) {
      console.error("[AffinityTemplate] EJS 渲染失敗，使用預設模板:", error);
      try {
        return ejs.render(DEFAULT_PROMPT_TEMPLATE, context, { async: false });
      } catch {
        return this._fallbackRender(context);
      }
    }
  }

  /**
   * 渲染 AI 更新規則指令
   */
  renderUpdateInstruction(config: CharacterAffinityConfig): string {
    if (!config.enabled || config.metrics.length === 0) return "";

    if (config.updateInstruction) return config.updateInstruction;

    const numMetrics = config.metrics.filter((m) => m.type !== "string");
    const strMetrics = config.metrics.filter((m) => m.type === "string");

    let instruction = DEFAULT_UPDATE_INSTRUCTION;
    if (numMetrics.length > 0) {
      instruction += `\n- 數字型指標：${numMetrics.map((m) => m.name).join("、")}`;
    }
    if (strMetrics.length > 0) {
      const parts = strMetrics.map((m) => {
        if (m.options.length > 0) return `${m.name}（可選值：${m.options.join("/")}）`;
        return m.name;
      });
      instruction += `\n- 字串型指標：${parts.join("、")}`;
    }
    return instruction;
  }

  /**
   * 預覽模板渲染（用於配置面板的即時預覽）
   */
  previewTemplate(
    template: string,
    metrics: AffinityMetricConfig[],
  ): string {
    const mockMetrics: AffinityMetricView[] = metrics.map((m) => ({
      id: m.id,
      name: m.name,
      type: m.type,
      value: m.initial,
      min: m.min,
      max: m.max,
      percentage: computePercentage(m.initial, m.min, m.max),
      stage: computeStage(m.initial, m.stages),
      options: m.options,
    }));

    const values: Record<string, MetricValue> = {};
    const stages: Record<string, string | null> = {};
    for (const m of mockMetrics) {
      values[m.name] = m.value;
      stages[m.name] = m.stage;
    }

    try {
      return ejs.render(template, { metrics: mockMetrics, values, stages }, {
        async: false,
      });
    } catch (error) {
      return `[模板語法錯誤] ${error instanceof Error ? error.message : String(error)}`;
    }
  }

  /**
   * 生成「AI 更新指令」世界書條目的完整文字內容
   * 包含 EJS 當前值展示 + <affinity-update> 格式說明 + 每個指標的規則
   */
  generateUpdateInstructionEntry(config: CharacterAffinityConfig): string {
    if (!config.enabled || config.metrics.length === 0) return "";

    const charKey = config.statKey?.trim() || "角色";
    const numMetrics = config.metrics.filter((m) => m.type !== "string");
    const strMetrics = config.metrics.filter((m) => m.type === "string");

    const lines: string[] = [];

    // ── 當前數值狀態區塊（EJS 模板）──
    lines.push("## 當前數值狀態");
    lines.push(`<% const _s = stat_data['${charKey}'] ?? {} %>`);

    for (const m of config.metrics) {
      if (m.type === "string") {
        const optionsHint =
          m.options.length > 0 ? `（可選：${m.options.join("、")}）` : "";
        lines.push(`${m.name}：<%= _s['${m.name}'] ?? '${m.initial || "未知"}' %>${optionsHint}`);
      } else {
        lines.push(`${m.name}：<%= _s['${m.name}'] ?? ${m.initial} %>／${m.max}`);
      }
    }

    lines.push("");

    // ── 更新規則說明 ──
    lines.push("## 數值更新規則");
    lines.push("每次回覆結束時，如果對話中發生了影響角色情感的事件，在回覆**末尾**輸出：");
    lines.push("");

    // 示例行
    const exampleParts: string[] = [];
    if (numMetrics.length > 0) exampleParts.push(`${numMetrics[0].name}="+2"`);
    if (numMetrics.length > 1) exampleParts.push(`${numMetrics[1].name}="-1"`);
    if (strMetrics.length > 0 && strMetrics[0].options.length > 0) {
      exampleParts.push(`${strMetrics[0].name}="${strMetrics[0].options[0]}"`);
    }
    lines.push(`<affinity-update ${exampleParts.join(" ")} reason="原因描述"/>`);
    lines.push("");

    // ── 各指標規則說明 ──
    lines.push("各指標規則：");
    for (const m of numMetrics) {
      lines.push(`- **${m.name}**：範圍 ${m.min}–${m.max}，正面互動加值，負面互動減值，每次建議 ±1～±5`);
    }
    for (const m of strMetrics) {
      if (m.options.length > 0) {
        lines.push(`- **${m.name}**：字串型，可選值為「${m.options.join("」「")}」，狀態一旦改變需符合劇情邏輯`);
      } else {
        lines.push(`- **${m.name}**：字串型，請填入符合劇情的文字描述`);
      }
    }
    lines.push("");
    lines.push("注意：只有在劇情中有明確事件時才更新，不要每次都更新。可以同時更新多個指標。");

    return lines.join("\n");
  }

  /** 最終回退：純文字渲染 */
  private _fallbackRender(context: AffinityTemplateContext): string {
    const lines = ["[角色數值狀態]"];
    for (const m of context.metrics) {
      let line: string;
      if (m.type === "string") {
        line = `- ${m.name}：${m.value}`;
      } else {
        line = `- ${m.name}：${m.value}/${m.max}`;
        if (m.stage) line += `（${m.stage}）`;
      }
      lines.push(line);
    }
    return lines.join("\n");
  }
}

export const affinityTemplateService = new AffinityTemplateService();
