import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/stores/settings", () => ({ useSettingsStore: vi.fn() }));

const SEC = 1000;
const MIN = 60 * SEC;
const IPHONE_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1";
const ANDROID_UA =
  "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36";

type Listener = () => void;

class FakeEventTarget {
  private listeners = new Map<string, Set<Listener>>();

  addEventListener(type: string, fn: Listener) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type)!.add(fn);
  }

  removeEventListener(type: string, fn: Listener) {
    this.listeners.get(type)?.delete(fn);
  }

  dispatch(type: string) {
    for (const fn of [...(this.listeners.get(type) ?? [])]) fn();
  }
}

class FakeAudio extends FakeEventTarget {
  static instances: FakeAudio[] = [];
  static rejectPlay = false;
  src: string;
  loop = false;
  volume = 1;
  paused = true;
  ended = false;

  constructor(src = "") {
    super();
    this.src = src;
    FakeAudio.instances.push(this);
  }

  play() {
    if (FakeAudio.rejectPlay) {
      return Promise.reject(new DOMException("需要使用者手勢", "NotAllowedError"));
    }
    if (this.paused) {
      this.paused = false;
      this.ended = false;
      this.dispatch("play");
    }
    return Promise.resolve();
  }

  pause() {
    if (this.paused) return;
    this.paused = true;
    this.dispatch("pause");
  }

  /** 模擬播到結尾卻沒有循環：跟瀏覽器一樣先 pause 再 ended */
  end() {
    this.paused = true;
    this.ended = true;
    this.dispatch("pause");
    this.dispatch("ended");
  }

  load() {}
}

class FakeAudioContext {
  static instances: FakeAudioContext[] = [];
  state = "running";
  destination = {};

  constructor() {
    FakeAudioContext.instances.push(this);
  }

  createGain() {
    return { gain: { value: 1 }, connect: vi.fn(), disconnect: vi.fn() };
  }

  createOscillator() {
    return {
      frequency: { value: 440 },
      connect: vi.fn(),
      disconnect: vi.fn(),
      start: vi.fn(),
      stop: vi.fn(),
    };
  }

  resume() {
    this.state = "running";
    return Promise.resolve();
  }

  suspend() {
    this.state = "suspended";
    return Promise.resolve();
  }

  close() {
    this.state = "closed";
    return Promise.resolve();
  }
}

class FakeDocument extends FakeEventTarget {
  visibilityState: "visible" | "hidden" = "visible";

  /** vue 的 runtime-dom 載入時會先建一個 template 元素 */
  createElement() {
    return {};
  }
}

class FakeMediaMetadata {
  constructor(init: Record<string, unknown>) {
    Object.assign(this, init);
  }
}

function createNavigator(userAgent: string) {
  const handlers: Record<string, Listener | null> = {};
  return {
    userAgent,
    maxTouchPoints: userAgent.includes("iPhone") ? 5 : 0,
    locks: {
      request: vi.fn(
        (_name: string, _options: { signal: AbortSignal }, _callback: () => Promise<void>) =>
          new Promise<void>(() => {}),
      ),
    },
    wakeLock: { request: vi.fn(() => new Promise(() => {})) },
    mediaSession: {
      metadata: null as unknown,
      playbackState: "none",
      handlers,
      setActionHandler(action: string, fn: Listener | null) {
        handlers[action] = fn;
      },
    },
  };
}

let doc: FakeDocument;
let nav: ReturnType<typeof createNavigator>;
let workerSpy: ReturnType<typeof vi.fn>;
let channelSpy: ReturnType<typeof vi.fn>;
let fetchSpy: ReturnType<typeof vi.fn>;
let keepAlive: typeof import("@/composables/useBackgroundAudio");

async function setup(userAgent = IPHONE_UA) {
  vi.resetModules();
  FakeAudio.instances = [];
  FakeAudio.rejectPlay = false;
  FakeAudioContext.instances = [];
  doc = new FakeDocument();
  nav = createNavigator(userAgent);
  workerSpy = vi.fn();
  channelSpy = vi.fn();
  fetchSpy = vi.fn(() => Promise.resolve());
  vi.stubGlobal("document", doc);
  vi.stubGlobal("navigator", nav);
  vi.stubGlobal("Audio", FakeAudio);
  vi.stubGlobal("AudioContext", FakeAudioContext);
  vi.stubGlobal("MediaMetadata", FakeMediaMetadata);
  vi.stubGlobal("Worker", workerSpy);
  vi.stubGlobal("BroadcastChannel", channelSpy);
  vi.stubGlobal("fetch", fetchSpy);
  keepAlive = await import("@/composables/useBackgroundAudio");
}

