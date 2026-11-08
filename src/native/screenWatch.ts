/**
 * 看螢幕模式（像 DC 分享螢幕）：網頁這邊的部分。
 *
 * iOS 的流程：
 * 1. 聊天裡按「分享螢幕」→ 用跟主動訊息一樣的方式組好提示詞（人設、世界書、總結、最近聊天），
 *    最後一則是看螢幕的指示，附上一張「待填」的圖片
 * 2. 組成一個完整的 API 請求（網址、headers、body）交給原生，原生跳出系統的「開始廣播」視窗
 * 3. 廣播期間 App 會被系統暫停，由螢幕廣播擴充元件每隔幾分鐘把截圖填進請求、送 AI、用角色的名字發通知、存回覆
 * 4. 回到 App 時，把存起來的回覆照一般主動訊息的流程寫進聊天
 *
 * 原生程式在 ios/App/App/ScreenWatchPlugin.swift、ios/App/ScreenWatchBroadcast/SampleHandler.swift。
 * 這是原生功能：舊版 App 沒有，熱更新送不過去，要重新安裝新版。
 */

import { Capacitor, registerPlugin } from "@capacitor/core";
import type { APIMessage, PendingRequest } from "@/api/OpenAICompatible";
import { isIosApp } from "./platform";

/** 擴充元件會把這兩個字串換成截圖（base64）和當下的情況（時間、剛剛說過的話） */
export const SCREEN_WATCH_IMAGE_PLACEHOLDER = "__SCREEN_WATCH_IMAGE__";
export const SCREEN_WATCH_CONTEXT_PLACEHOLDER = "__SCREEN_WATCH_CONTEXT__";

const INSTRUCTION_MARKER = "【看螢幕】";

export interface ScreenWatchStatus {
  active: boolean;
  chatId?: string;
  characterName?: string;
  startedAt?: number;
  replies?: number;
  lastError?: string;
}

export interface ScreenWatchReplyItem {
  id: string;
  chatId: string;
  /** 擴充元件生成回覆的時間（毫秒） */
  at: number;
  /** AI 的原始回覆（還沒解析 <msg>） */
  content: string;
}

/** 交給原生的「看螢幕包」，原生用 JSON 讀 */
export interface ScreenWatchPack {
  chatId: string;
  characterName: string;
  intervalSeconds: number;
  maxSeconds: number;
  /** 開始後多久看第一次 */
  firstDelaySeconds: number;
  request: PendingRequest;
}

interface ScreenWatchPlugin {
  isAvailable(): Promise<{ available: boolean; reason?: string }>;
  start(options: { pack: string }): Promise<void>;
  stop(): Promise<void>;
  status(): Promise<ScreenWatchStatus>;
  readReplies(): Promise<{ items: ScreenWatchReplyItem[] }>;
  removeReplies(options: { ids: string[] }): Promise<void>;
}

const ScreenWatch = registerPlugin<ScreenWatchPlugin>("ScreenWatch");

export interface ScreenWatchAvailability {
  available: boolean;
  /** 不能用的原因（給玩家看） */
  reason?: string;
}

export async function getScreenWatchAvailability(): Promise<ScreenWatchAvailability> {
  if (!isIosApp()) {
    return { available: false, reason: "目前只有 iOS App 可以分享螢幕，Android 版之後再做。" };
  }
  if (!Capacitor.isPluginAvailable("ScreenWatch")) {
    return { available: false, reason: "要重新安裝新版 App 才能分享螢幕（這是原生功能，熱更新送不過去）。" };
  }
  try {
    const result = await ScreenWatch.isAvailable();
    return result.available
      ? { available: true }
      : { available: false, reason: result.reason || "這個 App 沒有螢幕廣播擴充元件。" };
  } catch (err) {
    console.warn("[ScreenWatch] isAvailable 失敗", err);
    return { available: false, reason: "要重新安裝新版 App 才能分享螢幕。" };
  }
}

/** 看螢幕的指示：放在提示詞最後一則，擴充元件會把 CONTEXT 換成當下的情況 */
export function buildScreenWatchInstruction(): string {
  return (
    `<request>${INSTRUCTION_MARKER}用戶正在跟你分享手機螢幕（像在 DC 分享螢幕一樣），附上的圖片是用戶手機現在的畫面。` +
    `${SCREEN_WATCH_CONTEXT_PLACEHOLDER}\n` +
    `看看用戶正在做什麼，用符合你性格的方式自然地回一兩句，就像你在旁邊跟他一起看。` +
    `不要描述整張截圖，挑你在意的地方說；話要短，會顯示在手機通知上。` +
    `畫面上如果是密碼、銀行或其他私密資訊，不要念出內容。</request>`
  );
}

