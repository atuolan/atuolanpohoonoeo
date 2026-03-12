import { ref, type Ref } from "vue";
import { useSettingsStore } from "@/stores";
import { useUserStore } from "@/stores/user";
import type { StoredCharacter } from "@/types/character";

type MediaType =
  | "descriptive-image"
  | "descriptive-video"
  | "real-image"
  | "image-url"
  | "ai-generate";

interface ImageData {
  dataUrl: string;
  base64: string;
  mimeType: string;
  caption?: string;
}

interface Message {
  id: string;
  role: "user" | "ai" | "system";
  content: string;
  timestamp: number;
  messageType?: string;
  imageUrl?: string;
  imageData?: string;
  imageMimeType?: string;
  imageCaption?: string;
  imagePrompt?: string;
  isStreaming?: boolean;
  [key: string]: any;
}

/**
 * 媒體發送與 AI 文生圖功能
 * 從 ChatScreen.vue 抽取的獨立 composable
 */
export function useChatMedia(deps: {
  messages: Ref<Message[]>;
  currentCharacter: Ref<StoredCharacter | undefined>;
  scrollToBottom: () => void;
  saveChat: () => void;
}) {
  const settingsStore = useSettingsStore();
  const userStore = useUserStore();
  const isGeneratingImage = ref(false);

  function getCharacterPrompt(): string {
    const ext = deps.currentCharacter.value?.data?.extensions;
    const explicitPrompt = ext?.naiCharacterPrompt?.trim();
    if (explicitPrompt) return explicitPrompt;
    return ext?.sd_character_prompt?.positive?.trim() || "";
  }

  function getUserPrompt(): string {
    if (!settingsStore.novelAIImage.useUserTag) return "";
    return userStore.currentPersona?.naiUserPrompt?.trim() || "";
  }

  function handleMediaSelect(
    type: MediaType,
    content?: string,
    caption?: string,
  ) {
    if (type === "descriptive-image") {
      const message: Message = {
        id: `msg_${Date.now()}`,
        role: "user",
        content: `<圖片描述>${content}</圖片描述>`,
        timestamp: Date.now(),
        messageType: "descriptive-image",
        imageCaption: content,
      };
      deps.messages.value.push(message);
    } else if (type === "descriptive-video") {
      const message: Message = {
        id: `msg_${Date.now()}`,
        role: "user",
        content: `<影片描述>${content}</影片描述>`,
        timestamp: Date.now(),
        messageType: "descriptive-video",
        imageCaption: content,
      };
      deps.messages.value.push(message);
    } else if (type === "image-url" && content) {
      const message: Message = {
        id: `msg_${Date.now()}`,
        role: "user",
        content: caption || "[圖片]",
        timestamp: Date.now(),
        messageType: "image-url",
        imageUrl: content,
        imageCaption: caption,
      };
      deps.messages.value.push(message);
    }

    deps.scrollToBottom();
    deps.saveChat();
  }

  function handleImageUpload(imageData: ImageData) {
    const message: Message = {
      id: `msg_${Date.now()}`,
      role: "user",
      content: imageData.caption || "[圖片]",
      timestamp: Date.now(),
      messageType: "image",
      imageUrl: imageData.dataUrl,
      imageData: imageData.base64,
      imageMimeType: imageData.mimeType,
      imageCaption: imageData.caption,
    };
    deps.messages.value.push(message);
    deps.scrollToBottom();
    deps.saveChat();
  }

  async function tryGenerateImageForMessage(
    messageId: string,
    imagePrompt?: string,
  ) {
    if (!imagePrompt) return;
    if (
      !settingsStore.novelAIImage.enabled ||
      !settingsStore.novelAIImage.apiKey
    )
      return;

    const msgIndex = deps.messages.value.findIndex(
      (m) => m.id === messageId,
    );
    if (msgIndex === -1) return;

    deps.messages.value[msgIndex].content =
      `[生成圖片中...] ${deps.messages.value[msgIndex].imageCaption || ""}`;
    deps.messages.value[msgIndex].isStreaming = true;
    isGeneratingImage.value = true;

    try {
      const { generateImage } = await import("@/api/NovelAIImageApi");
      
      // iOS Safari 特殊处理：更短的超时时间
      const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
      const timeoutMs = isIOS ? 45000 : 60000; // iOS: 45秒, 其他: 60秒
      
      // 添加超時控制
      const timeoutPromise = new Promise<never>((_, reject) => 
        setTimeout(() => reject(new Error(`請求超時（${timeoutMs / 1000}秒），請檢查網絡連接或稍後重試`)), timeoutMs)
      );
      
      const result = await Promise.race([
        generateImage(imagePrompt, settingsStore.novelAIImage, {
          characterPrompt: getCharacterPrompt(),
          userPrompt: getUserPrompt(),
        }),
        timeoutPromise
      ]);

      const idx = deps.messages.value.findIndex((m) => m.id === messageId);
      if (idx === -1) return;

      if (result.success && result.imageBase64) {
        deps.messages.value[idx] = {
          ...deps.messages.value[idx],
          content: deps.messages.value[idx].imageCaption || imagePrompt,
          messageType: "image",
          imageUrl: `data:image/png;base64,${result.imageBase64}`,
          imageData: result.imageBase64,
          imageMimeType: "image/png",
          isStreaming: false,
        };
      } else {
        const caption = deps.messages.value[idx].imageCaption || "";
        deps.messages.value[idx].content = `<pic>${caption}</pic>`;
        deps.messages.value[idx].messageType = "descriptive-image";
        deps.messages.value[idx].isStreaming = false;
        console.warn("[AI Image] 生成失敗:", result.error);
        
        // 更友好的錯誤提示
        const errorMsg = result.error || "未知錯誤";
        if (errorMsg.includes('503')) {
          alert(`NovelAI 圖片生成失敗 (503)\n\n${errorMsg}\n\n提示詞: ${imagePrompt}`);
        } else {
          alert(`NovelAI 圖片生成失敗\n\n${errorMsg}\n\n提示詞: ${imagePrompt}`);
        }
      }
    } catch (error) {
      console.error("[AI Image] 錯誤:", error);
      const idx = deps.messages.value.findIndex((m) => m.id === messageId);
      if (idx !== -1) {
        const caption = deps.messages.value[idx].imageCaption || "";
        deps.messages.value[idx].content = `<pic>${caption}</pic>`;
        deps.messages.value[idx].messageType = "descriptive-image";
        deps.messages.value[idx].isStreaming = false;
      }
      
      // 更友好的異常錯誤提示
      const errorMsg = error instanceof Error ? error.message : "網絡錯誤或請求超時";
      if (errorMsg.includes('503')) {
        alert(`NovelAI 圖片生成異常 (503)\n\n服務暫時不可用，可能原因：\n1. NovelAI 服務器負載過高\n2. 網絡連接不穩定\n3. API Key 使用頻率過高\n\n建議：\n- 稍後重試（系統已自動重試 3 次）\n- 切換到 WiFi 網絡環境\n- 檢查 API Key 是否有效\n\n提示詞: ${imagePrompt}`);
      } else if (errorMsg.includes('超時')) {
        alert(`NovelAI 圖片生成超時\n\n${errorMsg}\n\n建議：\n- 檢查網絡連接\n- 切換到更穩定的網絡環境\n- 稍後重試\n\n提示詞: ${imagePrompt}`);
      } else {
        alert(`NovelAI 圖片生成異常\n\n${errorMsg}\n\n提示詞: ${imagePrompt}`);
      }
    } finally {
      isGeneratingImage.value = false;
      deps.saveChat();
    }
  }

  async function handleAIGenerateImage(prompt: string) {
    if (
      !settingsStore.novelAIImage.enabled ||
      !settingsStore.novelAIImage.apiKey
    ) {
      alert("請先在聊天設定中配置 NovelAI API Key");
      return;
    }

    isGeneratingImage.value = true;

    const placeholderMessage: Message = {
      id: `msg_${Date.now()}`,
      role: "user",
      content: `[生成中] ${prompt}`,
      timestamp: Date.now(),
      messageType: "image",
    };
    deps.messages.value.push(placeholderMessage);
    deps.scrollToBottom();

    try {
      const { generateImage } = await import("@/api/NovelAIImageApi");
      const result = await generateImage(
        prompt,
        settingsStore.novelAIImage,
        {
          characterPrompt: getCharacterPrompt(),
          userPrompt: getUserPrompt(),
        },
      );

      if (result.success && result.imageBase64) {
        const msgIndex = deps.messages.value.findIndex(
          (m) => m.id === placeholderMessage.id,
        );
        if (msgIndex !== -1) {
          deps.messages.value[msgIndex] = {
            ...deps.messages.value[msgIndex],
            content: `[AI 生成] ${prompt}`,
            imageUrl: `data:image/png;base64,${result.imageBase64}`,
            imageData: result.imageBase64,
            imageMimeType: "image/png",
            imageCaption: prompt,
          };
        }
        deps.saveChat();
      } else {
        const msgIndex = deps.messages.value.findIndex(
          (m) => m.id === placeholderMessage.id,
        );
        if (msgIndex !== -1) {
          deps.messages.value.splice(msgIndex, 1);
        }
        alert(`圖片生成失敗: ${result.error || "未知錯誤"}`);
      }
    } catch (error) {
      console.error("[AI Generate] 錯誤:", error);
      const msgIndex = deps.messages.value.findIndex(
        (m) => m.id === placeholderMessage.id,
      );
      if (msgIndex !== -1) {
        deps.messages.value.splice(msgIndex, 1);
      }
      alert(
        `圖片生成失敗: ${error instanceof Error ? error.message : "未知錯誤"}`,
      );
    } finally {
      isGeneratingImage.value = false;
    }
  }

  return {
    isGeneratingImage,
    handleMediaSelect,
    handleImageUpload,
    tryGenerateImageForMessage,
    handleAIGenerateImage,
  };
}
