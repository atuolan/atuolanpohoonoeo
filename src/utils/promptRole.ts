/**
 * 提示詞角色工具函式
 * 統一處理角色標籤與樣式
 */

export interface PromptRoleLabel {
  text: string;
  class: string;
}

/**
 * 取得提示詞角色的顯示標籤與 CSS class
 * @param role 角色類型
 * @returns 包含文字與 class 的物件
 */
export function getPromptRoleLabel(
  role: "system" | "user" | "assistant" | undefined,
): PromptRoleLabel {
  switch (role) {
    case "system":
      return { text: "system", class: "role-system" };
    case "user":
      return { text: "user", class: "role-user" };
    case "assistant":
      return { text: "assistant", class: "role-assistant" };
    default:
      return { text: "system", class: "role-system" };
  }
}