/**
 * 把截圖（待填）附到看螢幕的那則訊息上。
 * 找不到那則訊息（例如提示詞模板沒帶到）就在最後補一則。
 */
export function attachScreenImage(messages: APIMessage[]): APIMessage[] {
  const imagePart = {
    type: "image_url" as const,
    image_url: {
      url: `data:image/jpeg;base64,${SCREEN_WATCH_IMAGE_PLACEHOLDER}`,
      // OpenAI 系列用 low 只算固定的少量 token；其他模型會忽略
      detail: "low" as const,
    },
  };
  const result = messages.map((m) => ({ ...m }));
  for (let i = result.length - 1; i >= 0; i--) {
    const message = result[i];
    const content = message.content;
    if (typeof content === "string" && content.includes(INSTRUCTION_MARKER)) {
      result[i] = { ...message, role: "user", content: [{ type: "text", text: content }, imagePart] };
      return result;
    }
    if (
      Array.isArray(content) &&
      content.some((part) => part.type === "text" && part.text.includes(INSTRUCTION_MARKER))
    ) {
      result[i] = { ...message, role: "user", content: [...content, imagePart] };
      return result;
    }
  }
  result.push({
    role: "user",
    content: [{ type: "text", text: buildScreenWatchInstruction() }, imagePart],
  });
  return result;
}

export interface StartScreenWatchOptions {
  chatId: string;
  intervalMinutes: number;
  maxMinutes: number;
}

/** 組好看螢幕包交給原生，跳出系統的「開始廣播」視窗 */
export async function startScreenWatch(options: StartScreenWatchOptions): Promise<void> {
  const { proactiveMessageService } = await import("@/services/ProactiveMessageService");
  const capture = await proactiveMessageService.buildScreenWatchPrompt(
    options.chatId,
    buildScreenWatchInstruction(),
  );
  if (!capture) {
    throw new Error("組不出提示詞：請確認已經設定聊天用的 API，而且這是單人聊天。");
  }

  const { OpenAICompatibleClient } = await import("@/api/OpenAICompatible");
  const client = new OpenAICompatibleClient(capture.api);
  const request = client.buildPendingRequest({
    messages: attachScreenImage(capture.messages as APIMessage[]),
    settings: { ...capture.generation, streaming: false },
    // 不調整最後一則的 role：最後一則要維持 user，圖片才會被看到
    adjustLastMessageRole: false,
  });

  const pack: ScreenWatchPack = {
    chatId: capture.chatId,
    characterName: capture.characterName,
    intervalSeconds: Math.round(options.intervalMinutes * 60),
    maxSeconds: Math.round(options.maxMinutes * 60),
    firstDelaySeconds: 20,
    request,
  };
  await ScreenWatch.start({ pack: JSON.stringify(pack) });
}

export async function stopScreenWatch(): Promise<void> {
  await ScreenWatch.stop();
}

export async function getScreenWatchStatus(): Promise<ScreenWatchStatus> {
  try {
    return await ScreenWatch.status();
  } catch {
    return { active: false };
  }
}

let collecting = false;

/**
 * 把擴充元件在背景存的回覆寫進聊天（回到 App、App 啟動時呼叫）。
 * 回傳寫進幾則。角色還沒載入就先不收，下次再收。
 */
export async function collectScreenWatchReplies(): Promise<number> {
  if (collecting || !isIosApp() || !Capacitor.isPluginAvailable("ScreenWatch")) return 0;
  collecting = true;
  try {
    const { items } = await ScreenWatch.readReplies();
    if (!items?.length) return 0;

    const { useCharactersStore } = await import("@/stores/characters");
    if (!useCharactersStore().characters?.length) return 0;

    const { proactiveMessageService } = await import("@/services/ProactiveMessageService");
    const handled: string[] = [];
    for (const item of [...items].sort((a, b) => a.at - b.at)) {
      try {
        await proactiveMessageService.deliverScreenWatchReply(item.chatId, item.content, item.at);
      } catch (err) {
        console.warn("[ScreenWatch] 寫回聊天失敗", err);
      }
      // 寫不進去（例如聊天已刪除）也拿掉，不然每次回到 App 都會再試
      handled.push(item.id);
    }
    if (handled.length) await ScreenWatch.removeReplies({ ids: handled });
    return handled.length;
  } catch (err) {
    console.warn("[ScreenWatch] 讀取回覆失敗", err);
    return 0;
  } finally {
    collecting = false;
  }
}
