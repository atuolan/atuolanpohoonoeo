/**
 * 群聊 msg 標籤 name 和 sticker 屬性提取 Property-Based Test
 * **Feature: group-chat, Property 6: Msg tag name extraction**
 * **Validates: Requirements 4.2, 4.3**
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

/** 生成安全的文字內容（不含 XML 特殊字元和 ^ 想法標記） */
const safeTextArb = fc
  .string({ minLength: 1, maxLength: 40 })
  .map((s) => s.replace(/[<>&"'^~\\]/g, "").replace(/[\x00-\x1f]/g, ""))
  .filter((s) => s.trim().length > 0);

describe("Msg Tag Name and Sticker Extraction", () => {
  /**
   * **Feature: group-chat, Property 6: Msg tag name extraction**
   * **Validates: Requirements 4.2, 4.3**
   *
   * For any <msg> tag with a name attribute, parsing should extract the correct sender name.
   * For any <msg> tag with type="sticker", parsing should extract the correct meaning value.
   */
  it('extracts correct sender name from <msg name="..."> tags', () => {
    fc.assert(
      fc.property(nameArb, safeTextArb, (name, content) => {
        const xml = `<output><msg name="${name}">${content}</msg></output>`;
        const parsed = parseGroupChatResponse(xml);

        expect(parsed.messages.length).toBe(1);
        expect(parsed.messages[0].senderName).toBe(name);
      }),
      { numRuns: 100 },
    );
  });

  it("extracts correct sender name and meaning from sticker <msg> tags", () => {
    fc.assert(
      fc.property(nameArb, safeTextArb, (name, meaning) => {
        const xml = `<output><msg name="${name}" type="sticker" meaning="${meaning}"/></output>`;
        const parsed = parseGroupChatResponse(xml);

        expect(parsed.messages.length).toBe(1);
        const msg = parsed.messages[0];
        expect(msg.senderName).toBe(name);
        expect(msg.isStickerMsg).toBe(true);
        expect(msg.stickerMeaning).toBe(meaning);
      }),
      { numRuns: 100 },
    );
  });

  it("extracts correct sender names from multiple text-only <msg> tags", () => {
    fc.assert(
      fc.property(
        fc.array(fc.record({ name: nameArb, content: safeTextArb }), {
          minLength: 1,
          maxLength: 5,
        }),
        (msgs) => {
          const xmlTags = msgs.map(
            (m) => `<msg name="${m.name}">${m.content}</msg>`,
          );
          const xml = `<output>${xmlTags.join("")}</output>`;
          const parsed = parseGroupChatResponse(xml);

          expect(parsed.messages.length).toBe(msgs.length);
          for (let i = 0; i < msgs.length; i++) {
            expect(parsed.messages[i].senderName).toBe(msgs[i].name);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it("extracts correct meanings from multiple sticker-only <msg> tags", () => {
    fc.assert(
      fc.property(
        fc.array(fc.record({ name: nameArb, meaning: safeTextArb }), {
          minLength: 1,
          maxLength: 5,
        }),
        (msgs) => {
          const xmlTags = msgs.map(
            (m) =>
              `<msg name="${m.name}" type="sticker" meaning="${m.meaning}"/>`,
          );
          const xml = `<output>${xmlTags.join("")}</output>`;
          const parsed = parseGroupChatResponse(xml);

          expect(parsed.messages.length).toBe(msgs.length);
          for (let i = 0; i < msgs.length; i++) {
            expect(parsed.messages[i].senderName).toBe(msgs[i].name);
            expect(parsed.messages[i].isStickerMsg).toBe(true);
            expect(parsed.messages[i].stickerMeaning).toBe(msgs[i].meaning);
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});
