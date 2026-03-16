<template>
  <div class="theater-screen">
    <!-- 頂部導航 -->
    <div class="theater-header">
      <button class="back-btn" @click="$emit('back')">
        <svg
          viewBox="0 0 24 24"
          width="20"
          height="20"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
        >
          <path d="M19 12H5M12 19l-7-7 7-7" />
        </svg>
      </button>
      <div class="header-blogger-info">
        <img
          v-if="bloggerSettings.avatar"
          :src="bloggerSettings.avatar"
          class="blogger-avatar-small"
        />
        <div v-else class="blogger-avatar-placeholder">
          <svg
            viewBox="0 0 24 24"
            width="18"
            height="18"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <path
              d="M12 20h9M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"
            />
          </svg>
        </div>
        <span class="header-title">{{ bloggerSettings.name }}</span>
      </div>
      <button
        class="settings-btn"
        @click="showSettings = true"
        title="博主設定"
      >
        <svg
          viewBox="0 0 24 24"
          width="20"
          height="20"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
        >
          <circle cx="12" cy="12" r="3" />
          <path
            d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"
          />
        </svg>
      </button>
    </div>

    <!-- 詳情頁 -->
    <div v-if="selectedPost" class="theater-detail">
      <div class="detail-header">
        <button class="back-btn" @click="selectedPost = null">
          <svg
            viewBox="0 0 24 24"
            width="20"
            height="20"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
        </button>
        <span class="detail-title">小劇場</span>
      </div>

      <div class="detail-scroll">
        <!-- 博主資訊 -->
        <div class="detail-blogger">
          <img
            v-if="selectedPost.bloggerAvatar"
            :src="selectedPost.bloggerAvatar"
            class="detail-blogger-avatar"
          />
          <div v-else class="detail-blogger-avatar placeholder">
            <svg
              viewBox="0 0 24 24"
              width="20"
              height="20"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
            >
              <path
                d="M12 20h9M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"
              />
            </svg>
          </div>
          <div class="detail-blogger-info">
            <span class="detail-blogger-name">{{
              selectedPost.bloggerName
            }}</span>
            <span class="detail-time">{{
              formatTime(selectedPost.createdAt)
            }}</span>
          </div>
        </div>

        <!-- 角色配對標籤 -->
        <div class="detail-cast-tag">
          <img
            v-if="selectedPost.cast.characterAvatar"
            :src="selectedPost.cast.characterAvatar"
            class="cast-mini-avatar"
          />
          <span
            >{{ selectedPost.cast.characterName }} ×
            {{ selectedPost.cast.userName }}</span
          >
          <span v-if="selectedPost.isNsfw" class="nsfw-badge">NSFW</span>
        </div>

        <!-- 標題 -->
        <h2 class="detail-post-title">{{ selectedPost.title }}</h2>

        <!-- 正文（含 SMS 區塊） -->
        <div class="detail-content" v-html="renderContent(selectedPost)"></div>

        <!-- 續寫次數 -->
        <div
          v-if="selectedPost.continuationCount > 0"
          class="continuation-badge"
        >
          已續寫 {{ selectedPost.continuationCount }} 次
        </div>

        <!-- 互動欄 -->
        <div class="detail-actions">
          <button
            class="action-btn"
            :class="{ liked: selectedPost.liked }"
            @click="handleLike(selectedPost.id)"
          >
            <svg
              viewBox="0 0 24 24"
              width="20"
              height="20"
              :fill="selectedPost.liked ? 'currentColor' : 'none'"
              stroke="currentColor"
              stroke-width="2"
            >
              <path
                d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"
              />
            </svg>
            <span>{{ selectedPost.likeCount }}</span>
          </button>
          <button
            class="action-btn continue-btn"
            :disabled="theaterStore.isGenerating"
            @click="handleContinue(selectedPost)"
          >
            <svg
              viewBox="0 0 24 24"
              width="20"
              height="20"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
            >
              <path
                d="M12 20h9M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"
              />
            </svg>
            <span>續寫</span>
          </button>
          <button
            class="action-btn"
            :disabled="theaterStore.isGenerating"
            @click="handleCharComment(selectedPost)"
          >
            <svg
              viewBox="0 0 24 24"
              width="20"
              height="20"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
            >
              <path
                d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"
              />
            </svg>
            <span>角色評論</span>
          </button>
          <button
            class="action-btn delete-btn"
            @click="handleDelete(selectedPost.id)"
          >
            <svg
              viewBox="0 0 24 24"
              width="20"
              height="20"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
            >
              <path
                d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"
              />
            </svg>
          </button>
        </div>

        <!-- 評論區 -->
        <div class="detail-comments">
          <div class="comments-header">
            <span>評論 ({{ selectedPost.comments.length }})</span>
          </div>
          <div
            v-for="comment in selectedPost.comments"
            :key="comment.id"
            class="comment-item"
          >
            <img
              v-if="comment.authorAvatar"
              :src="comment.authorAvatar"
              class="comment-avatar"
            />
            <div v-else class="comment-avatar placeholder">
              <svg
                viewBox="0 0 24 24"
                width="14"
                height="14"
                fill="currentColor"
              >
                <path
                  d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 3c1.66 0 3 1.34 3 3s-1.34 3-3 3-3-1.34-3-3 1.34-3 3-3zm0 14.2c-2.5 0-4.71-1.28-6-3.22.03-1.99 4-3.08 6-3.08 1.99 0 5.97 1.09 6 3.08-1.29 1.94-3.5 3.22-6 3.22z"
                />
              </svg>
            </div>
            <div class="comment-body">
              <div class="comment-meta">
                <span class="comment-name" :class="comment.authorType">{{
                  comment.authorName
                }}</span>
                <span v-if="comment.replyToName" class="comment-reply-to">
                  回覆 @{{ comment.replyToName }}
                </span>
                <span class="comment-time">{{
                  formatTime(comment.timestamp)
                }}</span>
              </div>
              <div class="comment-text">{{ comment.content }}</div>
            </div>
            <button
              class="comment-delete-btn"
              title="刪除評論"
              @click="handleDeleteComment(selectedPost, comment.id)"
            >
              <svg
                viewBox="0 0 24 24"
                width="14"
                height="14"
                fill="currentColor"
              >
                <path
                  d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"
                />
              </svg>
            </button>
          </div>
          <div v-if="selectedPost.comments.length === 0" class="no-comments">
            還沒有評論，讓角色來說點什麼吧
          </div>
        </div>

        <!-- 用戶評論輸入 -->
        <div class="comment-input-bar">
          <input
            v-model="userCommentInput"
            type="text"
            placeholder="寫評論..."
            @keyup.enter="submitUserComment"
          />
          <button
            :disabled="!userCommentInput.trim()"
            @click="submitUserComment"
          >
            送出
          </button>
        </div>
      </div>
    </div>

    <!-- 主列表 -->
    <template v-else>
      <div class="theater-main" @scroll="handleScroll">
        <!-- 生成按鈕 -->
        <div class="generate-section">
          <button
            class="generate-btn"
            :disabled="theaterStore.isGenerating"
            @click="handleGenerate"
          >
            <svg
              v-if="!theaterStore.isGenerating"
              viewBox="0 0 24 24"
              width="22"
              height="22"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
            >
              <path
                d="M12 20h9M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"
              />
            </svg>
            <svg
              v-else
              class="spin"
              viewBox="0 0 24 24"
              width="22"
              height="22"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
            >
              <path d="M21 12a9 9 0 1 1-6.219-8.56" />
            </svg>
            <span>{{
              theaterStore.isGenerating ? "生成中..." : "隨機生成小劇場"
            }}</span>
          </button>
          <p class="generate-hint">從你的聊天列表中隨機抽取 char × user 配對</p>
        </div>

        <!-- 小劇場列表 -->
        <div v-if="theaterStore.sortedPosts.length > 0" class="post-list">
          <div
            v-for="post in theaterStore.sortedPosts"
            :key="post.id"
            class="post-card"
            @click="selectedPost = post"
          >
            <!-- 博主頭 -->
            <div class="post-card-header">
              <img
                v-if="post.bloggerAvatar"
                :src="post.bloggerAvatar"
                class="post-blogger-avatar"
              />
              <div v-else class="post-blogger-avatar placeholder">
                <svg
                  viewBox="0 0 24 24"
                  width="14"
                  height="14"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                >
                  <path
                    d="M12 20h9M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"
                  />
                </svg>
              </div>
              <div class="post-card-meta">
                <span class="post-blogger-name">{{ post.bloggerName }}</span>
                <span class="post-time">{{ formatTime(post.createdAt) }}</span>
              </div>
              <span v-if="post.isNsfw" class="nsfw-badge">NSFW</span>
            </div>

            <!-- 配對標籤 -->
            <div class="post-cast-line">
              <img
                v-if="post.cast.characterAvatar"
                :src="post.cast.characterAvatar"
                class="cast-tiny-avatar"
              />
              <img
                v-if="post.cast.userAvatar"
                :src="post.cast.userAvatar"
                class="cast-tiny-avatar"
              />
              <span class="cast-names"
                >{{ post.cast.characterName }} × {{ post.cast.userName }}</span
              >
            </div>

            <!-- 標題 + 預覽 -->
            <div class="post-card-title">{{ post.title }}</div>
            <div class="post-card-preview">{{ getPreview(post.content) }}</div>

            <!-- 底部互動 -->
            <div class="post-card-footer">
              <span class="footer-stat" :class="{ liked: post.liked }">
                <svg
                  viewBox="0 0 24 24"
                  width="14"
                  height="14"
                  :fill="post.liked ? 'currentColor' : 'none'"
                  stroke="currentColor"
                  stroke-width="2"
                >
                  <path
                    d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"
                  />
                </svg>
                {{ post.likeCount }}
              </span>
              <span class="footer-stat">
                <svg
                  viewBox="0 0 24 24"
                  width="14"
                  height="14"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                >
                  <path
                    d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"
                  />
                </svg>
                {{ post.comments.length }}
              </span>
              <span
                v-if="post.continuationCount > 0"
                class="footer-stat continued"
              >
                <svg
                  viewBox="0 0 24 24"
                  width="14"
                  height="14"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                >
                  <path
                    d="M12 20h9M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"
                  />
                </svg>
                續{{ post.continuationCount }}
              </span>
            </div>
          </div>
        </div>

        <!-- 空狀態 -->
        <div v-else class="empty-state">
          <svg
            viewBox="0 0 24 24"
            width="48"
            height="48"
            fill="none"
            stroke="currentColor"
            stroke-width="1.5"
            opacity="0.4"
          >
            <path
              d="M12 20h9M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"
            />
          </svg>
          <p>還沒有小劇場</p>
          <p class="empty-hint">點擊上方按鈕，讓博主為你的角色們寫一篇吧</p>
        </div>
      </div>
    </template>

    <!-- 博主設定彈窗 -->
    <div
      v-if="showSettings"
      class="settings-overlay"
      @click.self="showSettings = false"
    >
      <div class="settings-modal">
        <div class="settings-header">
          <span>博主設定</span>
          <button @click="showSettings = false">
            <svg
              viewBox="0 0 24 24"
              width="20"
              height="20"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
            >
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div class="settings-body">
          <label class="setting-field">
            <span>博主名稱</span>
            <input
              v-model="editingSettings.name"
              type="text"
              placeholder="小劇場製造機"
            />
          </label>
          <label class="setting-field">
            <span>博主簡介</span>
            <input
              v-model="editingSettings.bio"
              type="text"
              placeholder="專門寫同人小劇場..."
            />
          </label>
          <label class="setting-field">
            <span>允許 NSFW</span>
            <div class="toggle-wrapper">
              <button
                class="toggle-btn"
                :class="{ active: editingSettings.allowNsfw }"
                @click="editingSettings.allowNsfw = !editingSettings.allowNsfw"
              >
                <span class="toggle-knob"></span>
              </button>
            </div>
          </label>
          <label class="setting-field">
            <span>最小生成 Token</span>
            <input
              v-model.number="editingSettings.minTokens"
              type="number"
              min="500"
              max="8000"
              step="500"
            />
          </label>
          <label class="setting-field">
            <span>自動生成</span>
            <div class="toggle-wrapper">
              <button
                class="toggle-btn"
                :class="{ active: editingSettings.autoGenerate }"
                @click="
                  editingSettings.autoGenerate = !editingSettings.autoGenerate
                "
              >
                <span class="toggle-knob"></span>
              </button>
            </div>
          </label>
          <label v-if="editingSettings.autoGenerate" class="setting-field">
            <span>自動生成間隔（分鐘）</span>
            <input
              v-model.number="editingSettings.autoInterval"
              type="number"
              min="10"
              max="1440"
              step="10"
            />
          </label>
        </div>
        <div class="settings-footer">
          <button class="save-btn" @click="handleSaveSettings">保存</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import {
    continueTheater,
    generateCharComment,
    generateTheater,
    parseSmsBlocks,
    pickRandomCast,
    pickRandomTemplate,
    postTheaterToQzone,
} from "@/services/TheaterService";
import { useTheaterStore } from "@/stores/theater";
import { useUserStore } from "@/stores/user";
import type {
    TheaterBloggerSettings,
    TheaterComment,
    TheaterPost,
} from "@/types/theater";
import { DEFAULT_BLOGGER_SETTINGS } from "@/types/theater";
import { computed, onMounted, reactive, ref, watch } from "vue";

