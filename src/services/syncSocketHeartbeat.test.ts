import { describe, expect, it, vi } from "vitest";
import { isPongMessage, startSocketHeartbeat } from "./syncSocketHeartbeat";

function setup() {
  let time = 0;
  let tick: (() => void) | null = null;
  const sent: string[] = [];
  const onDead = vi.fn();
  const heartbeat = startSocketHeartbeat({
    send: (text) => sent.push(text),
    onDead,
    intervalMs: 15_000,
    timeoutMs: 12_000,
    now: () => time,
    setInterval: (fn) => {
      tick = fn;
      return 1;
    },
    clearInterval: () => {
      tick = null;
    },
  });
  const advance = (ms: number) => {
    time += ms;
    tick?.();
  };
  return { heartbeat, sent, onDead, advance, hasTimer: () => tick !== null };
}

describe("startSocketHeartbeat", () => {
  it("每次 tick 送 ping，有回應就一直活著", () => {
    const { heartbeat, sent, onDead, advance } = setup();
    for (let i = 0; i < 5; i += 1) {
      advance(15_000);
      heartbeat.markAlive(true);
    }
    expect(sent).toHaveLength(5);
    expect(JSON.parse(sent[0])).toEqual({ type: "ping" });
    expect(onDead).not.toHaveBeenCalled();
  });

  it("收過 pong 之後，ping 送出去沒回應就判定連線死了", () => {
    const { heartbeat, onDead, advance, hasTimer } = setup();
    advance(15_000);
    heartbeat.markAlive(true);
    advance(15_000); // 送 ping
    advance(15_000); // 15 秒沒任何訊息
    expect(onDead).toHaveBeenCalledWith({ waitedMs: 15_000 });
    expect(hasTimer()).toBe(false);
  });

  it("收到其他訊息也算活著", () => {
    const { heartbeat, onDead, advance } = setup();
    advance(15_000);
    heartbeat.markAlive(true);
    advance(15_000);
    heartbeat.markAlive(false);
    advance(15_000);
    expect(onDead).not.toHaveBeenCalled();
  });

  it("伺服器從沒回過 pong（舊版自架）就不判死", () => {
    const { onDead, advance, sent } = setup();
    for (let i = 0; i < 6; i += 1) advance(15_000);
    expect(onDead).not.toHaveBeenCalled();
    expect(sent.length).toBeGreaterThan(1);
  });

  it("計時器隔很久才跑（App 被放到背景）不算沒回應，重新 ping", () => {
    const { heartbeat, onDead, advance, sent } = setup();
    advance(15_000);
    heartbeat.markAlive(true);
    advance(15_000); // 送 ping 後進背景
    advance(120_000); // 回前景
    expect(onDead).not.toHaveBeenCalled();
    expect(sent).toHaveLength(3);
    advance(15_000); // 新的 ping 還是沒回
    expect(onDead).toHaveBeenCalled();
  });

  it("stop 之後不再送也不判死", () => {
    const { heartbeat, onDead, advance, sent } = setup();
    heartbeat.stop();
    advance(60_000);
    expect(sent).toHaveLength(0);
    expect(onDead).not.toHaveBeenCalled();
  });
});

describe("isPongMessage", () => {
  it("只認 type 是 pong 的小訊息", () => {
    expect(isPongMessage('{"type":"pong","serverTime":1}')).toBe(true);
    expect(isPongMessage('{"type":"sync:ready"}')).toBe(false);
    expect(isPongMessage('{"type":"peer:apply-request","note":"pong"}')).toBe(false);
    expect(isPongMessage("not json pong")).toBe(false);
  });
});
