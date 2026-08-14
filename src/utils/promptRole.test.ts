import { describe, expect, it } from "vitest";
import { getPromptRoleLabel } from "@/utils/promptRole";

describe("prompt role labels", () => {
  it("shows the selected role for system, user, and assistant", () => {
    expect(getPromptRoleLabel("system")).toEqual({
      text: "system",
      class: "role-system",
    });
    expect(getPromptRoleLabel("user")).toEqual({
      text: "user",
      class: "role-user",
    });
    expect(getPromptRoleLabel("assistant")).toEqual({
      text: "assistant",
      class: "role-assistant",
    });
  });
});
