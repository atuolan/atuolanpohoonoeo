/**
 * 噗浪空間 Store
 * 管理噗浪動態的狀態和持久化
 */

import {
    deleteQzonePost as dbDeleteQzonePost,
    getAllQzonePosts,
    getQzonePostsByAuthor,
    getSetting,
    saveQzonePost,
    saveQzonePosts,
    saveSetting,
} from "@/db/operations";
import {
  recordDeletedEntity,
  scheduleSelfHostedAutoSync,
} from "@/services/selfHostedSyncState";
import type {
    AutoInteractionConfig,
    PlurkBan,
    PlurkSystemNotice,
    QZoneComment,
    QZonePost,
    QZoneSettings,
} from "@/types/qzone";
import { DEFAULT_AUTO_INTERACTION_CONFIG } from "@/types/qzone";
import { DEFAULT_DIRECTOR_CONFIG, migrateDirectorConfig, type PlurkDirectorConfig } from "@/utils/plurkDirectorConfig";
import { isPostFollowed } from "@/utils/plurkRiver";
import { makeNoticeId, withNotice } from "@/utils/plurkModeration";
import { defineStore } from "pinia";
import { computed, ref } from "vue";
import { useNotificationStore } from "./notification";

export const useQzoneStore = defineStore("qzone", () => {
  // ============================================================
  // 狀態
  // ============================================================

  const posts = ref<QZonePost[]>([]);
  const isLoading = ref(false);
  const isLoaded = ref(false);

  // 空間設定
  const settings = ref<QZoneSettings>({
    nickname: "",
    avatar: "",
    background: "",
    themeMode: "auto",
    autoAIReply: true,
    enableChatContext: true,
    chatContextCount: 15,
  });

  // 自動互動配置
  const autoInteractionConfig = ref<AutoInteractionConfig>(
    DEFAULT_AUTO_INTERACTION_CONFIG,
  );

  // ============================================================
  // 計算屬性
  // ============================================================

  // 按時間排序的動態（最新在前）
  const sortedPosts = computed(() => {
    return [...posts.value].sort((a, b) => b.timestamp - a.timestamp);
  });

  // 動態數量
  const postCount = computed(() => posts.value.length);

  /** AI 導演設定（沒有時從舊設定組出來；之後才加的欄位用預設補上） */
  const directorConfig = computed<PlurkDirectorConfig>(() =>
    settings.value.director
      ? { ...DEFAULT_DIRECTOR_CONFIG, ...settings.value.director }
      : migrateDirectorConfig(settings.value, autoInteractionConfig.value),
  );

  // ============================================================
  // 載入方法
  // ============================================================

  /**
   * 從 IndexedDB 載入所有動態
   */
  async function loadPosts(): Promise<void> {
    if (isLoaded.value) return;

    isLoading.value = true;
    try {
      const loadedPosts = await getAllQzonePosts();
      posts.value = loadedPosts;
      isLoaded.value = true;
      console.log(`[QZone] 已載入 ${loadedPosts.length} 條動態`);
    } catch (error) {
      console.error("[QZone] 載入動態失敗:", error);
    } finally {
      isLoading.value = false;
    }
  }

  /**
   * 載入設定
   */
  async function loadSettings(): Promise<void> {
    try {
      const savedSettings = await getSetting<QZoneSettings>("qzone-settings");
      if (savedSettings) {
        settings.value = { ...settings.value, ...savedSettings };
      }

      const savedConfig = await getSetting<AutoInteractionConfig>(
        "qzone-auto-interaction",
      );
      if (savedConfig) {
        autoInteractionConfig.value = {
          ...DEFAULT_AUTO_INTERACTION_CONFIG,
          ...savedConfig,
        };
      }

      console.log("[QZone] 設定已載入");
    } catch (error) {
      console.error("[QZone] 載入設定失敗:", error);
    }
  }

  // ============================================================
  // 動態操作
  // ============================================================

  /**
   * 新增動態
   */
  async function addPost(
    post: Omit<QZonePost, "id" | "timestamp" | "comments" | "likes">,
    opts: { timestamp?: number } = {},
  ): Promise<QZonePost> {
    const newPost: QZonePost = {
      ...post,
      id: `post-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      timestamp: opts.timestamp ?? Date.now(),
      comments: [],
      likes: [],
      likeCount: 0,
      commentCount: 0,
      repostCount: 0,
      views: 0,
      bookmarked: false,
      reposted: false,
      emoticons: post.emoticons || {},
    };

    posts.value.unshift(newPost);
    try {
      await saveQzonePost(newPost);
      scheduleSelfHostedAutoSync();
    } catch (e) {
      console.error("[QZone] 儲存動態到 IndexedDB 失敗:", e, "動態 ID:", newPost.id);
      // 即使儲存失敗，動態仍在記憶體中，不移除
    }
    console.log("[QZone] 新增動態:", newPost.id, "內容:", newPost.content?.substring(0, 50));

    // AI 角色發文才通知；廣場路人、角色的偷偷說不通知
    if (post.authorType === "ai" && !post.onSquare && !post.anonOf) {
      try {
        const notificationStore = useNotificationStore();
        notificationStore.notifyQzonePost(
          post.username || "角色",
          post.avatar,
          post.authorId,
        );
      } catch (e) {
        // 通知失敗不影響主流程
        console.warn("[QZone] 發送通知失敗:", e);
      }
    }

    return newPost;
  }

  /**
   * 更新動態
   */
  async function updatePost(
    postId: string,
    updates: Partial<QZonePost>,
  ): Promise<void> {
    const index = posts.value.findIndex((p) => p.id === postId);
    if (index === -1) return;

    posts.value[index] = { ...posts.value[index], ...updates };
    await saveQzonePost(posts.value[index]);
    scheduleSelfHostedAutoSync();
  }

  /**
   * 刪除動態
   */
  async function deletePost(postId: string): Promise<void> {
    const index = posts.value.findIndex((p) => p.id === postId);
    if (index === -1) return;

    const removedPost = JSON.parse(JSON.stringify(posts.value[index]));
    const deletedAt = Date.now();
    await recordDeletedEntity({
      entityType: "qzone_post",
      entityId: postId,
      updatedAt: deletedAt,
      deletedAt,
      payload: removedPost,
    });
    posts.value.splice(index, 1);
    await dbDeleteQzonePost(postId);
    scheduleSelfHostedAutoSync();
    console.log("[QZone] 刪除動態:", postId);
  }

  /**
   * 點讚/取消點讚
   */
  async function toggleLike(
    postId: string,
    userId: string = "user",
  ): Promise<void> {
    const post = posts.value.find((p) => p.id === postId);
    if (!post) return;

    const likeIndex = post.likes.indexOf(userId);
    if (likeIndex === -1) {
      post.likes.push(userId);
      post.likeCount = (post.likeCount || 0) + 1;
      post.liked = true;
    } else {
      post.likes.splice(likeIndex, 1);
      post.likeCount = Math.max(0, (post.likeCount || 1) - 1);
      post.liked = false;
    }

    await saveQzonePost(post);
    scheduleSelfHostedAutoSync();
  }

  /**
   * 添加表情回應
   */
  async function addEmoticon(postId: string, emoji: string): Promise<void> {
    const post = posts.value.find((p) => p.id === postId);
    if (!post) return;

    if (!post.emoticons) {
      post.emoticons = {};
    }
    post.emoticons[emoji] = (post.emoticons[emoji] || 0) + 1;

    await saveQzonePost(post);
    scheduleSelfHostedAutoSync();
  }

  /**
   * 切換收藏
   */
  async function toggleBookmark(postId: string): Promise<void> {
    const post = posts.value.find((p) => p.id === postId);
    if (!post) return;

    post.bookmarked = !post.bookmarked;
    await saveQzonePost(post);
    scheduleSelfHostedAutoSync();
  }

  // ============================================================
  // 評論操作
  // ============================================================

  /**
   * 添加評論
   */
  async function addComment(
    postId: string,
    comment: Omit<QZoneComment, "id" | "timestamp">,
    opts: { timestamp?: number } = {},
  ): Promise<QZoneComment> {
    const post = posts.value.find((p) => p.id === postId);
    if (!post) throw new Error("動態不存在");

    const now = Date.now();
    const newComment: QZoneComment = {
      ...comment,
      id: `comment-${now}-${Math.random().toString(36).substr(2, 9)}`,
      timestamp: opts.timestamp ?? now,
    };

    post.comments.push(newComment);
    post.commentCount = post.comments.length;

    await saveQzonePost(post);
    scheduleSelfHostedAutoSync();
    console.log("[QZone] 新增評論:", newComment.id);

    // 追蹤中的噗、AI 回應立刻出現時才通知；排到之後的由 plurkReveal 到點再通知
    if (comment.authorType === "ai" && newComment.timestamp <= now && !post.muted && isPostFollowed(post)) {
      try {
        const notificationStore = useNotificationStore();
        notificationStore.notifyQzoneComment(
          comment.username || "角色",
          comment.avatar,
          comment.authorId,
        );
      } catch (e) {
        console.warn("[QZone] 發送通知失敗:", e);
      }
    }

    return newComment;
  }

  /**
   * 刪除評論
   */
  async function deleteComment(
    postId: string,
    commentId: string,
  ): Promise<void> {
    const post = posts.value.find((p) => p.id === postId);
    if (!post) return;

    const commentIndex = post.comments.findIndex((c) => c.id === commentId);
    if (commentIndex === -1) return;

    post.comments.splice(commentIndex, 1);
    post.commentCount = post.comments.length;

    await saveQzonePost(post);
    scheduleSelfHostedAutoSync();
    console.log("[QZone] 刪除評論:", commentId);
  }

  // ============================================================
  // 設定操作
  // ============================================================

  /** 單則重生：只換內容與發語詞 */
  async function updateComment(
    postId: string,
    commentId: string,
    updates: Partial<Pick<QZoneComment, "content" | "qualifier" | "moderation">>,
  ): Promise<void> {
    const post = posts.value.find((p) => p.id === postId);
    const comment = post?.comments.find((c) => c.id === commentId);
    if (!post || !comment) return;
    Object.assign(comment, updates);
    await saveQzonePost(post);
    scheduleSelfHostedAutoSync();
  }

  /** 打開回應串時呼叫：之前的回應都算看過（已讀是每台裝置各自的，不觸發同步） */
  async function markPostSeen(postId: string): Promise<void> {
    const post = posts.value.find((p) => p.id === postId);
    if (!post) return;
    post.seenAt = Date.now();
    await saveQzonePost(post);
  }

  /** 全部已讀：只動設定，不必逐則寫入 */
  async function markAllSeen(): Promise<void> {
    await updateSettings({ unreadSince: Date.now() });
  }

  async function setPostMuted(postId: string, muted: boolean): Promise<void> {
    const post = posts.value.find((p) => p.id === postId);
    if (!post) return;
    post.muted = muted;
    await saveQzonePost(post);
    scheduleSelfHostedAutoSync();
  }

  /** 加一則系統通知（版主處分、禁言、公告、申訴結果） */
  async function addSystemNotice(notice: Omit<PlurkSystemNotice, "id" | "at"> & { at?: number }): Promise<void> {
    const full: PlurkSystemNotice = { ...notice, id: makeNoticeId(), at: notice.at ?? Date.now() };
    await updateSettings({ systemNotices: withNotice(settings.value.systemNotices, full) });
  }

  /** 設定或解除（undefined）廣場禁言 */
  async function setBan(ban: PlurkBan | undefined): Promise<void> {
    await updateSettings({ ban });
  }

  /** 角色按讚：每人一次 */
  async function addLikeEvent(postId: string, by: string, at: number): Promise<void> {
    const post = posts.value.find((p) => p.id === postId);
    if (!post || post.likeEvents?.some((e) => e.by === by)) return;
    post.likeEvents = [...(post.likeEvents ?? []), { by, at }];
    await saveQzonePost(post);
    scheduleSelfHostedAutoSync();
  }

  async function updateDirector(updates: Partial<PlurkDirectorConfig>): Promise<void> {
    await updateSettings({ director: { ...directorConfig.value, ...updates } });
  }

  /**
   * 更新設定
   */
  async function updateSettings(
    updates: Partial<QZoneSettings>,
  ): Promise<void> {
    settings.value = { ...settings.value, ...updates };
    // 轉換為純物件以避免 DataCloneError
    const plainSettings = JSON.parse(JSON.stringify(settings.value));
    await saveSetting("qzone-settings", plainSettings);
    scheduleSelfHostedAutoSync();
  }

  /**
   * 更新自動互動配置
   */
  async function updateAutoInteractionConfig(
    updates: Partial<AutoInteractionConfig>,
  ): Promise<void> {
    autoInteractionConfig.value = {
      ...autoInteractionConfig.value,
      ...updates,
    };
    // 轉換為純物件以避免 DataCloneError
    const plainConfig = JSON.parse(JSON.stringify(autoInteractionConfig.value));
    await saveSetting("qzone-auto-interaction", plainConfig);
    scheduleSelfHostedAutoSync();
  }

  // ============================================================
  // 批量操作
  // ============================================================

  /**
   * 批量保存動態
   */
  async function savePosts(): Promise<void> {
    await saveQzonePosts(posts.value);
    scheduleSelfHostedAutoSync();
    console.log("[QZone] 已保存所有動態");
  }

  /**
   * 根據作者獲取動態
   */
  async function getPostsByAuthor(authorId: string): Promise<QZonePost[]> {
    return getQzonePostsByAuthor(authorId);
  }

  // ============================================================
  // 初始化
  // ============================================================

  /**
   * 初始化 store
   */
  async function init(): Promise<void> {
    await Promise.all([loadPosts(), loadSettings()]);
    // 第一次用新版：之前的回應都當已讀，不要一開就一堆未讀
    if (!settings.value.unreadSince) {
      await updateSettings({ unreadSince: Date.now() });
    }
    if (!settings.value.director) {
      await updateSettings({ director: directorConfig.value });
    }
  }

  return {
    // 狀態
    posts,
    isLoading,
    isLoaded,
    settings,
    autoInteractionConfig,

    // 計算屬性
    directorConfig,
    sortedPosts,
    postCount,

    // 方法
    loadPosts,
    loadSettings,
    addPost,
    updatePost,
    deletePost,
    toggleLike,
    addEmoticon,
    toggleBookmark,
    addComment,
    deleteComment,
    updateComment,
    markPostSeen,
    markAllSeen,
    setPostMuted,
    updateSettings,
    updateAutoInteractionConfig,
    updateDirector,
    addSystemNotice,
    setBan,
    addLikeEvent,
    savePosts,
    getPostsByAuthor,
    init,
  };
});
