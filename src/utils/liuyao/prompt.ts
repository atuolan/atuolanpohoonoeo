/**
 * 六爻解卦提示詞
 * 依《增刪卜易》（野鶴老人）為主，參《卜筮正宗》《黃金策》
 * 查表就能確定的事實（生剋沖合、旺衰、空破、動變）由 analysis.ts 算好直接給，AI 只做取用神、權衡與應期
 */
import type { ZhouyiText } from "@/data/liuyao/zhouyi";
import type { ChartFacts, LiuyaoChart, QuestionCategory, YaoFacts, YaoLine } from "@/types/liuyao";

export const POSITION_NAME = ["初爻", "二爻", "三爻", "四爻", "五爻", "上爻"] as const;

export const CATEGORY_LABEL: Record<QuestionCategory, string> = {
  love: "感情",
  career: "事業",
  wealth: "求財",
  exam: "考試",
  health: "健康",
  seek: "尋人尋物",
  travel: "出行",
  other: "其他",
};

/** 各類別的取用神提示（問題本身更明確時以問題為準） */
const CATEGORY_HINT: Record<QuestionCategory, string> = {
  love: "男占女、占妻、占女友以妻財為用神；女占男、占夫、占男友以官鬼為用神；同時看世（己）應（對方）。",
  career: "工作、職位、上司、升遷以官鬼為用神；自己的處境看世爻；合約文書看父母。",
  wealth: "以妻財為用神，子孫為原神，兄弟為忌神。",
  exam: "功名、錄取、名次以官鬼為用神；考卷、文章、成績單以父母為用神。",
  health: "自占以世爻為用神，官鬼為病，子孫為醫藥；占他人依關係取六親。",
  seek: "尋人依關係取六親；尋物依物性：財物以妻財、文件衣物車輛以父母為用神；失竊看官鬼為賊。",
  travel: "出行看世爻為自身、子孫為平安、父母為車船；問人何時回來，依關係取六親。",
  other: "依問題內容取用神；問自己整體運勢以世爻為用神。",
};

