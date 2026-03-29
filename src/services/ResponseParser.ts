/**
 * AI 回覆解析服務
 * 處理導演系統的 <think>、<output>、<msg> 標籤
 */

import type { CalendarEventData } from "@/types/calendar";
import type { ScheduleCallData } from "@/types/incomingCall";
import { repairXmlTags } from "./XmlFuzzyRepair";

export type { CalendarEventData, ScheduleCallData };

export interface ParsedMessage {
  content: string;
  thought?: string; // ~(想法)~ 中的內容
  /** 是否為完整 HTML 文件（需要用 iframe 渲染） */
  isHtmlBlock?: boolean;
  isTimetravel?: boolean;
  timetravelContent?: string;
  isRedpacket?: boolean;
  redpacketData?: {
    amount: string;
    blessing: string;
    password?: string;
    voice?: string;
  };
  isLocation?: boolean;
  locationContent?: string;
  isReplyTo?: boolean;
  replyToContent?: string;
  isGift?: boolean;
  giftName?: string;
  // 轉帳相關
  isTransfer?: boolean;
  transferType?: "pay" | "refund";
  transferAmount?: number;
  transferNote?: string;
  // 換頭像相關
  isAvatarChange?: boolean;
  avatarChangeAction?: "accept" | "reject" | "forced" | "mood" | "restore";
  avatarChangeMood?: string;
  avatarChangeDesc?: string;
  // AI 圖片相關（非群聊模式）
  isAiImage?: boolean;
  imageDescription?: string;
  imagePrompt?: string;
  // 語音訊息相關
  isVoice?: boolean;
  voiceContent?: string;
  // 外賣付款結果 / 送達（AI 用標籤觸發）
  isWaimaiPaymentResult?: boolean;
  waimaiPaymentStatus?: "paid" | "rejected" | "failed";
  isWaimaiDelivery?: boolean;
}

export interface ParsedResponse {
  /** 思考過程（<think> 標籤內容） */
  thinking: string;
  /** 解析後的訊息列表 */
  messages: ParsedMessage[];
  /** 原始輸出內容 */
  rawOutput: string;
  /** 是否有噗浪發文 */
  hasPlurkPost?: boolean;
  plurkContent?: string;
  /** 是否有來電預約 */
  hasScheduleCall?: boolean;
  /** 來電預約資料 */
  scheduleCallData?: ScheduleCallData;
  /** 是否有行事曆事件 */
  hasCalendarEvent?: boolean;
  /** 行事曆事件資料列表 */
  calendarEvents?: CalendarEventData[];
  /** 是否有時間跳轉 */
  hasTimeJump?: boolean;
  /** 時間跳轉目標（ISO datetime string） */
  timeJumpTarget?: string;
  /** 好感度數值更新 */
  hasAffinityUpdate?: boolean;
  affinityUpdates?: AffinityUpdateEntry[];
  /** 原始 <update> 區塊文字（用於存入訊息以便重新掃描） */
  rawUpdateBlock?: string;
  /** 角色動作標籤（封鎖、道歉外賣等） */
  charActions?: ParsedCharAction[];
}

/**
 * 檢查內容是否包含需要拆分的內嵌特殊標籤
 * 用於面對面模式等長文本場景，將特殊標籤從文字中拆分成獨立訊息
 */
function hasInlineSpecialTags(content: string): boolean {
  return /<(?:timetravel|voice|pay|refund|location|redpacket\s|waimai-pay\s|waimai-delivery)[\s\S]*?>/i.test(
    content,
  );
}

/**
 * 通用拆分函數：將長文本中的所有特殊標籤拆分成獨立訊息
 * 支援：<timetravel>、<voice>、<pay>、<refund>、<location>、<redpacket>
 *
 * 例如：「文字A <voice>語音內容</voice> 文字B <timetravel>跳轉</timetravel> 文字C」
 * 會拆分成：
 *   [{content: "文字A"}, {isVoice: true, voiceContent: "語音內容"},
 *    {content: "文字B"}, {isTimetravel: true, timetravelContent: "跳轉"}, {content: "文字C"}]
 */
function splitBySpecialTags(content: string): ParsedMessage[] {
  // 匹配所有需要拆分的特殊標籤（按出現順序）
  const tagRegex =
    /<timetravel>([\s\S]*?)<\/timetravel>|<voice>([\s\S]*?)<\/voice>|<pay>([\d.]+)(?::([^<]*?))?<\/pay>|<refund>([\d.]+)<\/refund>|<location>([\s\S]*?)<\/location>|<redpacket\s+([^>]+)\/?>|<waimai-pay\s+([^>]*?)\s*\/?>|<waimai-delivery\s*\/?>/gi;

  interface TagMatch {
    index: number;
    length: number;
    message: ParsedMessage;
  }

  const tagMatches: TagMatch[] = [];
  let match;

  while ((match = tagRegex.exec(content)) !== null) {
    let msg: ParsedMessage;

    if (match[1] !== undefined) {
      // <timetravel>
      msg = {
        content: "",
        isTimetravel: true,
        timetravelContent: match[1].trim(),
      };
    } else if (match[2] !== undefined) {
      // <voice>
      msg = { content: "", isVoice: true, voiceContent: match[2].trim() };
    } else if (match[3] !== undefined) {
      // <pay>
      msg = {
        content: "",
        isTransfer: true,
        transferType: "pay",
        transferAmount: parseFloat(match[3]),
        transferNote: match[4]?.trim() || undefined,
      };
    } else if (match[5] !== undefined) {
      // <refund>
      msg = {
        content: "",
        isTransfer: true,
        transferType: "refund",
        transferAmount: parseFloat(match[5]),
      };
    } else if (match[6] !== undefined) {
      // <location>
      msg = { content: "", isLocation: true, locationContent: match[6].trim() };
    } else if (match[7] !== undefined) {
      // <redpacket>
      const attrs = match[7];
      msg = {
        content: "",
        isRedpacket: true,
        redpacketData: {
          amount: extractAttr(attrs, "amount") || "0",
          blessing: extractAttr(attrs, "blessing") || "",
          password: extractAttr(attrs, "password"),
          voice: extractAttr(attrs, "voice"),
        },
      };
    } else if (match[8] !== undefined) {
      // <waimai-pay status="..."/>
      const attrs = match[8];
      const status = extractAttr(attrs, "status") as
        | "paid"
        | "rejected"
        | "failed"
        | undefined;
      msg = {
        content: "",
        isWaimaiPaymentResult: true,
        waimaiPaymentStatus:
          status && ["paid", "rejected", "failed"].includes(status)
            ? status
            : "paid",
      };
    } else if (match[0] && /<waimai-delivery/i.test(match[0])) {
      // <waimai-delivery/>
      msg = {
        content: "",
        isWaimaiDelivery: true,
      };
    } else {
      continue;
    }

    tagMatches.push({
      index: match.index,
      length: match[0].length,
      message: msg,
    });
  }

  if (tagMatches.length === 0) {
    // 沒有特殊標籤，回退到普通解析
    return [parseMessageContentWithoutTimetravel(content)];
  }

  const messages: ParsedMessage[] = [];
  let lastIndex = 0;

  // 輔助函數：處理文字區塊，檢查是否包含 HTML 區塊需要進一步拆分
  function pushTextChunk(text: string) {
    const clean = text
      .replace(/\[PLURKPOST\][\s\S]*?\[\/PLURKPOST\]/gi, "")
      .replace(/\[REACTIONS\][\s\S]*?\[\/REACTIONS\]/gi, "")
      .trim();
    if (!clean) return;
    // 檢查是否包含完整 HTML 文件需要拆分
    const htmlSplit = splitHtmlBlocks(clean);
    if (htmlSplit) {
      for (const splitMsg of htmlSplit) {
        if (splitMsg.content || splitMsg.isHtmlBlock) {
          messages.push(splitMsg);
        }
      }
    } else {
      messages.push(parseTextOnlyContent(clean));
    }
  }

  for (const tm of tagMatches) {
    // 處理標籤之前的文字內容
    const beforeContent = content.substring(lastIndex, tm.index).trim();
    if (beforeContent) {
      pushTextChunk(beforeContent);
    }

    // 添加特殊標籤訊息
    messages.push(tm.message);

    lastIndex = tm.index + tm.length;
  }

  // 處理最後一個標籤之後的文字內容
  const afterContent = content.substring(lastIndex).trim();
  if (afterContent) {
    pushTextChunk(afterContent);
  }

  return messages;
}

/**
 * 解析純文字內容（不處理特殊標籤，因為已在 splitBySpecialTags 中拆分過了）
 * 只處理想法、表情包正規化、PLURKPOST 移除等文字層面的解析
 */
