/**
 * 群聊 group-action 標籤解析 Property-Based Test
 * **Feature: group-chat, Property 9: Group-action tag parsing**
 * **Validates: Requirements 4.6**
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

/** group-action type */
const actionTypeArb = fc.constantFrom("rename", "kick", "mute", "unmute");

/** 生成安全的值字串（不含 XML 特殊字元） */
const safeValueArb = fc
  .string({ minLength: 1, maxLength: 30 })
  .map((s) =>
    s
      .replace(/[<>&"'^~\\]/g, "")
      .replace(/[\x00-\x1f]/g, "")
      .trim(),
  )
  .filter((s) => s.length > 0);

describe("Group-Action Tag Parsing", () => {
  /**
   * **Feature: group-chat, Property 9: Group-action tag parsing**
   * **Validates: Requirements 4.6**
   *
   * For any <group-action> tag with type, actor, target, and value attributes,
   * parsing should extract all attributes correctly into the corresponding fields.
   */
  it("parses rename action with actor and value", () => {
    fc.assert(
      fc.property(nameArb, safeValueArb, (actor, value) => {
        const xml = `<output><group-action type="rename" actor="${actor}" value="${value}"/></output>`;
        const parsed = parseGroupChatResponse(xml);

        expect(parsed.messages.length).toBe(1);
        const msg = parsed.messages[0];
        expect(msg.isGroupAction).toBe(true);
        expect(msg.groupActionType).toBe("rename");
        expect(msg.groupActionActor).toBe(actor);
        expect(msg.groupActionValue).toBe(value);
        expect(msg.senderName).toBe(actor);
      }),
      { numRuns: 100 },
    );
  });

  it("parses kick/mute/unmute actions with actor and target", () => {
    const targetActionTypeArb = fc.constantFrom("kick", "mute", "unmute");
    fc.assert(
      fc.property(
        targetActionTypeArb,
        nameArb,
        nameArb,
        (type, actor, target) => {
          const xml = `<output><group-action type="${type}" actor="${actor}" target="${target}"/></output>`;
          const parsed = parseGroupChatResponse(xml);

          expect(parsed.messages.length).toBe(1);
          const msg = parsed.messages[0];
          expect(msg.isGroupAction).toBe(true);
          expect(msg.groupActionType).toBe(type);
          expect(msg.groupActionActor).toBe(actor);
          expect(msg.groupActionTarget).toBe(target);
          expect(msg.senderName).toBe(actor);
        },
      ),
      { numRuns: 100 },
    );
  });

  it("parses all four action types with full attributes", () => {
    fc.assert(
      fc.property(
        actionTypeArb,
        nameArb,
        nameArb,
        safeValueArb,
        (type, actor, target, value) => {
          const xml = `<output><group-action type="${type}" actor="${actor}" target="${target}" value="${value}"/></output>`;
          const parsed = parseGroupChatResponse(xml);

          expect(parsed.messages.length).toBe(1);
          const msg = parsed.messages[0];
          expect(msg.isGroupAction).toBe(true);
          expect(msg.groupActionType).toBe(type);
          expect(msg.groupActionActor).toBe(actor);
          expect(msg.groupActionTarget).toBe(target);
          expect(msg.groupActionValue).toBe(value);
          expect(msg.senderName).toBe(actor);
        },
      ),
      { numRuns: 100 },
    );
  });

  it("parses multiple group-action tags preserving order", () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            type: actionTypeArb,
            actor: nameArb,
            target: nameArb,
            value: safeValueArb,
          }),
          { minLength: 1, maxLength: 4 },
        ),
        (actions) => {
          const xmlTags = actions.map(
            (a) =>
              `<group-action type="${a.type}" actor="${a.actor}" target="${a.target}" value="${a.value}"/>`,
          );
          const xml = `<output>${xmlTags.join("")}</output>`;
          const parsed = parseGroupChatResponse(xml);

          expect(parsed.messages.length).toBe(actions.length);
          for (let i = 0; i < actions.length; i++) {
            const msg = parsed.messages[i];
            expect(msg.isGroupAction).toBe(true);
            expect(msg.groupActionType).toBe(actions[i].type);
            expect(msg.groupActionActor).toBe(actions[i].actor);
            expect(msg.groupActionTarget).toBe(actions[i].target);
            expect(msg.groupActionValue).toBe(actions[i].value);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it("parses group-action tags mixed with msg tags", () => {
    fc.assert(
      fc.property(
        actionTypeArb,
        nameArb,
        nameArb,
        safeValueArb,
        nameArb,
        safeValueArb,
        (actionType, actor, target, value, msgName, msgContent) => {
          const xml = `<output><msg name="${msgName}">${msgContent}</msg><group-action type="${actionType}" actor="${actor}" target="${target}" value="${value}"/></output>`;
          const parsed = parseGroupChatResponse(xml);

          expect(parsed.messages.length).toBe(2);

          // First message is a regular msg
          expect(parsed.messages[0].senderName).toBe(msgName);
          expect(parsed.messages[0].isGroupAction).toBeFalsy();

          // Second message is a group-action
          const action = parsed.messages[1];
          expect(action.isGroupAction).toBe(true);
          expect(action.groupActionType).toBe(actionType);
          expect(action.groupActionActor).toBe(actor);
          expect(action.groupActionTarget).toBe(target);
          expect(action.groupActionValue).toBe(value);
        },
      ),
      { numRuns: 100 },
    );
  });
});
