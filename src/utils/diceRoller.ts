/**
 * 群聊跑團骰子機器人
 * 指令：.r 擲骰（.r 2d6+3 攻擊）、.rd 預設骰、.ra / .rc 技能檢定（.ra 偵查 60）、.help 說明
 * 句點可用半形「.」或全形「。」「．」
 */

export type DiceOutcome = "critical" | "extreme" | "hard" | "success" | "failure" | "fumble";

export const DICE_OUTCOME_LABEL: Record<DiceOutcome, string> = {
  critical: "大成功",
  extreme: "極難成功",
  hard: "困難成功",
  success: "成功",
  failure: "失敗",
  fumble: "大失敗",
};

export type DiceCommand =
  | { kind: "roll"; expr: string; reason?: string }
  | { kind: "check"; reason?: string; target?: number }
  | { kind: "help" };

export interface DiceRollData {
  /** 擲骰者名字 */
  roller: string;
  kind: "roll" | "check" | "help";
  /** 正規化後的算式，例如 2D6+3 */
  expr: string;
  /** 每顆骰子的點數，例如 [3,5]+3；只有一顆骰子時是空字串 */
  detail: string;
  total: number;
  /** 擲骰原因／技能名 */
  reason?: string;
  /** 檢定目標值 */
  target?: number;
  outcome?: DiceOutcome;
}

const MAX_TERMS = 10;
const MAX_DICE = 100;
const MAX_SIDES = 1000;
const DEFAULT_SIDES = 100;

const COMMAND_RE = /^[.。．]\s*(help|ra|rc|rd|r)(?![a-z])\s*([\s\S]*)$/i;
const EXPR_RE = /^(?:\d*d\d*|\d+)(?:\s*[+\-]\s*(?:\d*d\d*|\d+))*/i;

/** 把輸入框文字解析成骰子指令；不是指令就回傳 null */
export function parseDiceCommand(text: string): DiceCommand | null {
  const m = (text || "").trim().match(COMMAND_RE);
  if (!m) return null;
  const cmd = m[1].toLowerCase();
  let rest = m[2].trim();

  if (cmd === "help") return { kind: "help" };

  if (cmd === "ra" || cmd === "rc") {
    const num = rest.match(/\d+/);
    const target = num ? Number(num[0]) : undefined;
    const reason = (num ? rest.replace(num[0], "") : rest).trim();
    return { kind: "check", reason: reason || undefined, target };
  }

  // .rd20 = .r d20；.rd 不帶數字 = 預設骰
  if (cmd === "rd") rest = /^\d/.test(rest) ? `d${rest}` : `d ${rest}`;

  const exprMatch = rest.match(EXPR_RE);
  const expr = exprMatch ? exprMatch[0].replace(/\s+/g, "") : "d";
  const reason = (exprMatch ? rest.slice(exprMatch[0].length) : rest).trim();
  return { kind: "roll", expr, reason: reason || undefined };
}

function rollDie(sides: number, rng: () => number): number {
  return Math.floor(rng() * sides) + 1;
}

/** CoC 7 版檢定結果 */
export function checkOutcome(roll: number, target: number): DiceOutcome {
  if (roll === 1) return "critical";
  if (roll === 100 || (target < 50 && roll >= 96)) return "fumble";
  if (roll <= Math.floor(target / 5)) return "extreme";
  if (roll <= Math.floor(target / 2)) return "hard";
  if (roll <= target) return "success";
  return "failure";
}

