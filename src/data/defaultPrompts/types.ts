/**
 * 共用類型和常量定義
 */

import type { PromptDefinition, PromptOrderEntry } from "@/types/promptManager";

// 重新導出類型供其他模塊使用
export type { PromptDefinition, PromptOrderEntry };

// 注入位置常量
export const INJECTION_RELATIVE = 0;
export const INJECTION_ABSOLUTE = 1;
