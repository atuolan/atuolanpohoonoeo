/**
 * useChatMedia 單元測試
 * 測試 AI 圖片遞補鏈邏輯：NovelAI → Pixabay → 純文字描述
 */

import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ref } from "vue";

// 模擬 Pinia stores
vi.mock("@/stores", () => ({
  useSettingsStore: vi.fn(),
}));

vi.mock("@/stores/user", () => ({
  useUserStore: vi.fn(),
}));

// 模擬 NovelAI API（動態 import）
vi.mock("@/api/NovelAIImageApi", () => ({
  generateImage: vi.fn(),
}));

// 模擬 Pixabay API（動態 import）
vi.mock("@/api/PixabayApi", () => ({
  searchPixabay: vi.fn(),
}));

import { useChatMedia } from "@/composables/useChatMedia";
import { useSettingsStore } from "@/stores";
import { useUserStore } from "@/stores/user";

// 取得模擬函式的參考
const mockGenerateImage = vi.fn();
const mockSearchPixabay = vi.fn();

// 讓動態 import 回傳模擬函式
vi.mock("@/api/NovelAIImageApi", () => ({
  generateImage: (...args: unknown[]) => mockGenerateImage(...args),
}));

vi.mock("@/api/PixabayApi", () => ({
  searchPixabay: (...args: unknown[]) => mockSearchPixabay(...args),
}));

/** 建立測試用訊息 */
function makeMessage(overrides = {}) {
  return {
    id: "msg_test_1",
    role: "ai" as const,
    content: "描述文字",
    timestamp: Date.now(),
    messageType: "descriptive-image",
    imageCaption: "一隻貓",
    imagePrompt: "a cat",
    isStreaming: false,
    ...overrides,
  };
}

/** 建立 useChatMedia 的 deps */
function makeDeps(messages = [makeMessage()]) {
  const messagesRef = ref(messages);
  const saveChat = vi.fn();
  const scrollToBottom = vi.fn();
  const currentCharacter = ref(undefined);
  return { messages: messagesRef, saveChat, scrollToBottom, currentCharacter };
}

/** 設定 settingsStore 模擬 */
function mockSettings(novelAIEnabled: boolean, apiKey = "") {
  vi.mocked(useSettingsStore).mockReturnValue({
    novelAIImage: {
      enabled: novelAIEnabled,
      apiKey,
      useUserTag: false,
    },
  } as any);
  vi.mocked(useUserStore).mockReturnValue({
    currentPersona: null,
  } as any);
}

