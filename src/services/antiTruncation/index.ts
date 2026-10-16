/**
 * 防截斷：主聊天回覆改由假工具參數傳回，前端再還原成一般正文
 */
export {
  createRestoreStats,
  describeAntiTruncation,
  summarizeRestoreStats,
  type AntiTruncationOptions,
  type AntiTruncationResult,
  type RestoreContext,
  type RestoreStats,
} from "./stats";
export { CONTROL_PROMPT_IDENTIFIER, injectAntiTruncation, type AntiTruncationInjection } from "./injectRequest";
export { restoreStreamBody, type RestoredStream } from "./streamRestorer";
export { restoreJsonPayload } from "./jsonRestorer";
export { FALLBACK_STATUSES, antiTruncationMonitor, fallbackWarning, settleAntiTruncation } from "./monitor";