export const LIUYAO_RULES = `【斷卦依據】
以《增刪卜易》（野鶴老人）為主，參《卜筮正宗》《黃金策》。不用神煞；六神只當輔助象意，不決定吉凶。

一、取用神
- 自身運勢、自己的事、自占疾病：世爻（疾病另看官鬼為病、子孫為醫藥）
- 求財、物品價值：妻財；子孫為原神，兄弟為忌神
- 工作、職位、上司、考試功名、官司：官鬼；考卷文章、合約文書、房屋車輛、長輩：父母
- 感情：男占女／占妻→妻財；女占男／占夫→官鬼；性別不明時說明你採用哪個與理由，並參看世應（世為己、應為對方）
- 子女、寵物、醫藥、平安喜慶：子孫；兄弟朋友同輩、競爭破財：兄弟
- 尋人依關係取六親；尋物依物性（財物→妻財，文件衣物車→父母）
- 用神不上卦：先看日辰、月建是否就是用神；否則取伏神（能不能出已算好）
- 用神兩現：取動不取靜、取旺不取衰、取不空不破者、取持世或臨日月者
- 原神（生用神）、忌神（剋用神）、仇神（剋原神）一併看

二、旺衰
- 旺衰以月建為主、日辰並重；得月建或日辰臨、扶、生者有氣，受剋、被沖、洩耗者衰
- 動爻能生剋靜爻與其他動爻；變爻只作用於自己的動爻，不作用於其他爻
- 用神無根（休囚無生扶），原神再旺也難生
- 元神有力：旺相或臨日月、動化回頭生或化進、長生帝旺於日；元神無力：休囚不動、休囚又空破、動化退、化絕化剋化破、入墓
- 忌神有力、無力的條件同理

三、空、破、暗動
- 旬空：旺不為空、動不為空、有日辰動爻生扶不為空、日沖為沖空（實）；休囚又無生扶才是真空，真空主無、主落空
- 月破：靜而無日辰動爻生助才是真破，如枯根朽木；動爻雖破仍能作用；出月、實破之日、逢合之日不破
- 暗動：靜爻旺相被日沖。喜在原神暗動生用神，忌在忌神暗動剋用神；暗動之福禍常不知不覺而至
- 日破：靜爻休囚被日沖，作用與月破相近
- 沖散：休囚動爻被日沖，力量散去；旺相者沖之不散

四、動變
- 回頭剋最凶，不論用神旺衰；回頭生吉
- 化進神：主長久、增益；化退神：主漸消、退縮。動與變皆旺相則乘勢而進／得時不退；休囚者待時；有空破者待填實之日
- 化空、化破：力量暫失，待出空、填實之期
- 化墓：衰者更困；旺者暫困，沖墓之期可出。化絕：衰者無救，旺者遇生扶之期再起
- 化合：動而被合，事被牽絆或得助；化沖（爻反吟）：反覆
- 卦反吟（內外卦互沖變）：事多反覆、成而又敗、得而復失；伏吟（乾震互變）：憂鬱停滯、呻吟不前。成敗仍看用神：用神旺相不受回頭沖剋，反覆後仍可成
- 伏神：得日月生、旺相、飛神生、動爻生、日月動爻沖剋飛神、飛神空破休囚墓絕，皆可出；休囚無氣、被日月沖剋、被旺相飛神剋、墓絕於日月飛爻、休囚又空破，終不得出。伏神旺相而空者，出空之日可出

五、全卦
- 六沖卦：事多散、難長久，近事易散，壞事反易解；六合卦：事易成、能持久；六合化六沖先合後散、六沖化六合先散後合
- 獨發、獨靜只作參考，成敗應期仍由用神決定
- 六爻亂動：事情紛雜，更要專看用神
- 遊魂卦：心神不定、多變動、在外；歸魂卦：歸於本處、事不出門、守舊
- 三合局：成局則合力生或剋所屬五行；需有動爻參與，局中有空破者待填實

六、應期（近事應日時，遠事應年月）
- 用神旺而靜：逢沖、值日之期；旺而動：逢合、值日之期；太旺：入墓或逢沖之期
- 用神衰：生旺之期（長生、帝旺、被生扶之日）
- 用神空：出空、沖空、填實之期；月破：出月、實破、逢合之期
- 用神入墓：沖墓之期；被合住：沖開之期；靜而逢沖：逢合之期
- 用神伏藏：值日、沖飛神、生伏神之期
- 用神受剋：忌神被制（受沖剋、入墓）之期
- 動爻化進化退依進退法則定遲速

七、卦爻辭
卦辭、爻辭作象意補充；斷吉凶以用神為主。兩者矛盾時，說明以用神為準。

八、六神象意（輔助）
青龍：喜慶、財帛、酒色；朱雀：口舌、文書、消息；勾陳：田土、遲滯、牽連；螣蛇：虛驚、怪異、糾纏；白虎：凶喪、血光、威猛、病痛；玄武：暗昧、盜失、私情`;

const OUTPUT_RULES = `【輸出要求】
繁體中文，依序分段，每段用【】當小標題：
【卦象】本卦→變卦一兩句話的意象
【用神】取哪一爻、為什麼（有疑義就說明）
【旺衰與動變】用神、原神、忌神各自的力量；動爻怎麼影響用神
【世應與其他】世應關係，以及反吟伏吟、六沖六合、伏神、三合等有影響的部分（沒有影響的就不提）
【結論】吉、凶，或在什麼條件下成，用一兩句話直接回答問題
【應期】依應期法則推出可能的日或月（寫地支，再換算成大約的日期，起卦日之後最近的那幾個）；推不出就直說
【建議】具體可以做的事

- 卦盤事實已由程式依規則算好，直接採用，不要自己重算地支的生剋沖合
- 不誇大、不嚇人；卦象不明時誠實說「此卦不明，可再起一卦合參」
- 健康、法律、重大金錢決定：提醒以專業意見為主，卦只是參考
- 長度約 600–1000 字`;

export interface LiuyaoReader {
  name: string;
  description?: string;
  personality?: string;
  userName: string;
  userPersona?: string;
}

export interface LiuyaoPromptInput {
  chart: LiuyaoChart;
  facts: ChartFacts;
  question: string;
  category: QuestionCategory | null;
  /** 本卦、變卦的周易原文；載入失敗可省略 */
  original?: ZhouyiText | null;
  changed?: ZhouyiText | null;
  /** 不給就是一般占卜師 */
  reader?: LiuyaoReader | null;
}