/** 照算式擲骰；算式不合法或骰子太多時回傳 null */
export function rollExpression(
  expr: string,
  rng: () => number = Math.random,
): { expr: string; detail: string; total: number } | null {
  const terms = expr.replace(/\s+/g, "").match(/[+\-]?[^+\-]+/g);
  if (!terms || terms.length === 0 || terms.length > MAX_TERMS) return null;

  const exprParts: string[] = [];
  const detailParts: string[] = [];
  let total = 0;
  let diceCount = 0;

  for (const raw of terms) {
    const sign = raw.startsWith("-") ? -1 : 1;
    const body = raw.replace(/^[+\-]/, "");
    const op = exprParts.length === 0 ? (sign < 0 ? "-" : "") : sign < 0 ? "-" : "+";
    const dice = body.match(/^(\d*)d(\d*)$/i);
    if (dice) {
      const count = dice[1] ? Number(dice[1]) : 1;
      const sides = dice[2] ? Number(dice[2]) : DEFAULT_SIDES;
      if (count < 1 || sides < 1 || sides > MAX_SIDES) return null;
      diceCount += count;
      if (diceCount > MAX_DICE) return null;
      const rolls = Array.from({ length: count }, () => rollDie(sides, rng));
      const sum = rolls.reduce((a, b) => a + b, 0);
      total += sign * sum;
      exprParts.push(`${op}${count > 1 ? count : ""}D${sides}`);
      detailParts.push(`${op}${count > 1 ? `[${rolls.join(",")}]` : rolls[0]}`);
    } else if (/^\d+$/.test(body)) {
      total += sign * Number(body);
      exprParts.push(`${op}${body}`);
      detailParts.push(`${op}${body}`);
    } else {
      return null;
    }
  }

  const single = terms.length === 1 && !/^\[/.test(detailParts[0]) && exprParts[0].includes("D");
  return { expr: exprParts.join(""), detail: single ? "" : detailParts.join(""), total };
}

/** 執行一個骰子指令；算式不合法時回傳 null */
export function runDiceCommand(
  cmd: DiceCommand,
  roller: string,
  rng: () => number = Math.random,
): DiceRollData | null {
  if (cmd.kind === "help") {
    return { roller, kind: "help", expr: "", detail: "", total: 0 };
  }
  if (cmd.kind === "check") {
    const roll = rollDie(100, rng);
    return {
      roller,
      kind: "check",
      expr: "D100",
      detail: "",
      total: roll,
      reason: cmd.reason,
      target: cmd.target,
      outcome: cmd.target !== undefined ? checkOutcome(roll, cmd.target) : undefined,
    };
  }
  const result = rollExpression(cmd.expr, rng);
  if (!result) return null;
  return { roller, kind: "roll", ...result, reason: cmd.reason };
}

/** AI 的 <dice> 標籤：有 target 就是技能檢定，否則照 expr 擲骰 */
export function diceCommandFromTag(attrs: {
  expr?: string;
  reason?: string;
  target?: string;
}): DiceCommand {
  const reason = attrs.reason?.trim() || undefined;
  const target = attrs.target && /\d/.test(attrs.target) ? Number(attrs.target.match(/\d+/)![0]) : undefined;
  if (target !== undefined) return { kind: "check", reason, target };
  return { kind: "roll", expr: attrs.expr?.trim() || "d", reason };
}

export interface DiceTagRequest {
  name: string;
  expr?: string;
  reason?: string;
  target?: string;
}

const DICE_TAG_RE = /[ \t]*<dice\s+([^>]*?)\s*\/?>(?:\s*<\/dice>)?[ \t]*\n?/gi;

function readAttr(attrs: string, name: string): string | undefined {
  const m = attrs.match(new RegExp(`\\b${name}\\s*=\\s*["']([^"']*)["']`, "i"));
  return m ? m[1].trim() || undefined : undefined;
}

/** 面對面小說式回覆：把 <dice> 標籤從正文抽出來，回覆處理完再公布結果 */
export function extractDiceTags(content: string): { content: string; requests: DiceTagRequest[] } {
  const requests: DiceTagRequest[] = [];
  const stripped = content.replace(DICE_TAG_RE, (_tag, attrs: string) => {
    requests.push({
      name: readAttr(attrs, "name") || "",
      expr: readAttr(attrs, "expr"),
      reason: readAttr(attrs, "reason"),
      target: readAttr(attrs, "target"),
    });
    return "";
  });
  return { content: requests.length > 0 ? stripped : content, requests };
}

export const DICE_HELP_TEXT = [
  "🎲 骰子機器人指令",
  ".r 擲骰：.r（1D100）、.r 2d6+3 攻擊、.rd20",
  ".ra 技能檢定：.ra 偵查 60（結果：大成功／極難成功／困難成功／成功／失敗／大失敗）",
  "句點用全形「。」也可以",
].join("\n");

/** 骰子結果寫成一句話，畫面和提示詞都用這句 */
export function formatDiceRoll(data: DiceRollData): string {
  if (data.kind === "help") return DICE_HELP_TEXT;
  if (data.kind === "check" && data.target !== undefined && data.outcome) {
    const skill = data.reason ? `${data.reason}檢定` : "檢定";
    return `🎲 ${data.roller} 進行${skill}：D100=${data.total}/${data.target} ${DICE_OUTCOME_LABEL[data.outcome]}`;
  }
  const why = data.reason ? `（${data.reason}）` : "";
  const detail = data.detail ? `=${data.detail}` : "";
  return `🎲 ${data.roller} 擲骰${why}：${data.expr}${detail}=${data.total}`;
}
