/**
 * XML Fuzzy Repair 模組
 * 對 AI 輸出中常見的 XML 標籤錯誤進行自動修正
 */

export interface RepairLog {
  /** 修復前的原始內容 */
  original: string;
  /** 修復後的內容 */
  repaired: string;
  /** 套用的修復規則名稱 */
  rule: string;
}

export interface RepairResult {
  /** 修復後的完整內容 */
  content: string;
  /** 修復日誌列表 */
  logs: RepairLog[];
  /** 是否有進行任何修復 */
  wasRepaired: boolean;
}

/** 常見拼寫變體對照表 */
const SPELLING_VARIANTS: Record<string, string> = {
  messge: "msg",
  messg: "msg",
  mesage: "msg",
  message: "msg",
  mesg: "msg",
  recal: "recall",
  recll: "recall",
  recalll: "recall",
  "group-acton": "group-action",
  "group-actoin": "group-action",
  groupaction: "group-action",
  "group-acion": "group-action",
};

/**
 * 修復 XML 標籤中的常見錯誤
 *
 * 修復規則：
 * 1. 標籤名前後多餘空格
 * 2. 標籤名前多餘符號（如 `-`）
 * 3. 常見拼寫變體
 * 4. 屬性引號不匹配
 * 5. 未閉合的 <msg> 標籤
 */
export function repairXmlTags(content: string): RepairResult {
  const logs: RepairLog[] = [];
  let result = content;

  // Rule 1: 標籤名前後多餘空格
  // 匹配 < msg>, < /msg>, < recall>, < dm>, < group-action> 等
  result = result.replace(
    /<\s+(\/?\s*(?:msg|recall|dm|group-action|output|think))/gi,
    (match, tagBody) => {
      const cleaned = tagBody.replace(/\s+/g, "");
      const repaired = `<${cleaned}`;
      if (match !== repaired) {
        logs.push({ original: match, repaired, rule: "extra-space-in-tag" });
      }
      return repaired;
    },
  );

  // Also fix spaces before closing >: <msg name="x" > → <msg name="x">
  // and closing tags with spaces: < / msg> → </msg>
  result = result.replace(
    /<\s*\/\s+(msg|recall|dm|group-action|output|think)\s*>/gi,
    (match, tagName) => {
      const repaired = `</${tagName.toLowerCase()}>`;
      if (match !== repaired) {
        logs.push({
          original: match,
          repaired,
          rule: "extra-space-in-closing-tag",
        });
      }
      return repaired;
    },
  );

  // Rule 2: 標籤名前多餘符號（如 <-pay>, <-msg>）
  result = result.replace(
    /<-+(msg|recall|dm|group-action|pay|refund|redpacket|location|reply-to|送禮物|waimai-pay|waimai-delivery)/gi,
    (match, tagName) => {
      const repaired = `<${tagName}`;
      if (match !== repaired) {
        logs.push({
          original: match,
          repaired,
          rule: "extra-symbol-before-tag",
        });
      }
      return repaired;
    },
  );
  // Same for closing tags: <-/msg> or </-msg>
  result = result.replace(
    /<-+\/(msg|recall|dm|group-action|pay|refund|redpacket|location|reply-to|送禮物)/gi,
    (match, tagName) => {
      const repaired = `</${tagName}`;
      if (match !== repaired) {
        logs.push({
          original: match,
          repaired,
          rule: "extra-symbol-before-closing-tag",
        });
      }
      return repaired;
    },
  );
  result = result.replace(
    /<\/-+(msg|recall|dm|group-action|pay|refund|redpacket|location|reply-to|送禮物)/gi,
    (match, tagName) => {
      const repaired = `</${tagName}`;
      if (match !== repaired) {
        logs.push({
          original: match,
          repaired,
          rule: "extra-symbol-before-closing-tag",
        });
      }
      return repaired;
    },
  );

  // Rule 3: 常見拼寫變體
  // Match opening tags with misspelled names
  const variantPattern = Object.keys(SPELLING_VARIANTS).join("|");
  const variantRegex = new RegExp(`<(/?)(${variantPattern})(\\s|>|/>)`, "gi");
  result = result.replace(variantRegex, (match, slash, misspelled, after) => {
    const correct = SPELLING_VARIANTS[misspelled.toLowerCase()];
    if (correct) {
      const repaired = `<${slash}${correct}${after}`;
      logs.push({ original: match, repaired, rule: "spelling-variant" });
      return repaired;
    }
    return match;
  });

  // Rule 4: 屬性引號不匹配
  // Fix name="阿瓜 (missing closing quote) — look for name="..." where the closing " is missing before > or next attribute
  result = result.replace(
    /(\bname\s*=\s*"[^"]*?)(\s*>|\s*\/>|\s+(?:type|meaning|action|actor|target|value|description|prompt)\s*=)/gi,
    (match, attrStart, afterPart) => {
      // Check if the attribute value is properly closed
      if (!attrStart.endsWith('"')) {
        const repaired = `${attrStart}"${afterPart}`;
        logs.push({
          original: match,
          repaired,
          rule: "unclosed-attribute-quote",
        });
        return repaired;
      }
      return match;
    },
  );
  // Same for other attributes: type, meaning, action, actor, target, value
  result = result.replace(
    /(\b(?:type|meaning|action|actor|target|value|description|prompt)\s*=\s*"[^"]*?)(\s*>|\s*\/>|\s+(?:name|type|meaning|action|actor|target|value|description|prompt)\s*=)/gi,
    (match, attrStart, afterPart) => {
      if (!attrStart.endsWith('"')) {
        const repaired = `${attrStart}"${afterPart}`;
        logs.push({
          original: match,
          repaired,
          rule: "unclosed-attribute-quote",
        });
        return repaired;
      }
      return match;
    },
  );

  // Rule 5: 未閉合的 <msg> 標籤
  // Find <msg ...> that are not self-closing and don't have a matching </msg>
  result = repairUnclosedMsgTags(result, logs);

  return {
    content: result,
    logs,
    wasRepaired: logs.length > 0,
  };
}

