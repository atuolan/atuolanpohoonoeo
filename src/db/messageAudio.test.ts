/// <reference types="vitest/globals" />

import "fake-indexeddb/auto";
import { deleteDB } from "idb";
import type { ChatMessage } from "@/types/chat";
import { closeDatabase, getDatabase } from "@/db/database";
import {
  appendChatMessages,
  loadChatMessages,
  saveChatMessages,
  upsertChatMessages,
} from "@/db/chatMessageStore";
import {
  decodedDataUrlSize,
  ensureChatAudioMigrated,
  externalizeRecordAudio,
  isInlineAudioDataUrl,
  isMessageAudioRef,
  migrateInlineMessageAudio,
  resetMessageAudioStateForTests,
  resolvePlayableAudioUrl,
  type AudioStoreAccess,
} from "@/db/messageAudio";
import type { AudioBlobRecord } from "@/db/database";

function audioDataUrl(bytes: number[], mime = "audio/mpeg"): string {
  return `data:${mime};base64,${Buffer.from(bytes).toString("base64")}`;
}

const AUDIO_A = audioDataUrl([1, 2, 3, 4, 5, 6, 7]);
const AUDIO_B = audioDataUrl([9, 8, 7, 6, 5, 4, 3, 2, 1, 0]);
const AUDIO_C = audioDataUrl([42, 43], "audio/wav");

function voicedMessage(id: string, createdAt: number, overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id,
    sender: "assistant",
    name: "Assistant",
    is_user: false,
    status: "sent",
    content: `voiced ${id}`,
    createdAt,
    updatedAt: createdAt,
    ttsAudioUrl: AUDIO_A,
    ttsSegments: [
      { emotion: "happy", speed: 1, text: "第一句", clean: "第一句", audioUrl: AUDIO_A },
      { emotion: "sad", speed: 1, text: "第二句", clean: "第二句", audioUrl: AUDIO_B },
      { emotion: "neutral", speed: 1, text: "還沒生成", clean: "還沒生成" },
    ],
    ...overrides,
  };
}

async function audioRecords(): Promise<AudioBlobRecord[]> {
  const db = await getDatabase();
  return db.getAll("audio-blobs");
}

async function blobBytes(blob: Blob): Promise<number[]> {
  return [...new Uint8Array(await blob.arrayBuffer())];
}

function memoryAudioStore(): AudioStoreAccess & { records: Map<string, AudioBlobRecord> } {
  const records = new Map<string, AudioBlobRecord>();
  return {
    records,
    get: async (id) => records.get(id),
    put: async (record) => {
      records.set(record.id, record);
    },
  };
}

