import { useSettingsStore } from "@/stores";
import {
  getImageGenTimeoutMs,
  getImageProvider,
  getImageProviderLabel,
  isImageGenReady,
  type ImageGenResponse,
} from "@/api/ImageGenApi";
import type { ImageProvider } from "@/api/NovelAIImageApi";
import type { ImageStyleRef } from "@/types/chat";
import {
  buildImageReviewPrompt,
  extractArtistTags,
  getCharacterAppearanceTags,
  getSelfReviewMaxRounds,
  getUserAppearanceTags,
  parseImageReviewReply,
  type ImageReviewAttempt,
  type ImageReviewVerdict,
} from "@/utils/picPromptGuide";
import type { ImageForModel } from "@/services/imageNoteReader";
import { useUserStore } from "@/stores/user";
import type { StoredCharacter } from "@/types/character";
import { ref, type Ref } from "vue";

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
  imageNegativePrompt?: string;
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
  imageSearchEnabled?: Ref<boolean>;
  /** 這個聊天的畫風參考圖（看圖調整優先拿它比對） */
  getImageStyleRef?: () => ImageStyleRef | undefined;
  /** 參考圖不在目前載入的訊息裡時，到資料庫找要用的聊天 ID */
  getChatId?: () => string | undefined;
  /** 拿畫風參考圖比對、看圖調整通過時，回報那次用的繪師串 */
  onStyleArtistsFound?: (messageId: string, artists: string) => void;
  /** 角色拿得到「試畫」工具：這時 <pic> 不跑背後的看圖調整，調畫風交給工具 */
  isDrawToolUsable?: () => boolean;
}) {
  const settingsStore = useSettingsStore();
  const userStore = useUserStore();
  const isGeneratingImage = ref(false);

  function getCharacterPrompt(): string {
    return getCharacterAppearanceTags(deps.currentCharacter.value);
  }

  function getUserPrompt(): string {
    return getUserAppearanceTags(settingsStore.novelAIImage, userStore.currentPersona);
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

  /**
   * 將訊息降級為純文字描述圖片
   * - 普通模式：messageType=descriptive-image，content=純文字描述
   * - 面對面 show-pic 模式：保留 <show-pic> 包裹，讓 MessageBubble 渲染相機動畫
   */
  function fallbackToDescriptiveImage(
    messageId: string,
    mode: "pic" | "show-pic" = "pic",
  ) {
    const idx = deps.messages.value.findIndex((m) => m.id === messageId);
    if (idx === -1) return;
    const caption = deps.messages.value[idx].imageCaption || "";
    if (mode === "show-pic") {
      deps.messages.value[idx] = {
        ...deps.messages.value[idx],
        content: `<show-pic>${caption}</show-pic>`,
        // 保持 messageType 為 undefined，避免被當成普通描述圖渲染
        messageType: undefined,
        isStreaming: false,
      };
    } else {
      deps.messages.value[idx] = {
        ...deps.messages.value[idx],
        content: caption,
        messageType: "descriptive-image",
        isStreaming: false,
      };
    }
  }

  /**
   * 將 AI 生成的長 prompt 精簡為 Pixabay 可接受的搜尋關鍵字
   * Pixabay 免費 API 限制：
   *   - q 最多 100 字元
   *   - 逗號視為標籤分隔符（最多 3 個標籤）
   * 策略：取第一個逗號前的片段，再取前 4 個單詞，截斷至 100 字元
   */
  function sanitizePixabayQuery(prompt: string): string {
    // 取第一個逗號前的部分（最核心的描述詞）
    const firstSegment = prompt.split(",")[0].trim();
    // 取前 4 個單詞，避免過長的描述句造成 400
    const words = firstSegment.split(/\s+/).slice(0, 4).join(" ");
    return words.slice(0, 100);
  }

  /**
   * Pixabay 遞補：NovelAI 未啟用時搜尋 Pixabay 圖片
   */
  async function tryPixabayFallback(
    messageId: string,
    imagePrompt: string,
    mode: "pic" | "show-pic" = "pic",
  ) {
    const idx = deps.messages.value.findIndex((m) => m.id === messageId);
    if (idx === -1) return;

    // 精簡查詢關鍵字，避免 Pixabay API 400 錯誤
    const sanitizedQuery = sanitizePixabayQuery(imagePrompt);
    if (!sanitizedQuery) {
      fallbackToDescriptiveImage(messageId, mode);
      deps.saveChat();
      return;
    }

    try {
      const { searchPixabay } = await import("@/api/PixabayApi");
      const result = await searchPixabay({
        q: sanitizedQuery,
        perPage: 3, // Pixabay 免費方案最小值為 3
        lang: "en",
      });

      const currentIdx = deps.messages.value.findIndex(
        (m) => m.id === messageId,
      );
      if (currentIdx === -1) return;

      if (result.hits.length > 0) {
        const hit = result.hits[0];
        // 有結果：更新為 image-url 訊息
        // imageCaption 保留原本的中文描述（顯示在拍立得底部），不用 Pixabay 作者名
        const originalCaption =
          deps.messages.value[currentIdx].imageCaption || imagePrompt;
        deps.messages.value[currentIdx] = {
          ...deps.messages.value[currentIdx],
          content: originalCaption,
          messageType: "image-url",
          imageUrl: hit.proxyWebformatURL,
          imageCaption: originalCaption,
          isStreaming: false,
        };
      } else {
        // 無結果：降級為純文字描述
        fallbackToDescriptiveImage(messageId, mode);
      }
    } catch {
      // 錯誤：降級為純文字描述
      fallbackToDescriptiveImage(messageId, mode);
    } finally {
      deps.saveChat();
    }
  }

  /** 畫風參考圖的原圖：先找目前載入的訊息，沒有再到資料庫找 */
  async function loadStyleRefImage(styleRef: ImageStyleRef): Promise<ImageForModel | undefined> {
    let imageData = deps.messages.value.find((m) => m.id === styleRef.messageId)?.imageData as string | undefined;
    if (!imageData) {
      const { getChatMessageById } = await import("@/db/chatMessageStore");
      imageData = (await getChatMessageById(styleRef.messageId, deps.getChatId?.()))?.imageData;
    }
    if (!imageData) return undefined;
    const { resolveImageBase64 } = await import("@/services/imageNoteReader");
    const imageBase64 = await resolveImageBase64(imageData);
    return imageBase64 ? { imageBase64, mimeType: styleRef.mimeType } : undefined;
  }

  /** 看圖調整的參考圖：聊天指定的畫風參考圖優先，沒有就用這一輪使用者傳的圖 */
  async function resolveReviewReference(
    messageId: string,
  ): Promise<{ image: ImageForModel; fromStyleRef: boolean } | undefined> {
    const styleRef = deps.getImageStyleRef?.();
    if (styleRef) {
      const image = await loadStyleRefImage(styleRef).catch((error) => {
        console.warn("[AI Image] 讀不到畫風參考圖", error);
        return undefined;
      });
      if (image) return { image, fromStyleRef: true };
    }
    const turnImage = await findTurnReferenceImage(messageId).catch(() => undefined);
    return turnImage ? { image: turnImage, fromStyleRef: false } : undefined;
  }

  /**
   * 這張 AI 圖片那一輪使用者傳的圖（拿來當看圖調整的參考圖）：
   * 從圖片訊息往前找，跳過同一輪的 AI 訊息，碰到上一輪的 AI 回覆就停
   */
  async function findTurnReferenceImage(messageId: string): Promise<ImageForModel | undefined> {
    const index = deps.messages.value.findIndex((m) => m.id === messageId);
    if (index === -1) return undefined;
    const turnId = deps.messages.value[index].turnId;
    for (let i = index - 1; i >= 0; i--) {
      const m = deps.messages.value[i];
      if (m.role === "ai") {
        if (turnId && m.turnId === turnId) continue;
        return undefined;
      }
      if (m.role !== "user" || !m.imageData || !m.imageMimeType) continue;
      const { resolveImageBase64 } = await import("@/services/imageNoteReader");
      const imageBase64 = await resolveImageBase64(m.imageData);
      return imageBase64 ? { imageBase64, mimeType: m.imageMimeType } : undefined;
    }
    return undefined;
  }

  /**
   * 看圖調整：讓聊天模型看剛生好的圖（有參考圖就一起比），它說要重畫就用它改的提示詞再畫一次，
   * 最多 selfReviewMaxRounds 次。NovelAI 時它可以先要求查相似繪師（每輪一次）。
   * 看圖或重畫失敗時保留上一張，不跳錯誤（圖已經有了）。
   * 回傳模型最後有沒有說「可以」（重畫次數用完、出錯都算沒有）。
   */
  async function reviewAndRegenerate(ctx: {
    image: ImageForModel;
    reference?: ImageForModel;
    description: string;
    provider: ImageProvider;
    autoTags: string;
    getPrompts: () => { prompt: string; negative?: string };
    setPrompts: (prompt: string, negative: string | undefined) => void;
    generate: (prompt: string, negative: string | undefined) => Promise<ImageGenResponse>;
    showGenerating: () => void;
    applyImage: (image: { imageBase64: string; mimeType?: string }) => boolean;
  }): Promise<boolean> {
    const maxRounds = getSelfReviewMaxRounds(settingsStore.novelAIImage);
    const canSearchArtists = ctx.provider === "novelai";
    const attempts: ImageReviewAttempt[] = [];
    const artistNotes: string[] = [];
    const { askChatModelAboutImage } = await import("@/services/imageNoteReader");
    let image = ctx.image;

    for (let round = 1; round <= maxRounds; round++) {
      const { prompt, negative } = ctx.getPrompts();
      let verdict: ImageReviewVerdict | undefined;
      // 每輪最多先查一次繪師，查完再看一次圖
      for (let ask = 0; ask < 2; ask++) {
        try {
          const reply = await askChatModelAboutImage(
            buildImageReviewPrompt({
              description: ctx.description,
              prompt,
              negativePrompt: negative,
              provider: ctx.provider,
              autoTags: ctx.autoTags,
              round,
              maxRounds,
              hasReference: !!ctx.reference,
              attempts,
              artistNotes,
              canSearchArtists: canSearchArtists && ask === 0,
            }),
            ctx.reference ? [ctx.reference, image] : [image],
          );
          verdict = parseImageReviewReply(reply);
        } catch (error) {
          console.warn("[AI Image] 看圖調整：模型看圖失敗，保留這張", error);
          return false;
        }
        if (verdict.kind !== "search") break;
        if (!canSearchArtists || ask > 0) {
          verdict = { kind: "ok" };
          break;
        }
        try {
          const { describeRelatedArtists, findRelatedArtists } = await import("@/services/danbooruTags");
          const artists = await findRelatedArtists(verdict.queries, 10);
          artistNotes.push(describeRelatedArtists(verdict.queries, artists));
        } catch (error) {
          console.warn("[AI Image] 看圖調整：查繪師失敗", error);
          artistNotes.push(`查繪師失敗（${error instanceof Error ? error.message : String(error)}），只能用你自己知道的繪師。`);
        }
      }
      if (!verdict || verdict.kind !== "retry") return verdict?.kind === "ok";

      console.log(`[AI Image] 看圖調整第 ${round} 次重畫：${verdict.reason || "（沒寫原因）"}`, verdict);
      attempts.push({ prompt, negativePrompt: negative, reason: verdict.reason });
      const previous = { prompt, negative };
      ctx.setPrompts(verdict.prompt, verdict.negativePrompt);
      ctx.showGenerating();
      let next: ImageGenResponse;
      try {
        next = await ctx.generate(verdict.prompt, verdict.negativePrompt);
      } catch (error) {
        next = { success: false, error: error instanceof Error ? error.message : String(error) };
      }
      if (!next.success || !next.imageBase64) {
        console.warn("[AI Image] 看圖調整：重畫失敗，換回上一張", next.error);
        ctx.setPrompts(previous.prompt, previous.negative);
        ctx.applyImage(image);
        return false;
      }
      image = { imageBase64: next.imageBase64, mimeType: next.mimeType || "image/png" };
      if (!ctx.applyImage(image)) return false;
      deps.saveChat();
    }
    // 最後一次重畫完沒有再看，不算通過
    return false;
  }

  async function tryGenerateImageForMessage(
    messageId: string,
    imagePrompt?: string,
    imageDescription?: string,
    mode: "pic" | "show-pic" = "pic",
  ) {
    // 若 imagePrompt 為空，使用 imageDescription 作為搜尋關鍵字
    const effectivePrompt = imagePrompt?.trim() || imageDescription?.trim();
    if (!effectivePrompt) return;

    const msgIndex = deps.messages.value.findIndex((m) => m.id === messageId);
    if (msgIndex === -1) return;

    // 確保 imageCaption 已寫入（fallback 渲染相機動畫時會用到）
    if (!deps.messages.value[msgIndex].imageCaption && imageDescription) {
      deps.messages.value[msgIndex].imageCaption = imageDescription.trim();
    }

    // 遞補鏈：文生圖（NovelAI / GPT / Banana / MJ / Niji）啟用時用它，否則使用 Pixabay
    if (isImageGenReady(settingsStore.novelAIImage)) {
      const imageSettings = settingsStore.novelAIImage;
      const provider = getImageProvider(imageSettings);
      const providerLabel = getImageProviderLabel(provider);
      // 舊資料可能只留下圖片描述，沒有保存英文 prompt；這時退回用描述重生。
      let currentPrompt = imagePrompt?.trim() || effectivePrompt;
      // 模型在 <pic negative="..."> 寫的負面提示詞（存在訊息上，重新生成時也帶著）
      let currentNegative: string | undefined =
        deps.messages.value[msgIndex].imageNegativePrompt?.trim() || undefined;
      const characterPrompt = getCharacterPrompt();
      const userPrompt = getUserPrompt();

      const caption = deps.messages.value[msgIndex].imageCaption || "";
      /** 顯示「生成中」：show-pic 保留相機動畫，其他用打字提示 */
      const showGenerating = () => {
        const idx = deps.messages.value.findIndex((m) => m.id === messageId);
        if (idx === -1) return;
        if (mode === "show-pic") {
          // 面對面 show-pic：保留 <show-pic> 包裝讓 MessageBubble 持續顯示相機動畫
          // 不切到 isStreaming，避免相機動畫被打字提示覆蓋
          deps.messages.value[idx] = {
            ...deps.messages.value[idx],
            content: `<show-pic>${caption}</show-pic>`,
            messageType: undefined,
          };
        } else {
          deps.messages.value[idx] = {
            ...deps.messages.value[idx],
            content: `[生成圖片中...] ${caption}`,
            isStreaming: true,
          };
        }
      };
      /** 把生好的圖寫進訊息；訊息已被刪掉時回傳 false */
      const applyImage = (image: { imageBase64: string; mimeType?: string }): boolean => {
        const idx = deps.messages.value.findIndex((m) => m.id === messageId);
        if (idx === -1) return false;
        const mimeType = image.mimeType || "image/png";
        deps.messages.value[idx] = {
          ...deps.messages.value[idx],
          content: deps.messages.value[idx].imageCaption || effectivePrompt,
          messageType: "image",
          imageUrl: `data:${mimeType};base64,${image.imageBase64}`,
          imageData: image.imageBase64,
          imageMimeType: mimeType,
          imagePrompt: currentPrompt,
          imageNegativePrompt: currentNegative,
          isStreaming: false,
        };
        return true;
      };

      showGenerating();
      isGeneratingImage.value = true;

      try {
        const { generateAIImage } = await import("@/api/ImageGenApi");

        // NovelAI：iOS 45 秒、其他 60 秒；GPT / Banana / MJ 本來就比較久
        const timeoutMs = getImageGenTimeoutMs(imageSettings);
        const generate = (prompt: string, negative: string | undefined) => {
          let timer: ReturnType<typeof setTimeout> | undefined;
          const timeoutPromise = new Promise<never>((_, reject) => {
            timer = setTimeout(
              () => reject(new Error(`請求超時（${timeoutMs / 1000}秒），請檢查網絡連接或稍後重試`)),
              timeoutMs,
            );
          });
          return Promise.race([
            generateAIImage(prompt, imageSettings, {
              characterPrompt,
              userPrompt,
              negativePrompt: negative,
              // 「提示詞交給模型」：不套設定裡的固定正負提示詞
              ignorePresets: !!imageSettings.modelControlsPrompt,
            }),
            timeoutPromise,
          ]).finally(() => clearTimeout(timer));
        };

        const result = await generate(currentPrompt, currentNegative);

        if (result.success && result.imageBase64) {
          if (
            applyImage({ imageBase64: result.imageBase64, mimeType: result.mimeType }) &&
            imageSettings.selfReview &&
            !deps.isDrawToolUsable?.()
          ) {
            deps.saveChat();
            const reference = await resolveReviewReference(messageId);
            const passed = await reviewAndRegenerate({
              image: { imageBase64: result.imageBase64, mimeType: result.mimeType || "image/png" },
              reference: reference?.image,
              description: caption || imageDescription?.trim() || "",
              provider,
              autoTags: [characterPrompt, userPrompt].filter(Boolean).join(", "),
              getPrompts: () => ({ prompt: currentPrompt, negative: currentNegative }),
              setPrompts: (prompt, negative) => {
                currentPrompt = prompt;
                currentNegative = negative;
              },
              generate,
              showGenerating,
              applyImage,
            });
            // 照畫風參考圖畫出滿意的圖：記住這次的繪師串，下次直接從這組開始
            const artists = extractArtistTags(currentPrompt);
            if (passed && reference?.fromStyleRef && artists) {
              deps.onStyleArtistsFound?.(messageId, artists);
            }
          }
        } else {
          fallbackToDescriptiveImage(messageId, mode);
          console.warn("[AI Image] 生成失敗:", result.error);

          // 更友好的錯誤提示
          const errorMsg = result.error || "未知錯誤";
          if (errorMsg.includes("503")) {
            alert(
              `${providerLabel} 圖片生成失敗 (503)\n\n${errorMsg}\n\n提示詞: ${currentPrompt}`,
            );
          } else {
            alert(
              `${providerLabel} 圖片生成失敗\n\n${errorMsg}\n\n提示詞: ${currentPrompt}`,
            );
          }
        }
      } catch (error) {
        console.error("[AI Image] 錯誤:", error);
        fallbackToDescriptiveImage(messageId, mode);

        // 更友好的異常錯誤提示
        const errorMsg =
          error instanceof Error ? error.message : "網絡錯誤或請求超時";
        if (errorMsg.includes("503")) {
          alert(
            `${providerLabel} 圖片生成異常 (503)\n\n服務暫時不可用，可能原因：\n1. 服務器負載過高\n2. 網絡連接不穩定\n3. API Key 使用頻率過高\n\n建議：\n- 稍後重試（系統已自動重試 3 次）\n- 切換到 WiFi 網絡環境\n- 檢查 API Key 是否有效\n\n提示詞: ${currentPrompt}`,
          );
        } else if (errorMsg.includes("超時")) {
          alert(
            `${providerLabel} 圖片生成超時\n\n${errorMsg}\n\n建議：\n- 檢查網絡連接\n- 切換到更穩定的網絡環境\n- 稍後重試\n\n提示詞: ${currentPrompt}`,
          );
        } else {
          alert(
            `${providerLabel} 圖片生成異常\n\n${errorMsg}\n\n提示詞: ${currentPrompt}`,
          );
        }
      } finally {
        isGeneratingImage.value = false;
        deps.saveChat();
      }
      return;
    }

    if (deps.imageSearchEnabled?.value === false) {
      fallbackToDescriptiveImage(messageId, mode);
      deps.saveChat();
      return;
    }

    // Pixabay 遞補：NovelAI 未啟用時搜尋 Pixabay
    await tryPixabayFallback(messageId, effectivePrompt, mode);
  }

  async function handleAIGenerateImage(prompt: string) {
    if (!isImageGenReady(settingsStore.novelAIImage)) {
      alert("請先在聊天設定的「文生圖設定」啟用並填好 API Key");
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
      const { generateAIImage } = await import("@/api/ImageGenApi");
      const result = await generateAIImage(prompt, settingsStore.novelAIImage, {
        characterPrompt: getCharacterPrompt(),
        userPrompt: getUserPrompt(),
      });

      if (result.success && result.imageBase64) {
        const msgIndex = deps.messages.value.findIndex(
          (m) => m.id === placeholderMessage.id,
        );
        if (msgIndex !== -1) {
          deps.messages.value[msgIndex] = {
            ...deps.messages.value[msgIndex],
            content: `[AI 生成] ${prompt}`,
            messageType: "image",
            imageUrl: `data:${result.mimeType || "image/png"};base64,${result.imageBase64}`,
            imageData: result.imageBase64,
            imageMimeType: result.mimeType || "image/png",
            imageCaption: prompt,
            imagePrompt: prompt,
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


  /**
   * 「試畫」工具：照提示詞畫一張，只回傳圖（不進聊天；工作紀錄卡片會顯示）。
   * 畫不成丟錯，讓模型知道失敗原因。
   */
  async function drawImageForTool(request: {
    prompt: string;
    negativePrompt?: string;
    signal?: AbortSignal;
  }): Promise<{ imageBase64: string; mimeType: string; autoTags: string; providerLabel: string }> {
    const imageSettings = settingsStore.novelAIImage;
    if (!isImageGenReady(imageSettings)) throw new Error("文生圖沒有設定好，不能畫圖");
    const characterPrompt = getCharacterPrompt();
    const userPrompt = getUserPrompt();

    isGeneratingImage.value = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let onAbort: (() => void) | undefined;
    try {
      const { generateAIImage } = await import("@/api/ImageGenApi");
      const timeoutMs = getImageGenTimeoutMs(imageSettings);
      const stop = new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`生圖超時（${timeoutMs / 1000} 秒）`)), timeoutMs);
        onAbort = () => reject(new Error("已取消"));
        if (request.signal?.aborted) onAbort();
        else request.signal?.addEventListener("abort", onAbort, { once: true });
      });
      const result = await Promise.race([
        generateAIImage(request.prompt, imageSettings, {
          characterPrompt,
          userPrompt,
          negativePrompt: request.negativePrompt,
          ignorePresets: !!imageSettings.modelControlsPrompt,
        }),
        stop,
      ]);
      if (!result.success || !result.imageBase64) throw new Error(result.error || "生圖失敗");
      return {
        imageBase64: result.imageBase64,
        mimeType: result.mimeType || "image/png",
        autoTags: [characterPrompt, userPrompt].filter(Boolean).join(", "),
        providerLabel: getImageProviderLabel(getImageProvider(imageSettings)),
      };
    } finally {
      clearTimeout(timer);
      if (onAbort) request.signal?.removeEventListener("abort", onAbort);
      isGeneratingImage.value = false;
    }
  }

  /**
   * 把選定的試畫貼進聊天：messageId 那則還在就換掉它的圖，否則新增一則角色圖片訊息
   * （插在 beforeMessageId 前面，也就是這次回覆的文字前面）。回傳圖片訊息的 id。
   */
  function postToolImage(request: {
    imageBase64: string;
    mimeType: string;
    prompt?: string;
    negativePrompt?: string;
    caption?: string;
    messageId?: string;
    turnId?: string;
    beforeMessageId?: string;
  }): string {
    const fields = {
      messageType: "image",
      imageUrl: `data:${request.mimeType};base64,${request.imageBase64}`,
      imageData: request.imageBase64,
      imageMimeType: request.mimeType,
      imagePrompt: request.prompt,
      imageNegativePrompt: request.negativePrompt,
      // 換了圖，舊的看圖備註不適用
      imageNote: undefined,
      isStreaming: false,
    };
    const existing = request.messageId ? deps.messages.value.findIndex((m) => m.id === request.messageId) : -1;
    if (existing !== -1) {
      const current = deps.messages.value[existing];
      const caption = request.caption ?? current.imageCaption;
      deps.messages.value[existing] = {
        ...current,
        ...fields,
        imageCaption: caption || undefined,
        content: caption || request.prompt || current.content,
      };
      return current.id;
    }
    const caption = request.caption?.trim() || "";
    const message: Message = {
      id: `msg_${Date.now()}_draw_${Math.random().toString(36).slice(2, 8)}`,
      role: "ai",
      content: caption || request.prompt || "[圖片]",
      timestamp: Date.now(),
      imageCaption: caption || undefined,
      ...fields,
      ...(request.turnId ? { turnId: request.turnId } : {}),
    };
    const beforeIndex = request.beforeMessageId
      ? deps.messages.value.findIndex((m) => m.id === request.beforeMessageId)
      : -1;
    if (beforeIndex >= 0) deps.messages.value.splice(beforeIndex, 0, message);
    else deps.messages.value.push(message);
    deps.scrollToBottom();
    return message.id;
  }

  /** 「看聊天裡的圖」工具：畫風參考圖，或從最新往回數第 nth 張（目前載入的訊息） */
  async function findChatImageForTool(request: {
    nth: number;
    sender: "any" | "user" | "character";
    styleRef?: boolean;
  }): Promise<
    | {
        image: ImageForModel;
        messageId: string;
        sender: "user" | "character";
        nth: number;
        total: number;
        caption?: string;
        prompt?: string;
        negativePrompt?: string;
        note?: string;
        isStyleRef?: boolean;
      }
    | null
  > {
    const styleRef = deps.getImageStyleRef?.();
    if (request.styleRef) {
      if (!styleRef) return null;
      const image = await loadStyleRefImage(styleRef);
      if (!image) return null;
      const message = deps.messages.value.find((m) => m.id === styleRef.messageId);
      return {
        image,
        messageId: styleRef.messageId,
        sender: message?.role === "ai" ? "character" : "user",
        nth: 0,
        total: 0,
        caption: message?.imageCaption,
        prompt: message?.imagePrompt,
        negativePrompt: message?.imageNegativePrompt,
        note: styleRef.styleNote,
        isStyleRef: true,
      };
    }
    const candidates = deps.messages.value.filter(
      (m) =>
        !m.isStreaming &&
        !!m.imageData &&
        !!m.imageMimeType &&
        (m.role === "user" || m.role === "ai") &&
        (request.sender === "any" || (request.sender === "user") === (m.role === "user")),
    );
    const nth = Math.max(1, Math.floor(request.nth || 1));
    const message = candidates[candidates.length - nth];
    if (!message) return null;
    const { resolveImageBase64 } = await import("@/services/imageNoteReader");
    const imageBase64 = await resolveImageBase64(message.imageData);
    if (!imageBase64) return null;
    return {
      image: { imageBase64, mimeType: message.imageMimeType! },
      messageId: message.id,
      sender: message.role === "user" ? "user" : "character",
      nth,
      total: candidates.length,
      caption: message.imageCaption,
      prompt: message.imagePrompt,
      negativePrompt: message.imageNegativePrompt,
      note: message.imageNote,
      isStyleRef: styleRef?.messageId === message.id,
    };
  }

  return {
    isGeneratingImage,
    handleMediaSelect,
    handleImageUpload,
    tryGenerateImageForMessage,
    handleAIGenerateImage,
    drawImageForTool,
    postToolImage,
    findChatImageForTool,
  };
}
