import { regexFromString, type RegexPlacement, type RegexRunParams } from "@/services/RegexEngine";
import type { RegexScript } from "@/types/character";

export interface HtmlTemplateResult {
  text: string;
  htmlBlocks: string[];
  applied: number;
}

interface TemplateContext extends RegexRunParams {
  placement?: RegexPlacement;
  user?: string;
  char?: string;
  charName?: string;
  userGender?: string;
  charGender?: string;
  userAvatar?: string;
  charAvatar?: string;
}

type ParsedTemplateContext = Record<string, unknown>;

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function escapeHtml(value: unknown): string {
  return String(value ?? "").replace(/[&<>"']/g, (c) => {
    const map: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    };
    return map[c] ?? c;
  });
}

function expandGlobalMacros(template: string, ctx: TemplateContext): string {
  if (!template) return "";
  const now = new Date();
  return template.replace(/\{\{([^{}]+)\}\}/g, (match, rawKey: string) => {
    const key = rawKey.trim();
    if (key.startsWith("random:")) {
      const pool = key
        .slice(7)
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      return pool.length ? pool[Math.floor(Math.random() * pool.length)] : match;
    }
    switch (key) {
      case "user":
        return ctx.userName || ctx.user || "";
      case "char":
        return ctx.characterName || ctx.charName || ctx.char || "";
      case "user.gender":
        return ctx.userGender || "";
      case "char.gender":
        return ctx.charGender || "";
      case "user.avatar":
        return ctx.userAvatar || "";
      case "char.avatar":
        return ctx.charAvatar || "";
      case "time":
        return `${pad(now.getHours())}:${pad(now.getMinutes())}`;
      case "date":
        return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
      default:
        return match;
    }
  });
}

function parseKv(raw: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const idx = trimmed.indexOf("=") >= 0 ? trimmed.indexOf("=") : trimmed.indexOf(":");
    if (idx < 0) continue;
    const key = trimmed.slice(0, idx).trim();
    const value = trimmed.slice(idx + 1).trim();
    if (key) result[key] = value;
  }
  return result;
}

function parseMatches(matches: string[], mode: RegexScript["parseMode"]): ParsedTemplateContext {
  const ctx: ParsedTemplateContext = { $0: matches[0] ?? "" };
  for (let i = 1; i < matches.length; i++) {
    const raw = matches[i] ?? "";
    ctx[`$${i}`] = raw;
    if (mode === "json") {
      try {
        const parsed = JSON.parse(raw);
        ctx[i] = parsed && typeof parsed === "object" ? parsed : {};
      } catch {
        ctx[i] = {};
      }
    } else if (mode === "kv") {
      ctx[i] = parseKv(raw);
    } else {
      ctx[i] = raw;
    }
  }
  return ctx;
}

function resolvePath(path: string, ctx: ParsedTemplateContext): unknown {
  if (/^\$\d+$/.test(path)) return ctx[path];
  const numeric = path.match(/^(\d+)(?:\.(.+))?$/);
  if (!numeric) return undefined;
  let value = ctx[Number(numeric[1])];
  const rest = numeric[2];
  if (!rest) return value;
  for (const seg of rest.split(".").map((s) => s.trim()).filter(Boolean)) {
    if (value == null || typeof value !== "object") return undefined;
    value = (value as Record<string, unknown>)[seg];
  }
  return value;
}

function renderValue(key: string, ctx: ParsedTemplateContext, item?: unknown): string {
  const trimmed = key.trim();
  if (trimmed.startsWith("#") || trimmed.startsWith("/")) return `{{${key}}}`;
  if (
    item &&
    typeof item === "object" &&
    !/^\$/.test(trimmed) &&
    !/^\d+\./.test(trimmed)
  ) {
    let value: unknown = item;
    for (const seg of trimmed.split(".").map((s) => s.trim()).filter(Boolean)) {
      if (value == null || typeof value !== "object") {
        value = undefined;
        break;
      }
      value = (value as Record<string, unknown>)[seg];
    }
    if (value != null) return escapeHtml(value);
  }
  return escapeHtml(resolvePath(trimmed, ctx));
}