function parseTextOnlyContent(content: string): ParsedMessage {
  const result: ParsedMessage = { content };

  // 正規化表情包標籤格式
  result.content = normalizeStickerTags(result.content);

  // 移除 PLURKPOST / REACTIONS 標籤
  result.content = result.content
    .replace(/\[PLURKPOST\][\s\S]*?\[\/PLURKPOST\]/gi, "")
    .replace(/\[REACTIONS\][\s\S]*?\[\/REACTIONS\]/gi, "")
    .trim();

  // 提取 ˇ想法ˇ
  const thoughtMatchNew = result.content.match(/ˇ([^ˇ]+)ˇ/g);
  if (thoughtMatchNew && thoughtMatchNew.length > 0) {
    const lastThought = thoughtMatchNew[thoughtMatchNew.length - 1];
    const innerMatch = lastThought.match(/ˇ([^ˇ]+)ˇ/);
    if (innerMatch) {
      result.thought = innerMatch[1];
    }
    result.content = result.content.replace(/\s*ˇ[^ˇ]+ˇ/g, "").trim();
  } else {
    // 兼容舊格式 ~(想法)~
    const thoughtMatchOld = result.content.match(/~\(([^)]+)\)~/g);
    if (thoughtMatchOld && thoughtMatchOld.length > 0) {
      const lastThought = thoughtMatchOld[thoughtMatchOld.length - 1];
      const innerMatch = lastThought.match(/~\(([^)]+)\)~/);
      if (innerMatch) {
        result.thought = innerMatch[1];
      }
      result.content = result.content.replace(/\s*~\([^)]+\)~/g, "").trim();
    }
  }

  // 檢查回覆引用
  const replyMatch = result.content.match(/<reply-to>([\s\S]*?)<\/reply-to>/i);
  if (replyMatch) {
    result.isReplyTo = true;
    result.replyToContent = replyMatch[1].trim();
    result.content = result.content
      .replace(/<reply-to>[\s\S]*?<\/reply-to>/i, "")
      .trim();
  }

  // 檢查送禮物
  const giftMatch = result.content.match(/<送禮物>([\s\S]*?)<\/送禮物>/i);
  if (giftMatch) {
    result.isGift = true;
    result.giftName = giftMatch[1].trim();
    result.content = "";
  }

  // 檢查換頭像
  const avatarChangeMatch = result.content.match(
    /<avatar-change\s+([^>]*?)\s*\/?>/i,
  );
  if (avatarChangeMatch) {
    const attrs = avatarChangeMatch[1];
    const action = extractAttr(attrs, "action") as
      | "accept"
      | "reject"
      | "forced"
      | "mood"
      | "restore"
      | undefined;
    if (action) {
      result.isAvatarChange = true;
      result.avatarChangeAction = action;
      if (action === "mood") {
        result.avatarChangeMood = extractAttr(attrs, "mood");
      }
      result.avatarChangeDesc = extractAttr(attrs, "desc");
    }
    result.content = result.content
      .replace(/<avatar-change\s+[^>]*?\s*\/?>/gi, "")
      .trim();
  }

  // 檢查 AI 圖片
  const picWithPromptMatch = result.content.match(
    /<pic\s+prompt=["']([^"']+)["']\s*>([\s\S]*?)<\/pic>/i,
  );
  const picSimpleMatch = !picWithPromptMatch
    ? result.content.match(/<pic>([\s\S]*?)<\/pic>/i)
    : null;
  if (picWithPromptMatch) {
    result.isAiImage = true;
    result.imagePrompt = picWithPromptMatch[1].trim();
    result.imageDescription = picWithPromptMatch[2].trim();
    // 移除 <pic> 標籤
    result.content = result.content
      .replace(/<pic\s+prompt=["'][^"']+["']\s*>[\s\S]*?<\/pic>/gi, "")
      .trim();
  } else if (picSimpleMatch) {
    result.isAiImage = true;
    result.imageDescription = picSimpleMatch[1].trim();
    // 移除 <pic> 標籤
    result.content = result.content
      .replace(/<pic>[\s\S]*?<\/pic>/gi, "")
      .trim();
  }

  return result;
}

/**
 * 正規化表情包標籤格式
 * AI 可能輸出多種格式，統一轉換為 [sticker:name]
 * 支援：<sticker:name/>、<sticker:name></sticker:name>、<sticker:name>
 */
function normalizeStickerTags(content: string): string {
  return (
    content
      // <sticker:name/> → [sticker:name]
      .replace(/<sticker:([^/>]+)\s*\/>/gi, "[sticker:$1]")
      // <sticker:name></sticker:name> → [sticker:name]
      .replace(/<sticker:([^>]+)><\/sticker:[^>]+>/gi, "[sticker:$1]")
      // <sticker>name</sticker> → [sticker:name]
      .replace(/<sticker>([^<]+)<\/sticker>/gi, "[sticker:$1]")
      // <sticker:name> (未閉合) → [sticker:name]
      .replace(/<sticker:([^>/<]+)>/gi, "[sticker:$1]")
  );
}

/**
 * 解析訊息內容（不處理 timetravel，因為已經在上層拆分過了）
 */
function parseMessageContentWithoutTimetravel(content: string): ParsedMessage {
  const result: ParsedMessage = {
    content: content,
  };

  // 正規化表情包標籤格式
  result.content = normalizeStickerTags(result.content);

  // 移除 [PLURKPOST]...[/PLURKPOST] 標籤
  result.content = result.content
    .replace(/\[PLURKPOST\][\s\S]*?\[\/PLURKPOST\]/gi, "")
    .trim();

  // 移除 [REACTIONS]...[/REACTIONS] 標籤（噗浪表情反應，不應顯示在聊天氣泡中）
  result.content = result.content
    .replace(/\[REACTIONS\][\s\S]*?\[\/REACTIONS\]/gi, "")
    .trim();

  // 提取 ˇ想法ˇ （新格式，使用注音符號）
  const thoughtMatchNew = result.content.match(/ˇ([^ˇ]+)ˇ/g);
  if (thoughtMatchNew && thoughtMatchNew.length > 0) {
    const lastThought = thoughtMatchNew[thoughtMatchNew.length - 1];
    const innerMatch = lastThought.match(/ˇ([^ˇ]+)ˇ/);
    if (innerMatch) {
      result.thought = innerMatch[1];
    }
    result.content = result.content.replace(/\s*ˇ[^ˇ]+ˇ/g, "").trim();
  } else {
    // 兼容舊格式 ~(想法)~
    const thoughtMatchOld = result.content.match(/~\(([^)]+)\)~/g);
    if (thoughtMatchOld && thoughtMatchOld.length > 0) {
      const lastThought = thoughtMatchOld[thoughtMatchOld.length - 1];
      const innerMatch = lastThought.match(/~\(([^)]+)\)~/);
      if (innerMatch) {
        result.thought = innerMatch[1];
      }
      result.content = result.content.replace(/\s*~\([^)]+\)~/g, "").trim();
    }
  }

  // 檢查紅包
  const redpacketMatch = result.content.match(/<redpacket\s+([^>]+)\/?>/i);
  if (redpacketMatch) {
    result.isRedpacket = true;
    const attrs = redpacketMatch[1];
    result.redpacketData = {
      amount: extractAttr(attrs, "amount") || "0",
      blessing: extractAttr(attrs, "blessing") || "",
      password: extractAttr(attrs, "password"),
      voice: extractAttr(attrs, "voice"),
    };
    result.content = "";
  }

  // 檢查位置分享
  const locationMatch = result.content.match(
    /<location>([\s\S]*?)<\/location>/i,
  );
  if (locationMatch) {
    result.isLocation = true;
    result.locationContent = locationMatch[1].trim();
    result.content = "";
  }

  // 檢查回覆引用
  const replyMatch = result.content.match(/<reply-to>([\s\S]*?)<\/reply-to>/i);
  if (replyMatch) {
    result.isReplyTo = true;
    result.replyToContent = replyMatch[1].trim();
    result.content = result.content
      .replace(/<reply-to>[\s\S]*?<\/reply-to>/i, "")
      .trim();
  }

  // 檢查送禮物
  const giftMatch = result.content.match(/<送禮物>([\s\S]*?)<\/送禮物>/i);
  if (giftMatch) {
    result.isGift = true;
    result.giftName = giftMatch[1].trim();
    result.content = "";
  }

  // 檢查轉帳 <pay>金額:備註</pay> 或 <pay>金額</pay>（支援整數和小數）
  const payMatch = result.content.match(/<pay>([\d.]+)(?::([^<]*?))?<\/pay>/i);
  if (payMatch) {
    result.isTransfer = true;
    result.transferType = "pay";
    result.transferAmount = parseFloat(payMatch[1]);
    result.transferNote = payMatch[2]?.trim() || undefined;
    result.content = result.content
      .replace(/<pay>[\s\S]*?<\/pay>/gi, "")
      .trim();
  }

  // 檢查退回 <refund>金額</refund>（支援整數和小數）
  const refundMatch = result.content.match(/<refund>([\d.]+)<\/refund>/i);
  if (refundMatch) {
    result.isTransfer = true;
    result.transferType = "refund";
    result.transferAmount = parseFloat(refundMatch[1]);
    result.content = result.content
      .replace(/<refund>[\s\S]*?<\/refund>/gi, "")
      .trim();
  }

  // 檢查換頭像 <avatar-change action="xxx" mood="xxx"/>
  const avatarChangeMatch = result.content.match(
    /<avatar-change\s+([^>]*?)\s*\/?>/i,
  );
  if (avatarChangeMatch) {
    const attrs = avatarChangeMatch[1];
    const action = extractAttr(attrs, "action") as
      | "accept"
      | "reject"
      | "forced"
      | "mood"
      | "restore"
      | undefined;
    if (action) {
      result.isAvatarChange = true;
      result.avatarChangeAction = action;
      if (action === "mood") {
        result.avatarChangeMood = extractAttr(attrs, "mood");
      }
      result.avatarChangeDesc = extractAttr(attrs, "desc");
    }
    result.content = result.content
      .replace(/<avatar-change\s+[^>]*?\s*\/?>/gi, "")
      .trim();
  }

  // 檢查 AI 圖片 <pic prompt="english keywords">中文描述</pic> 或 <pic>中文描述</pic>
  const picWithPromptMatch = result.content.match(
    /<pic\s+prompt=["']([^"']+)["']\s*>([\s\S]*?)<\/pic>/i,
  );
  const picSimpleMatch = !picWithPromptMatch
    ? result.content.match(/<pic>([\s\S]*?)<\/pic>/i)
    : null;
  if (picWithPromptMatch) {
    result.isAiImage = true;
    result.imagePrompt = picWithPromptMatch[1].trim();
    result.imageDescription = picWithPromptMatch[2].trim();
    // 移除 <pic> 標籤
    result.content = result.content
      .replace(/<pic\s+prompt=["'][^"']+["']\s*>[\s\S]*?<\/pic>/gi, "")
      .trim();
  } else if (picSimpleMatch) {
    result.isAiImage = true;
    result.imageDescription = picSimpleMatch[1].trim();
    // 移除 <pic> 標籤
    result.content = result.content
      .replace(/<pic>[\s\S]*?<\/pic>/gi, "")
      .trim();
  }

  // 檢查語音訊息 <voice>語音內容</voice>
  const voiceMatch = result.content.match(/<voice>([\s\S]*?)<\/voice>/i);
  if (voiceMatch) {
    result.isVoice = true;
    result.voiceContent = voiceMatch[1].trim();
    result.content = result.content
      .replace(/<voice>[\s\S]*?<\/voice>/gi, "")
      .trim();
  }

  // 檢查外賣付款結果 <waimai-pay status="paid|rejected|failed"/>
  const waimaiPayMatch = result.content.match(/<waimai-pay\s+([^>]*?)\s*\/?>/i);
  if (waimaiPayMatch) {
    const attrs = waimaiPayMatch[1];
    const status = extractAttr(attrs, "status") as
      | "paid"
      | "rejected"
      | "failed"
      | undefined;
    if (status && ["paid", "rejected", "failed"].includes(status)) {
      result.isWaimaiPaymentResult = true;
      result.waimaiPaymentStatus = status;
    }
    result.content = result.content
      .replace(/<waimai-pay\s+[^>]*?\s*\/?>/gi, "")
      .trim();
  }

  // 檢查外賣送達 <waimai-delivery/>
  const waimaiDeliveryMatch = result.content.match(/<waimai-delivery\s*\/?>/i);
  if (waimaiDeliveryMatch) {
    result.isWaimaiDelivery = true;
    result.content = result.content
      .replace(/<waimai-delivery\s*\/?>/gi, "")
      .trim();
  }

  return result;
}

