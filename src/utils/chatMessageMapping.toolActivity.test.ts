import { describe, expect, it } from "vitest";
import { reactive } from "vue";
import { convertToStorableMessage } from "./chatMessageMapping";

describe("convertToStorableMessage toolActivity", () => {
  it("stores plain copies of the tool records", () => {
    const uiMessage = reactive({
      id: "m1", role: "ai" as const, content: "好", timestamp: 1,
      toolActivity: [{ id: "c1", toolName: "lock_phone", label: "鎖手機 · lock_phone", status: "success" as const, summary: "已鎖定", at: 1 }],
    });
    const stored = convertToStorableMessage(uiMessage, "角色");
    expect(stored.toolActivity).toEqual([{ id: "c1", toolName: "lock_phone", label: "鎖手機 · lock_phone", status: "success", summary: "已鎖定", at: 1 }]);
    expect(stored.toolActivity?.[0]).not.toBe(uiMessage.toolActivity[0]);
    expect(() => structuredClone(stored)).not.toThrow();
  });

  it("leaves toolActivity undefined when there is none", () => {
    expect(convertToStorableMessage({ id: "m2", role: "ai", content: "嗨", timestamp: 1 }, "角色").toolActivity).toBeUndefined();
  });
});
