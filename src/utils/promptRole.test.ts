/**
 * 提示詞角色工具測試
 */

import { describe, expect, it } from "vitest";
import { getPromptRoleLabel } from "./promptRole";

describe("getPromptRoleLabel", () => {
  it("should return correct label for system role", () => {
    const result = getPromptRoleLabel("system");
    expect(result.text).toBe("system");
    expect(result.class).toBe("role-system");
  });

  it("should return correct label for user role", () => {
    const result = getPromptRoleLabel("user");
    expect(result.text).toBe("user");
    expect(result.class).toBe("role-user");
  });

  it("should return correct label for assistant role", () => {
    const result = getPromptRoleLabel("assistant");
    expect(result.text).toBe("assistant");
    expect(result.class).toBe("role-assistant");
  });

  it("should return system as default for undefined role", () => {
    const result = getPromptRoleLabel(undefined);
    expect(result.text).toBe("system");
    expect(result.class).toBe("role-system");
  });
});