/**
 * 偵測內容是否為完整 HTML 文件
 */
function isFullHtmlDocument(content: string): boolean {
  const trimmed = content.trim();
  return /^\s*<!DOCTYPE\s/i.test(trimmed) || /^\s*<html[\s>]/i.test(trimmed);
}

/**
 * 將混合了完整 HTML 文件和普通文字的內容拆分成多條訊息
 * 例如：「普通文字 ```html <div>...</div>``` 更多文字」
 * 會拆分成：[{content: "普通文字"}, {isHtmlBlock: true, content: "<div>..."}, {content: "更多文字"}]
 */
function splitHtmlBlocks(content: string): ParsedMessage[] | null {
  // 匹配 ```html ... ``` 或 ``` ... ```（內容包含 HTML 標籤）
  // 同時支援完整 HTML 文件和 HTML 片段（如 <div>）
  const fenceRegex = /```(?:html)?\s*\n?([\s\S]*?)\n?\s*```/gi;

  // 也匹配裸露的完整 HTML 文件（以 <!DOCTYPE 或 <html 開頭，到 </html> 結束）
  const bareHtmlRegex =
    /(<!DOCTYPE\s[\s\S]*?<\/html\s*>|<html[\s\S]*?<\/html\s*>)/gi;

  // 先嘗試 fence 匹配
  let matches: Array<{ start: number; end: number; html: string }> = [];

  let m: RegExpExecArray | null;
  while ((m = fenceRegex.exec(content)) !== null) {
    const htmlContent = m[1].trim();
    // 接受完整 HTML 文件，或以 HTML 標籤開頭的片段
    if (isFullHtmlDocument(htmlContent) || /^\s*<[a-zA-Z]/.test(htmlContent)) {
      matches.push({
        start: m.index,
        end: m.index + m[0].length,
        html: htmlContent,
      });
    }
  }

  // 如果沒有 fence 匹配，嘗試裸露 HTML
  if (matches.length === 0) {
    while ((m = bareHtmlRegex.exec(content)) !== null) {
      matches.push({
        start: m.index,
        end: m.index + m[0].length,
        html: m[1].trim(),
      });
    }
  }

  // 如果仍然沒有匹配，嘗試偵測裸露的 HTML 片段（含 <style> 標籤的大型 HTML 區塊）
  // 這處理 AI 直接輸出 <style>...<div>... 而沒有 fence 或 <html> 包裹的情況
  if (matches.length === 0) {
    const bareFragmentRegex =
      /(<style[\s\S]*?<\/style>\s*[\s\S]*?(?:<\/div>\s*)*$)/gi;
    while ((m = bareFragmentRegex.exec(content)) !== null) {
      const fragment = m[1].trim();
      // 至少要有 <style> 和一些 HTML 結構，且長度足夠（避免誤判簡短內容）
      if (
        fragment.length > 200 &&
        /<style[\s>]/i.test(fragment) &&
        /<div[\s>]/i.test(fragment)
      ) {
        matches.push({
          start: m.index,
          end: m.index + m[0].length,
          html: fragment,
        });
      }
    }
  }

  if (matches.length === 0) return null;

  const messages: ParsedMessage[] = [];
  let lastIndex = 0;

  for (const match of matches) {
    // HTML 區塊之前的文字
    const before = content.substring(lastIndex, match.start).trim();
    if (before) {
      messages.push(parseMessageContentWithoutTimetravel(before));
    }

    // HTML 區塊本身
    messages.push({
      content: match.html,
      isHtmlBlock: true,
    });

    lastIndex = match.end;
  }

  // HTML 區塊之後的文字
  const after = content.substring(lastIndex).trim();
  if (after) {
    messages.push(parseMessageContentWithoutTimetravel(after));
  }

  return messages.length > 0 ? messages : null;
}

/**
 * 解析 AI 回覆
 */