function clip(s: string | undefined, n: number): string {
  const t = (s ?? "").trim();
  return t.length > n ? `${t.slice(0, n)}…` : t;
}

function yinYang(yang: boolean): string {
  return yang ? "陽" : "陰";
}

function movingMark(line: YaoLine): string {
  if (!line.moving) return "";
  return line.value === 9 ? "○老陽動" : "×老陰動";
}

/** 卦盤文字表，上爻在上 */
export function formatChartTable(chart: LiuyaoChart): string {
  const rows = [...chart.lines].reverse().map((l) => {
    const parts = [`${POSITION_NAME[l.position - 1]}：${l.liushen}`, `${l.liuqin}${l.zhi}${l.wuxing}`, yinYang(l.yang)];
    const mark = movingMark(l);
    if (mark) parts.push(mark);
    if (l.isShi) parts.push("世");
    if (l.isYing) parts.push("應");
    if (l.fushen) parts.push(`（伏：${l.fushen.liuqin}${l.fushen.zhi}${l.fushen.wuxing}）`);
    if (l.changed) {
      const c = l.changed;
      parts.push(l.moving ? `→ 變出 ${c.liuqin}${c.zhi}${c.wuxing} ${yinYang(c.yang)}` : `｜變卦同位 ${c.liuqin}${c.zhi}${c.wuxing}`);
    }
    return parts.join(" ");
  });
  return rows.join("\n");
}

function formatYaoFacts(line: YaoLine, f: YaoFacts, chart: LiuyaoChart): string {
  const { time } = chart;
  const seg: string[] = [];
  seg.push(`月建${time.monthZhi}（${f.month.rels.join("、")}，${f.month.season}）`);
  const dayStage = f.day.stage ? `，${f.day.stage}於日` : "";
  seg.push(`日辰${time.dayZhi}（${f.day.rels.join("、")}${dayStage}）`);
  seg.push(f.strong ? "有氣" : "休囚無氣");
  if (f.monthBreak) seg.push("月破");
  if (f.staticDayClash) seg.push(f.staticDayClash);
  if (f.movingDayClash) seg.push(f.movingDayClash);
  if (f.kong) {
    const why = f.kong.reasons.length ? `不為空：${f.kong.reasons.join("、")}` : "真空";
    seg.push(`旬空（${why}${f.kong.monthBreakToo ? "；又逢月破" : ""}）`);
  }
  if (f.change?.length && line.changed) {
    seg.push(`動化${line.changed.zhi}${line.changed.wuxing}：${f.change.join("、")}`);
  }
  let text = `${POSITION_NAME[line.position - 1]} ${line.liuqin}${line.zhi}${line.wuxing}：${seg.join("；")}`;
  if (f.fushen && line.fushen) {
    const fs = f.fushen;
    const fu = line.fushen;
    text +=
      `\n  └ 伏神 ${fu.liuqin}${fu.zhi}${fu.wuxing}：${fs.rels.join("、")}；` +
      `助力：${fs.helps.join("、") || "無"}；阻力：${fs.hinders.join("、") || "無"}；判斷：${fs.verdict}`;
  }
  return text;
}

/** 斷卦事實逐條 */
export function formatFacts(chart: LiuyaoChart, facts: ChartFacts): string {
  const out: string[] = [];
  const lines = [...chart.lines].reverse();
  for (const l of lines) {
    const f = facts.lines[l.position - 1];
    if (f) out.push(formatYaoFacts(l, f, chart));
  }
  const whole: string[] = [];
  whole.push(`動爻 ${facts.movingCount} 個（${facts.movingPattern}）`);
  if (facts.liuchong.original) whole.push("本卦為六沖卦");
  if (facts.liuhe.original) whole.push("本卦為六合卦");
  if (facts.liuchong.changed) whole.push("變卦為六沖卦");
  if (facts.liuhe.changed) whole.push("變卦為六合卦");
  if (facts.fanyin.length) whole.push(`${facts.fanyin.join("、")}反吟`);
  if (facts.fuyin.length) whole.push(`${facts.fuyin.join("、")}伏吟`);
  for (const s of facts.sanhe) whole.push(`${s.zhi.join("")}${s.ju}湊齊（${s.sources.join("、")}）`);
  if (facts.shiYing.length) whole.push(`世應：${facts.shiYing.join("、")}`);
  out.push(`全卦：${whole.join("；")}`);
  return out.join("\n");
}

