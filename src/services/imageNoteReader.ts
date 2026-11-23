/**
 * 點開圖片「讀圖」：讓聊天用的模型重新看一張 user 傳的圖，寫成圖片備註。
 * 模型回覆時忘了寫 <pic-note>，或寫得不對時用。
 */
import { OpenAICompatibleClient } from "@/api/OpenAICompatible";
import { getChatImage, isChatImageRef } from "@/db/operations";
import { useSettingsStore } from "@/stores/settings";
import { pickGenerationToggles } from "@/utils/generationToggles";
import { buildReadImagePrompt, cleanImageNoteReply } from "@/utils/picNote";

/** 訊息裡的圖片資料（base64、data URL 或 chatimg 引用）轉成純 base64；讀不到回傳 null */
export async function resolveImageBase64(imageData: string | undefined): Promise<string | null> {
  if (!imageData) return null;

  const source = isChatImageRef(imageData) ? await getChatImage(imageData) : imageData;
  if (!source) return null;

  if (source.startsWith("data:")) {
    const commaIndex = source.indexOf(",");
    return commaIndex >= 0 ? source.slice(commaIndex + 1).replace(/\s+/g, "") : null;
  }

  return source.replace(/\s+/g, "");
}

export interface ImageForModel {
  imageBase64: string;
  mimeType: string;
}

/** 讓聊天用的模型看圖（可以好幾張，照順序放）回答指示，回傳原始回覆；失敗時丟出錯誤 */
export async function askChatModelAboutImage(
  instruction: string,
  images: ImageForModel[],
  temperature = 0.3,
): Promise<string> {
  const taskConfig = useSettingsStore().getAPIForTask("chat");
  if (!taskConfig.api.endpoint || !taskConfig.api.apiKey || !taskConfig.api.model) {
    throw new Error("請先在設定中配置 API");
  }

  const generation = taskConfig.generation;
  const client = new OpenAICompatibleClient({ ...taskConfig.api });
  const stream = client.generateStream({
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: instruction },
          ...images.map((image) => ({
            type: "image_url" as const,
            image_url: { url: `data:${image.mimeType};base64,${image.imageBase64}`, detail: "auto" as const },
          })),
        ],
      },
    ],
    settings: {
      maxContextLength: generation.maxContextLength || 200000,
      // 思考模型會先花掉一些輸出 token，跟聊天用同一個上限
      maxResponseLength: generation.maxTokens || 8192,
      temperature,
      topP: 0.9,
      frequencyPenalty: 0,
      presencePenalty: 0,
      repetitionPenalty: 1,
      stopSequences: [],
      streaming: true,
      useStreamingWindow: false,
      ...pickGenerationToggles(generation),
    },
    apiSettings: taskConfig.api,
    adjustLastMessageRole: true,
  });

  let content = "";
  for await (const event of stream) {
    if (event.type === "token" && event.token) {
      content += event.token;
    } else if (event.type === "done") {
      content = event.content || content;
    } else if (event.type === "error") {
      throw new Error(String(event.error || "模型沒有回應"));
    }
  }
  return content;
}

/** 讓模型看圖寫備註；失敗時丟出錯誤 */
export async function readImageNote(
  imageBase64: string,
  mimeType: string,
  caption?: string,
): Promise<string> {
  const content = await askChatModelAboutImage(buildReadImagePrompt(caption), [{ imageBase64, mimeType }]);
  const note = cleanImageNoteReply(content);
  if (!note) throw new Error("模型沒有寫出圖片內容");
  return note;
}