export function parseAIResponse(rawResponse: string): ParsedResponse {
  const result: ParsedResponse = {
    thinking: "",
    messages: [],
    rawOutput: "",
  };

  // 1. 提取 <think> 內容
  const thinkMatch = rawResponse.match(/<think>([\s\S]*?)<\/think>/i);
  if (thinkMatch) {
    result.thinking = thinkMatch[1].trim();
  }

  // 2. 提取 <output> 內容
  let outputContent = "";
  const outputMatch = rawResponse.match(/<output>([\s\S]*?)<\/output>/i);
  if (outputMatch) {
    outputContent = outputMatch[1].trim();
  } else {
    // 如果沒有 <output> 標籤，嘗試移除 <think> 後使用剩餘內容
    // 同時移除可能的 Scene、基拉祈、雪拉比 等思考過程標記
    outputContent = rawResponse
      .replace(/<think>[\s\S]*?<\/think>/gi, "")
      .replace(/Scene\s*\d+[^<]*/gi, "") // 移除 Scene 標記
      .replace(/基拉祈[：:][^<\n]*/gi, "") // 移除基拉祈的思考
      .replace(/雪拉比[：:][^<\n]*/gi, "") // 移除雪拉比的思考
      .replace(/💫[^<\n]*/gi, "") // 移除表情符號開頭的思考行
      .replace(/📱[^<\n]*/gi, "")
      .replace(/🔴[^<\n]*/gi, "")
      .trim();
  }
  result.rawOutput = outputContent;

  // 2.5 從 outputContent 中預先移除 char-action 標籤，避免它們出現在訊息氣泡裡
  // （char-action 標籤會在步驟 10 從 rawResponse 解析，不應顯示給用戶）
  outputContent = outputContent
    .replace(/\[char-action:[^\]]*\]/g, "")
    .replace(/\[\/char-action:[^\]]*\]/g, "")
    .replace(/\[char-action:[^\]]*\][\s\S]*?\[\/char-action:[^\]]*\]/g, "")
    .trim();

  // 3. 解析 <msg> 標籤
  const msgRegex = /<msg>([\s\S]*?)<\/msg>/gi;
  const msgMatchArray: Array<{
    fullMatch: string;
    content: string;
    index: number;
  }> = [];
  let msgExec: RegExpExecArray | null;
  while ((msgExec = msgRegex.exec(outputContent)) !== null) {
    msgMatchArray.push({
      fullMatch: msgExec[0],
      content: msgExec[1].trim(),
      index: msgExec.index,
    });
  }

  if (msgMatchArray.length > 0) {
    // 有 <msg> 標籤時，需要處理標籤內外的內容
    let lastEndIndex = 0;

    for (const msgMatch of msgMatchArray) {
      const matchIndex = msgMatch.index;
      const matchEnd = matchIndex + msgMatch.fullMatch.length;
      const msgContent = msgMatch.content;

      // 處理 <msg> 標籤之前的文字內容
      if (matchIndex > lastEndIndex) {
        const beforeContent = outputContent
          .substring(lastEndIndex, matchIndex)
          .trim();
        if (beforeContent && !isThinkingContent(beforeContent)) {
          const cleanBefore = beforeContent
            .replace(/<\/?output>/gi, "")
            .replace(/<\/?think>/gi, "")
            .trim();
          if (cleanBefore) {
            const parsedBefore = parseMessageContent(cleanBefore);
            if (isNonEmptyMessage(parsedBefore)) {
              result.messages.push(parsedBefore);
            }
          }
        }
      }

      // 處理 <msg> 標籤內的內容 - 檢查是否包含 timetravel 或其他特殊標籤需要拆分
      if (hasInlineSpecialTags(msgContent)) {
        // 使用通用拆分函數拆分成多條訊息
        const splitMessages = splitBySpecialTags(msgContent);
        for (const splitMsg of splitMessages) {
          if (isNonEmptyMessage(splitMsg)) {
            result.messages.push(splitMsg);
          }
        }
      } else {
        // 先檢查是否包含完整 HTML 文件需要拆分
        const htmlSplit = splitHtmlBlocks(msgContent);
        if (htmlSplit) {
          for (const splitMsg of htmlSplit) {
            if (splitMsg.content || splitMsg.isHtmlBlock) {
              result.messages.push(splitMsg);
            }
          }
        } else {
          const parsed = parseMessageContent(msgContent);
          if (
            parsed.content ||
            parsed.isTimetravel ||
            parsed.isRedpacket ||
            parsed.isLocation ||
            parsed.isTransfer ||
            parsed.isGift ||
            parsed.isVoice ||
            parsed.isAiImage
          ) {
            result.messages.push(parsed);
          }
        }
      }

      // 更新上一個結束位置
      lastEndIndex = matchEnd;
    }

    // 處理最後一個 <msg> 標籤之後的文字內容
    const remainingContent = outputContent.substring(lastEndIndex).trim();
    if (remainingContent && !isThinkingContent(remainingContent)) {
      const cleanAfter = remainingContent
        .replace(/<\/?output>/gi, "")
        .replace(/<\/?think>/gi, "")
        .replace(/<\/?msg>/gi, "")
        .trim();
      if (cleanAfter) {
        const parsedAfter = parseMessageContent(cleanAfter);
        if (isNonEmptyMessage(parsedAfter)) {
          result.messages.push(parsedAfter);
        }
      }
    }
  } else if (outputContent) {
    // 4. 如果沒有 <msg> 標籤，將整個輸出作為單條訊息
    // 移除可能的標籤殘留和思考過程
    const cleanContent = outputContent
      .replace(/<\/?output>/gi, "")
      .replace(/<\/?think>/gi, "")
      .replace(/<\/?msg>/gi, "")
      // 移除可能洩漏的思考過程格式
      .replace(/Scene\s*[\d.]+\s*[—\-–]\s*[^\n]*/gi, "")
      .replace(/基拉祈[&＆]雪拉比[：:][^\n]*/gi, "")
      .trim();

    // 只有當清理後的內容不為空且不是純思考內容時才添加
    if (cleanContent && !isThinkingContent(cleanContent)) {
      // 4a. 先檢查是否包含完整 HTML 文件需要拆分
      const htmlSplit = splitHtmlBlocks(cleanContent);
      if (htmlSplit) {
        for (const splitMsg of htmlSplit) {
          if (splitMsg.content || splitMsg.isHtmlBlock) {
            result.messages.push(splitMsg);
          }
        }
      } else if (hasInlineSpecialTags(cleanContent)) {
        // 檢查是否包含任何需要拆分的特殊標籤（timetravel、voice、pay、refund、location、redpacket）
        const splitMessages = splitBySpecialTags(cleanContent);
        for (const splitMsg of splitMessages) {
          if (isNonEmptyMessage(splitMsg)) {
            result.messages.push(splitMsg);
          }
        }
      } else {
        const parsedClean = parseMessageContent(cleanContent);
        if (isNonEmptyMessage(parsedClean)) {
          result.messages.push(parsedClean);
        }
      }
    }
  }

  // 5. 檢查噗浪發文
  const plurkMatch = rawResponse.match(
    /\[PLURKPOST\]([\s\S]*?)\[\/PLURKPOST\]/i,
  );
  if (plurkMatch) {
    result.hasPlurkPost = true;
    result.plurkContent = plurkMatch[1].trim();
  }

  // 6. 檢查來電預約標籤
  const scheduleCallResult = parseScheduleCallTag(rawResponse);
  if (scheduleCallResult) {
    result.hasScheduleCall = true;
    result.scheduleCallData = scheduleCallResult;
  }

  // 7. 檢查行事曆事件標籤
  const calendarEvents = parseCalendarEventTags(rawResponse);
  if (calendarEvents.length > 0) {
    result.hasCalendarEvent = true;
    result.calendarEvents = calendarEvents;
  }

  // 8. 檢查時間跳轉標籤（偏移時間模式專用）
  const timeJumpResult = parseTimeJumpTag(rawResponse);
  if (timeJumpResult) {
    result.hasTimeJump = true;
    result.timeJumpTarget = timeJumpResult;
  }

  // 9. 解析好感度更新標籤
  const affinityUpdates = parseAffinityUpdateTags(rawResponse);
  if (affinityUpdates.length > 0) {
    result.hasAffinityUpdate = true;
    result.affinityUpdates = affinityUpdates;

    // 保留原始 <update> 區塊，供訊息存儲後重新掃描使用
    const updateBlockMatch = rawResponse.match(/<update>[\s\S]*?<\/update>/gi);
    if (updateBlockMatch) {
      result.rawUpdateBlock = updateBlockMatch.join("\n");
    }
  }

  // 10. 解析 char-action 標籤（封鎖、道歉外賣等）
  const allCharActions: ParsedCharAction[] = [];

  // 10a. 解析 friend-response YAML 區塊（需先處理，因為它包含多行）
  const friendResult = parseFriendResponseBlock(rawResponse);
  if (friendResult.response) {
    allCharActions.push(friendResult.response);
  }

  // 10b. 解析行內 char-action 標籤
  const tagResult = parseCharActionTags(rawResponse);
  if (tagResult.actions.length > 0) {
    allCharActions.push(...tagResult.actions);
  }

  if (allCharActions.length > 0) {
    result.charActions = allCharActions;

    // 從所有訊息的 content 中移除 char-action 標籤
    for (const msg of result.messages) {
      if (msg.content) {
        const cleaned1 = parseFriendResponseBlock(msg.content);
        const cleaned2 = parseCharActionTags(cleaned1.cleanContent);
        msg.content = cleaned2.cleanContent;
      }
    }
  }

  return result;
}

/**
 * 檢查解析後的訊息是否有實質內容（非空）
 * 用於過濾掉移除 PLURKPOST 等標籤後變成空白的訊息
 */
function isNonEmptyMessage(msg: ParsedMessage): boolean {
  const hasContent = !!(
    msg.content ||
    msg.isHtmlBlock ||
    msg.isTimetravel ||
    msg.isRedpacket ||
    msg.isLocation ||
    msg.isTransfer ||
    msg.isGift ||
    msg.isAvatarChange ||
    msg.isVoice ||
    msg.isAiImage ||
    msg.isWaimaiPaymentResult ||
    msg.isWaimaiDelivery
  );

  // 調試日誌：記錄空消息過濾
  if (!hasContent) {
    console.log("[ResponseParser] Filtering out empty message:", msg);
  }

  return hasContent;
}

/**
 * 檢查內容是否為思考過程（不應該顯示給用戶）
 */
function isThinkingContent(content: string): boolean {
  // 檢查是否包含明顯的思考過程標記
  const thinkingPatterns = [
    /^Scene\s*\d+/i,
    /基拉祈[：:]/,
    /雪拉比[：:]/,
    /情緒釋放/,
    /噗浪決策/,
    /思維融合/,
    /最終輸出已確定/,
  ];

  return thinkingPatterns.some((pattern) => pattern.test(content));
}

/**
 * 解析單條訊息內容
 */
