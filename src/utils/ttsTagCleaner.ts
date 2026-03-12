/**
 * MiniMax TTS 標記清理工具
 *
 * AI 回覆中可能包含以下 TTS 標記：
 * - 語氣標籤：(laughs) (sighs) (gasps) 等 22 種
 * - 停頓控制：<#秒數#>，如 <#1.5#>
 * - 情緒/語速：[emotion=happy] 或 [emotion=sad;speed=0.8]
 *
 * 這些標記需要：
 * 1. 原封不動送給 MiniMax TTS API（它會解析）
 * 2. 從顯示文字中清除（用戶看乾淨文字，聽帶情緒語音）
 */

/** 所有 MiniMax 語氣標籤 */
const TONE_TAGS = [
  'laughs', 'chuckle', 'coughs', 'clear-throat',
  'groans', 'breath', 'pant', 'inhale', 'exhale',
  'gasps', 'sniffs', 'sighs', 'snorts', 'burps',
  'lip-smacking', 'humming', 'hissing', 'emm',
  'sneezes', 'whistles', 'crying', 'applause',
];

/** 語氣標籤正則：(laughs) (sighs) 等 */
const TONE_TAG_RE = new RegExp(
  `\\((?:${TONE_TAGS.join('|')})\\)`,
  'gi',
);

/** 停頓標記正則：<#0.5#> <#1.5#> 等 */
const PAUSE_RE = /<#[\d.]+#>/g;

/** 情緒/語速標記正則：[emotion=happy] [emotion=sad;speed=0.8] */
const EMOTION_RE = /\[emotion=[^\]]*\]/gi;

/**
 * 從顯示文字中清除所有 TTS 標記
 * 用於用戶看到的聊天氣泡
 */
export function cleanTTSTags(text: string): string {
  return text
    .replace(TONE_TAG_RE, '')
    .replace(PAUSE_RE, '')
    .replace(EMOTION_RE, '')
    // 清理多餘空格
    .replace(/  +/g, ' ')
    .trim();
}

/**
 * 檢測文字中是否包含 TTS 標記
 */
export function hasTTSTags(text: string): boolean {
  // 使用不帶 g flag 的新正則，避免 lastIndex 問題
  const toneTest = new RegExp(`\\((?:${TONE_TAGS.join('|')})\\)`, 'i');
  const pauseTest = /<#[\d.]+#>/;
  const emotionTest = /\[emotion=[^\]]*\]/i;
  return toneTest.test(text) || pauseTest.test(text) || emotionTest.test(text);
}

/**
 * 從文字中提取 emotion 標記的情緒值
 * 例如 [emotion=happy] → "happy"
 * 例如 [emotion=sad;speed=0.8] → "sad"
 */
export function extractEmotion(text: string): string | undefined {
  const match = text.match(/\[emotion=([a-z]+)/i);
  return match ? match[1] : undefined;
}

/**
 * 從對話文字中提取純對話部分（引號內的內容）
 * 用於 TTS 合成——只合成角色說的話，不合成旁白
 *
 * 例如：
 * 她眼睛一亮，猛地抓住他的手。"真的吗(laughs)？太好了！[emotion=happy]"
 * → "真的吗(laughs)？太好了！[emotion=happy]"
 */
export function extractDialogueForTTS(text: string): string | null {
  // 匹配中文引號「」和英文引號 ""
  const dialogues: string[] = [];
  const patterns = [
    /「([^」]+)」/g,
    /"([^"]+)"/g,
    /\u201c([^\u201d]+)\u201d/g,
  ];
  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(text)) !== null) {
      dialogues.push(match[1]);
    }
  }
  return dialogues.length > 0 ? dialogues.join(' ') : null;
}

// ===== TTS 逐句解析 =====

/** 單段 TTS 對話 */
export interface TTSSegment {
  /** 情緒 */
  emotion: string;
  /** 語速 0.5~2.0 */
  speed: number;
  /** 帶語氣標籤的原文（直接送 TTS API） */
  text: string;
  /** 去標籤的乾淨文字（純閱讀顯示） */
  clean: string;
  /** 合成後的音頻 URL */
  audioUrl?: string;
}

/**
 * 從小說文本中逐句解析 TTS 對話段落
 *
 * 支援兩種格式：
 *
 * 格式一（引號格式）：
 *   「真的嗎(laughs)？太好了！[emotion=happy]」
 *   → { emotion: 'happy', text: '真的嗎(laughs)？太好了！' }
 *
 * 格式二（句末裸露格式，AI 常用）：
 *   ...真的太棒了！[emotion=happy] 我停在你面前...
 *   → { emotion: 'happy', text: '（標記前的整段文字）' }
 */
export function parseTTSSegments(novel: string): TTSSegment[] {
  const out: TTSSegment[] = [];

  // === 格式一：引號內含 [emotion=...] 的對話 ===
  const quotedRe = /(?:「([\s\S]*?)\[emotion=([^\]]+)\]」|"([\s\S]*?)\[emotion=([^\]]+)\]"|\u201c([\s\S]*?)\[emotion=([^\]]+)\]\u201d)/g;
  let m: RegExpExecArray | null;

  while ((m = quotedRe.exec(novel)) !== null) {
    const rawText = m[1] ?? m[3] ?? m[5] ?? '';
    const emotionStr = m[2] ?? m[4] ?? m[6] ?? '';
    const params: Record<string, string> = {};
    emotionStr.split(';').forEach(s => {
      const [k, v] = s.split('=');
      if (k && v) params[k.trim()] = v.trim();
    });
    out.push({
      emotion: params.emotion || 'neutral',
      speed: parseFloat(params.speed) || 1.0,
      text: rawText.trim(),
      clean: rawText
        .replace(/\([a-z-]+\)/gi, '')
        .replace(/<#[\d.]+#>/g, '')
        .replace(/  +/g, ' ')
        .trim(),
    });
  }

  // 如果引號格式成功解析到段落，直接返回
  if (out.length > 0) return out;

  // === 格式二：句末裸露的 [emotion=...] ===
  // 策略：以每個 [emotion=...] 為分隔點，取其前方的文字段落作為該段 TTS 內容
  const bareRe = /\[emotion=([^\]]+)\]/g;
  let lastEnd = 0;

  while ((m = bareRe.exec(novel)) !== null) {
    // 取得這個 [emotion=...] 之前的文字段落
    const segText = novel.slice(lastEnd, m.index).trim();
    const emotionStr = m[1] ?? '';
    const params: Record<string, string> = {};
    emotionStr.split(';').forEach(s => {
      const [k, v] = s.split('=');
      if (k && v) params[k.trim()] = v.trim();
    });

    // 只有當前段落確實有文字才加入
    if (segText) {
      out.push({
        emotion: params.emotion || 'neutral',
        speed: parseFloat(params.speed) || 1.0,
        text: segText,
        clean: segText
          .replace(/\([a-z-]+\)/gi, '')
          .replace(/<#[\d.]+#>/g, '')
          .replace(/  +/g, ' ')
          .trim(),
      });
    }

    lastEnd = m.index + m[0].length;
  }

  return out;
}