const props = defineProps<{
  initialPostId?: string;
}>();

const emit = defineEmits<{
  (e: "back"): void;
  (e: "post-opened"): void;
}>();

const theaterStore = useTheaterStore();
const userStore = useUserStore();

const selectedPost = ref<TheaterPost | null>(null);
const showSettings = ref(false);
const userCommentInput = ref("");
const editingSettings = reactive<TheaterBloggerSettings>({
  ...DEFAULT_BLOGGER_SETTINGS,
});

// 安全存取 bloggerSettings（store init 前使用默認值）
const bloggerSettings = computed(
  () => theaterStore.bloggerSettings ?? DEFAULT_BLOGGER_SETTINGS,
);

onMounted(async () => {
  await theaterStore.init();
  Object.assign(editingSettings, theaterStore.bloggerSettings);
  // 如果有指定 postId，自動打開對應內文
  if (props.initialPostId) {
    const target = theaterStore.posts.find((p) => p.id === props.initialPostId);
    if (target) {
      selectedPost.value = target;
    }
    emit("post-opened");
  }
});

// 監聽 prop 變化（同一組件實例下 prop 更新時）
watch(
  () => props.initialPostId,
  (newId) => {
    if (newId) {
      const target = theaterStore.posts.find((p) => p.id === newId);
      if (target) {
        selectedPost.value = target;
      }
      emit("post-opened");
    }
  },
);

