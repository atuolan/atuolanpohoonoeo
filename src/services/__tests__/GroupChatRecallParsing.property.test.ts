/**
 * 群聊 recall 標籤解析 Property-Based Test
 * **Feature: group-chat, Property 7: Recall tag parsing**
 * **Validates: Requirements 4.4**
 */

import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import { parseGroupChatResponse } from "../ResponseParser";

// === Arbitraries ===

/** 生成不含 XML 特殊字元的名稱 */
const nameArb = fc.constantFrom(
  "阿瓜",
  "小雲",
  "星星",
  "月月",
  "小花",
  "大海",
  "Alice",
  "Bob",
  "Charlie",
  "abc",
  "def",
);

/** 生成安全的文字內容（不含 XML 特殊字元和 ^ 想法標記，已 trim） */
const safeTextArb = fc
  .string({ minLength: 1, maxLength: 40 })
  .map((s) =>
    s
      .replace(/[<>&"'^~\\]/g, "")
      .replace(/[\x00-\x1f]/g, "")
      .trim(),
  )
  .filter((s) => s.length > 0);

describe("Recall Tag Parsing", () => {
  /**
   * **Feature: group-chat, Property 7: Recall tag parsing**
   * **Validates: Requirements 4.4**
   *
   * For any <recall name="X">content</recall> tag, parsing should produce
   * a message with isRecall=true, senderName="X", and recallContent="content".
   */
  it("parses a single recall tag with correct fields", () => {
    fc.assert(
      fc.property(nameArb, safeTextArb, (name, content) => {
        const xml = `<output><recall name="${name}">${content}</recall></output>`;
        const parsed = parseGroupChatResponse(xml);

        expect(parsed.messages.length).toBe(1);
        const msg = parsed.messages[0];
        expect(msg.isRecall).toBe(true);
        expect(msg.senderName).toBe(name);
        expect(msg.recallContent).toBe(content);
      }),
      { numRuns: 100 },
    );
  });

  it("parses multiple recall tags preserving order and fields", () => {
    fc.assert(
      fc.property(
        fc.array(fc.record({ name: nameArb, content: safeTextArb }), {
          minLength: 1,
          maxLength: 5,
        }),
        (recalls) => {
          const xmlTags = recalls.map(
            (r) => `<recall name="${r.name}">${r.content}</recall>`,
          );
          const xml = `<output>${xmlTags.join("")}</output>`;
          const parsed = parseGroupChatResponse(xml);

          expect(parsed.messages.length).toBe(recalls.length);
          for (let i = 0; i < recalls.length; i++) {
            const msg = parsed.messages[i];
            expect(msg.isRecall).toBe(true);
            expect(msg.senderName).toBe(recalls[i].name);
            expect(msg.recallContent).toBe(recalls[i].content);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it("parses recall tags mixed with regular msg tags", () => {
    fc.assert(
      fc.property(
        nameArb,
        safeTextArb,
        nameArb,
        safeTextArb,
        (recallName, recallContent, msgName, msgContent) => {
          const xml = `<output><msg name="${msgName}">${msgContent}</msg><recall name="${recallName}">${recallContent}</recall></output>`;
          const parsed = parseGroupChatResponse(xml);

          expect(parsed.messages.length).toBe(2);

          // First message is a regular msg
          expect(parsed.messages[0].senderName).toBe(msgName);
          expect(parsed.messages[0].isRecall).toBeFalsy();

          // Second message is a recall
          const recall = parsed.messages[1];
          expect(recall.isRecall).toBe(true);
          expect(recall.senderName).toBe(recallName);
          expect(recall.recallContent).toBe(recallContent);
        },
      ),
      { numRuns: 100 },
    );
  });
});
