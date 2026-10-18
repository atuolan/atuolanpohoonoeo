/**
 * 角色待辦與行程（每個聊天一份）
 * AI 在回覆裡用 <char-todo>／<char-plan> 標籤更新；聊天頁「他的今天」和偷窺手機的備忘錄、行事曆都讀這份
 */

/** 誰寫的：聊天回覆、偷窺手機生成、使用者 */
export type PlannerSource = "chat" | "peek" | "user";

export interface CharTodo {
  id: string;
  text: string;
  done: boolean;
  /** 期限 YYYY-MM-DD */
  due?: string;
  /** 秘密：聊天頁看不到，只有偷窺手機看得到 */
  secret?: boolean;
  source: PlannerSource;
  createdAt: number;
  doneAt?: number;
}

export interface CharPlan {
  id: string;
  /** YYYY-MM-DD（聊天的有效時間） */
  date: string;
  /** HH:mm */
  time?: string;
  /** HH:mm */
  end?: string;
  title: string;
  place?: string;
  /** 跟使用者一起 */
  withUser?: boolean;
  secret?: boolean;
  source: PlannerSource;
  /** 加進使用者行事曆後的那一筆，避免重複加 */
  calendarEventId?: string;
  createdAt: number;
}

export interface PlannerState {
  todos: CharTodo[];
  plans: CharPlan[];
}

/** 一輪回覆改了什麼：重新生成時換回 before，換回這個候選回覆時換回 after */
export interface PlannerTurn {
  turnId: string;
  before: PlannerState;
  after: PlannerState;
}

export interface CharPlanner extends PlannerState {
  chatId: string;
  characterId: string;
  updatedAt: number;
  /** 最近幾輪的改動 */
  turns?: PlannerTurn[];
  /** 使用者上次打開「他的今天」的時間；之後有新的改動就亮小點 */
  seenAt?: number;
}

/** 從回覆標籤解析出來的一個動作 */
export type PlannerOp =
  | { kind: "todo-add"; text: string; due?: string; secret?: boolean }
  | { kind: "todo-done"; match: string }
  | { kind: "todo-drop"; match: string }
  | {
      kind: "plan-add";
      date: string;
      title: string;
      time?: string;
      end?: string;
      place?: string;
      withUser?: boolean;
      secret?: boolean;
    }
  | { kind: "plan-cancel"; match: string };