describe("externalizeRecordAudio", () => {
  it("recognises inline audio and computes its decoded size", () => {
    expect(isInlineAudioDataUrl(AUDIO_A)).toBe(true);
    expect(isInlineAudioDataUrl("https://example.com/a.mp3")).toBe(false);
    expect(isInlineAudioDataUrl("audioblob_1_abc")).toBe(false);
    expect(isInlineAudioDataUrl("data:text/plain,hello")).toBe(false);
    expect(decodedDataUrlSize(AUDIO_A)).toBe(7);
    expect(decodedDataUrlSize(AUDIO_B)).toBe(10);
    expect(decodedDataUrlSize(AUDIO_C)).toBe(2);
  });

  it("returns null when nothing is inline", async () => {
    const store = memoryAudioStore();
    const message = voicedMessage("m1", 1, { ttsAudioUrl: undefined, ttsSegments: [] });
    expect(await externalizeRecordAudio(message, store)).toBeNull();
    expect(store.records.size).toBe(0);
  });

  it("moves TTS and call audio out without touching the input", async () => {
    const store = memoryAudioStore();
    const message = voicedMessage("m1", 1, {
      phoneCallHistoryData: {
        characterName: "他",
        startedAt: 1,
        endedAt: 2,
        messages: [
          { role: "ai", content: "喂", audioUrl: AUDIO_C, timestamp: 1 },
          { role: "user", content: "嗨", timestamp: 2 },
        ],
      },
    });
    const snapshot = JSON.parse(JSON.stringify(message));

    const result = await externalizeRecordAudio(message, store);
    expect(result).not.toBeNull();
    const out = result!.record;

    expect(isMessageAudioRef(out.ttsAudioUrl)).toBe(true);
    expect(isMessageAudioRef(out.ttsSegments![0].audioUrl)).toBe(true);
    expect(isMessageAudioRef(out.ttsSegments![1].audioUrl)).toBe(true);
    expect(out.ttsSegments![2].audioUrl).toBeUndefined();
    expect(isMessageAudioRef(out.phoneCallHistoryData!.messages[0].audioUrl)).toBe(true);
    expect(out.phoneCallHistoryData!.messages[1].audioUrl).toBeUndefined();

    // 舊版 ttsAudioUrl 和第一段是同一份音檔，只存一次
    expect(out.ttsAudioUrl).toBe(out.ttsSegments![0].audioUrl);
    expect(store.records.size).toBe(3);
    expect(result!.storedBytes).toBe(7 + 10 + 2);

    const first = store.records.get(out.ttsSegments![0].audioUrl!)!;
    expect(await blobBytes(first.blob)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(first.mimeType).toBe("audio/mpeg");
    expect(store.records.get(out.phoneCallHistoryData!.messages[0].audioUrl!)!.mimeType).toBe("audio/wav");

    expect(message).toEqual(snapshot);
  });

  it("reuses the stored audio when the database already has a ref of the same size there", async () => {
    const store = memoryAudioStore();
    const first = await externalizeRecordAudio(voicedMessage("m1", 1), store);
    expect(store.records.size).toBe(2);

    // 畫面上還是舊的 base64，再存一次
    const again = await externalizeRecordAudio(voicedMessage("m1", 1), store, first!.record);
    expect(again!.record.ttsSegments![0].audioUrl).toBe(first!.record.ttsSegments![0].audioUrl);
    expect(again!.record.ttsSegments![1].audioUrl).toBe(first!.record.ttsSegments![1].audioUrl);
    expect(again!.storedBytes).toBe(0);
    expect(store.records.size).toBe(2);
  });

  it("stores a new file when the audio at that position changed", async () => {
    const store = memoryAudioStore();
    const first = await externalizeRecordAudio(voicedMessage("m1", 1), store);
    const regenerated = voicedMessage("m1", 1);
    regenerated.ttsSegments![1].audioUrl = AUDIO_C;

    const again = await externalizeRecordAudio(regenerated, store, first!.record);
    expect(again!.record.ttsSegments![0].audioUrl).toBe(first!.record.ttsSegments![0].audioUrl);
    expect(again!.record.ttsSegments![1].audioUrl).not.toBe(first!.record.ttsSegments![1].audioUrl);
    expect(store.records.size).toBe(3);
  });
});

describe("chat message writes keep audio out of the messages store", () => {
  beforeEach(async () => {
    closeDatabase();
    await deleteDB("aguaphone-db");
    resetMessageAudioStateForTests();
  });

  afterEach(() => {
    closeDatabase();
  });

  it("append, upsert and save all store refs instead of base64", async () => {
    await appendChatMessages("chat-1", [voicedMessage("a", 1)]);
    await upsertChatMessages("chat-1", [voicedMessage("b", 2)]);
    await saveChatMessages("chat-1", [voicedMessage("a", 1), voicedMessage("b", 2), voicedMessage("c", 3)]);

    const stored = await loadChatMessages("chat-1");
    expect(stored.map((m) => m.id)).toEqual(["a", "b", "c"]);
    for (const message of stored) {
      expect(JSON.stringify(message)).not.toContain("base64");
      expect(isMessageAudioRef(message.ttsSegments![0].audioUrl)).toBe(true);
      expect(message.ttsSegments![2].audioUrl).toBeUndefined();
      expect(message.content).toBe(`voiced ${message.id}`);
    }
    // 三則各兩段音檔；a、b 再存時沿用原本的檔案
    expect(await audioRecords()).toHaveLength(6);
  });

  it("plays back the original audio from a ref", async () => {
    await appendChatMessages("chat-1", [voicedMessage("a", 1)]);
    const [stored] = await loadChatMessages("chat-1");
    const ref = stored.ttsSegments![1].audioUrl!;

    const playable = await resolvePlayableAudioUrl(ref);
    expect(playable).toMatch(/^blob:/);
    // 同一個引用第二次拿到同一個網址
    expect(await resolvePlayableAudioUrl(ref)).toBe(playable);

    const db = await getDatabase();
    const record = await db.get("audio-blobs", ref);
    expect(await blobBytes(record!.blob)).toEqual([9, 8, 7, 6, 5, 4, 3, 2, 1, 0]);
  });

  it("passes through playable urls and returns null for audio that is not on this device", async () => {
    expect(await resolvePlayableAudioUrl(AUDIO_A)).toBe(AUDIO_A);
    expect(await resolvePlayableAudioUrl("https://example.com/a.mp3")).toBe("https://example.com/a.mp3");
    expect(await resolvePlayableAudioUrl("audioblob_from_other_device")).toBeNull();
    expect(await resolvePlayableAudioUrl(undefined)).toBeNull();
  });
});

describe("migrating audio already inside stored messages", () => {
  beforeEach(async () => {
    closeDatabase();
    await deleteDB("aguaphone-db");
    resetMessageAudioStateForTests();
  });

  afterEach(() => {
    closeDatabase();
  });

  /** 模擬舊版：語音直接放在訊息裡 */
  async function putLegacy(chatId: string, messages: ChatMessage[]): Promise<void> {
    const db = await getDatabase();
    for (const message of messages) {
      await db.put("chatMessages", { ...message, chatId } as never);
    }
  }

  it("moves every chat's inline audio out in batches", async () => {
    const many = Array.from({ length: 45 }, (_, i) => voicedMessage(`old-${i}`, i));
    await putLegacy("chat-1", many);
    await putLegacy("chat-2", [voicedMessage("other", 1)]);

    await migrateInlineMessageAudio();

    for (const chatId of ["chat-1", "chat-2"]) {
      for (const message of await loadChatMessages(chatId)) {
        expect(JSON.stringify(message)).not.toContain("base64");
        expect(isMessageAudioRef(message.ttsAudioUrl)).toBe(true);
        expect(message.ttsAudioUrl).toBe(message.ttsSegments![0].audioUrl);
      }
    }
    expect(await audioRecords()).toHaveLength(46 * 2);
    expect((await loadChatMessages("chat-1")).map((m) => m.id)).toEqual(many.map((m) => m.id));
  });

  it("migrates only the requested chat before its history is read", async () => {
    await putLegacy("chat-1", [voicedMessage("a", 1)]);
    await putLegacy("chat-2", [voicedMessage("b", 1)]);

    await ensureChatAudioMigrated("chat-1");

    const [a] = await loadChatMessages("chat-1");
    const [b] = await loadChatMessages("chat-2");
    expect(isMessageAudioRef(a.ttsSegments![0].audioUrl)).toBe(true);
    expect(b.ttsSegments![0].audioUrl).toBe(AUDIO_A);
  });

  it("leaves messages without inline audio untouched", async () => {
    const plain: ChatMessage = {
      id: "plain",
      sender: "user",
      name: "User",
      is_user: true,
      status: "sent",
      content: "hi",
      createdAt: 1,
      updatedAt: 1,
    };
    await putLegacy("chat-1", [plain]);
    await migrateInlineMessageAudio();
    const [stored] = await loadChatMessages("chat-1");
    expect(stored).toEqual({ ...plain, chatId: "chat-1" });
    expect(await audioRecords()).toHaveLength(0);
  });
});
