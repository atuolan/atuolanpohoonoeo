/**
 * 群聊 XML 解析 Property-Based Tests
 * **Feature: group-chat, Property 5: Group chat XML round-trip parsing**
 * **Validates: Requirements 4.1, 4.7, 4.8**
 */

import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
    parseGroupChatResponse,
    prettyPrintGroupResponse,
} from "../ResponseParser";

// === Arbitraries ===

/** 生成不含 XML 特殊字元的中文/英文名稱 */
const nameArb = fc.oneof(
  fc.constantFrom(
    "阿瓜",
    "小雲",
    "星星",
    "月月",
    "小花",
    "大海",
    "Alice",
    "Bob",
    "Charlie",
  ),
  fc
    .array(fc.constantFrom("a", "b", "c", "d", "e", "f", "g", "h"), {
      minLength: 1,
      maxLength: 6,
    })
    .map((chars) => chars.join("")),
);

/** 生成安全的訊息文字內容（不含 XML 特殊字元和 ^ 想法標記） */
const safeTextArb = fc
  .string({ minLength: 1, maxLength: 50 })
  .map((s) => s.replace(/[<>&"'^~\\]/g, "").replace(/[\x00-\x1f]/g, ""))
  .filter((s) => s.trim().length > 0);

/** 生成思考內容 */
const thinkingArb = fc.option(safeTextArb, { nil: undefined });

/** 生成普通文字 msg */
const textMsgArb = fc.record({
  type: fc.constant("text" as const),
  name: nameArb,
  content: safeTextArb,
});

/** 生成 sticker msg */
const stickerMsgArb = fc.record({
  type: fc.constant("sticker" as const),
  name: nameArb,
  meaning: safeTextArb,
});

/** 生成 voice msg */
const voiceMsgArb = fc.record({
  type: fc.constant("voice" as const),
  name: nameArb,
  voiceContent: safeTextArb,
});

/** 生成 recall tag */
const recallArb = fc.record({
  type: fc.constant("recall" as const),
  name: nameArb,
  recallContent: safeTextArb,
});

/** 生成 dm tag */
const dmArb = fc.record({
  type: fc.constant("dm" as const),
  name: nameArb,
  content: safeTextArb,
});

/** 生成 group-action tag */
const groupActionArb = fc.record({
  type: fc.constant("group-action" as const),
  actionType: fc.constantFrom("rename", "kick", "mute", "unmute"),
  actor: nameArb,
  target: fc.option(nameArb, { nil: undefined }),
  value: fc.option(safeTextArb, { nil: undefined }),
});

type MsgDef =
  | { type: "text"; name: string; content: string }
  | { type: "sticker"; name: string; meaning: string }
  | { type: "voice"; name: string; voiceContent: string }
  | { type: "recall"; name: string; recallContent: string }
  | { type: "dm"; name: string; content: string }
  | {
      type: "group-action";
      actionType: string;
      actor: string;
      target?: string;
      value?: string;
    };

/** 生成一個群聊標籤 */
const groupTagArb: fc.Arbitrary<MsgDef> = fc.oneof(
  textMsgArb,
  stickerMsgArb,
  voiceMsgArb,
  recallArb,
  dmArb,
  groupActionArb,
);

/** 將 MsgDef 轉為 XML 字串 */
function msgDefToXml(msg: MsgDef): string {
  switch (msg.type) {
    case "text":
      return `<msg name="${msg.name}">${msg.content}</msg>`;
    case "sticker":
      return `<msg name="${msg.name}" type="sticker" meaning="${msg.meaning}"/>`;
    case "voice":
      return `<msg name="${msg.name}" type="voice">${msg.voiceContent}</msg>`;
    case "recall":
      return `<recall name="${msg.name}">${msg.recallContent}</recall>`;
    case "dm":
      return `<dm name="${msg.name}">${msg.content}</dm>`;
    case "group-action": {
      const parts = [`type="${msg.actionType}"`, `actor="${msg.actor}"`];
      if (msg.target !== undefined) parts.push(`target="${msg.target}"`);
      if (msg.value !== undefined) parts.push(`value="${msg.value}"`);
      return `<group-action ${parts.join(" ")}/>`;
    }
  }
}

describe("Group Chat XML Round-Trip Parsing", () => {
  /**
   * **Feature: group-chat, Property 5: Group chat XML round-trip parsing**
   * **Validates: Requirements 4.1, 4.7, 4.8**
   *
   * For any valid group chat XML response, parsing then pretty-printing
   * should produce semantically equivalent XML — meaning re-parsing the
   * pretty-printed output yields the same structured data.
   */
  it("parse → prettyPrint → parse produces equivalent parsed structure", () => {
    fc.assert(
      fc.property(
        thinkingArb,
        fc.array(groupTagArb, { minLength: 1, maxLength: 5 }),
        (thinking, tags) => {
          // Build canonical XML
          const thinkPart = thinking ? `<think>${thinking}</think>` : "";
          const outputPart = `<output>${tags.map(msgDefToXml).join("")}</output>`;
          const xml = `${thinkPart}${outputPart}`;

          // Parse
          const parsed = parseGroupChatResponse(xml);

          // Pretty-print
          const printed = prettyPrintGroupResponse(parsed);

          // Re-parse
          const reparsed = parseGroupChatResponse(printed);

          // Compare structural equivalence
          expect(reparsed.thinking).toBe(parsed.thinking);
          expect(reparsed.messages.length).toBe(parsed.messages.length);

          for (let i = 0; i < parsed.messages.length; i++) {
            const a = parsed.messages[i];
            const b = reparsed.messages[i];

            expect(b.senderName).toBe(a.senderName);
            expect(b.content).toBe(a.content);
            expect(b.isRecall ?? false).toBe(a.isRecall ?? false);
            expect(b.recallContent ?? "").toBe(a.recallContent ?? "");
            expect(b.isPrivateMessage ?? false).toBe(
              a.isPrivateMessage ?? false,
            );
            expect(b.isGroupAction ?? false).toBe(a.isGroupAction ?? false);
            expect(b.groupActionType).toBe(a.groupActionType);
            expect(b.groupActionActor).toBe(a.groupActionActor);
            expect(b.groupActionTarget).toBe(a.groupActionTarget);
            expect(b.groupActionValue).toBe(a.groupActionValue);
            expect(b.isStickerMsg ?? false).toBe(a.isStickerMsg ?? false);
            expect(b.stickerMeaning ?? "").toBe(a.stickerMeaning ?? "");
            expect(b.isVoice ?? false).toBe(a.isVoice ?? false);
            expect(b.voiceContent ?? "").toBe(a.voiceContent ?? "");
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});