// ===== 格式化 =====

function formatTime(ts: number): string {
  const d = new Date(ts);
  const now = new Date();
  const diff = now.getTime() - ts;
  if (diff < 60000) return "剛剛";
  if (diff < 3600000) return `${Math.floor(diff / 60000)} 分鐘前`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)} 小時前`;
  if (d.getFullYear() === now.getFullYear()) {
    return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}`;
  }
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`;
}

function getPreview(content: string): string {
  // 移除 SMS 標記，取前 80 字
  const clean = content
    .replace(/\[SMS_START\][\s\S]*?\[SMS_END\]/g, " [短信] ")
    .replace(/\n+/g, " ")
    .trim();
  return clean.length > 80 ? clean.slice(0, 80) + "..." : clean;
}

function renderContent(post: TheaterPost): string {
  let html = post.content;
  // 替換 SMS 區塊為 HTML
  let blockIdx = 0;
  html = html.replace(
    /\[SMS_START\]([\s\S]*?)\[SMS_END\]/g,
    (_match, inner: string) => {
      const block = post.smsBlocks[blockIdx++];
      if (!block) return "";
      return renderSmsBlock(block, post);
    },
  );
  // 基本 Markdown：粗體、斜體、換行
  html = html
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/\n/g, "<br/>");
  return html;
}

function renderSmsBlock(
  block: {
    participants: string[];
    messages: Array<{
      sender: string;
      isUser: boolean;
      content: string;
      time?: string;
    }>;
  },
  post: TheaterPost,
): string {
  const msgs = block.messages
    .map((m) => {
      const isUser = m.sender === post.cast.userName;
      const align = isUser ? "right" : "left";
      const bubbleClass = isUser ? "sms-bubble-user" : "sms-bubble-char";
      return `<div class="sms-row sms-${align}">
        <span class="sms-sender">${m.sender}</span>
        <div class="sms-bubble ${bubbleClass}">${m.content}</div>
      </div>`;
    })
    .join("");
  return `<div class="sms-block">${msgs}</div>`;
}

// ===== 操作 =====

async function handleGenerate() {
  theaterStore.isGenerating = true;
  try {
    const cast = await pickRandomCast();
    if (!cast) {
      alert("找不到有聊天記錄的角色配對，請先和角色聊天");
      return;
    }
    const template = pickRandomTemplate(
      theaterStore.bloggerSettings.preferredTemplates,
    );
    const post = await generateTheater({
      cast,
      template,
      bloggerName: theaterStore.bloggerSettings.name,
      bloggerAvatar: theaterStore.bloggerSettings.avatar,
      allowNsfw: theaterStore.bloggerSettings.allowNsfw,
      minTokens: theaterStore.bloggerSettings.minTokens,
    });
    if (post) {
      await theaterStore.addPost(post);
      // 在噗浪發布超連結貼文
      await postTheaterToQzone(post);
      selectedPost.value = post;
    }
  } catch (e) {
    console.error("[Theater] 生成失敗:", e);
  } finally {
    theaterStore.isGenerating = false;
  }
}

async function handleLike(postId: string) {
  await theaterStore.toggleLike(postId);
  // 如果點讚了，刷新 selectedPost 引用
  if (selectedPost.value?.id === postId) {
    selectedPost.value =
      theaterStore.posts.find((p) => p.id === postId) || null;
  }
}

async function handleContinue(post: TheaterPost) {
  theaterStore.isGenerating = true;
  try {
    const newContent = await continueTheater(post);
    if (newContent) {
      // 解析新的 SMS 區塊
      const newSmsBlocks = parseSmsBlocks(newContent);
      for (const block of newSmsBlocks) {
        for (const msg of block.messages) {
          msg.isUser = msg.sender === post.cast.userName;
        }
      }
      const updatedSmsBlocks = [...post.smsBlocks, ...newSmsBlocks];
      await theaterStore.appendContent(post.id, newContent);
      await theaterStore.updatePost(post.id, { smsBlocks: updatedSmsBlocks });
      // 刷新引用
      selectedPost.value =
        theaterStore.posts.find((p) => p.id === post.id) || null;
    }
  } finally {
    theaterStore.isGenerating = false;
  }
}

async function handleCharComment(post: TheaterPost) {
  theaterStore.isGenerating = true;
  try {
    const comment = await generateCharComment({
      charId: post.cast.characterId,
      post,
    });
    if (comment) {
      await theaterStore.addComment(post.id, comment);
      selectedPost.value =
        theaterStore.posts.find((p) => p.id === post.id) || null;
    }
  } finally {
    theaterStore.isGenerating = false;
  }
}

async function handleDelete(postId: string) {
  if (!confirm("確定要刪除這篇小劇場嗎？")) return;
  await theaterStore.deletePost(postId);
  selectedPost.value = null;
}

function submitUserComment() {
  if (!userCommentInput.value.trim() || !selectedPost.value) return;
  const comment: TheaterComment = {
    id: `tc-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
    authorId: userStore.currentPersonaId || "user",
    authorName: userStore.currentName,
    authorAvatar: userStore.currentAvatar,
    authorType: "user",
    content: userCommentInput.value.trim(),
    timestamp: Date.now(),
  };
  theaterStore.addComment(selectedPost.value.id, comment);
  selectedPost.value =
    theaterStore.posts.find((p) => p.id === selectedPost.value?.id) || null;
  userCommentInput.value = "";
}

