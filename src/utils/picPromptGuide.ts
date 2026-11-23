/**
 * 模型指揮生圖：
 * - {{picGuide}}：告訴聊天模型這次用哪個生圖服務、prompt 該怎麼寫、可以加 negative
 * - 看圖調整：生完圖讓模型看一眼，不對就改提示詞重畫
 */
import { getImageProvider, getImageProviderLabel, isImageGenReady } from "@/api/ImageGenApi";
import type { ImageProvider, NovelAIImageSettings } from "@/api/NovelAIImageApi";
import { readTagAttr, NEGATIVE_ATTR_NAMES, TAG_ATTRS_PATTERN } from "@/utils/tagAttr";

/** 各生圖服務吃的提示詞寫法 */
export function getPromptStyleHint(provider: ImageProvider): string {
  switch (provider) {
    case "novelai":
      return "prompt 用英文 danbooru 標籤，逗號分隔，重要的寫前面（例如 1girl, long hair, sitting, cafe, smile, window light）";
    case "gpt":
    case "banana":
      return "prompt 用英文自然語言把畫面寫完整：主體、動作、表情、場景、光線、構圖、畫風";
    case "midjourney":
    case "niji":
      return "prompt 用英文短句描述畫面和風格，不要寫 -- 開頭的參數";
  }
}

/** 查 Danbooru 標籤只對 NovelAI 有用（吃 danbooru 標籤）；其他服務吃自然語言 */
export function isDanbooruTagLookupUseful(settings: NovelAIImageSettings): boolean {
  return isImageGenReady(settings) && getImageProvider(settings) === "novelai";
}

/**
 * {{picGuide}}：文生圖能用時接在圖片標籤說明後面；不能用時是空字串。
 * tagLookup：這一輪模型拿得到 search_danbooru_tags 工具
 */
export function buildPicGuide(settings: NovelAIImageSettings, options: { tagLookup?: boolean } = {}): string {
  if (!isImageGenReady(settings)) return "";
  const provider = getImageProvider(settings);
  const lines = [
    `  圖片會用 ${getImageProviderLabel(provider)} 畫：${getPromptStyleHint(provider)}。`,
    '  不想出現在圖裡的東西可以加 negative="英文，逗號分隔"（可省略）。',
  ];
  if (options.tagLookup && provider === "novelai") {
    lines.push(
      "  不確定標籤怎麼寫時，先用 search_danbooru_tags 工具查正式寫法再寫 prompt；要畫出特定畫風（例如照參考圖）時，用 find_danbooru_artists 找繪師，在 prompt 加 artist:名字。",
    );
  }
  if (settings.modelControlsPrompt) {
    lines.push("  不會自動加品質詞和負面詞，需要的話自己寫進 prompt、negative；角色外觀標籤會自動補上。");
  }
  return `\n${lines.join("\n")}`;
}

export interface ImageReviewAttempt {
  prompt: string;
  negativePrompt?: string;
  /** 看圖時說的哪裡不對 */
  reason: string;
}

export interface ImageReviewInput {
  /** 想要的畫面（模型寫的中文描述） */
  description: string;
  prompt: string;
  negativePrompt?: string;
  provider: ImageProvider;
  /** 程式自動加上的外觀標籤 */
  autoTags?: string;
  /** 第幾次檢查（從 1 開始）與上限 */
  round: number;
  maxRounds: number;
  /** 有使用者給的參考圖（送圖時參考圖在前、剛畫的在後） */
  hasReference?: boolean;
  /** 之前試過、被判定要重畫的提示詞 */
  attempts?: ImageReviewAttempt[];
  /** 已經查到的繪師（find_danbooru_artists 的結果文字） */
  artistNotes?: string[];
  /** 這次可以要求查繪師（<find-artists>） */
  canSearchArtists?: boolean;
}

