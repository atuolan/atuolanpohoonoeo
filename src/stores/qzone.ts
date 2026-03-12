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
import type {
    AutoInteractionConfig,
    QZoneComment,
    QZonePost,
    QZoneSettings,
} from "@/types/qzone";
import { DEFAULT_AUTO_INTERACTION_CONFIG } from "@/types/qzone";
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
    chatContextCount: 10,
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
  ): Promise<QZonePost> {
    const newPost: QZonePost = {
      ...post,
      id: `post-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      timestamp: Date.now(),
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
    await saveQzonePost(newPost);
    console.log("[QZone] 新增動態:", newPost.id);

    // 如果是 AI 角色發文，發送通知
    if (post.authorType === "ai") {
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
  }

  /**
   * 刪除動態
   */
  async function deletePost(postId: string): Promise<void> {
    const index = posts.value.findIndex((p) => p.id === postId);
    if (index === -1) return;

    posts.value.splice(index, 1);
    await dbDeleteQzonePost(postId);
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
  }

  /**
   * 切換收藏
   */
  async function toggleBookmark(postId: string): Promise<void> {
    const post = posts.value.find((p) => p.id === postId);
    if (!post) return;

    post.bookmarked = !post.bookmarked;
    await saveQzonePost(post);
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
  ): Promise<QZoneComment> {
    const post = posts.value.find((p) => p.id === postId);
    if (!post) throw new Error("動態不存在");

    const newComment: QZoneComment = {
      ...comment,
      id: `comment-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      timestamp: Date.now(),
    };

    post.comments.push(newComment);
    post.commentCount = post.comments.length;

    await saveQzonePost(post);
    console.log("[QZone] 新增評論:", newComment.id);

    // 如果是 AI 角色回覆，發送通知
    if (comment.authorType === "ai") {
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
    console.log("[QZone] 刪除評論:", commentId);
  }

  // ============================================================
  // 設定操作
  // ============================================================

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
  }

  // ============================================================
  // 批量操作
  // ============================================================

  /**
   * 批量保存動態
   */
  async function savePosts(): Promise<void> {
    await saveQzonePosts(posts.value);
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
  }

  return {
    // 狀態
    posts,
    isLoading,
    isLoaded,
    settings,
    autoInteractionConfig,

    // 計算屬性
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
    updateSettings,
    updateAutoInteractionConfig,
    savePosts,
    getPostsByAuthor,
    init,
  };
});