function parseMessageContent(content: string): ParsedMessage {
  const result: ParsedMessage = {
    content: content,
  };

  // 正規化表情包標籤格式
  result.content = normalizeStickerTags(result.content);

  // 移除 [PLURKPOST]...[/PLURKPOST] 標籤（已在上層處理發文）
  result.content = result.content
    .replace(/\[PLURKPOST\][\s\S]*?\[\/PLURKPOST\]/gi, "")
    .trim();

  // 移除 <affinity-update> 標籤（已在上層 parseAIResponse 處理）
  result.content = result.content
    .replace(/<affinity-update\s+[^>]*?\s*\/?>/gi, "")
    .trim();

  // 移除 [REACTIONS]...[/REACTIONS] 標籤（噗浪表情反應，不應顯示在聊天氣泡中）
  result.content = result.content
    .replace(/\[REACTIONS\][\s\S]*?\[\/REACTIONS\]/gi, "")
    .trim();

  // 提取 ˇ想法ˇ （新格式，使用注音符號）
  const thoughtMatchNew = result.content.match(/ˇ([^ˇ]+)ˇ/g);
  if (thoughtMatchNew && thoughtMatchNew.length > 0) {
    // 取最後一個想法
    const lastThought = thoughtMatchNew[thoughtMatchNew.length - 1];
    const innerMatch = lastThought.match(/ˇ([^ˇ]+)ˇ/);
    if (innerMatch) {
      result.thought = innerMatch[1];
    }
    // 從內容中移除想法
    result.content = result.content.replace(/\s*ˇ[^ˇ]+ˇ/g, "").trim();
  } else {
    // 兼容舊格式 ~(想法)~
    const thoughtMatchOld = result.content.match(/~\(([^)]+)\)~/g);
    if (thoughtMatchOld && thoughtMatchOld.length > 0) {
      const lastThought = thoughtMatchOld[thoughtMatchOld.length - 1];
      const innerMatch = lastThought.match(/~\(([^)]+)\)~/);
      if (innerMatch) {
        result.thought = innerMatch[1];
      }
      result.content = result.content.replace(/\s*~\([^)]+\)~/g, "").trim();
    }
  }

  // 檢查時空跳轉 - 不再清空 content，而是移除標籤保留其他內容
  // 實際的拆分邏輯在 parseAIResponse 中處理
  const timetravelMatch = result.content.match(
    /<timetravel>([\s\S]*?)<\/timetravel>/i,
  );
  if (timetravelMatch) {
    result.isTimetravel = true;
    result.timetravelContent = timetravelMatch[1].trim();
    // 移除 timetravel 標籤，保留其他內容
    result.content = result.content
      .replace(/<timetravel>[\s\S]*?<\/timetravel>/gi, "")
      .trim();
  }

  // 檢查紅包
  const redpacketMatch = result.content.match(/<redpacket\s+([^>]+)\/?>/i);
  if (redpacketMatch) {
    result.isRedpacket = true;
    const attrs = redpacketMatch[1];
    result.redpacketData = {
      amount: extractAttr(attrs, "amount") || "0",
      blessing: extractAttr(attrs, "blessing") || "",
      password: extractAttr(attrs, "password"),
      voice: extractAttr(attrs, "voice"),
    };
    result.content = "";
  }

  // 檢查位置分享
  const locationMatch = result.content.match(
    /<location>([\s\S]*?)<\/location>/i,
  );
  if (locationMatch) {
    result.isLocation = true;
    result.locationContent = locationMatch[1].trim();
    result.content = "";
  }

  // 檢查回覆引用
  const replyMatch = result.content.match(/<reply-to>([\s\S]*?)<\/reply-to>/i);
  if (replyMatch) {
    result.isReplyTo = true;
    result.replyToContent = replyMatch[1].trim();
    // 移除 reply-to 標籤，保留剩餘內容
    result.content = result.content
      .replace(/<reply-to>[\s\S]*?<\/reply-to>/i, "")
      .trim();
    // 再次處理想法
    const thoughtMatch2 = result.content.match(/~\(([^)]+)\)~/);
    if (thoughtMatch2) {
      result.thought = thoughtMatch2[1];
      result.content = result.content.replace(/\s*~\([^)]+\)~/g, "").trim();
    }
  }

  // 檢查送禮物
  const giftMatch = result.content.match(/<送禮物>([\s\S]*?)<\/送禮物>/i);
  if (giftMatch) {
    result.isGift = true;
    result.giftName = giftMatch[1].trim();
    result.content = "";
  }

  // 檢查轉帳 <pay>金額:備註</pay> 或 <pay>金額</pay>（支援整數和小數）
  const payMatch = result.content.match(/<pay>([\d.]+)(?::([^<]*?))?<\/pay>/i);
  if (payMatch) {
    result.isTransfer = true;
    result.transferType = "pay";
    result.transferAmount = parseFloat(payMatch[1]);
    result.transferNote = payMatch[2]?.trim() || undefined;
    // 移除 pay 標籤，保留其他內容
    result.content = result.content
      .replace(/<pay>[\s\S]*?<\/pay>/gi, "")
      .trim();
  }

  // 檢查退回 <refund>金額</refund>（支援整數和小數）
  const refundMatch = result.content.match(/<refund>([\d.]+)<\/refund>/i);
  if (refundMatch) {
    result.isTransfer = true;
    result.transferType = "refund";
    result.transferAmount = parseFloat(refundMatch[1]);
    // 移除 refund 標籤，保留其他內容
    result.content = result.content
      .replace(/<refund>[\s\S]*?<\/refund>/gi, "")
      .trim();
  }

  // 檢查換頭像 <avatar-change action="xxx" mood="xxx"/>
  const avatarChangeMatch = result.content.match(
    /<avatar-change\s+([^>]*?)\s*\/?>/i,
  );
  if (avatarChangeMatch) {
    const attrs = avatarChangeMatch[1];
    const action = extractAttr(attrs, "action") as
      | "accept"
      | "reject"
      | "forced"
      | "mood"
      | "restore"
      | undefined;
    if (action) {
      result.isAvatarChange = true;
      result.avatarChangeAction = action;
      if (action === "mood") {
        result.avatarChangeMood = extractAttr(attrs, "mood");
      }
      result.avatarChangeDesc = extractAttr(attrs, "desc");
    }
    result.content = result.content
      .replace(/<avatar-change\s+[^>]*?\s*\/?>/gi, "")
      .trim();
  }

  // 檢查 AI 圖片 <pic prompt="english keywords">中文描述</pic> 或 <pic>中文描述</pic>
  const picWithPromptMatch = result.content.match(
    /<pic\s+prompt=["']([^"']+)["']\s*>([\s\S]*?)<\/pic>/i,
  );
  const picSimpleMatch = !picWithPromptMatch
    ? result.content.match(/<pic>([\s\S]*?)<\/pic>/i)
    : null;
  if (picWithPromptMatch) {
    result.isAiImage = true;
    result.imagePrompt = picWithPromptMatch[1].trim();
    result.imageDescription = picWithPromptMatch[2].trim();
    // 移除 <pic> 標籤
    result.content = result.content
      .replace(/<pic\s+prompt=["'][^"']+["']\s*>[\s\S]*?<\/pic>/gi, "")
      .trim();
  } else if (picSimpleMatch) {
    result.isAiImage = true;
    result.imageDescription = picSimpleMatch[1].trim();
    // 移除 <pic> 標籤
    result.content = result.content
      .replace(/<pic>[\s\S]*?<\/pic>/gi, "")
      .trim();
  }

  // 檢查語音訊息 <voice>語音內容</voice>
  const voiceMatch = result.content.match(/<voice>([\s\S]*?)<\/voice>/i);
  if (voiceMatch) {
    result.isVoice = true;
    result.voiceContent = voiceMatch[1].trim();
    result.content = result.content
      .replace(/<voice>[\s\S]*?<\/voice>/gi, "")
      .trim();
  }

  // 檢查外賣付款結果 <waimai-pay status="paid|rejected|failed"/>
  const waimaiPayMatch2 = result.content.match(
    /<waimai-pay\s+([^>]*?)\s*\/?>/i,
  );
  if (waimaiPayMatch2) {
    const attrs = waimaiPayMatch2[1];
    const status = extractAttr(attrs, "status") as
      | "paid"
      | "rejected"
      | "failed"
      | undefined;
    if (status && ["paid", "rejected", "failed"].includes(status)) {
      result.isWaimaiPaymentResult = true;
      result.waimaiPaymentStatus = status;
    }
    result.content = result.content
      .replace(/<waimai-pay\s+[^>]*?\s*\/?>/gi, "")
      .trim();
  }

  // 檢查外賣送達 <waimai-delivery/>
  const waimaiDeliveryMatch2 = result.content.match(/<waimai-delivery\s*\/?>/i);
  if (waimaiDeliveryMatch2) {
    result.isWaimaiDelivery = true;
    result.content = result.content
      .replace(/<waimai-delivery\s*\/?>/gi, "")
      .trim();
  }

  return result;
}

/**
 * 從屬性字串中提取屬性值
 */
function extractAttr(attrs: string, name: string): string | undefined {
  const match = attrs.match(new RegExp(`${name}=["']([^"']+)["']`, "i"));
  return match ? match[1] : undefined;
}

/**
 * 解析 schedule-call 標籤
 * 支援格式：<schedule-call delay="5m" reason="想確認她有沒有去看醫生"/>
 * 或：<schedule-call delay="5m" reason="想確認她有沒有去看醫生" opening="喂～你在幹嘛？"/>
 *
 * @param rawResponse - 原始 AI 回覆
 * @returns 解析後的 ScheduleCallData，如果沒有有效標籤則返回 null
 */
export function parseScheduleCallTag(
  rawResponse: string,
): ScheduleCallData | null {
  // 匹配 <schedule-call ... /> 或 <schedule-call ...></schedule-call>
  const tagMatch = rawResponse.match(
    /<schedule-call\s+([^>]*?)\s*\/?>(?:<\/schedule-call>)?/i,
  );

  if (!tagMatch) {
    return null;
  }

  const attrs = tagMatch[1];

  // 提取必要屬性
  const delay = extractAttr(attrs, "delay");
  const reason = extractAttr(attrs, "reason");

  // 驗證必要屬性存在
  if (!delay || !reason) {
    console.warn(
      "[ResponseParser] schedule-call 標籤缺少必要屬性 (delay, reason)",
      { delay, reason },
    );
    return null;
  }

  // 驗證 delay 格式（數字 + 單位：s/m/h/d）
  if (!isValidDelayFormat(delay)) {
    console.warn("[ResponseParser] schedule-call delay 格式無效:", delay);
    return null;
  }

  // 提取可選屬性
  const opening = extractAttr(attrs, "opening");

  return {
    delay,
    reason,
    opening,
  };
}

