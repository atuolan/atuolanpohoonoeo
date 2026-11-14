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
import {
  CharacterAffinityConfigSchema,
  computePercentage,
  computeStage,
  createDefaultState,
  findStage,
  readMvuLeaf,
} from "@/schemas/affinity";
import { createStTemplateContext } from "@/services/StTemplateContextService";

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
  /** 目前階段的說明（角色在這個階段會怎麼表現） */
  stageDescription: string;
  options: string[];
  /** false：沒有上下限（金錢、天數…），不要印成「x/100」 */
  bounded: boolean;
  description: string;
  /** 最近一次更新的變化，已格式化（"+3"、"已識破"）；沒有變化是空字串 */
  delta: string;
}

/** AI 回報變化的格式 */
export type AffinityUpdateFormat = "tag" | "mvu";

export function resolveUpdateFormat(config: CharacterAffinityConfig): AffinityUpdateFormat {
  return config.updateFormat ?? (config.mvuEnabled ? "mvu" : "tag");
}

/** 規則範例裡的文字型新值：挑一個跟初始值不同的選項，範例才看得出是在改值 */
function exampleNextOption(m: AffinityMetricConfig): string {
  return m.options.find((o) => o !== String(m.initial)) ?? m.options[0] ?? "新的狀態";
}

function formatDelta(delta: unknown): string {
  if (typeof delta === "number") {
    if (!Number.isFinite(delta) || delta === 0) return "";
    return delta > 0 ? `+${delta}` : String(delta);
  }
  if (typeof delta === "string") return delta === "0" ? "" : delta;
  return "";
}

function toMetricView(
  m: AffinityMetricConfig,
  value: MetricValue,
  deltaData: Record<string, unknown>,
): AffinityMetricView {
  const bounded = m.bounded !== false;
  return {
    id: m.id,
    name: m.name,
    type: m.type,
    value,
    min: m.min,
    max: m.max,
    percentage: bounded ? computePercentage(value, m.min, m.max) : 0,
    stage: computeStage(value, m.stages),
    stageDescription: findStage(value, m.stages)?.description ?? "",
    options: m.options,
    bounded,
    description: m.description ?? "",
    delta: formatDelta(readMvuLeaf(deltaData, m.path || m.name)),
  };
}

export interface AffinityTemplateContext {
  metrics: AffinityMetricView[];
  charKey: string;
  values: Record<string, MetricValue>;
  stages: Record<string, string | null>;
  stat_data: Record<string, unknown>;
  display_data: Record<string, unknown>;
  delta_data: Record<string, unknown>;
  getvar: (path: string, options?: unknown) => unknown;
  variables: Record<string, unknown>;
}

// ===== 預設模板 =====

export const DEFAULT_PROMPT_TEMPLATE = `[角色數值狀態]
<% for (const m of metrics) { -%>
- <%= m.name %>：<%= m.value %><% if (m.type !== 'string' && m.bounded) { %>/<%= m.max %><% } %><% if (m.stage) { %>（<%= m.stage %><% if (m.stageDescription) { %>：<%= m.stageDescription %><% } %>）<% } %><% if (m.delta) { %>〔上次變化：<%= m.delta %>〕<% } %>
<% } -%>`.trim();

// ===== 服務類 =====

class AffinityTemplateService {
  /**
   * 構建模板上下文
   * @param charName 角色名稱；沒設「變數名稱」(statKey) 時用它當 stat_data 底下的鍵
   */
  buildContext(
    config: CharacterAffinityConfig,
    state: ChatAffinityState,
    charName?: string,
  ): AffinityTemplateContext {
    const charKey = config.statKey?.trim() || charName?.trim() || "角色";
    const deltaData = (state.mvuState?.deltaData ?? {}) as Record<string, unknown>;
    const metrics = config.metrics.map((m) =>
      toMetricView(m, state.values[m.id] ?? m.initial, deltaData),
    );

    const shared = createStTemplateContext({
      affinityConfig: config,
      affinityState: state,
      charName: charKey,
    });

    return {
      metrics,
      charKey,
      values: shared.values,
      stages: shared.stages,
      stat_data: shared.stat_data,
      display_data: shared.display_data,
      delta_data: shared.delta_data,
      getvar: shared.getvar,
      variables: shared.variables,
    };
  }

  /** 實際會用哪個狀態模板（自訂 > MVU 卡帶的 > 預設） */
  resolvePromptTemplate(config: CharacterAffinityConfig): string {
    return (
      config.promptTemplate?.trim() ||
      (config.mvuEnabled ? config.mvuPromptTemplate?.trim() : "") ||
      DEFAULT_PROMPT_TEMPLATE
    );
  }