function formatTexts(input: LiuyaoPromptInput): string {
  const { chart, original, changed } = input;
  const out: string[] = [];
  if (original) {
    out.push(`本卦《${chart.original.fullName}》卦辭：${original.guaci}`);
    out.push(original.xiang);
    const allMoving = chart.lines.every((l) => l.moving);
    if (allMoving && original.yong) {
      out.push(`六爻皆動：${original.yong.text}${original.yong.xiang}`);
    } else {
      for (const l of chart.lines) {
        const t = original.lines[l.position - 1];
        if (l.moving && t) out.push(`動爻 ${t.text}${t.xiang}`);
      }
    }
  }
  if (chart.changed && changed) {
    out.push(`變卦《${chart.changed.fullName}》卦辭：${changed.guaci}`);
  }
  return out.join("\n");
}

function formatIdentity(reader: LiuyaoReader | null | undefined): string {
  if (!reader) {
    return "你是精研《增刪卜易》的六爻卦師，斷卦嚴謹、說話溫和，會把專業術語講成一般人聽得懂的話。";
  }
  const lines = [`你現在是「${reader.name}」，正在替 ${reader.userName} 解一個六爻卦。`];
  const desc = clip(reader.description, 1200);
  const pers = clip(reader.personality, 400);
  if (desc) lines.push(`【${reader.name} 的人設】\n${desc}`);
  if (pers) lines.push(`【${reader.name} 的性格】\n${pers}`);
  const up = clip(reader.userPersona, 400);
  if (up) lines.push(`【${reader.userName} 的設定】\n${up}`);
  lines.push(
    `用 ${reader.name} 的口吻、對 ${reader.userName} 說話；${reader.name} 精通六爻（就算人設沒提，這次也照專業水準來解）。` +
      "角色口吻只改變說話方式，斷卦依據、分析步驟與結論不能因此省略或改變。",
  );
  return lines.join("\n\n");
}

export interface LiuyaoPrompt {
  system: string;
  user: string;
}

export function buildLiuyaoPrompt(input: LiuyaoPromptInput): LiuyaoPrompt {
  const { chart, facts, question, category } = input;
  const { time, original, changed } = chart;

  const system = [formatIdentity(input.reader), LIUYAO_RULES, OUTPUT_RULES].join("\n\n");

  const date = new Date(time.timestamp);
  const pad = (n: number) => String(n).padStart(2, "0");
  const dateText = `${date.getFullYear()}/${date.getMonth() + 1}/${date.getDate()} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
  const hexLine = (h: typeof original) => `${h.fullName}（${h.palace}宮・${h.generation}，宮屬${h.palaceWuxing}）`;

  const info = [
    `問題：${question.trim() || "（未填）"}`,
    category ? `問事類別：${CATEGORY_LABEL[category]}（取用神參考：${CATEGORY_HINT[category]}）` : "",
    `起卦時間：${dateText}（${time.lunarText}）`,
    `四柱：${time.year}年 ${time.month}月 ${time.day}日 ${time.hour}時`,
    `月建：${time.monthZhi}　日辰：${time.day}　旬空：${time.xunKong.join("")}`,
    `本卦：${hexLine(original)}`,
    changed ? `變卦：${hexLine(changed)}` : "變卦：無（六爻安靜）",
  ].filter(Boolean);

  const texts = formatTexts(input);

  const user = [
    `【起卦資料】\n${info.join("\n")}`,
    `【卦盤】（上爻在上；六親以本卦宮五行論）\n${formatChartTable(chart)}`,
    `【卦盤事實】以下由程式依規則算出，請直接採用，不要自己重算地支關係。\n${formatFacts(chart, facts)}`,
    texts ? `【周易原文】\n${texts}` : "",
    "請依斷卦依據解這一卦。",
  ]
    .filter(Boolean)
    .join("\n\n");

  return { system, user };
}