/**
 * 驗證延遲時間格式是否有效
 * 有效格式：數字 + 單位（s=秒, m=分鐘, h=小時, d=天）
 * 例如：5s, 30m, 1h, 2d
 */
export function isValidDelayFormat(delay: string): boolean {
  return /^\d+[smhd]$/i.test(delay);
}

/**
 * 解析 calendar-event 標籤（支援多個）
 * 支援格式：<calendar-event type="user" date="2026-02-14" title="情人節約會" description="一起去吃飯"/>
 * 或：<calendar-event type="period" date="2026-02-10" title="月經來了"/>
 *
 * @param rawResponse - 原始 AI 回覆
 * @returns 解析後的 CalendarEventData 陣列
 */
export function parseCalendarEventTags(
  rawResponse: string,
): CalendarEventData[] {
  const results: CalendarEventData[] = [];
  const tagRegex = /<calendar-event\s+([^>]*?)\s*\/?>(?:<\/calendar-event>)?/gi;
  let match;

  while ((match = tagRegex.exec(rawResponse)) !== null) {
    const attrs = match[1];

    const title = extractAttr(attrs, "title");
    const date = extractAttr(attrs, "date");

    if (!title || !date) {
      console.warn(
        "[ResponseParser] calendar-event 標籤缺少必要屬性 (title, date)",
        { title, date },
      );
      continue;
    }

    // 驗證日期格式 YYYY-MM-DD
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      console.warn(
        "[ResponseParser] calendar-event date 格式無效（需要 YYYY-MM-DD）:",
        date,
      );
      continue;
    }

    const type = extractAttr(attrs, "type");
    const validTypes = ["user", "period"];
    const eventType =
      type && validTypes.includes(type) ? (type as "user" | "period") : "user";

    const description = extractAttr(attrs, "description");

    results.push({
      type: eventType,
      title,
      date,
      description: description || undefined,
    });
  }

  return results;
}

/**
 * 好感度更新解析結果：
 * - 數字型指標：change 有值，stringValue 為 undefined
 * - 字串型指標：change 為 0，stringValue 有值
 */
export interface AffinityUpdateEntry {
  metric: string;
  /** delta 增量（isAbsolute=false 時使用） */
  change: number;
  reason: string;
  /** 字串型指標的新值 */
  stringValue?: string;
  /** true 時表示絕對賦值（_.set），false/undefined 表示增量（_.add / <affinity-update>） */
  isAbsolute?: boolean;
  /** 絕對賦值的數字新值（isAbsolute=true 且為數字時使用） */
  absoluteValue?: number;
}

/**
 * 解析好感度更新標籤，支援兩種格式：
 * （此函數已 export，可供開場白等場景直接使用）
 * 1. <affinity-update> XML 標籤（±增量）
 *    <affinity-update 好感度="+5" 信任度="-2" 识破身份="已识破" reason="原因"/>
 * 2. MVU <update> 區塊中的 _.set() 語法（絕對賦值）
 *    兩參數：<update>_.set('黎靖青.冷淡值', 50);</update>
 *    三參數：<update>_.set('黎靖青.冷淡值', 50, 55);</update>（原生 MVU 格式：舊值, 新值）
 */

/** 輔助：將解析到的 _.set 參數推入結果陣列 */
function _pushSetResult(
  results: AffinityUpdateEntry[],
  path: string,
  rawVal: string,
): void {
  const strMatch = rawVal.match(/^['"](.*)['"]$/);
  if (strMatch) {
    results.push({
      metric: path,
      change: 0,
      reason: "MVU _.set",
      stringValue: strMatch[1],
      isAbsolute: true,
    });
  } else {
    const numVal = parseFloat(rawVal);
    if (!isNaN(numVal)) {
      results.push({
        metric: path,
        change: 0,
        reason: "MVU _.set",
        isAbsolute: true,
        absoluteValue: numVal,
      });
    }
  }
}

export function parseAffinityUpdateTags(
  rawResponse: string,
): AffinityUpdateEntry[] {
  const results: AffinityUpdateEntry[] = [];

  // ── 格式一：<affinity-update> 標籤（增量） ──────────────────
  const tagRegex = /<affinity-update\s+([^>]*?)\s*\/?>/gi;
  let match: RegExpExecArray | null;

  while ((match = tagRegex.exec(rawResponse)) !== null) {
    const attrs = match[1];
    let reason = "";

    const reasonMatch = attrs.match(/reason=["']([^"']*)["']/i);
    if (reasonMatch) reason = reasonMatch[1];

    const attrRegex = /([^\s=]+)=["']([^"']*)["']/g;
    let attrMatch: RegExpExecArray | null;
    while ((attrMatch = attrRegex.exec(attrs)) !== null) {
      const name = attrMatch[1];
      const value = attrMatch[2];
      if (name.toLowerCase() === "reason") continue;

      const numValue = parseFloat(value);
      if (!Number.isNaN(numValue)) {
        results.push({ metric: name, change: numValue, reason });
      } else {
        results.push({ metric: name, change: 0, reason, stringValue: value });
      }
    }
  }

  // ── 格式二：<update> 區塊中的 _.set() 呼叫（絕對賦值） ──────
  // 支援兩種格式：
  //   兩參數：_.set('path', newValue)           → 直接賦值
  //   三參數：_.set('path', oldValue, newValue)  → 原生 MVU 格式，取第三個參數作為新值
  const updateBlockRegex = /<update>([\s\S]*?)<\/update>/gi;
  let blockMatch: RegExpExecArray | null;

  while ((blockMatch = updateBlockRegex.exec(rawResponse)) !== null) {
    const block = blockMatch[1];
    // 先嘗試三參數格式：_.set('path', oldVal, newVal)
    // 再嘗試兩參數格式：_.set('path', newVal)
    // 使用非貪婪 + 明確分隔避免跨參數誤匹配
    const setRegex3 = /_.set\(['"]([^'"]+)['"]\s*,\s*[^,)]+,\s*([^)]+)\)/g;
    const setRegex2 = /_.set\(['"]([^'"]+)['"]\s*,\s*([^,)]+)\)/g;
    let setMatch: RegExpExecArray | null;

    // 已解析的路徑集合，避免同一行被兩個 regex 重複匹配
    const parsedPaths = new Set<number>();

    // 第一輪：三參數格式（優先）
    while ((setMatch = setRegex3.exec(block)) !== null) {
      parsedPaths.add(setMatch.index);
      const path = setMatch[1].trim();
      const rawVal = setMatch[2].trim(); // 第三個參數 = 新值
      _pushSetResult(results, path, rawVal);
    }

    // 第二輪：兩參數格式（補漏，跳過已被三參數匹配的位置）
    while ((setMatch = setRegex2.exec(block)) !== null) {
      if (parsedPaths.has(setMatch.index)) continue;
      const path = setMatch[1].trim();
      const rawVal = setMatch[2].trim(); // 第二個參數 = 新值
      _pushSetResult(results, path, rawVal);
    }
  }

  return results;
}

/**
 * 檢查回覆是否需要解析（包含導演系統標籤）
 */
export function needsParsing(content: string): boolean {
  // 檢查是否包含任何需要解析的標籤
  return /<think>|<output>|<msg>|<update>|<timetravel>|<redpacket|<location>|<schedule-call|<calendar-event|<time-jump|<送禮物>|<pay>|<refund>|<avatar-change|<voice>|<waimai-pay|<waimai-delivery|<affinity-update|<!DOCTYPE\s|<html[\s>]/i.test(
    content,
  );
}

/**
 * 解析開場白（first_mes）內容，拆分成多個訊息氣泡。
 * 與 parseAIResponse 不同，不會清理「思考過程」等 AI 回覆專用的內容，
 * 只做 HTML 區塊拆分和特殊標籤拆分。
 */
export function parseGreeting(content: string): ParsedMessage[] {
  const trimmed = content.trim();
  if (!trimmed) return [];

  // 1. 先嘗試 HTML 區塊拆分
  const htmlSplit = splitHtmlBlocks(trimmed);
  if (htmlSplit) {
    // HTML 拆分後的文字區塊可能還包含特殊標籤，需要進一步拆分
    const result: ParsedMessage[] = [];
    for (const msg of htmlSplit) {
      if (msg.isHtmlBlock) {
        result.push(msg);
      } else if (msg.content && hasInlineSpecialTags(msg.content)) {
        const split = splitBySpecialTags(msg.content);
        for (const s of split) {
          if (isNonEmptyMessage(s)) result.push(s);
        }
      } else if (msg.content) {
        const parsed = parseMessageContent(msg.content);
        if (isNonEmptyMessage(parsed)) result.push(parsed);
      }
    }
    return result.length > 0 ? result : [parseMessageContent(trimmed)];
  }

  // 2. 檢查特殊標籤拆分（voice、pay、location 等）
  if (hasInlineSpecialTags(trimmed)) {
    const split = splitBySpecialTags(trimmed);
    const result = split.filter(isNonEmptyMessage);
    return result.length > 0 ? result : [parseMessageContent(trimmed)];
  }

  // 3. 沒有需要拆分的內容，用 parseMessageContent 解析單條
  const parsed = parseMessageContent(trimmed);
  return isNonEmptyMessage(parsed) ? [parsed] : [{ content: trimmed }];
}