  /**
   * 渲染好感度 prompt（注入到 AI 上下文的文本）
   */
  renderAffinityPrompt(
    config: CharacterAffinityConfig,
    state: ChatAffinityState,
    charName?: string,
  ): string {
    if (!config.enabled || config.injectStatus === false) return "";
    const template = this.resolvePromptTemplate(config);
    if (config.metrics.length === 0 && template === DEFAULT_PROMPT_TEMPLATE) return "";
    const context = this.buildContext(config, state, charName);

    try {
      return ejs.render(template, context, { async: false }).trim();
    } catch (error) {
      console.error("[AffinityTemplate] EJS 渲染失敗，使用預設模板:", error);
      try {
        return ejs.render(DEFAULT_PROMPT_TEMPLATE, context, { async: false }).trim();
      } catch {
        return this._fallbackRender(context);
      }
    }
  }

  /**
   * 渲染 AI 更新規則指令：自訂 > MVU 卡帶的 > 依指標自動產生
   */
  renderUpdateInstruction(config: CharacterAffinityConfig): string {
    if (!config.enabled || config.injectRules === false) return "";
    // 旁觀者判斷：聊天的 AI 不用寫，回覆才乾淨
    if (config.updateMode === "judge") return "";
    if (config.updateInstruction?.trim()) return config.updateInstruction;
    if (config.mvuEnabled && config.mvuUpdateInstruction?.trim()) {
      return config.mvuUpdateInstruction;
    }
    if (config.metrics.length === 0) return "";
    return this.buildAutoUpdateRules(config);
  }

  /**
   * 依指標設定產生給 AI 的更新規則（說明、範圍、單次上限、可選值都會寫進去）
   */
  buildAutoUpdateRules(config: CharacterAffinityConfig): string {
    const lines: string[] = ["[數值更新規則]"];
    lines.push(
      "回覆的最後，如果這一輪的劇情讓下面的數值有變化，就用下面的格式寫出來；沒有變化就不用寫。",
    );
    lines.push("");
    lines.push(...this._formatLines(config));
    lines.push("");
    lines.push(...this._metricLines(config));
    lines.push("");
    lines.push(
      "只有劇情裡真的發生了會影響這些數值的事才更新，不要每輪都改；變化要合理、符合角色個性，一次不要跳太多。",
    );
    return lines.join("\n");
  }

  /** 回報格式的範例和說明 */
  private _formatLines(config: CharacterAffinityConfig): string[] {
    const format = resolveUpdateFormat(config);
    const metrics = config.metrics.filter((m) => m.name.trim());
    const numMetrics = metrics.filter((m) => m.type !== "string");
    const strMetrics = metrics.filter((m) => m.type === "string");
    const pathOf = (m: AffinityMetricConfig) => m.path?.trim() || m.name;
    const lines: string[] = [];

    if (format === "mvu") {
      lines.push("<UpdateVariable>");
      const exampleNum = numMetrics[0];
      const exampleStr = strMetrics[0];
      if (exampleNum) {
        const v = typeof exampleNum.initial === "number" ? exampleNum.initial : 0;
        const step = exampleNum.maxChange > 0 ? Math.min(2, exampleNum.maxChange) : 2;
        lines.push(`_.set('${pathOf(exampleNum)}', ${v}, ${v + step});//原因`);
      }
      if (exampleStr) {
        const next = exampleNextOption(exampleStr);
        lines.push(`_.set('${pathOf(exampleStr)}', '${exampleStr.initial}', '${next}');//原因`);
      }
      lines.push("</UpdateVariable>");
      lines.push("");
      lines.push("- 格式：_.set('路徑', 舊值, 新值);//原因，一行一個");
      lines.push("- 數字直接寫算好的新值；文字要加引號");
    } else {
      const parts: string[] = [];
      if (numMetrics[0]) parts.push(`${numMetrics[0].name}="+2"`);
      if (numMetrics[1]) parts.push(`${numMetrics[1].name}="-1"`);
      if (strMetrics[0]) {
        parts.push(`${strMetrics[0].name}="${exampleNextOption(strMetrics[0])}"`);
      }
      lines.push(`<affinity-update ${parts.join(" ")} reason="原因"/>`);
      lines.push("");
      lines.push("- 數字型寫變化量，用 + 或 - 開頭；文字型直接寫新的值");
      lines.push("- 有變化的才寫，可以一次寫好幾個");
    }
    return lines;
  }

