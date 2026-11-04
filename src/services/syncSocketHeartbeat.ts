/**
 * 同步 WebSocket 的客戶端心跳。
 *
 * 伺服器每 25 秒會 ping 一次，但那是給伺服器自己清掉死連線用的；客戶端這邊
 * 連線半死（VPN 切換、手機網路換基地台、牆把封包吃掉）時 readyState 還是 OPEN，
 * 送出去的請求石沉大海，要等 60 秒逾時才知道。
 *
 * 這裡每隔一段時間送 {type:"ping"}，伺服器會回 {type:"pong"}；收到任何訊息都算活著。
 * 送出 ping 後太久都沒收到任何東西，就判定連線已死，交給呼叫端關掉重連。
 *
 * - 要先收到過一次 pong 才會開始判死，避免不回 pong 的舊版自架伺服器被一直斷線。
 * - 計時器隔太久才跑（App 在背景被暫停、主執行緒被卡住），不算對方沒回，重新送一次 ping。
 */

export interface SocketHeartbeatOptions {
  send: (text: string) => void;
  onDead: (info: { waitedMs: number }) => void;
  intervalMs?: number;
  timeoutMs?: number;
  now?: () => number;
  setInterval?: (fn: () => void, ms: number) => unknown;
  clearInterval?: (handle: unknown) => void;
}

export interface SocketHeartbeat {
  /** 收到任何訊息時呼叫 */
  markAlive: (isPong?: boolean) => void;
  stop: () => void;
}

export const HEARTBEAT_INTERVAL_MS = 15_000;
export const HEARTBEAT_TIMEOUT_MS = 12_000;
/** 兩次 tick 間隔超過 interval 的這個倍數，就當作中間被暫停過 */
const SUSPEND_GAP_FACTOR = 2.5;

export function isPongMessage(raw: string): boolean {
  if (raw.length > 200 || !raw.includes('"pong"')) return false;
  try {
    return JSON.parse(raw)?.type === "pong";
  } catch {
    return false;
  }
}

export function startSocketHeartbeat(options: SocketHeartbeatOptions): SocketHeartbeat {
  const intervalMs = options.intervalMs ?? HEARTBEAT_INTERVAL_MS;
  const timeoutMs = options.timeoutMs ?? HEARTBEAT_TIMEOUT_MS;
  const now = options.now ?? (() => Date.now());
  const schedule = options.setInterval ?? ((fn, ms) => setInterval(fn, ms));
  const cancel = options.clearInterval ?? ((handle) => clearInterval(handle as ReturnType<typeof setInterval>));

  let stopped = false;
  let armed = false;
  let awaitingSince: number | null = null;
  let lastTickAt = now();

  const tick = () => {
    if (stopped) return;
    const current = now();
    const gap = current - lastTickAt;
    lastTickAt = current;

    if (gap > intervalMs * SUSPEND_GAP_FACTOR) {
      // 剛從背景回來或卡了一陣子：沒收到回應不代表連線死了，重新問一次
      awaitingSince = null;
    }

    if (awaitingSince !== null) {
      const waitedMs = current - awaitingSince;
      if (armed && waitedMs >= timeoutMs) {
        stopped = true;
        cancel(handle);
        options.onDead({ waitedMs });
        return;
      }
      if (!armed) {
        // 伺服器還沒證明會回 pong：繼續 ping，但不判死
        awaitingSince = null;
      } else {
        return;
      }
    }

    try {
      options.send(JSON.stringify({ type: "ping" }));
      awaitingSince = current;
    } catch {
      // 送不出去代表 socket 已經在關了，onclose 會處理
    }
  };

  const handle = schedule(tick, intervalMs);

  return {
    markAlive(isPong = false) {
      if (isPong) armed = true;
      awaitingSince = null;
    },
    stop() {
      if (stopped) return;
      stopped = true;
      cancel(handle);
    },
  };
}