async function handleDeleteComment(post: TheaterPost, commentId: string) {
  await theaterStore.removeComment(post.id, commentId);
  selectedPost.value = theaterStore.posts.find((p) => p.id === post.id) || null;
}

function handleSaveSettings() {
  theaterStore.updateBloggerSettings({ ...editingSettings });
  showSettings.value = false;
}

function handleScroll() {
  // 預留：可做無限滾動
}
</script>

<style scoped lang="scss">
.theater-screen {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--color-background, #f5f5f5);
  color: var(--color-text, #333);
  overflow: hidden;
}

// ===== Header =====
.theater-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 16px;
  padding-top: max(12px, var(--safe-top, 0px));
  background: var(--color-surface, #fff);
  border-bottom: 1px solid var(--color-border, #e0e0e0);
  flex-shrink: 0;
}

.back-btn,
.settings-btn {
  background: none;
  border: none;
  color: var(--color-text, #333);
  cursor: pointer;
  padding: 4px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  &:hover {
    background: var(--color-hover, rgba(0, 0, 0, 0.05));
  }
}

.header-blogger-info {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1;
}

.blogger-avatar-small,
.blogger-avatar-placeholder {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  object-fit: cover;
}

.blogger-avatar-placeholder {
  background: var(--color-primary, #7dd3a8);
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
}

.header-title {
  font-weight: 600;
  font-size: 16px;
}

// ===== Generate Section =====
.theater-main {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
}

.generate-section {
  text-align: center;
  margin-bottom: 20px;
}

.generate-btn {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 12px 24px;
  border: none;
  border-radius: 24px;
  background: var(--color-primary, #7dd3a8);
  color: #fff;
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
  transition: opacity 0.2s;
  &:hover:not(:disabled) {
    opacity: 0.85;
  }
  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
}

.generate-hint {
  font-size: 12px;
  color: var(--color-text-secondary, #999);
  margin-top: 6px;
}

.spin {
  animation: spin 1s linear infinite;
}
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

// ===== Post Card =====
.post-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.post-card {
  background: var(--color-surface, #fff);
  border-radius: 12px;
  padding: 14px;
  cursor: pointer;
  transition: transform 0.15s;
  &:active {
    transform: scale(0.98);
  }
}

.post-card-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}

.post-blogger-avatar {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  object-fit: cover;
  &.placeholder {
    background: var(--color-primary, #7dd3a8);
    display: flex;
    align-items: center;
    justify-content: center;
    color: #fff;
  }
}

.post-card-meta {
  flex: 1;
  display: flex;
  flex-direction: column;
}

.post-blogger-name {
  font-size: 13px;
  font-weight: 600;
}

.post-time {
  font-size: 11px;
  color: var(--color-text-secondary, #999);
}

.nsfw-badge {
  font-size: 10px;
  padding: 2px 6px;
  border-radius: 4px;
  background: #e53e3e;
  color: #fff;
  font-weight: 600;
}

.post-cast-line {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-bottom: 6px;
  font-size: 12px;
  color: var(--color-primary, #7dd3a8);
  font-weight: 500;
}

.cast-tiny-avatar {
  width: 18px;
  height: 18px;
  border-radius: 50%;
  object-fit: cover;
}

.cast-names {
  margin-left: 2px;
}

.post-card-title {
  font-size: 15px;
  font-weight: 600;
  margin-bottom: 4px;
  line-height: 1.4;
}

.post-card-preview {
  font-size: 13px;
  color: var(--color-text-secondary, #666);
  line-height: 1.5;
  margin-bottom: 8px;
}

.post-card-footer {
  display: flex;
  gap: 16px;
  font-size: 12px;
  color: var(--color-text-secondary, #999);
}

.footer-stat {
  display: flex;
  align-items: center;
  gap: 4px;
  &.liked {
    color: #e53e3e;
  }
  &.continued {
    color: var(--color-primary, #7dd3a8);
  }
}

// ===== Empty State =====
.empty-state {
  text-align: center;
  padding: 60px 20px;
  color: var(--color-text-secondary, #999);
  p {
    margin: 8px 0;
  }
}

.empty-hint {
  font-size: 13px;
}

// ===== Detail View =====
.theater-detail {
  display: flex;
  flex-direction: column;
  height: 100%;
  position: absolute;
  inset: 0;
  background: var(--color-background, #f5f5f5);
  z-index: 10;
}

.detail-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 16px;
  padding-top: max(12px, var(--safe-top, 0px));
  background: var(--color-surface, #fff);
  border-bottom: 1px solid var(--color-border, #e0e0e0);
  flex-shrink: 0;
}

.detail-title {
  font-weight: 600;
  font-size: 16px;
}

.detail-scroll {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
  padding-bottom: 80px;
}

.detail-blogger {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 12px;
}

.detail-blogger-avatar {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  object-fit: cover;
  &.placeholder {
    background: var(--color-primary, #7dd3a8);
    display: flex;
    align-items: center;
    justify-content: center;
    color: #fff;
  }
}

.detail-blogger-info {
  display: flex;
  flex-direction: column;
}

.detail-blogger-name {
  font-weight: 600;
  font-size: 14px;
}

.detail-time {
  font-size: 12px;
  color: var(--color-text-secondary, #999);
}

.detail-cast-tag {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  border-radius: 16px;
  background: var(--color-primary-light, rgba(125, 211, 168, 0.15));
  color: var(--color-primary, #7dd3a8);
  font-size: 13px;
  font-weight: 500;
  margin-bottom: 12px;
}

.cast-mini-avatar {
  width: 20px;
  height: 20px;
  border-radius: 50%;
  object-fit: cover;
}

.detail-post-title {
  font-size: 20px;
  font-weight: 700;
  margin-bottom: 16px;
  line-height: 1.4;
}

.detail-content {
  font-size: 15px;
  line-height: 1.8;
  word-break: break-word;
}

// ===== SMS Block (模擬手機短信) =====
:deep(.sms-block) {
  margin: 16px 0;
  padding: 12px;
  border-radius: 12px;
  background: var(--color-surface, #fff);
  border: 1px solid var(--color-border, #e0e0e0);
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.06);
}

:deep(.sms-row) {
  display: flex;
  flex-direction: column;
  margin-bottom: 8px;
  &:last-child {
    margin-bottom: 0;
  }
}

:deep(.sms-right) {
  align-items: flex-end;
}

:deep(.sms-left) {
  align-items: flex-start;
}

:deep(.sms-sender) {
  font-size: 11px;
  color: var(--color-text-secondary, #999);
  margin-bottom: 2px;
  padding: 0 4px;
}

:deep(.sms-bubble) {
  display: inline-block;
  max-width: 75%;
  padding: 8px 12px;
  border-radius: 16px;
  font-size: 14px;
  line-height: 1.5;
  word-break: break-word;
}

:deep(.sms-bubble-user) {
  background: var(--color-primary, #7dd3a8);
  color: #fff;
  border-bottom-right-radius: 4px;
}

:deep(.sms-bubble-char) {
  background: var(--color-surface, #e8e8e8);
  color: var(--color-text, #333);
  border-bottom-left-radius: 4px;
}

// ===== Continuation Badge =====
.continuation-badge {
  display: inline-block;
  margin-top: 16px;
  padding: 4px 10px;
  border-radius: 12px;
  background: var(--color-primary-light, rgba(125, 211, 168, 0.15));
  color: var(--color-primary, #7dd3a8);
  font-size: 12px;
  font-weight: 500;
}

// ===== Detail Actions =====
.detail-actions {
  display: flex;
  gap: 8px;
  margin-top: 20px;
  padding: 12px 0;
  border-top: 1px solid var(--color-border, #e0e0e0);
  border-bottom: 1px solid var(--color-border, #e0e0e0);
  flex-wrap: wrap;
}

.action-btn {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 6px 12px;
  border: 1px solid var(--color-border, #e0e0e0);
  border-radius: 20px;
  background: var(--color-surface, #fff);
  color: var(--color-text-secondary, #666);
  font-size: 13px;
  cursor: pointer;
  transition: all 0.2s;
  &:hover:not(:disabled) {
    background: var(--color-hover, rgba(0, 0, 0, 0.03));
  }
  &:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
  &.liked {
    color: #e53e3e;
    border-color: #e53e3e;
  }
  &.continue-btn:not(:disabled) {
    color: var(--color-primary, #7dd3a8);
    border-color: var(--color-primary, #7dd3a8);
  }
  &.delete-btn {
    color: #999;
    margin-left: auto;
  }
}

// ===== Comments =====
.detail-comments {
  margin-top: 16px;
}

.comments-header {
  font-size: 14px;
  font-weight: 600;
  margin-bottom: 12px;
}

.comment-item {
  display: flex;
  gap: 10px;
  margin-bottom: 14px;
}

.comment-avatar {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  object-fit: cover;
  flex-shrink: 0;
  &.placeholder {
    background: var(--color-surface, #e0e0e0);
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--color-text-secondary, #999);
  }
}

.comment-body {
  flex: 1;
  min-width: 0;
}

.comment-meta {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 2px;
  flex-wrap: wrap;
}

.comment-name {
  font-size: 13px;
  font-weight: 600;
  &.char {
    color: var(--color-primary, #7dd3a8);
  }
  &.blogger {
    color: #f5a9b8;
  }
}

.comment-reply-to {
  font-size: 11px;
  color: var(--color-text-secondary, #999);
}

.comment-time {
  font-size: 11px;
  color: var(--color-text-secondary, #999);
}

.comment-text {
  font-size: 14px;
  line-height: 1.5;
  word-break: break-word;
}

.comment-delete-btn {
  flex-shrink: 0;
  align-self: flex-start;
  margin-top: 2px;
  background: none;
  border: none;
  color: var(--color-text-secondary, #999);
  cursor: pointer;
  padding: 4px;
  border-radius: 4px;
  transition: color 0.15s;
  &:hover {
    color: #e74c3c;
  }
}

.no-comments {
  text-align: center;
  padding: 20px;
  color: var(--color-text-secondary, #999);
  font-size: 13px;
}

// ===== Comment Input =====
.comment-input-bar {
  position: sticky;
  bottom: 0;
  display: flex;
  gap: 8px;
  padding: 12px 16px;
  background: var(--color-surface, #fff);
  border-top: 1px solid var(--color-border, #e0e0e0);

  input {
    flex: 1;
    padding: 8px 14px;
    border: 1px solid var(--color-border, #e0e0e0);
    border-radius: 20px;
    font-size: 14px;
    background: var(--color-background, #f5f5f5);
    color: var(--color-text, #333);
    outline: none;
    &:focus {
      border-color: var(--color-primary, #7dd3a8);
    }
  }

  button {
    padding: 8px 16px;
    border: none;
    border-radius: 20px;
    background: var(--color-primary, #7dd3a8);
    color: #fff;
    font-size: 14px;
    cursor: pointer;
    &:disabled {
      opacity: 0.4;
      cursor: not-allowed;
    }
  }
}

// ===== Settings Modal =====
.settings-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
}

.settings-modal {
  background: var(--color-surface, #fff);
  border-radius: 16px;
  width: 90%;
  max-width: 360px;
  overflow: hidden;
}

.settings-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 16px;
  border-bottom: 1px solid var(--color-border, #e0e0e0);
  font-weight: 600;
  font-size: 16px;

  button {
    background: none;
    border: none;
    color: var(--color-text, #333);
    cursor: pointer;
    padding: 4px;
  }
}

.settings-body {
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.setting-field {
  display: flex;
  flex-direction: column;
  gap: 4px;

  > span {
    font-size: 13px;
    font-weight: 500;
    color: var(--color-text-secondary, #666);
  }

  input[type="text"],
  input[type="number"] {
    padding: 8px 12px;
    border: 1px solid var(--color-border, #e0e0e0);
    border-radius: 8px;
    font-size: 14px;
    background: var(--color-background, #f5f5f5);
    color: var(--color-text, #333);
    outline: none;
    &:focus {
      border-color: var(--color-primary, #7dd3a8);
    }
  }
}

.toggle-wrapper {
  display: flex;
  align-items: center;
}

.toggle-btn {
  width: 44px;
  height: 24px;
  border-radius: 12px;
  border: none;
  background: var(--color-border, #ccc);
  cursor: pointer;
  position: relative;
  transition: background 0.2s;

  &.active {
    background: var(--color-primary, #7dd3a8);
  }
}

.toggle-knob {
  position: absolute;
  top: 2px;
  left: 2px;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: #fff;
  transition: transform 0.2s;

  .active & {
    transform: translateX(20px);
  }
}

.settings-footer {
  padding: 12px 16px;
  border-top: 1px solid var(--color-border, #e0e0e0);
  display: flex;
  justify-content: flex-end;
}

.save-btn {
  padding: 8px 24px;
  border: none;
  border-radius: 20px;
  background: var(--color-primary, #7dd3a8);
  color: #fff;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  &:hover {
    opacity: 0.85;
  }
}
</style>