/**
 * 修復未閉合的 <msg> 標籤
 * 以下一個 <msg>、<recall>、<dm>、<group-action> 或 </output> 作為邊界自動補上 </msg>
 */
function repairUnclosedMsgTags(content: string, logs: RepairLog[]): string {
  // Match all <msg ...> opening tags (non-self-closing)
  // We need to track positions and check for matching </msg>
  const openTagRegex = /<msg\s[^>]*?[^/]>|<msg>/gi;
  const selfClosingRegex = /<msg\s[^>]*?\/>/gi;
  const closeTagStr = "</msg>";

  // Collect all opening tag positions (excluding self-closing)
  const selfClosingPositions = new Set<number>();
  let scMatch;
  while ((scMatch = selfClosingRegex.exec(content)) !== null) {
    selfClosingPositions.add(scMatch.index);
  }

  const openTags: Array<{ index: number; length: number; tag: string }> = [];
  let otMatch;
  while ((otMatch = openTagRegex.exec(content)) !== null) {
    if (!selfClosingPositions.has(otMatch.index)) {
      openTags.push({
        index: otMatch.index,
        length: otMatch[0].length,
        tag: otMatch[0],
      });
    }
  }

  if (openTags.length === 0) return content;

  // For each opening tag, check if there's a </msg> before the next boundary
  // Boundaries: next <msg, <recall, <dm, <group-action, </output>, end of string
  const boundaryRegex =
    /<msg[\s>]|<recall[\s>]|<dm[\s>]|<group-action[\s>\/]|<\/output>/gi;
  const boundaries: number[] = [];
  let bMatch;
  while ((bMatch = boundaryRegex.exec(content)) !== null) {
    boundaries.push(bMatch.index);
  }
  boundaries.push(content.length);

  // Process from end to start to avoid index shifting
  const repairs: Array<{ insertAt: number; original: string }> = [];

  for (let i = openTags.length - 1; i >= 0; i--) {
    const openTag = openTags[i];
    const afterOpen = openTag.index + openTag.length;

    // Find the next boundary after this opening tag
    let nextBoundary = content.length;
    for (const b of boundaries) {
      if (b > afterOpen) {
        nextBoundary = b;
        break;
      }
    }

    // Check if there's a </msg> between afterOpen and nextBoundary
    const segment = content.substring(afterOpen, nextBoundary);
    if (!segment.includes(closeTagStr)) {
      // No closing tag found — need to insert one at the boundary
      repairs.push({
        insertAt: nextBoundary,
        original:
          segment.trim().substring(0, 30) + (segment.length > 30 ? "..." : ""),
      });
    }
  }

  // Apply repairs from end to start
  let repaired = content;
  for (const repair of repairs) {
    repaired =
      repaired.substring(0, repair.insertAt) +
      closeTagStr +
      repaired.substring(repair.insertAt);
    logs.push({
      original: `(unclosed <msg> near: "${repair.original}")`,
      repaired: `(inserted </msg> at position ${repair.insertAt})`,
      rule: "unclosed-msg-tag",
    });
  }

  return repaired;
}
