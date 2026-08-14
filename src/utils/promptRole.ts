import type { PromptRoleType } from "@/types/promptManager";

export interface PromptRoleLabel {
  text: string;
  class: string;
}

export function getPromptRoleLabel(role: PromptRoleType): PromptRoleLabel | null {
  return {
    text: role,
    class: `role-${role}`,
  };
}
