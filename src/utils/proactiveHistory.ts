// 主動訊息：整理「user 沒回之後角色連發的訊息」，避免角色每次都照著自己上一則再寫一次

export interface ProactiveHistoryMessage {
  sender?: string;
  is_user?: boolean;
  createdAt?: number;
}

export interface UnrepliedTrimResult<T> {
  /** 整理後的訊息（舊→新） */
  messages: T[];
  /** user 最後一則訊息的時間；沒有就是 undefined */
  lastUserAt?: number;
  /** user 最後一則訊息之後，角色主動傳了幾次（一次 = 一批連著的氣泡） */
  unrepliedBatches: number;
  /** 中間省略掉幾則 */
  droppedCount: number;
}

/** 兩則訊息相隔超過這麼久就算另一次發送 */
const BATCH_GAP_MS = 5 * 60 * 1000;

function isRealUserMessage(m: ProactiveHistoryMessage): boolean {
  return m.sender === "user" || (m.is_user === true && m.sender !== "system" && m.sender !== "narrator");
}

/**
 * user 最後一則訊息之後，角色可能已經主動傳了好幾次都沒人回。
 * 全部留著的話，模型看到一整排自己寫的相似訊息，就會照著再寫一次；
 * 又因為這些訊息把視窗塞滿，user 真正說過的話反而被擠出去，只剩總結可看。
 *
 * 這裡保留：user 最後一則之後緊接著的那批回覆、最近 keepBatches 次主動訊息；中間的省略。
 */
export function trimUnrepliedProactiveTail<T extends ProactiveHistoryMessage>(
  msgs: T[],
  keepBatches = 2,
): UnrepliedTrimResult<T> {
  let lastUserIndex = -1;
  for (let i = msgs.length - 1; i >= 0; i--) {
    if (isRealUserMessage(msgs[i])) {
      lastUserIndex = i;
      break;
    }
  }
  // 從來沒說過話：沒有「沒回」可言，照原樣
  if (lastUserIndex < 0) {
    return { messages: msgs, unrepliedBatches: 0, droppedCount: 0 };
  }

  const lastUserAt = msgs[lastUserIndex].createdAt;
  const tail = msgs.slice(lastUserIndex + 1);
  if (tail.length === 0) {
    return { messages: msgs, lastUserAt, unrepliedBatches: 0, droppedCount: 0 };
  }

  // 依時間間隔切成一批一批
  const batches: T[][] = [];
  let prevAt = lastUserAt;
  for (const m of tail) {
    const at = m.createdAt;
    const newBatch =
      batches.length === 0 ||
      (typeof at === "number" && typeof prevAt === "number" && at - prevAt > BATCH_GAP_MS);
    if (newBatch) batches.push([m]);
    else batches[batches.length - 1].push(m);
    if (typeof at === "number") prevAt = at;
  }

  // 第一批緊接在 user 訊息後面 → 是在回 user，不算主動
  const firstAt = tail[0].createdAt;
  const firstIsReply =
    typeof firstAt !== "number" ||
    typeof lastUserAt !== "number" ||
    firstAt - lastUserAt <= BATCH_GAP_MS;
  const replyBatches = firstIsReply ? batches.slice(0, 1) : [];
  const proactiveBatches = firstIsReply ? batches.slice(1) : batches;

  const kept = proactiveBatches.slice(-Math.max(0, keepBatches));
  const dropped = proactiveBatches.slice(0, proactiveBatches.length - kept.length);
  const droppedCount = dropped.reduce((n, b) => n + b.length, 0);

  return {
    messages: [...msgs.slice(0, lastUserIndex + 1), ...replyBatches.flat(), ...kept.flat()],
    lastUserAt,
    unrepliedBatches: proactiveBatches.length,
    droppedCount,
  };
}

function formatElapsed(ms: number): string {
  const minutes = Math.max(1, Math.round(ms / 60000));
  if (minutes < 60) return `${minutes} 分鐘`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    const rest = minutes % 60;
    return rest >= 10 ? `${hours} 小時 ${rest} 分鐘` : `${hours} 小時`;
  }
  return `${Math.floor(hours / 24)} 天`;
}

/**
 * 給主動訊息指示加的補充：user 多久沒說話、角色已經連發幾次，這次別再重複。
 * 沒有連發時回空字串。
 */
export function buildUnrepliedProactiveNote(opts: {
  userName: string;
  unrepliedBatches: number;
  droppedCount?: number;
  lastUserAt?: number;
  now?: number;
}): string {
  const { userName, unrepliedBatches } = opts;
  if (unrepliedBatches <= 0) return "";
  const now = opts.now ?? Date.now();
  const since =
    typeof opts.lastUserAt === "number" && opts.lastUserAt < now
      ? `${userName} 最後一次傳訊息是 ${formatElapsed(now - opts.lastUserAt)}前，`
      : "";
  const dropped =
    opts.droppedCount && opts.droppedCount > 0
      ? `（更早的 ${opts.droppedCount} 則這裡省略，只留最近幾次）`
      : "";
  return (
    `【注意：${userName} 還沒回】${since}之後你已經主動傳了 ${unrepliedBatches} 次訊息${dropped}，${userName} 都還沒回，可能在忙或睡了。` +
    `這次不要重複你前幾次講過的內容、開場和句型——同樣的天氣、同樣的問候、同樣的事情、同樣的晚安都算重複。` +
    `想想這段時間你身上有沒有新的事，或換個話題、換個角度；也可以只傳一兩句短的。` +
    `要接話的話，以 ${userName} 最後說的話為準，不要去接很久以前的話題。`
  );
}