  /** 每個數值的範圍、上限、可選值和說明 */
  private _metricLines(config: CharacterAffinityConfig): string[] {
    const format = resolveUpdateFormat(config);
    const metrics = config.metrics.filter((m) => m.name.trim());
    const pathOf = (m: AffinityMetricConfig) => m.path?.trim() || m.name;
    const lines: string[] = ["各數值："];
    for (const m of metrics.filter((x) => x.type !== "string")) {
      const range = m.bounded === false ? "沒有上下限" : `範圍 ${m.min}～${m.max}`;
      const step = m.maxChange > 0 ? `，每次最多變動 ${m.maxChange}` : "";
      const desc = m.description?.trim() ? `。${m.description.trim()}` : "";
      lines.push(`- ${m.name}${format === "mvu" ? `（路徑 ${pathOf(m)}）` : ""}：${range}${step}${desc}`);
    }
    for (const m of metrics.filter((x) => x.type === "string")) {
      const opts = m.options.length > 0 ? `，只能是「${m.options.join("」「")}」其中之一` : "";
      const desc = m.description?.trim() ? `。${m.description.trim()}` : "";
      lines.push(`- ${m.name}${format === "mvu" ? `（路徑 ${pathOf(m)}）` : ""}：文字${opts}${desc}`);
    }
    return lines;
  }

  /**
   * 旁觀者判斷用的提示詞：讀這一輪對話，只輸出數值變化。
   * 卡片自己有寫規則（自訂規則或 MVU 卡的 [mvu_update]）時用它的規則。
   */
  buildJudgePrompt(
    config: CharacterAffinityConfig,
    state: ChatAffinityState,
    input: { charName: string; userName: string; dialogue: string },
  ): string {
    const charName = input.charName || "角色";
    const status =
      this.renderAffinityPrompt({ ...config, enabled: true, injectStatus: true }, state, charName) ||
      this._fallbackRender(this.buildContext(config, state, charName));

    const customRules =
      config.updateInstruction?.trim() ||
      (config.mvuEnabled ? config.mvuUpdateInstruction?.trim() : "") ||
      "";
    let rules = customRules;
    if (customRules && customRules.includes("<%")) {
      try {
        rules = ejs.render(customRules, this.buildContext(config, state, charName), { async: false });
      } catch {
        rules = customRules;
      }
    }

    const lines: string[] = [];
    lines.push(
      `你是在旁邊記錄數值的旁觀者，不是${charName}本人。讀下面這一輪對話，判斷${charName}的數值有沒有因此改變。`,
    );
    lines.push("");
    lines.push("[目前數值]");
    lines.push(status);
    lines.push("");
    if (rules) {
      lines.push("[數值規則]");
      lines.push(rules);
      lines.push("");
    }
    lines.push(...this._metricLines(config));
    lines.push("");
    lines.push("[這一輪對話]");
    lines.push(input.dialogue.trim());
    lines.push("");
    lines.push("[輸出方式]");
    lines.push("有變化時，只輸出：");
    lines.push(...this._formatLines(config));
    lines.push("");
    lines.push("沒有變化時，只輸出「無」。不要輸出任何其他文字、不要續寫對話。");
    lines.push(
      "只有這一輪真的發生了會影響數值的事才改；變化要合理、符合角色個性，一次不要跳太多。",
    );
    return lines.join("\n");
  }

  /**
   * 預覽模板渲染（用於配置面板的即時預覽，數值用各指標的初始值）
   */
  previewTemplate(
    template: string,
    config: CharacterAffinityConfig,
    charName?: string,
  ): string {
    try {
      const draft = CharacterAffinityConfigSchema.parse({
        ...JSON.parse(JSON.stringify(config)),
        characterId: config.characterId || "preview",
        enabled: true,
        metrics: config.metrics.filter((m) => m.name?.trim()),
      });
      const state = createDefaultState("preview", draft);
      return ejs
        .render(template, this.buildContext(draft, state, charName), { async: false })
        .trim();
    } catch (error) {
      return `[模板語法錯誤] ${error instanceof Error ? error.message : String(error)}`;
    }
  }

  /**
   * 生成「AI 更新指令」世界書條目的完整文字內容：
   * 目前數值（EJS，送出時才算）+ 依指標產生的更新規則
   */
  generateUpdateInstructionEntry(config: CharacterAffinityConfig, charName?: string): string {
    if (config.metrics.length === 0) return "";

    const charKey = config.statKey?.trim() || charName?.trim() || "角色";
    const lines: string[] = [];
    lines.push("[角色數值狀態]");
    for (const m of config.metrics) {
      if (!m.name.trim()) continue;
      const path = m.path?.trim() || `${charKey}.${m.name}`;
      const fallback = m.type === "string" ? `'${String(m.initial || "未知").replace(/'/g, "\\'")}'` : String(m.initial);
      const read = `<%= getvar('stat_data.${path}') ?? ${fallback} %>`;
      lines.push(
        m.type === "string" || m.bounded === false
          ? `- ${m.name}：${read}`
          : `- ${m.name}：${read}/${m.max}`,
      );
    }
    lines.push("");
    lines.push(this.buildAutoUpdateRules(config));
    return lines.join("\n");
  }

  /** 最終回退：純文字渲染 */
  _fallbackRender(context: AffinityTemplateContext): string {
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
