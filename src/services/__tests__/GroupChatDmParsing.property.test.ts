/**
 * 群聊 dm 標籤解析 Property-Based Test
 * **Feature: group-chat, Property 8: DM tag parsing**
 * **Validates: Requirements 4.5**
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

describe("DM Tag Parsing", () => {
  /**
   * **Feature: group-chat, Property 8: DM tag parsing**
   * **Validates: Requirements 4.5**
   *
   * For any <dm name="X">content</dm> tag, parsing should produce
   * a message with isPrivateMessage=true, senderName="X", and the correct content.
   */
  it("parses a single dm tag with correct fields", () => {
    fc.assert(
      fc.property(nameArb, safeTextArb, (name, content) => {
        const xml = `<output><dm name="${name}">${content}</dm></output>`;
        const parsed = parseGroupChatResponse(xml);

        expect(parsed.messages.length).toBe(1);
        const msg = parsed.messages[0];
        expect(msg.isPrivateMessage).toBe(true);
        expect(msg.senderName).toBe(name);
        expect(msg.content).toBe(content);
      }),
      { numRuns: 100 },
    );
  });

  it("parses multiple dm tags preserving order and fields", () => {
    fc.assert(
      fc.property(
        fc.array(fc.record({ name: nameArb, content: safeTextArb }), {
          minLength: 1,
          maxLength: 5,
        }),
        (dms) => {
          const xmlTags = dms.map(
            (d) => `<dm name="${d.name}">${d.content}</dm>`,
          );
          const xml = `<output>${xmlTags.join("")}</output>`;
          const parsed = parseGroupChatResponse(xml);

          expect(parsed.messages.length).toBe(dms.length);
          for (let i = 0; i < dms.length; i++) {
            const msg = parsed.messages[i];
            expect(msg.isPrivateMessage).toBe(true);
            expect(msg.senderName).toBe(dms[i].name);
            expect(msg.content).toBe(dms[i].content);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it("parses dm tags mixed with regular msg tags", () => {
    fc.assert(
      fc.property(
        nameArb,
        safeTextArb,
        nameArb,
        safeTextArb,
        (dmName, dmContent, msgName, msgContent) => {
          const xml = `<output><msg name="${msgName}">${msgContent}</msg><dm name="${dmName}">${dmContent}</dm></output>`;
          const parsed = parseGroupChatResponse(xml);

          expect(parsed.messages.length).toBe(2);

          // First message is a regular msg
          expect(parsed.messages[0].senderName).toBe(msgName);
          expect(parsed.messages[0].isPrivateMessage).toBeFalsy();

          // Second message is a dm
          const dm = parsed.messages[1];
          expect(dm.isPrivateMessage).toBe(true);
          expect(dm.senderName).toBe(dmName);
          expect(dm.content).toBe(dmContent);
        },
      ),
      { numRuns: 100 },
    );
  });
});
