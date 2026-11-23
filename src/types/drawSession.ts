/**
 * 調畫風的工作紀錄：角色用畫圖工具時，每一步（看圖、查繪師、試畫、選圖）記在這裡，
 * 聊天裡顯示成一張卡片。試畫的圖存在 imageCache（imageRef），不直接進聊天，
 * 選定的那張才貼成一般圖片訊息。
 */

export type DrawStepKind = "look" | "artists" | "tags" | "draw" | "choose";
/** running 只在生成中出現；存檔前會轉成 cancelled */
export type DrawStepStatus = "running" | "success" | "error" | "cancelled";

export interface DrawStep {
  /** tool call id */
  id: string;
  kind: DrawStepKind;
  status: DrawStepStatus;
  at: number;
  /** 給人看的一行，例如「找相似繪師：hanfu, male focus」 */
  title: string;
  /** 結果摘要或錯誤原因 */
  detail?: string;
  /** 試畫編號（從 1 開始；同一串調整會接著上一輪往下數） */
  attempt?: number;
  prompt?: string;
  negativePrompt?: string;
  /** 程式自動加上的外觀標籤 */
  autoTags?: string;
  /** 角色寫的：這張跟上一張比改了什麼、為什麼 */
  note?: string;
  /** imageCache 的引用 ID */
  imageRef?: string;
  mimeType?: string;
}

export interface DrawSession {
  id: string;
  steps: DrawStep[];
  /** 選定的試畫編號 */
  chosenAttempt?: number;
  /** 選定那張貼進聊天的訊息 */
  chosenMessageId?: string;
  /** 使用者自己按「用這張」換過 */
  pickedByUser?: boolean;
}
