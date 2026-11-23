import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { ref } from "vue";

vi.mock("@/storage/settingsStorage", () => ({ SETTINGS_ID: "main-settings", loadSettingsData: vi.fn(), saveSettingsData: vi.fn() }));

const mocks = vi.hoisted(() => ({
  generateAIImage: vi.fn(),
  askChatModelAboutImage: vi.fn(),
  findRelatedArtists: vi.fn(),
}));

vi.mock("@/api/ImageGenApi", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/api/ImageGenApi")>()),
  generateAIImage: mocks.generateAIImage,
}));
vi.mock("@/services/imageNoteReader", () => ({
  askChatModelAboutImage: mocks.askChatModelAboutImage,
  resolveImageBase64: async (data: string) => data,
}));
vi.mock("@/services/danbooruTags", () => ({
  findRelatedArtists: mocks.findRelatedArtists,
  describeRelatedArtists: () => "常畫「hanfu」的繪師：\n- ink master（出現在 1 組，900 張）",
}));

import { useSettingsStore } from "@/stores";
import { useChatMedia } from "./useChatMedia";

describe("看圖調整：拿參考圖比、查繪師後重畫", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    Object.values(mocks).forEach((m) => m.mockReset());
  });

  it("參考圖在前、生成圖在後；查完繪師改提示詞重畫，最後一張與提示詞存回訊息", async () => {
    Object.assign(useSettingsStore().novelAIImage, {
      enabled: true,
      apiKey: "pst-1",
      provider: "novelai",
      selfReview: true,
      selfReviewMaxRounds: 2,
    });
    const messages = ref<any[]>([
      { id: "u1", role: "user", content: "照這個畫", timestamp: 1, turnId: "t1", imageData: "REF", imageMimeType: "image/webp" },
      { id: "a1", role: "ai", content: "好", timestamp: 2, turnId: "t1" },
      { id: "a2", role: "ai", content: "<pic>古風男子</pic>", timestamp: 3, turnId: "t1", messageType: "descriptive-image", imageCaption: "古風男子" },
    ]);
    mocks.generateAIImage
      .mockResolvedValueOnce({ success: true, imageBase64: "IMG1", mimeType: "image/png" })
      .mockResolvedValueOnce({ success: true, imageBase64: "IMG2", mimeType: "image/png" });
    mocks.askChatModelAboutImage
      .mockResolvedValueOnce('<find-artists queries="hanfu, male focus"/>')
      .mockResolvedValueOnce('<pic-retry prompt="1boy, hanfu, artist:ink master" negative="glossy">畫風太亮</pic-retry>')
      .mockResolvedValueOnce("<pic-ok/>");
    mocks.findRelatedArtists.mockResolvedValue([{ name: "ink master", postCount: 900, score: 1, hits: 1 }]);

    const media = useChatMedia({
      messages,
      currentCharacter: ref(undefined),
      scrollToBottom: () => {},
      saveChat: () => {},
    });
    await media.tryGenerateImageForMessage("a2", "1boy, hanfu", "古風男子");

    const calls = mocks.askChatModelAboutImage.mock.calls;
    expect(calls).toHaveLength(3);
    expect(calls[0][1]).toEqual([
      { imageBase64: "REF", mimeType: "image/webp" },
      { imageBase64: "IMG1", mimeType: "image/png" },
    ]);
    expect(calls[0][0]).toContain("<find-artists");
    expect(mocks.findRelatedArtists).toHaveBeenCalledWith(["hanfu, male focus"], 10);
    // 查完繪師那次看得到結果，而且這輪不能再查
    expect(calls[1][0]).toContain("- ink master");
    expect(calls[1][0]).not.toContain("<find-artists");
    // 重畫後再看一次，列出試過的版本
    expect(calls[2][1][1]).toEqual({ imageBase64: "IMG2", mimeType: "image/png" });
    expect(calls[2][0]).toContain("1. prompt：1boy, hanfu｜");

    expect(mocks.generateAIImage.mock.calls[1][0]).toBe("1boy, hanfu, artist:ink master");
    expect(mocks.generateAIImage.mock.calls[1][2]).toMatchObject({ negativePrompt: "glossy" });
    expect(messages.value[2]).toMatchObject({
      messageType: "image",
      imageData: "IMG2",
      imagePrompt: "1boy, hanfu, artist:ink master",
      imageNegativePrompt: "glossy",
      isStreaming: false,
    });
  });

  it("上一輪的圖不當參考圖", async () => {
    Object.assign(useSettingsStore().novelAIImage, { enabled: true, apiKey: "pst-1", selfReview: true });
    const messages = ref<any[]>([
      { id: "u0", role: "user", content: "", timestamp: 1, turnId: "t0", imageData: "OLD", imageMimeType: "image/png" },
      { id: "a0", role: "ai", content: "好看", timestamp: 2, turnId: "t0" },
      { id: "u1", role: "user", content: "畫一張", timestamp: 3, turnId: "t1" },
      { id: "a1", role: "ai", content: "<pic>貓</pic>", timestamp: 4, turnId: "t1", messageType: "descriptive-image" },
    ]);
    mocks.generateAIImage.mockResolvedValue({ success: true, imageBase64: "IMG1", mimeType: "image/png" });
    mocks.askChatModelAboutImage.mockResolvedValue("<pic-ok/>");
    const media = useChatMedia({ messages, currentCharacter: ref(undefined), scrollToBottom: () => {}, saveChat: () => {} });
    await media.tryGenerateImageForMessage("a1", "cat", "貓");
    expect(mocks.askChatModelAboutImage.mock.calls[0][1]).toEqual([{ imageBase64: "IMG1", mimeType: "image/png" }]);
    expect(mocks.askChatModelAboutImage.mock.calls[0][0]).not.toContain("參考圖");
  });
});