describe("useChatMedia — tryGenerateImageForMessage", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
  });

  // 測試 1：NovelAI 分支
  it("NovelAI 啟用時應呼叫 generateImage，不呼叫 searchPixabay", async () => {
    mockSettings(true, "test-api-key");
    mockGenerateImage.mockResolvedValue({
      success: true,
      imageBase64: "abc123",
    });

    const deps = makeDeps();
    const { tryGenerateImageForMessage } = useChatMedia(deps);

    await tryGenerateImageForMessage("msg_test_1", "a cat");

    expect(mockGenerateImage).toHaveBeenCalledOnce();
    expect(mockSearchPixabay).not.toHaveBeenCalled();
  });

  // 測試 2：Pixabay 分支
  it("NovelAI 未啟用時應呼叫 searchPixabay，不呼叫 generateImage", async () => {
    mockSettings(false);
    mockSearchPixabay.mockResolvedValue({
      hits: [
        {
          proxyWebformatURL: "/image-proxy?url=test.jpg",
          user: "photographer",
        },
      ],
      total: 1,
      totalHits: 1,
    });

    const deps = makeDeps();
    const { tryGenerateImageForMessage } = useChatMedia(deps);

    await tryGenerateImageForMessage("msg_test_1", "a cat");

    expect(mockSearchPixabay).toHaveBeenCalledOnce();
    expect(mockGenerateImage).not.toHaveBeenCalled();
  });

  // 測試 3：Pixabay 有結果時更新為 image-url
  it("Pixabay 有結果時應將訊息更新為 image-url 類型", async () => {
    mockSettings(false);
    mockSearchPixabay.mockResolvedValue({
      hits: [
        {
          proxyWebformatURL: "/image-proxy?url=cat.jpg",
          user: "catphotographer",
        },
      ],
      total: 1,
      totalHits: 1,
    });

    const deps = makeDeps();
    const { tryGenerateImageForMessage } = useChatMedia(deps);

    await tryGenerateImageForMessage("msg_test_1", "a cat");

    const msg = deps.messages.value[0];
    expect(msg.messageType).toBe("image-url");
    expect(msg.imageUrl).toBe("/image-proxy?url=cat.jpg");
    expect(msg.imageCaption).toBe("catphotographer");
    expect(msg.isStreaming).toBe(false);
    expect(deps.saveChat).toHaveBeenCalled();
  });

  // 測試 4：Pixabay 無結果時降級為 descriptive-image
  it("Pixabay 無結果時應將訊息降級為 descriptive-image", async () => {
    mockSettings(false);
    mockSearchPixabay.mockResolvedValue({ hits: [], total: 0, totalHits: 0 });

    const deps = makeDeps([makeMessage({ imageCaption: "一隻貓" })]);
    const { tryGenerateImageForMessage } = useChatMedia(deps);

    await tryGenerateImageForMessage("msg_test_1", "a cat");

    const msg = deps.messages.value[0];
    expect(msg.messageType).toBe("descriptive-image");
    expect(msg.isStreaming).toBe(false);
    expect(deps.saveChat).toHaveBeenCalled();
  });

  // 測試 5：Pixabay 拋出錯誤時降級為 descriptive-image
  it("searchPixabay 拋出錯誤時應將訊息降級為 descriptive-image", async () => {
    mockSettings(false);
    mockSearchPixabay.mockRejectedValue(new Error("網路錯誤"));

    const deps = makeDeps([makeMessage({ imageCaption: "一隻貓" })]);
    const { tryGenerateImageForMessage } = useChatMedia(deps);

    await tryGenerateImageForMessage("msg_test_1", "a cat");

    const msg = deps.messages.value[0];
    expect(msg.messageType).toBe("descriptive-image");
    expect(msg.isStreaming).toBe(false);
    expect(deps.saveChat).toHaveBeenCalled();
  });

  // 測試 6：imagePrompt 為空時使用 imageDescription 作為搜尋關鍵字
  it("imagePrompt 為空時應使用 imageDescription 呼叫 Pixabay", async () => {
    mockSettings(false);
    mockSearchPixabay.mockResolvedValue({
      hits: [
        {
          proxyWebformatURL: "/image-proxy?url=sunset.jpg",
          user: "sunsetphotographer",
        },
      ],
      total: 1,
      totalHits: 1,
    });

    const deps = makeDeps([
      makeMessage({ imagePrompt: undefined, imageCaption: "夕陽" }),
    ]);
    const { tryGenerateImageForMessage } = useChatMedia(deps);

    // imagePrompt 為空，imageDescription 為 '夕陽'
    await tryGenerateImageForMessage("msg_test_1", undefined, "夕陽");

    expect(mockSearchPixabay).toHaveBeenCalledWith(
      expect.objectContaining({ q: "夕陽" }),
    );
    const msg = deps.messages.value[0];
    expect(msg.messageType).toBe("image-url");
  });

  // 邊界情況：imagePrompt 與 imageDescription 皆為空時應直接返回
  it("imagePrompt 與 imageDescription 皆為空時不應呼叫任何 API", async () => {
    mockSettings(false);

    const deps = makeDeps();
    const { tryGenerateImageForMessage } = useChatMedia(deps);

    await tryGenerateImageForMessage("msg_test_1", undefined, undefined);

    expect(mockSearchPixabay).not.toHaveBeenCalled();
    expect(mockGenerateImage).not.toHaveBeenCalled();
  });

  // 邊界情況：NovelAI 啟用但 imagePrompt 為空時應跳過（不呼叫 NovelAI 也不呼叫 Pixabay）
  it("NovelAI 啟用但 imagePrompt 為空時應跳過，不呼叫任何 API", async () => {
    mockSettings(true, "test-api-key");

    const deps = makeDeps();
    const { tryGenerateImageForMessage } = useChatMedia(deps);

    // imagePrompt 為空，imageDescription 有值，但 NovelAI 啟用時應跳過
    await tryGenerateImageForMessage("msg_test_1", "", "一隻貓");

    expect(mockGenerateImage).not.toHaveBeenCalled();
    expect(mockSearchPixabay).not.toHaveBeenCalled();
  });
});
