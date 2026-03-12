import { ref, type Ref, type ComputedRef } from "vue";
import { useCharactersStore } from "@/stores";

/**
 * 換頭像處理功能
 * 從 ChatScreen.vue 抽取的獨立 composable
 */
export function useChatAvatarChange(deps: {
  messages: Ref<any[]>;
  currentCharacter: ComputedRef<any>;
  characterName: string;
  saveChatImmediate: () => Promise<void>;
}) {
  const charactersStore = useCharactersStore();

  const moodAvatarUrl = ref<string | null>(null);
  const showForceAvatarConfirm = ref(false);

  const MOOD_LABELS: Record<string, { label: string; emoji: string }> = {
    angry: { label: "生氣", emoji: "😠" },
    sad: { label: "難過", emoji: "😢" },
  };

  function getMoodAvatarUrl(mood: string): string | null {
    const char = deps.currentCharacter.value;
    if (!char) return null;
    const config = (char as any).moodAvatars as
      | { baseUrl?: string; avatars?: Record<string, string> }
      | undefined;
    if (!config?.avatars?.[mood]) return null;
    const filename = config.avatars[mood];
    if (filename.startsWith("http")) return filename;
    return config.baseUrl ? `${config.baseUrl}/${filename}` : null;
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
          await charactersStore.updateCharacter(deps.currentCharacter.value.id, {
            avatar: img.url,
          });
          const description = desc || img.caption || "";
          const suffix = description ? `（${description}）` : "";
          insertAvatarChangeNotice(
            `${timeStr} ${charName} 換了新頭像${suffix}`,
            { url: img.url, data: img.imageData, mimeType: img.imageMimeType },
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
      await charactersStore.updateCharacter(deps.currentCharacter.value.id, {
        avatar: img.url,
      });
      const desc = img.caption ? `（${img.caption}）` : "";
      insertAvatarChangeNotice(
        `${timeStr} 你幫 ${charName} 換了新頭像${desc}`,
        { url: img.url, data: img.imageData, mimeType: img.imageMimeType },
      );
      await deps.saveChatImmediate();
    }
  }

  return {
    moodAvatarUrl,
    showForceAvatarConfirm,
    handleAvatarChange,
    confirmForceAvatar,
    findLastUserImage,
  };
}