function renderTemplate(template: string, ctx: ParsedTemplateContext): string {
  const withLoops = template.replace(
    /\{\{#each:([^{}]+)\}\}([\s\S]*?)\{\{\/each\}\}/g,
    (_match, pathRaw: string, inner: string) => {
      const arr = resolvePath(pathRaw.trim(), ctx);
      if (!Array.isArray(arr)) return "";
      return arr
        .map((item) => inner.replace(/\{\{([^{}]+)\}\}/g, (_m, key: string) => renderValue(key, ctx, item)))
        .join("");
    },
  );
  return withLoops.replace(/\{\{([^{}]+)\}\}/g, (_match, key: string) => renderValue(key, ctx));
}

function shouldApplyScript(script: RegexScript, params: TemplateContext): boolean {
  if (script.disabled || !script.isHtmlTemplate || !script.findRegex || !script.htmlTemplate) return false;
  if (params.placement !== undefined && !script.placement?.includes(params.placement)) return false;
  const { isMarkdown = false, isPrompt = false, isEdit = false } = params;
  if (script.markdownOnly || script.promptOnly) {
    const matchesContext = (script.markdownOnly && isMarkdown) || (script.promptOnly && isPrompt);
    if (!matchesContext) return false;
  } else if (isMarkdown || isPrompt) {
    return false;
  }
  if (isEdit && !script.runOnEdit) return false;
  if (params.depth !== undefined) {
    const min = script.minDepth ?? -1;
    const max = script.maxDepth ?? -1;
    if (min >= 0 && params.depth < min) return false;
    if (max >= 0 && params.depth > max) return false;
  }
  return true;
}

function extractTriggerTag(pattern: string): string | null {
  const normalized = pattern.trim().replace(/^\/\s*/, "");
  const match = normalized.match(/^<([\w一-龥][\w一-龥-]*)/);
  return match?.[1]?.toLowerCase() ?? null;
}

function hasAnyTriggerTag(text: string, scripts: RegexScript[], params: TemplateContext): boolean {
  const lower = text.toLowerCase();
  let hasTemplateWithoutTag = false;
  for (const script of scripts) {
    if (!shouldApplyScript(script, params)) continue;
    const pattern = expandGlobalMacros(script.findRegex, params).trim();
    const tag = extractTriggerTag(pattern);
    if (!tag) {
      hasTemplateWithoutTag = true;
      continue;
    }
    if (lower.includes(`<${tag}`)) return true;
  }
  return hasTemplateWithoutTag;
}

export function applyHtmlTemplateRules(
  text: string,
  scripts: RegexScript[],
  params: TemplateContext = {},
): HtmlTemplateResult {
  if (!text || !scripts.length) return { text: text || "", htmlBlocks: [], applied: 0 };
  if (!hasAnyTriggerTag(text, scripts, params)) return { text, htmlBlocks: [], applied: 0 };
  let result = text;
  const htmlBlocks: string[] = [];
  let applied = 0;
  const sorted = [...scripts].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

  for (const script of sorted) {
    if (!shouldApplyScript(script, params)) continue;
    const pattern = expandGlobalMacros(script.findRegex, params).trim();
    const regex = regexFromString(pattern);
    if (!regex) continue;
    let matched = false;
    try {
      result = result.replace(regex, (...args) => {
        const matches = args.slice(0, -2) as string[];
        const parsed = parseMatches(matches, script.parseMode ?? "text");
        const template = expandGlobalMacros(script.htmlTemplate ?? "", params);
        const css = expandGlobalMacros(script.cssScope ?? "", params).trim();
        const html = `${css ? `<style>${css}</style>` : ""}${renderTemplate(template, parsed)}`;
        matched = true;
        htmlBlocks.push(html);
        return `\`\`\`html\n${html}\n\`\`\``;
      });
    } catch {
      continue;
    }
    if (matched) applied++;
  }

  return { text: result.trim(), htmlBlocks, applied };
}

export function buildHtmlTemplatePrompt(scripts: RegexScript[], params: TemplateContext = {}): string {
  const prompts = scripts
    .filter((script) => !script.disabled && script.isHtmlTemplate && script.aiPrompt?.trim())
    .filter((script) => params.placement === undefined || script.placement?.includes(params.placement))
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    .map((script) => expandGlobalMacros(script.aiPrompt ?? "", params).trim())
    .filter(Boolean);
  return prompts.join("\n\n");
}