/** 給模型看圖時的指示 */
export function buildImageReviewPrompt(input: ImageReviewInput): string {
  const lines = [
    input.hasReference
      ? "[看圖調整] 第 1 張是使用者給的參考圖（想要的樣子），第 2 張是剛才照你寫的提示詞畫出來的圖。請比對兩張，檢查畫得對不對。"
      : "[看圖調整] 這是剛才照你寫的提示詞畫出來的圖。請看圖檢查畫得對不對。",
    `想要的畫面：${input.description || "（沒有寫描述，照提示詞判斷）"}`,
    `生圖服務：${getImageProviderLabel(input.provider)}（${getPromptStyleHint(input.provider)}）`,
    `正面提示詞：${input.prompt}`,
    `負面提示詞：${input.negativePrompt?.trim() || "（沒有）"}`,
  ];
  if (input.autoTags?.trim()) {
    lines.push(`程式會自動加上的外觀標籤：${input.autoTags.trim()}（不用寫進提示詞）`);
  }
  if (input.attempts?.length) {
    lines.push("之前試過、不滿意的版本（不要再寫回一樣的）：");
    input.attempts.forEach((a, i) => {
      lines.push(
        `${i + 1}. prompt：${a.prompt}｜negative：${a.negativePrompt?.trim() || "（沒有）"}｜不對的地方：${a.reason || "（沒寫）"}`,
      );
    });
  }
  if (input.artistNotes?.length) {
    lines.push("已經查到的繪師：", ...input.artistNotes);
  }
  lines.push(
    `這是第 ${input.round} 次檢查，最多 ${input.maxRounds} 次。`,
    input.hasReference
      ? "檢查：畫風（線條、上色、色調、光線、質感）、取景構圖、髮型服裝跟參考圖像不像；主體、人數、動作、表情對不對；有沒有明顯崩壞（手指、臉、肢體）、多出來的人、文字或浮水印。"
      : "檢查：主體、人數、動作、表情、場景、構圖對不對；有沒有明顯崩壞（手指、臉、肢體）、多出來的人、文字或浮水印。",
    input.hasReference
      ? "小瑕疵可以接受；畫風或構圖跟參考圖差很多就要重畫。"
      : "小瑕疵可以接受，只有明顯不符或崩壞才重畫。",
    "畫得可以就只輸出：<pic-ok/>",
    '要重畫就只輸出：<pic-retry prompt="改好的完整正面提示詞" negative="改好的完整負面提示詞">一句話說哪裡不對</pic-retry>',
  );
  if (input.canSearchArtists) {
    lines.push(
      '畫風不對、想換繪師但不知道有誰時，可以先只輸出：<find-artists queries="標籤, 標籤 | 標籤, 標籤"/>',
      `（每組 1～2 個最能代表${input.hasReference ? "參考圖" : "想要畫面"}的英文標籤，最多 3 組，用 | 分開；查到後會再給你看一次圖。繪師寫進 prompt 用 artist:名字，可以混 2～3 位）`,
    );
  }
  lines.push("prompt 和 negative 都要寫完整的新版本，不是只寫要改的部分。不要輸出其他文字。");
  return lines.join("\n");
}

export type ImageReviewVerdict =
  | { kind: "ok" }
  | { kind: "retry"; prompt: string; negativePrompt?: string; reason: string }
  | { kind: "search"; queries: string[] };

const PIC_RETRY_TAG = new RegExp(String.raw`<pic-retry${TAG_ATTRS_PATTERN}\s*(?:\/>|>([\s\S]*?)(?:<\/pic-retry>|$))`, "i");
const FIND_ARTISTS_TAG = new RegExp(String.raw`<find-artists${TAG_ATTRS_PATTERN}\s*\/?>`, "i");

/**
 * 解析看圖結果：<pic-retry prompt="..."> 重畫、<find-artists queries="..."> 先查繪師，
 * 其他（<pic-ok/>、看不懂的回覆）都當作可以
 */
export function parseImageReviewReply(reply: string): ImageReviewVerdict {
  const text = reply.replace(/<think(?:ing)?>[\s\S]*?<\/think(?:ing)?>/gi, "");
  const retry = text.match(PIC_RETRY_TAG);
  const prompt = retry ? readTagAttr(retry[1], "prompt") : undefined;
  if (retry && prompt) {
    return {
      kind: "retry",
      prompt,
      negativePrompt: readTagAttr(retry[1], ...NEGATIVE_ATTR_NAMES),
      reason: (retry[2] || "").replace(/\s+/g, " ").trim(),
    };
  }
  const search = text.match(FIND_ARTISTS_TAG);
  const queries = (readTagAttr(search?.[1], "queries", "query") || "")
    .split("|")
    .map((q) => q.trim())
    .filter(Boolean)
    .slice(0, 3);
  if (queries.length) return { kind: "search", queries };
  return { kind: "ok" };
}

/** 看圖調整最多重畫幾次的上限（照參考圖換繪師常要多試幾次） */
export const SELF_REVIEW_MAX_ROUNDS_LIMIT = 5;

/** 看圖調整最多重畫幾次：1～5，沒設定是 1 */
export function getSelfReviewMaxRounds(settings: NovelAIImageSettings): number {
  const n = Math.round(Number(settings.selfReviewMaxRounds ?? 1));
  return Number.isFinite(n) ? Math.min(SELF_REVIEW_MAX_ROUNDS_LIMIT, Math.max(1, n)) : 1;
}