/**
 * 解析 time-jump 標籤（偏移時間模式專用）
 * 支援格式：<time-jump datetime="2026-05-15T16:00" reason="兩個月後"/>
 *
 * @param rawResponse - 原始 AI 回覆
 * @returns ISO datetime string，或 null（未找到或格式無效）
 */
export function parseTimeJumpTag(rawResponse: string): string | null {
  const tagMatch = rawResponse.match(
    /<time-jump\s+([^>]*?)\s*\/?>(?:<\/time-jump>)?/i,
  );
  if (!tagMatch) return null;

  const attrs = tagMatch[1];
  const datetime = extractAttr(attrs, "datetime");
  if (!datetime) {
    console.warn("[ResponseParser] time-jump 標籤缺少 datetime 屬性");
    return null;
  }

  // 驗證格式（YYYY-MM-DDTHH:mm 或 YYYY-MM-DD）
  if (!/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2})?$/.test(datetime)) {
    console.warn("[ResponseParser] time-jump datetime 格式無效:", datetime);
    return null;
  }

  return datetime;
}

/**
 * 簡單清理回覆（移除思考過程，只保留輸出）
 */
export function cleanResponse(rawResponse: string): string {
  const parsed = parseAIResponse(rawResponse);
  if (parsed.messages.length > 0) {
    return parsed.messages
      .map((m) => m.content)
      .filter((c) => c)
      .join("\n\n");
  }
  return parsed.rawOutput || rawResponse;
}

// ===== CharAction 標籤解析 =====

export interface ParsedCharAction {
  action: "block-user" | "unblock-user" | "apology-food" | "friend-response";
  reason?: string;
  message?: string;
  item?: string;
  /** 好友申請回應：是否接受 */
  accept?: boolean;
  /** 好友申請回應：回覆文字 */
  reply?: string;
  /** 拒絕原因（角色拒絕時 AI 生成） */
  rejectReason?: string;
  /** 隱藏小心聲（提示用戶怎麼做角色會高興一點） */
  hint?: string;
}

/** 支援的 char-action 動作類型 */
const VALID_CHAR_ACTIONS = new Set([
  "block-user",
  "unblock-user",
  "apology-food",
]);

/**
 * 從 AI 回應中解析 char-action 標籤
 * 支援格式：
 * - [char-action:block-user|reason:xxx]
 * - [char-action:unblock-user]
 * - [char-action:apology-food|item:xxx|message:xxx]
 *
 * 無效標籤靜默忽略並記錄 console.warn
 */
export function parseCharActionTags(content: string): {
  actions: ParsedCharAction[];
  cleanContent: string;
} {
  const actions: ParsedCharAction[] = [];
  // 匹配 [char-action:ACTION] 或 [char-action:ACTION|param:value|...]
  const tagRegex = /\[char-action:([^\]|]+?)(?:\|([^\]]*))?\]/g;
  let cleanContent = content;

  let match: RegExpExecArray | null;
  while ((match = tagRegex.exec(content)) !== null) {
    const actionType = match[1].trim();
    const paramsStr = match[2] || "";

    // 驗證動作類型
    if (!VALID_CHAR_ACTIONS.has(actionType)) {
      console.warn(`[ResponseParser] 無效的 char-action 類型: ${actionType}`);
      continue;
    }

    const action: ParsedCharAction = {
      action: actionType as ParsedCharAction["action"],
    };

    // 解析鍵值參數
    if (paramsStr) {
      const params = paramsStr.split("|");
      for (const param of params) {
        const colonIdx = param.indexOf(":");
        if (colonIdx === -1) continue;
        const key = param.substring(0, colonIdx).trim();
        const value = param.substring(colonIdx + 1).trim();
        if (!key || !value) continue;

        switch (key) {
          case "reason":
            action.reason = value;
            break;
          case "message":
            action.message = value;
            break;
          case "item":
            action.item = value;
            break;
          default:
            // 未知參數靜默忽略
            break;
        }
      }
    }

    actions.push(action);
    // 從顯示內容中移除已解析的標籤
    cleanContent = cleanContent.replace(match[0], "");
  }

  // 清理移除標籤後可能產生的多餘空白行
  cleanContent = cleanContent.replace(/\n{3,}/g, "\n\n").trim();

  return { actions, cleanContent };
}

/**
 * 解析 YAML 格式的好友申請回應區塊
 * 格式：
 * [char-action:friend-response]
 * accept: y/n
 * reply: 回覆文字
 * reason: 拒絕原因（可選）
 * hint: 小心聲（可選）
 * [/char-action:friend-response]
 *
 * 無效區塊回傳 null 並記錄 console.warn
 */
export function parseFriendResponseBlock(content: string): {
  response: ParsedCharAction | null;
  cleanContent: string;
} {
  const blockRegex =
    /\[char-action:friend-response\]\s*\n([\s\S]*?)\[\/char-action:friend-response\]/g;
  let cleanContent = content;
  let response: ParsedCharAction | null = null;

  const match = blockRegex.exec(content);
  if (!match) {
    return { response: null, cleanContent };
  }

  const yamlContent = match[1];

  try {
    // 逐行解析簡單 key: value 格式
    const fields: Record<string, string> = {};
    const lines = yamlContent.split("\n");
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      const colonIdx = trimmed.indexOf(":");
      if (colonIdx === -1) continue;
      const key = trimmed.substring(0, colonIdx).trim();
      const value = trimmed.substring(colonIdx + 1).trim();
      if (key && value) {
        fields[key] = value;
      }
    }

    // accept 為必要欄位
    if (!fields.accept) {
      console.warn("[ResponseParser] friend-response 區塊缺少 accept 欄位");
      return { response: null, cleanContent };
    }

    const acceptValue = fields.accept.toLowerCase();
    if (acceptValue !== "y" && acceptValue !== "n") {
      console.warn(
        `[ResponseParser] friend-response accept 值無效: ${fields.accept}`,
      );
      return { response: null, cleanContent };
    }

    response = {
      action: "friend-response",
      accept: acceptValue === "y",
      reply: fields.reply,
      rejectReason: fields.reason,
      hint: fields.hint,
    };
  } catch (e) {
    console.warn("[ResponseParser] 解析 friend-response 區塊失敗:", e);
    return { response: null, cleanContent };
  }

  // 從顯示內容中移除整個區塊
  cleanContent = cleanContent.replace(match[0], "");
  cleanContent = cleanContent.replace(/\n{3,}/g, "\n\n").trim();

  return { response, cleanContent };
}

// ===== 群聊解析 =====

export interface ParsedGroupMessage extends ParsedMessage {
  /** 發送者角色名稱 */
  senderName: string;
  /** 是否為撤回 */
  isRecall?: boolean;
  recallContent?: string;
  /** 是否為私信 */
  isPrivateMessage?: boolean;
  /** 是否為群管理動作 */
  isGroupAction?: boolean;
  groupActionType?: "rename" | "kick" | "mute" | "unmute";
  groupActionActor?: string;
  groupActionTarget?: string;
  groupActionValue?: string;
  /** 是否為表情包 */
  isStickerMsg?: boolean;
  stickerMeaning?: string;
  /** 是否為語音 */
  isVoice?: boolean;
  voiceContent?: string;
  /** 是否為圖片 */
  isAiImage?: boolean;
  imageDescription?: string;
  imagePrompt?: string;
  /** 是否為群通話請求 */
  isGroupCallRequest?: boolean;
  groupCallRequestReason?: string;
  /** 是否為群通話回應 */
  isGroupCallResponse?: boolean;
  groupCallResponseAction?: "join" | "decline";
  groupCallDeclineReason?: string;
  /** 是否為加入通話 */
  isJoinCall?: boolean;
  /** 是否為離開通話 */
  isLeaveCall?: boolean;
  leaveCallReason?: string;
}

export interface ParsedGroupResponse {
  thinking: string;
  messages: ParsedGroupMessage[];
  rawOutput: string;
}

/**
 * 解析群聊 AI 回覆
 * 格式：<think>...</think><output><msg name="角色名">內容</msg>...</output>
 */
