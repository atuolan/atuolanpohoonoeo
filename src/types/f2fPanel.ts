/**
 * 面對面設定面板的配置結構
 *
 * 面板只描述「結構」：有哪些模塊、每個選項對應哪些條目、有哪些風格。
 * 條目一律以 identifier 引用；條目開關狀態只存在 faceToFacePromptOrder，不存在這裡。
 */
import { z } from "zod";

export const F2FPanelOptionSchema = z.object({
  id: z.string().min(1),
  /** 顯示在面板上的名稱 */
  label: z.string(),
  /** 選中此選項時要開啟的條目 identifier；可連動多條 */
  entries: z.array(z.string().min(1)).min(1),
});

export const F2FPanelModuleSchema = z.object({
  id: z.string().min(1),
  title: z.string(),
  mode: z.enum(["single", "multi"]),
  /** 單選模塊是否允許一個都不選 */
  allowNone: z.boolean().default(false),
  options: z.array(F2FPanelOptionSchema),
});

export const F2FPanelStyleSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  desc: z.string().default(""),
  /** moduleId → 選中的 optionId；沒列出的模塊套用時不受影響 */
  selections: z.record(z.string(), z.array(z.string())),
});

export const F2FPanelLayoutSchema = z.object({
  version: z.literal(1),
  modules: z.array(F2FPanelModuleSchema).default([]),
  styles: z.array(F2FPanelStyleSchema).default([]),
});

export type F2FPanelOption = z.output<typeof F2FPanelOptionSchema>;
export type F2FPanelModule = z.output<typeof F2FPanelModuleSchema>;
export type F2FPanelStyle = z.output<typeof F2FPanelStyleSchema>;
export type F2FPanelLayout = z.output<typeof F2FPanelLayoutSchema>;

/** 驗證外部來源（資料庫、匯入檔）的面板配置；格式不對時回傳 null，由呼叫端決定退路 */
export function parseF2FPanelLayout(raw: unknown): F2FPanelLayout | null {
  const result = F2FPanelLayoutSchema.safeParse(raw);
  return result.success ? result.data : null;
}

export function createEmptyF2FPanelLayout(): F2FPanelLayout {
  return { version: 1, modules: [], styles: [] };
}
