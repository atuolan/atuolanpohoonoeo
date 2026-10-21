/**
 * 發噗面板的狀態與送出：記住上次的可見範圍／回應設定，發出後依設定讓角色回應
 */

import type { ComposeState } from "@/components/plurk/types";
import { useBatchComments } from "@/composables/useBatchComments";
import { useQzoneStore } from "@/stores/qzone";
import { useUserStore } from "@/stores/user";
import type { PlurkComposeDefaults, QZonePost } from "@/types/qzone";
import { compressImage, compressionPresets } from "@/utils/imageCompression";
import { dayKey } from "@/utils/plurkDirectorConfig";
import { isBanActive } from "@/utils/plurkModeration";
import { anonQuotaLeft } from "@/utils/plurkSquare";
import { computed, reactive } from "vue";

const MAX_LENGTH = 360;

function readAsDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

export function usePlurkCompose() {
  const qzoneStore = useQzoneStore();
  const userStore = useUserStore();
  const { generateCommentsForPost } = useBatchComments();

  const state = reactive<ComposeState>({
    content: "",
    qualifier: "說",
    media: [],
    audience: "all",
    privateTo: [],
    replyPolicy: "ai",
    replyPickIds: [],
    allowPasserby: true,
    slowReplies: false,
  });

  function reset(): void {
    const settings = qzoneStore.settings;
    const persona = userStore.currentPersona;
    const saved = settings.composeDefaults;
    const d: PlurkComposeDefaults = saved ?? {
      audience: "all",
      replyPolicy: settings.autoAIReply === false ? "none" : "ai",
      allowPasserby: true,
      slowReplies: false,
    };
    // 第一次用新版：人設原本預設「只給群組看」就帶成私噗
    const groupOnly = !saved && persona?.qzoneSettings?.defaultVisibility === "group-only";

    state.content = "";
    state.qualifier = "說";
    state.media = [];
    // 上次用偷偷說、今天的額度又用完了：改回全員
    const anonBlocked = d.audience === "anon" && anonQuotaLeft(settings, Date.now()) <= 0;
    state.audience = groupOnly ? "private" : anonBlocked ? "all" : d.audience;
    state.privateTo = [...(persona?.boundCharacterIds ?? [])];
    state.replyPolicy = d.replyPolicy;
    state.replyPickIds = [];
    state.allowPasserby = d.allowPasserby;
    state.slowReplies = d.slowReplies;
  }

  const canPost = computed(() => {
    const length = state.content.trim().length;
    return length > 0 && length <= MAX_LENGTH;
  });

  /** 圖片照聊天圖片的規則壓縮，影片不壓；壓縮失敗用原檔 */
  async function addFiles(files: FileList): Promise<void> {
    for (const file of Array.from(files)) {
      const isVideo = file.type.startsWith("video/");
      if (!isVideo && !file.type.startsWith("image/")) continue;
      try {
        const url = isVideo ? await readAsDataURL(file) : await compressImage(file, compressionPresets.chatImage);
        state.media.push({ type: isVideo ? "video" : "image", url });
      } catch (error) {
        console.error("處理媒體文件失敗:", error);
        try {
          state.media.push({ type: isVideo ? "video" : "image", url: await readAsDataURL(file) });
        } catch {
          // 原檔也讀不到就略過
        }
      }
    }
  }

  function removeMedia(index: number): void {
    state.media.splice(index, 1);
  }

  async function submit(): Promise<QZonePost | null> {
    if (!canPost.value) return null;
    // 廣場禁言中：全員、偷偷說改成只給好友
    const banned = isBanActive(qzoneStore.settings.ban, Date.now());
    const audience = banned && (state.audience === "all" || state.audience === "anon") ? "friends" : state.audience;
    if (audience === "anon" && anonQuotaLeft(qzoneStore.settings, Date.now()) <= 0) return null;
    const persona = userStore.currentPersona;
    const images = state.media.filter((m) => m.type === "image").map((m) => m.url);
    const post = await qzoneStore.addPost({
      authorId: persona?.id || "user",
      username: persona?.name || qzoneStore.settings.nickname || "我",
      avatar: persona?.avatar || qzoneStore.settings.avatar || "",
      type: images.length ? "text_image" : "shuoshuo",
      content: state.content.trim(),
      qualifier: state.qualifier || undefined,
      images: images.length ? [...images] : undefined,
      media: state.media.length ? state.media.map((m) => ({ type: m.type, url: m.url })) : undefined,
      visibility: "public",
      authorType: "user",
      authorPersonaId: persona?.id,
      audience,
      privateTo: audience === "private" ? [...state.privateTo] : undefined,
      replyPolicy: state.replyPolicy,
      replyPickIds: state.replyPolicy === "pick" ? [...state.replyPickIds] : undefined,
      allowPasserby: state.allowPasserby,
      slowReplies: state.slowReplies,
    });
    if (audience === "anon") {
      const today = dayKey(Date.now());
      const quota = qzoneStore.settings.anonQuota;
      await qzoneStore.updateSettings({
        anonQuota: { day: today, count: (quota?.day === today ? quota.count : 0) + 1 },
      });
    }
    await qzoneStore.updateSettings({
      composeDefaults: {
        audience: state.audience,
        replyPolicy: state.replyPolicy,
        allowPasserby: state.allowPasserby,
        slowReplies: state.slowReplies,
      },
    });
    if (state.replyPolicy !== "none") {
      window.setTimeout(() => {
        void generateCommentsForPost(post.id).then((r) => {
          if (!r.success) console.warn("[PlurkCompose] 自動回應失敗:", r.error);
        });
      }, 500);
    }
    reset();
    return post;
  }

  return { state, reset, canPost, addFiles, removeMedia, submit };
}
