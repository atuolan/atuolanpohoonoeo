/**
 * 默認提示詞內容 — 統一 re-export
 *
 * 所有提示詞定義已拆分至各自的模塊文件，
 * 本檔案僅做向後兼容的重新導出。
 */

// 線上聊天
export { DEFAULT_PROMPT_DEFINITIONS, DEFAULT_PROMPT_ORDER } from "./chat";

// 日記
export { DIARY_PROMPT_DEFINITIONS, DEFAULT_DIARY_PROMPT_ORDER } from "./diary";

// 總結
export { SUMMARY_PROMPT_DEFINITIONS, DEFAULT_SUMMARY_PROMPT_ORDER } from "./summary";

// 重要事件
export { IMPORTANT_EVENTS_PROMPT_DEFINITIONS, DEFAULT_IMPORTANT_EVENTS_PROMPT_ORDER } from "./events";

// 噗浪（發文 + 評論）
export {
  PLURK_POST_PROMPT_DEFINITIONS,
  DEFAULT_PLURK_POST_PROMPT_ORDER,
  PLURK_COMMENT_PROMPT_DEFINITIONS,
  DEFAULT_PLURK_COMMENT_PROMPT_ORDER,
} from "./plurk";

// 電話通話
export { PHONE_CALL_PROMPT_DEFINITIONS, DEFAULT_PHONE_CALL_PROMPT_ORDER } from "./phoneCall";

// 批量評論
export { BATCH_COMMENTS_PROMPT_DEFINITIONS, DEFAULT_BATCH_COMMENTS_PROMPT_ORDER } from "./batchComments";

// 面對面模式（從 data/ 層級的獨立文件導入）
export {
  DEFAULT_FACE_TO_FACE_PROMPT_ORDER,
  FACE_TO_FACE_PROMPT_DEFINITIONS,
} from "../faceToFacePrompts";

// 群聊模式（從 data/ 層級的獨立文件導入）
export {
  DEFAULT_GROUP_CHAT_PROMPT_ORDER,
  GROUP_CHAT_PROMPT_DEFINITIONS,
} from "../groupChatPrompts";
