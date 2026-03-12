/**
 * 小劇場 Store
 * 管理小劇場博主的狀態、持久化和自動生成定時器
 */

import { getSetting, saveSetting } from "@/db/operations";
import {
    generateTheater,
    pickRandomCast,
    pickRandomTemplate,
    postTheaterToQzone,
} from "@/services/TheaterService";
import type {
    TheaterBloggerSettings,
    TheaterComment,
    TheaterPost,
} from "@/types/theater";
import { DEFAULT_BLOGGER_SETTINGS } from "@/types/theater";
import { defineStore } from "pinia";
import { computed, ref } from "vue";

const THEATER_POSTS_KEY = "theater-posts";
const THEATER_SETTINGS_KEY = "theater-blogger-settings";

export const useTheaterStore = defineStore("theater", () => {
  // ============================================================
  // 狀態
  // ============================================================

  const posts = ref<TheaterPost[]>([]);
  const bloggerSettings = ref<TheaterBloggerSettings>({
    ...DEFAULT_BLOGGER_SETTINGS,
  });
  const isLoading = ref(false);
  const isLoaded = ref(false);
  const isGenerating = ref(false);

  // 自動生成定時器
  let autoGenerateTimer: ReturnType<typeof setInterval> | null = null;

  // ============================================================
  // 計算屬性
  // ============================================================

  const sortedPosts = computed(() =>
    [...posts.value].sort((a, b) => b.updatedAt - a.updatedAt),
  );

  const postCount = computed(() => posts.value.length);

  const likedPosts = computed(() =>
    posts.value
      .filter((p) => p.liked)
      .sort((a, b) => b.updatedAt - a.updatedAt),
  );

  // ============================================================
  // 載入 / 保存
  // ============================================================

  async function loadData(): Promise<void> {
    if (isLoaded.value) return;
    isLoading.value = true;
    try {
      const [savedPosts, savedSettings] = await Promise.all([
        getSetting<TheaterPost[]>(THEATER_POSTS_KEY),
        getSetting<TheaterBloggerSettings>(THEATER_SETTINGS_KEY),
      ]);
      if (savedPosts) posts.value = savedPosts;
      if (savedSettings) {
        bloggerSettings.value = {
          ...DEFAULT_BLOGGER_SETTINGS,
          ...savedSettings,
        };
      }
      isLoaded.value = true;
      console.log(`[Theater] 已載入 ${posts.value.length} 篇小劇場`);
    } catch (e) {
      console.error("[Theater] 載入失敗:", e);
    } finally {
      isLoading.value = false;
    }
  }

  async function savePosts(): Promise<void> {
    try {
      const plain = JSON.parse(JSON.stringify(posts.value));
      await saveSetting(THEATER_POSTS_KEY, plain);
    } catch (e) {
      console.error("[Theater] 保存失敗:", e);
    }
  }

  async function saveSettings(): Promise<void> {
    try {
      const plain = JSON.parse(JSON.stringify(bloggerSettings.value));
      await saveSetting(THEATER_SETTINGS_KEY, plain);
    } catch (e) {
      console.error("[Theater] 保存設定失敗:", e);
    }
  }

  // ============================================================
  // 動態操作
  // ============================================================

  async function addPost(post: TheaterPost): Promise<void> {
    posts.value.unshift(post);
    await savePosts();
  }

  async function updatePost(
    postId: string,
    updates: Partial<TheaterPost>,
  ): Promise<void> {
    const idx = posts.value.findIndex((p) => p.id === postId);
    if (idx === -1) return;
    posts.value[idx] = {
      ...posts.value[idx],
      ...updates,
      updatedAt: Date.now(),
    };
    await savePosts();
  }

  async function deletePost(postId: string): Promise<void> {
    posts.value = posts.value.filter((p) => p.id !== postId);
    await savePosts();
  }

  async function toggleLike(postId: string): Promise<void> {
    const post = posts.value.find((p) => p.id === postId);
    if (!post) return;
    post.liked = !post.liked;
    post.likeCount += post.liked ? 1 : -1;
    post.updatedAt = Date.now();
    await savePosts();
  }

  async function addComment(
    postId: string,
    comment: TheaterComment,
  ): Promise<void> {
    const post = posts.value.find((p) => p.id === postId);
    if (!post) return;
    post.comments.push(comment);
    post.updatedAt = Date.now();
    await savePosts();
  }

  async function removeComment(
    postId: string,
    commentId: string,
  ): Promise<void> {
    const post = posts.value.find((p) => p.id === postId);
    if (!post) return;
    post.comments = post.comments.filter((c) => c.id !== commentId);
    post.updatedAt = Date.now();
    await savePosts();
  }

  async function appendContent(
    postId: string,
    newContent: string,
  ): Promise<void> {
    const post = posts.value.find((p) => p.id === postId);
    if (!post) return;
    post.content += "\n\n---\n\n" + newContent;
    post.continuationCount += 1;
    post.status = "continued";
    post.updatedAt = Date.now();
    await savePosts();
  }

  async function updateBloggerSettings(
    updates: Partial<TheaterBloggerSettings>,
  ): Promise<void> {
    bloggerSettings.value = { ...bloggerSettings.value, ...updates };
    await saveSettings();

    // 每次保存設定都重新同步定時器
    syncAutoGenerateTimer();
  }

  // ============================================================
  // 自動生成定時器
  // ============================================================

  /**
   * 執行一次自動生成
   */
  async function runAutoGenerate(): Promise<void> {
    if (isGenerating.value) {
      console.log("[Theater] 已有生成任務進行中，跳過自動生成");
      return;
    }

    console.log("[Theater] 自動生成定時器觸發，開始生成小劇場...");
    isGenerating.value = true;

    try {
      const cast = await pickRandomCast();
      if (!cast) {
        console.warn("[Theater] 找不到可用的角色配對，跳過自動生成");
        return;
      }

      const template = pickRandomTemplate(
        bloggerSettings.value.preferredTemplates,
      );
      const post = await generateTheater({
        cast,
        template,
        bloggerName: bloggerSettings.value.name,
        bloggerAvatar: bloggerSettings.value.avatar,
        allowNsfw: bloggerSettings.value.allowNsfw,
        minTokens: bloggerSettings.value.minTokens,
      });

      if (post) {
        await addPost(post);
        await postTheaterToQzone(post);
        console.log("[Theater] 自動生成完成:", post.title);
      } else {
        console.warn("[Theater] 自動生成返回 null，可能 API 未設定");
      }
    } catch (e) {
      console.error("[Theater] 自動生成失敗:", e);
    } finally {
      isGenerating.value = false;
    }
  }

  /**
   * 同步自動生成定時器狀態
   */
  function syncAutoGenerateTimer(): void {
    // 先清除舊的
    if (autoGenerateTimer) {
      clearInterval(autoGenerateTimer);
      autoGenerateTimer = null;
      console.log("[Theater] 已清除舊的自動生成定時器");
    }

    // 如果啟用，啟動新的
    if (bloggerSettings.value.autoGenerate) {
      const intervalMin = bloggerSettings.value.autoInterval || 120;
      const intervalMs = intervalMin * 60 * 1000;
      autoGenerateTimer = setInterval(() => {
        console.log(`[Theater] 定時器觸發 (每 ${intervalMin} 分鐘)`);
        runAutoGenerate();
      }, intervalMs);
      console.log(
        `[Theater] 自動生成定時器已啟動，間隔 ${intervalMin} 分鐘 (${intervalMs}ms)，下次觸發: ${new Date(Date.now() + intervalMs).toLocaleTimeString()}`,
      );
    } else {
      console.log("[Theater] 自動生成已關閉");
    }
  }

  /**
   * 停止自動生成定時器
   */
  function stopAutoGenerate(): void {
    if (autoGenerateTimer) {
      clearInterval(autoGenerateTimer);
      autoGenerateTimer = null;
    }
  }

  // ============================================================
  // 初始化
  // ============================================================

  async function init(): Promise<void> {
    await loadData();
    // 載入後同步定時器
    syncAutoGenerateTimer();
  }

  return {
    posts,
    bloggerSettings,
    isLoading,
    isLoaded,
    isGenerating,
    sortedPosts,
    postCount,
    likedPosts,
    loadData,
    addPost,
    updatePost,
    deletePost,
    toggleLike,
    addComment,
    removeComment,
    appendContent,
    updateBloggerSettings,
    savePosts,
    saveSettings,
    runAutoGenerate,
    syncAutoGenerateTimer,
    stopAutoGenerate,
    init,
  };
});
