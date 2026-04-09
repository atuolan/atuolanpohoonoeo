import { ref, type Ref, type ComputedRef } from "vue";
import { getChatImage, isChatImageRef } from "@/db/operations";
import { cropImageByPercent } from "@/utils/cropImage";
import type { CoupleAvatarEntry } from "@/types/chat";
import type { CoupleAvatarAction } from "@/services/ResponseParser";

/**
 * 換頭像處理功能
 * 從 ChatScreen.vue 抽取的獨立 composable
 * 頭像變更僅影響當前聊天（寫入 charAvatarOverride / userAvatarOverride），不修改角色卡原始頭像
 */
export function useChatAvatarChange(deps: {
  messages: Ref<any[]>;
  currentCharacter: ComputedRef<any>;
  characterName: string;
  saveChatImmediate: () => Promise<void>;
  /** 聊天專屬角色頭像覆蓋 */
  charAvatarOverride: Ref<string | undefined>;
  /** 聊天專屬用戶頭像覆蓋 */
  userAvatarOverride: Ref<string | undefined>;
  /** 情頭庫 */
  coupleAvatarLibrary: Ref<CoupleAvatarEntry[]>;
  /** 當前啟用的情頭 ID */
  activeCoupleAvatarId: Ref<string | null>;
}) {

  const moodAvatarUrl = ref<string | null>(null);
  const showForceAvatarConfirm = ref(false);

  const MOOD_LABELS: Record<string, { label: string; emoji: string }> = {
    angry: { label: "生氣", emoji: "😠" },
    sad: { label: "難過", emoji: "😢" },
  };

  // 預設情緒頭像（通用）
  const DEFAULT_MOOD_AVATARS: Record<string, string> = {
    angry: "/mood-avatars/angry.jpg",
    sad: "/mood-avatars/sad.jpg",
  };

  function getMoodAvatarUrl(mood: string): string | null {
    const char = deps.currentCharacter.value;
    if (!char) return null;
    // 優先使用角色卡自訂的情緒頭像
    const config = (char as any).moodAvatars as
      | { baseUrl?: string; avatars?: Record<string, string> }
      | undefined;
    if (config?.avatars?.[mood]) {
      const filename = config.avatars[mood];
      if (filename.startsWith("http") || filename.startsWith("data:")) return filename;
      return config.baseUrl ? `${config.baseUrl}/${filename}` : filename;
    }
    // 回退到預設情緒頭像
    return DEFAULT_MOOD_AVATARS[mood] ?? null;
  }

  function findLastUserImage(): {
    url: string;
    caption?: string;
    imageData?: string;
    imageMimeType?: string;
  } | null {
    for (let i = deps.messages.value.length - 1; i >= 0; i--) {
      const m = deps.messages.value[i];
      if (m.role === "user" && m.imageUrl) {
        return {
          url: m.imageUrl,
          caption: m.imageCaption,
          imageData: m.imageData,
          imageMimeType: m.imageMimeType,
        };
      }
    }
    return null;
  }

  /** 找到最近 N 張用戶圖片 */
  function findLastUserImages(count: number): { url: string; imageData?: string }[] {
    const results: { url: string; imageData?: string }[] = [];
    for (let i = deps.messages.value.length - 1; i >= 0 && results.length < count; i--) {
      const m = deps.messages.value[i];
      if (m.role === "user" && m.imageUrl) {
        results.push({ url: m.imageUrl, imageData: m.imageData });
      }
    }
    return results.reverse();
  }

  function insertAvatarChangeNotice(
    text: string,
    imageData?: { url: string; data?: string; mimeType?: string },
  ) {
    const notice: any = {
      id: `msg_${Date.now()}_avatar`,
      role: "system",
      content: text,
      timestamp: Date.now(),
      isAvatarChange: true,
    };
    if (imageData) {
      notice.messageType = imageData.data ? "image" : "image-url";
      notice.imageUrl = imageData.url;
      if (imageData.data) notice.imageData = imageData.data;
      if (imageData.mimeType) notice.imageMimeType = imageData.mimeType;
    }
    deps.messages.value.push(notice);
  }

  function formatTimeStr(): string {
    const now = new Date();
    return `${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, "0")}/${String(now.getDate()).padStart(2, "0")} ${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  }

  async function handleAvatarChange(
    action: "accept" | "reject" | "forced" | "mood" | "restore",
    mood?: string,
    desc?: string,
  ) {
    const charName = deps.characterName || "角色";
    const timeStr = formatTimeStr();

    switch (action) {
      case "accept": {
        const img = findLastUserImage();
        if (img && deps.currentCharacter.value) {
          // 解析實際的 base64 圖片數據：優先使用 imageData，若為 chatimg 引用則從 IDB 讀取
          let avatarBase64 = img.url;
          if (img.imageData && img.imageData.startsWith("data:")) {
            avatarBase64 = img.imageData;
          } else if (isChatImageRef(img.url)) {
            const resolved = await getChatImage(img.url);
            if (resolved) avatarBase64 = resolved;
          }
          if (img.imageData && isChatImageRef(img.imageData)) {
            const resolved = await getChatImage(img.imageData);
            if (resolved) avatarBase64 = resolved;
          }
          // 寫入聊天專屬覆蓋，不修改角色卡原始頭像
          deps.charAvatarOverride.value = avatarBase64;
          const description = desc || img.caption || "";
          const suffix = description ? `（${description}）` : "";
          insertAvatarChangeNotice(
            `${timeStr} ${charName} 換了新頭像${suffix}`,
            { url: avatarBase64, data: img.imageData, mimeType: img.imageMimeType },
          );
        }
        break;
      }
      case "reject":
        break;
      case "forced":
        showForceAvatarConfirm.value = true;
        break;
      case "mood": {
        if (!mood) break;
        const url = getMoodAvatarUrl(mood);
        if (url) {
          moodAvatarUrl.value = url;
          const moodInfo = MOOD_LABELS[mood] || { label: mood, emoji: "💭" };
          insertAvatarChangeNotice(
            `${timeStr} ${charName} 換了頭像（${moodInfo.label}中 ${moodInfo.emoji}）`,
          );
        }
        break;
      }
      case "restore": {
        if (moodAvatarUrl.value) {
          moodAvatarUrl.value = null;
          insertAvatarChangeNotice(`${timeStr} ${charName} 恢復了原本的頭像`);
        }
        break;
      }
    }

    await deps.saveChatImmediate();
  }

  async function confirmForceAvatar() {
    showForceAvatarConfirm.value = false;
    const img = findLastUserImage();
    const charName = deps.characterName || "角色";
    const timeStr = formatTimeStr();

    if (img && deps.currentCharacter.value) {
      // 解析實際的 base64 圖片數據：優先使用 imageData，若為 chatimg 引用則從 IDB 讀取
      let avatarBase64 = img.url;
      if (img.imageData && img.imageData.startsWith("data:")) {
        avatarBase64 = img.imageData;
      } else if (isChatImageRef(img.url)) {
        const resolved = await getChatImage(img.url);
        if (resolved) avatarBase64 = resolved;
      }
      if (img.imageData && isChatImageRef(img.imageData)) {
        const resolved = await getChatImage(img.imageData);
        if (resolved) avatarBase64 = resolved;
      }
      // 寫入聊天專屬覆蓋，不修改角色卡原始頭像
      deps.charAvatarOverride.value = avatarBase64;
      const desc = img.caption ? `（${img.caption}）` : "";
      insertAvatarChangeNotice(
        `${timeStr} 你幫 ${charName} 換了新頭像${desc}`,
        { url: avatarBase64, data: img.imageData, mimeType: img.imageMimeType },
      );
      await deps.saveChatImmediate();
    }
  }

  /** 解析圖片引用為實際 base64 */
  async function resolveImageUrl(url: string, imageData?: string): Promise<string> {
    if (imageData && imageData.startsWith("data:")) return imageData;
    if (imageData && isChatImageRef(imageData)) {
      const r = await getChatImage(imageData);
      if (r) return r;
    }
    if (isChatImageRef(url)) {
      const r = await getChatImage(url);
      if (r) return r;
    }
    return url;
  }

  async function handleCoupleAvatarAction(action: CoupleAvatarAction) {
    const charName = deps.characterName || "角色";
    const timeStr = formatTimeStr();

    switch (action.type) {
      case "crop": {
        const img = findLastUserImage();
        if (!img) {
          console.warn("[CoupleAvatar] crop: 找不到用戶圖片");
          break;
        }
        const srcUrl = await resolveImageUrl(img.url, img.imageData);
        try {
          const userCropped = await cropImageByPercent(
            srcUrl,
            action.userRect[0], action.userRect[1], action.userRect[2], action.userRect[3],
          );
          const charCropped = await cropImageByPercent(
            srcUrl,
            action.charRect[0], action.charRect[1], action.charRect[2], action.charRect[3],
          );
          const entry: CoupleAvatarEntry = {
            id: `ca_${Date.now()}`,
            name: action.name || `情頭_${deps.coupleAvatarLibrary.value.length + 1}`,
            description: action.description || "",
            userAvatar: userCropped,
            charAvatar: charCropped,
            sourceType: "single_crop",
            sourceImages: [srcUrl],
            createdAt: Date.now(),
            addedBy: "character",
            usedCount: 1,
          };
          deps.coupleAvatarLibrary.value.push(entry);
          deps.activeCoupleAvatarId.value = entry.id;
          deps.charAvatarOverride.value = charCropped;
          deps.userAvatarOverride.value = userCropped;
          insertAvatarChangeNotice(
            `${timeStr} ${charName} 製作了情頭「${entry.name}」`,
          );
        } catch (e) {
          console.error("[CoupleAvatar] crop 失敗:", e);
        }
        break;
      }
      case "collect": {
        const imgs = findLastUserImages(Math.max(action.userIndex, action.charIndex));
        const userImg = imgs[action.userIndex - 1];
        const charImg = imgs[action.charIndex - 1];
        if (!userImg || !charImg) {
          console.warn("[CoupleAvatar] collect: 圖片不足");
          break;
        }
        const userUrl = await resolveImageUrl(userImg.url, userImg.imageData);
        const charUrl = await resolveImageUrl(charImg.url, charImg.imageData);
        const entry: CoupleAvatarEntry = {
          id: `ca_${Date.now()}`,
          name: action.name || `情頭_${deps.coupleAvatarLibrary.value.length + 1}`,
          description: action.description || "",
          userAvatar: userUrl,
          charAvatar: charUrl,
          sourceType: "dual_direct",
          sourceImages: [userUrl, charUrl],
          createdAt: Date.now(),
          addedBy: "character",
          usedCount: 1,
        };
        deps.coupleAvatarLibrary.value.push(entry);
        deps.activeCoupleAvatarId.value = entry.id;
        deps.charAvatarOverride.value = charUrl;
        deps.userAvatarOverride.value = userUrl;
        insertAvatarChangeNotice(
          `${timeStr} ${charName} 設定了情頭「${entry.name}」`,
        );
        break;
      }
      case "apply": {
        const entry = deps.coupleAvatarLibrary.value.find(
          (e) => e.name === action.name,
        );
        if (entry) {
          entry.usedCount++;
          deps.activeCoupleAvatarId.value = entry.id;
          deps.charAvatarOverride.value = entry.charAvatar;
          deps.userAvatarOverride.value = entry.userAvatar;
          insertAvatarChangeNotice(
            `${timeStr} ${charName} 套用了情頭「${entry.name}」`,
          );
        } else {
          console.warn(`[CoupleAvatar] apply: 找不到情頭 "${action.name}"`);
        }
        break;
      }
      case "remove": {
        deps.activeCoupleAvatarId.value = null;
        deps.charAvatarOverride.value = undefined;
        deps.userAvatarOverride.value = undefined;
        insertAvatarChangeNotice(
          `${timeStr} ${charName} 移除了情頭`,
        );
        break;
      }
    }

    await deps.saveChatImmediate();
  }

  return {
    moodAvatarUrl,
    showForceAvatarConfirm,
    handleAvatarChange,
    confirmForceAvatar,
    findLastUserImage,
    handleCoupleAvatarAction,
  };
}
