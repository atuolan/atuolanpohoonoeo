/**
 * 角色帳戶：角色自己的錢，跟著角色（characterId）走，不跟聊天走
 */

export type CharLedgerKind =
  | "income" //       每天的收入
  | "to_user" //      轉帳給使用者
  | "from_user" //    收下使用者的轉帳
  | "redpacket" //    發紅包（過期退回也記這類，金額為正）
  | "date" //         約會付錢
  | "daily" //        偷窺手機裡的日常消費
  | "manual"; //      使用者手動調整

export interface CharLedgerEntry {
  id: string;
  /** 入帳正數、支出負數 */
  amount: number;
  kind: CharLedgerKind;
  description: string;
  /** 發生時的劇情時間 */
  storyTime: number;
  realTime: number;
  chatId?: string;
  /** 對應的訊息（轉帳卡、紅包），換掉回覆時用來還原 */
  messageId?: string;
}

export interface CharWallet {
  characterId: string;
  balance: number;
  /** 月收入，AI 估一次，使用者可改 */
  monthlyIncome: number;
  /** 收入來源，例如「公司薪水」「接案」 */
  incomeNote?: string;
  /** 上次入帳的劇情日期 YYYY-MM-DD */
  lastPaidStoryDay: string;
  /** 最近的收支，新的在前 */
  ledger: CharLedgerEntry[];
  initializedFrom: "peek" | "estimate" | "default" | "manual";
  /** 偷窺手機的日常消費上次扣在哪個劇情日（一天只扣一次） */
  lastPeekSpendDay?: string;
  updatedAt: number;
}