/** 開啟背景運行模式，並模擬使用者第一次觸摸畫面 */
async function startAndTouch() {
  keepAlive.startKeepAlive();
  doc.dispatch("touchstart");
  await vi.advanceTimersByTimeAsync(0);
  return FakeAudio.instances[0];
}

async function setVisibility(state: "visible" | "hidden") {
  doc.visibilityState = state;
  doc.dispatch("visibilitychange");
  await vi.advanceTimersByTimeAsync(0);
}

/** 一秒一秒往前推，直到靜音被接回來，回傳等了多久 */
async function waitUntilPlaying(audio: FakeAudio, limit: number) {
  let waited = 0;
  while (audio.paused && waited < limit) {
    await vi.advanceTimersByTimeAsync(SEC);
    waited += SEC;
  }
  return waited;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 9, 22, 12, 0));
});

afterEach(() => {
  keepAlive?.stopKeepAlive();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("背景運行模式：負擔", () => {
  it("只用一條靜音音檔，不開 Worker、BroadcastChannel、螢幕常亮，也不連網路", async () => {
    await setup();
    const audio = await startAndTouch();
    await setVisibility("hidden");
    await vi.advanceTimersByTimeAsync(2 * MIN);
    await setVisibility("visible");
    await vi.advanceTimersByTimeAsync(2 * MIN);

    expect(FakeAudio.instances).toHaveLength(1);
    expect(audio.loop).toBe(true);
    expect(audio.paused).toBe(false);
    expect(workerSpy).not.toHaveBeenCalled();
    expect(channelSpy).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(nav.wakeLock.request).not.toHaveBeenCalled();
  });

  it("iPhone 不開靜音振盪器", async () => {
    await setup(IPHONE_UA);
    await startAndTouch();
    expect(FakeAudioContext.instances).toHaveLength(0);
  });

  it("Android 照舊開一個靜音振盪器", async () => {
    await setup(ANDROID_UA);
    await startAndTouch();
    expect(FakeAudioContext.instances).toHaveLength(1);
  });
});

describe("背景運行模式：音樂欄", () => {
  it("按暫停會真的停下來，輪詢也不會播回來", async () => {
    await setup();
    const audio = await startAndTouch();

    nav.mediaSession.handlers.pause?.();
    await vi.advanceTimersByTimeAsync(10 * MIN);

    expect(audio.paused).toBe(true);
    expect(nav.mediaSession.playbackState).toBe("paused");
  });

  it("按暫停後再按播放會恢復", async () => {
    await setup();
    const audio = await startAndTouch();

    nav.mediaSession.handlers.pause?.();
    nav.mediaSession.handlers.play?.();
    await vi.advanceTimersByTimeAsync(0);

    expect(audio.paused).toBe(false);
    expect(nav.mediaSession.playbackState).toBe("playing");
  });

  it("按暫停後回到 App 會恢復", async () => {
    await setup();
    const audio = await startAndTouch();

    nav.mediaSession.handlers.pause?.();
    await setVisibility("hidden");
    await vi.advanceTimersByTimeAsync(5 * MIN);
    expect(audio.paused).toBe(true);

    await setVisibility("visible");
    expect(audio.paused).toBe(false);
  });
});

describe("背景運行模式：被打斷時的輪詢", () => {
  it("被系統暫停不會馬上搶回來，交給輪詢接回", async () => {
    await setup();
    const audio = await startAndTouch();
    await setVisibility("hidden");
    await vi.advanceTimersByTimeAsync(2 * MIN);

    audio.pause();
    const waited = await waitUntilPlaying(audio, MIN);
    expect(waited).toBeGreaterThanOrEqual(10 * SEC);
    expect(waited).toBeLessThanOrEqual(20 * SEC);
  });

  it("接回來又馬上被停（別的 App 在放音樂），等待時間加倍", async () => {
    await setup();
    const audio = await startAndTouch();
    await setVisibility("hidden");
    await vi.advanceTimersByTimeAsync(2 * MIN);

    // 第一次被打斷：10 秒後接回
    audio.pause();
    const first = await waitUntilPlaying(audio, MIN);
    expect(first).toBeGreaterThanOrEqual(10 * SEC);
    expect(first).toBeLessThanOrEqual(20 * SEC);

    // 剛接回又被停：等 20 秒
    audio.pause();
    const second = await waitUntilPlaying(audio, MIN);
    expect(second).toBeGreaterThanOrEqual(20 * SEC);
    expect(second).toBeLessThanOrEqual(30 * SEC);

    // 再被停：等 40 秒
    audio.pause();
    const third = await waitUntilPlaying(audio, 2 * MIN);
    expect(third).toBeGreaterThanOrEqual(40 * SEC);
    expect(third).toBeLessThanOrEqual(50 * SEC);
  });

  it("一直被搶，等待時間最長 5 分鐘", async () => {
    await setup();
    const audio = await startAndTouch();
    await setVisibility("hidden");

    const waits: number[] = [];
    for (let i = 0; i < 8; i++) {
      audio.pause();
      waits.push(await waitUntilPlaying(audio, 10 * MIN));
    }
    for (const waited of waits) {
      expect(waited).toBeLessThanOrEqual(5 * MIN + 10 * SEC);
    }
    expect(waits[waits.length - 1]).toBeGreaterThanOrEqual(5 * MIN);
  });

  it("連續播放夠久沒被打斷，等待時間恢復成 10 秒", async () => {
    await setup();
    const audio = await startAndTouch();
    await setVisibility("hidden");

    for (let i = 0; i < 4; i++) {
      audio.pause();
      await waitUntilPlaying(audio, 10 * MIN);
    }
    await vi.advanceTimersByTimeAsync(6 * MIN);

    audio.pause();
    expect(await waitUntilPlaying(audio, MIN)).toBeLessThanOrEqual(20 * SEC);
  });

  it("在 App 裡最多搶回兩次，回到 App 才再試", async () => {
    await setup();
    const audio = await startAndTouch();
    await vi.advanceTimersByTimeAsync(2 * MIN);

    audio.pause();
    expect(await waitUntilPlaying(audio, MIN)).toBeLessThanOrEqual(20 * SEC);

    audio.pause();
    expect(await waitUntilPlaying(audio, MIN)).toBeLessThanOrEqual(30 * SEC);

    audio.pause();
    await vi.advanceTimersByTimeAsync(10 * MIN);
    expect(audio.paused).toBe(true);

    await setVisibility("hidden");
    await setVisibility("visible");
    expect(audio.paused).toBe(false);
  });

  it("播到結尾沒有循環時馬上從頭播，不算被打斷", async () => {
    await setup();
    const audio = await startAndTouch();
    await setVisibility("hidden");
    await vi.advanceTimersByTimeAsync(2 * MIN);

    audio.end();
    await vi.advanceTimersByTimeAsync(0);
    expect(audio.paused).toBe(false);

    // 結尾不算被搶：接著真的被打斷，照樣 10 秒後接回，不會加倍
    audio.pause();
    expect(await waitUntilPlaying(audio, MIN)).toBeLessThan(20 * SEC);
  });

  it("播到結尾從頭播失敗時，下一次輪詢就再試", async () => {
    await setup();
    const audio = await startAndTouch();
    await setVisibility("hidden");
    await vi.advanceTimersByTimeAsync(30 * SEC);

    FakeAudio.rejectPlay = true;
    audio.end();
    await vi.advanceTimersByTimeAsync(0);
    expect(audio.paused).toBe(true);

    FakeAudio.rejectPlay = false;
    expect(await waitUntilPlaying(audio, MIN)).toBeLessThanOrEqual(10 * SEC);
  });

  it("在 App 裡播不起來時，下次觸摸畫面再試", async () => {
    await setup();
    FakeAudio.rejectPlay = true;
    const audio = await startAndTouch();
    expect(audio.paused).toBe(true);

    FakeAudio.rejectPlay = false;
    doc.dispatch("touchstart");
    await vi.advanceTimersByTimeAsync(0);
    expect(audio.paused).toBe(false);
  });
});

describe("背景運行模式：關閉", () => {
  it("關掉後聲音、音樂欄、Web Lock、輪詢都停掉", async () => {
    await setup(ANDROID_UA);
    const audio = await startAndTouch();
    const lockOptions = nav.locks.request.mock.calls[0][1] as { signal: AbortSignal };

    keepAlive.stopKeepAlive();
    await vi.advanceTimersByTimeAsync(5 * MIN);

    expect(audio.paused).toBe(true);
    expect(nav.mediaSession.metadata).toBeNull();
    expect(nav.mediaSession.handlers.pause).toBeNull();
    expect(lockOptions.signal.aborted).toBe(true);
    expect(FakeAudioContext.instances[0].state).toBe("closed");
  });
});