export function parseGroupChatResponse(
  rawResponse: string,
): ParsedGroupResponse {
  const result: ParsedGroupResponse = {
    thinking: "",
    messages: [],
    rawOutput: "",
  };

  // 1. 提取 <think> 內容
  const thinkMatch = rawResponse.match(/<think>([\s\S]*?)<\/think>/i);
  if (thinkMatch) {
    result.thinking = thinkMatch[1].trim();
  }

  // 2. 提取 <output> 內容
  let outputContent = "";
  const outputMatch = rawResponse.match(/<output>([\s\S]*?)<\/output>/i);
  if (outputMatch) {
    outputContent = outputMatch[1].trim();
  } else {
    // 沒有 <output> 標籤，移除 <think> 後使用剩餘內容
    outputContent = rawResponse
      .replace(/<think>[\s\S]*?<\/think>/gi, "")
      .trim();
  }

  // 3. 呼叫 fuzzy repair
  const repaired = repairXmlTags(outputContent);
  outputContent = repaired.content;
  result.rawOutput = outputContent;

  // 4. 解析各種標籤
  // 使用正則逐一匹配 <msg>, <recall>, <dm>, <group-action>, <group-call-request>, <call-response>
  const tagRegex =
    /<msg\s+([^>]*?)\/>|<msg\s+([^>]*?)>([\s\S]*?)<\/msg>|<recall\s+([^>]*?)>([\s\S]*?)<\/recall>|<dm\s+([^>]*?)>([\s\S]*?)<\/dm>|<group-action\s+([^>]*?)\s*\/?>|<group-call-request\s+([^>]*?)\s*\/?>|<call-response\s+([^>]*?)\s*\/?>/gi;

  let match;
  while ((match = tagRegex.exec(outputContent)) !== null) {
    if (match[1] !== undefined) {
      // Self-closing <msg ... /> tag (sticker, image)
      const attrs = match[1];
      const name = extractAttr(attrs, "name") || "";
      const type = extractAttr(attrs, "type");
      const meaning = extractAttr(attrs, "meaning");

      if (type === "sticker") {
        result.messages.push({
          content: "",
          senderName: name,
          isStickerMsg: true,
          stickerMeaning: meaning || "",
        });
      } else if (type === "image") {
        const description = extractAttr(attrs, "description") || "";
        const prompt = extractAttr(attrs, "prompt") || "";
        result.messages.push({
          content: "",
          senderName: name,
          isAiImage: true,
          imageDescription: description,
          imagePrompt: prompt,
        });
      } else {
        // 其他自閉合 msg 標籤
        result.messages.push({
          content: "",
          senderName: name,
        });
      }
    } else if (match[2] !== undefined) {
      // Non-self-closing <msg ...>content</msg> tag
      const attrs = match[2];
      const innerContent = match[3] ?? "";
      const name = extractAttr(attrs, "name") || "";
      const type = extractAttr(attrs, "type");

      if (type === "voice") {
        result.messages.push({
          content: "",
          senderName: name,
          isVoice: true,
          voiceContent: innerContent.trim(),
        });
      } else {
        // 檢查是否包含 <join-call> 或 <leave-call>
        const joinCallMatch = innerContent.match(/<join-call\s*\/?>/i);
        const leaveCallMatch = innerContent.match(
          /<leave-call\s+reason="([^"]*)"?\s*\/?>/i,
        );

        if (joinCallMatch) {
          // 加入通話
          const textContent = innerContent
            .replace(/<join-call\s*\/?>/gi, "")
            .trim();
          const parsed = parseMessageContent(textContent);
          result.messages.push({
            ...parsed,
            senderName: name,
            isJoinCall: true,
          });
        } else if (leaveCallMatch) {
          // 離開通話
          const reason = leaveCallMatch[1] || "";
          const textContent = innerContent
            .replace(/<leave-call\s+reason="[^"]*"?\s*\/?>/gi, "")
            .trim();
          const parsed = parseMessageContent(textContent);
          result.messages.push({
            ...parsed,
            senderName: name,
            isLeaveCall: true,
            leaveCallReason: reason,
          });
        } else {
          // 普通文字訊息 — 複用 parseMessageContent 處理內部標籤
          const parsed = parseMessageContent(innerContent.trim());
          result.messages.push({
            ...parsed,
            senderName: name,
          });
        }
      }
    } else if (match[4] !== undefined) {
      // <recall> tag
      const attrs = match[4];
      const recallBody = match[5] ?? "";
      const name = extractAttr(attrs, "name") || "";
      result.messages.push({
        content: "",
        senderName: name,
        isRecall: true,
        recallContent: recallBody.trim(),
      });
    } else if (match[6] !== undefined) {
      // <dm> tag
      const attrs = match[6];
      const dmBody = match[7] ?? "";
      const name = extractAttr(attrs, "name") || "";
      result.messages.push({
        content: dmBody.trim(),
        senderName: name,
        isPrivateMessage: true,
      });
    } else if (match[8] !== undefined) {
      // <group-action> tag
      const attrs = match[8];
      const actionType = extractAttr(attrs, "type") as
        | "rename"
        | "kick"
        | "mute"
        | "unmute"
        | undefined;
      const actor = extractAttr(attrs, "actor") || "";
      const target = extractAttr(attrs, "target");
      const value = extractAttr(attrs, "value");
      result.messages.push({
        content: "",
        senderName: actor,
        isGroupAction: true,
        groupActionType: actionType,
        groupActionActor: actor,
        groupActionTarget: target,
        groupActionValue: value,
      });
    } else if (match[9] !== undefined) {
      // <group-call-request> tag
      const attrs = match[9];
      const name = extractAttr(attrs, "name") || "";
      const reason = extractAttr(attrs, "reason") || "";
      result.messages.push({
        content: "",
        senderName: name,
        isGroupCallRequest: true,
        groupCallRequestReason: reason,
      });
    } else if (match[10] !== undefined) {
      // <call-response> tag
      const attrs = match[10];
      const name = extractAttr(attrs, "name") || "";
      const action = extractAttr(attrs, "action") as
        | "join"
        | "decline"
        | undefined;
      const reason = extractAttr(attrs, "reason");
      result.messages.push({
        content: "",
        senderName: name,
        isGroupCallResponse: true,
        groupCallResponseAction: action,
        groupCallDeclineReason: reason,
      });
    }
  }

  // 5. Fallback：如果完全沒有解析到任何訊息，將原始內容作為系統訊息
  if (result.messages.length === 0 && outputContent) {
    result.messages.push({
      content: outputContent,
      senderName: "",
    });
  }

  return result;
}

/**
 * 將 ParsedGroupResponse 轉回 XML 字串（pretty-print）
 */
export function prettyPrintGroupResponse(parsed: ParsedGroupResponse): string {
  const parts: string[] = [];

  if (parsed.thinking) {
    parts.push(`<think>${parsed.thinking}</think>`);
  }

  const msgParts: string[] = [];
  for (const msg of parsed.messages) {
    if (msg.isRecall) {
      msgParts.push(
        `<recall name="${msg.senderName}">${msg.recallContent ?? ""}</recall>`,
      );
    } else if (msg.isPrivateMessage) {
      msgParts.push(`<dm name="${msg.senderName}">${msg.content}</dm>`);
    } else if (msg.isGroupAction) {
      const attrParts = [`type="${msg.groupActionType ?? ""}"`];
      attrParts.push(`actor="${msg.groupActionActor ?? ""}"`);
      if (msg.groupActionTarget !== undefined) {
        attrParts.push(`target="${msg.groupActionTarget}"`);
      }
      if (msg.groupActionValue !== undefined) {
        attrParts.push(`value="${msg.groupActionValue}"`);
      }
      msgParts.push(`<group-action ${attrParts.join(" ")}/>`);
    } else if (msg.isStickerMsg) {
      msgParts.push(
        `<msg name="${msg.senderName}" type="sticker" meaning="${msg.stickerMeaning ?? ""}"/>`,
      );
    } else if (msg.isVoice) {
      msgParts.push(
        `<msg name="${msg.senderName}" type="voice">${msg.voiceContent ?? ""}</msg>`,
      );
    } else if (msg.isAiImage) {
      msgParts.push(
        `<msg name="${msg.senderName}" type="image" description="${msg.imageDescription ?? ""}" prompt="${msg.imagePrompt ?? ""}"/>`,
      );
    } else {
      // 普通文字訊息 — 重建內部標籤
      let inner = rebuildMessageContent(msg);
      msgParts.push(`<msg name="${msg.senderName}">${inner}</msg>`);
    }
  }

  if (msgParts.length > 0) {
    parts.push(`<output>${msgParts.join("")}</output>`);
  }

  return parts.join("");
}

/**
 * 從 ParsedMessage 重建內部 XML 內容
 */
function rebuildMessageContent(msg: ParsedGroupMessage): string {
  const segments: string[] = [];

  if (msg.isReplyTo && msg.replyToContent) {
    segments.push(`<reply-to>${msg.replyToContent}</reply-to>`);
  }
  if (msg.isRedpacket && msg.redpacketData) {
    let attrs = `amount="${msg.redpacketData.amount}" blessing="${msg.redpacketData.blessing}"`;
    if (msg.redpacketData.password) {
      attrs += ` password="${msg.redpacketData.password}"`;
    }
    if (msg.redpacketData.voice) {
      attrs += ` voice="${msg.redpacketData.voice}"`;
    }
    segments.push(`<redpacket ${attrs}/>`);
    return segments.join("");
  }
  if (msg.isLocation && msg.locationContent) {
    segments.push(`<location>${msg.locationContent}</location>`);
    return segments.join("");
  }
  if (msg.isGift && msg.giftName) {
    segments.push(`<送禮物>${msg.giftName}</送禮物>`);
    return segments.join("");
  }
  if (msg.isTransfer) {
    if (msg.transferType === "pay") {
      const note = msg.transferNote ? `:${msg.transferNote}` : "";
      segments.push(`<pay>${msg.transferAmount ?? 0}${note}</pay>`);
    } else if (msg.transferType === "refund") {
      segments.push(`<refund>${msg.transferAmount ?? 0}</refund>`);
    }
  }

  if (msg.isWaimaiPaymentResult && msg.waimaiPaymentStatus) {
    segments.push(`<waimai-pay status="${msg.waimaiPaymentStatus}"/>`);
  }
  if (msg.isWaimaiDelivery) {
    segments.push(`<waimai-delivery/>`);
  }

  if (msg.content) {
    segments.push(msg.content);
  }

  if (msg.thought) {
    segments.push(` ˇ${msg.thought}ˇ`);
  }

  return segments.join("");
}
