<template>
  <Teleport to="body">
    <Transition name="modal">
      <div v-if="visible" class="chat-info-overlay" @click.self="close">
        <div class="chat-info-modal">
          <!-- 標題 -->
          <header class="modal-header">
            <h2>{{ isGroupChat ? "群聊資訊" : "聊天資訊" }}</h2>
            <button class="close-btn" @click="close">
              <svg viewBox="0 0 24 24" fill="currentColor">
                <path
                  d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"
                />
              </svg>
            </button>
          </header>

          <!-- 內容 -->
          <div class="modal-content">
            <!-- 單人聊天：角色資訊 -->
            <section v-if="!isGroupChat" class="info-section">
              <div class="section-title">角色</div>
              <div class="character-info">
                <div class="character-avatar">
                  <img
                    v-if="characterAvatar"
                    :src="characterAvatar"
                    :alt="characterName"
                  />
                  <div v-else class="avatar-placeholder">
                    <svg viewBox="0 0 24 24" fill="currentColor">
                      <path
                        d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"
                      />
                    </svg>
                  </div>
                </div>
                <div class="character-details">
                  <div class="character-name">{{ characterName }}</div>
                  <div class="message-count">{{ messageCount }} 條訊息</div>
                </div>
              </div>
            </section>

            <!-- 群聊：群組資訊 -->
            <section v-if="isGroupChat" class="info-section">
              <div class="section-title">群組</div>
              <div class="group-info">
                <div class="group-avatar">
                  <img v-if="groupAvatar" :src="groupAvatar" :alt="groupName" />
                  <div v-else class="avatar-placeholder group">
                    <svg viewBox="0 0 24 24" fill="currentColor">
                      <path
                        d="M12 12.75c1.63 0 3.07.39 4.24.9 1.08.48 1.76 1.56 1.76 2.73V18H6v-1.61c0-1.18.68-2.26 1.76-2.73 1.17-.52 2.61-.91 4.24-.91zM4 13c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm1.13 1.1c-.37-.06-.74-.1-1.13-.1-.99 0-1.93.21-2.78.58A2.01 2.01 0 000 16.43V18h4.5v-1.61c0-.83.23-1.61.63-2.29zM20 13c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm4 3.43c0-.81-.48-1.53-1.22-1.85A6.95 6.95 0 0020 14c-.39 0-.76.04-1.13.1.4.68.63 1.46.63 2.29V18H24v-1.57zM12 6c1.66 0 3 1.34 3 3s-1.34 3-3 3-3-1.34-3-3 1.34-3 3-3z"
                      />
                    </svg>
                  </div>
                </div>
                <div class="group-details">
                  <div class="group-name">{{ groupName }}</div>
                  <div class="member-count">{{ memberCount }} 位成員</div>
                </div>
                <!-- 群聊設定按鈕 -->
                <button
                  class="settings-btn"
                  @click="openSettings"
                  title="群聊設定"
                >
                  <svg viewBox="0 0 24 24" fill="currentColor">
                    <path
                      d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.07.62-.07.94s.02.64.07.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z"
                    />
                  </svg>
                </button>
              </div>
            </section>

            <!-- 群聊：成員列表 -->
            <section
              v-if="isGroupChat && groupMembers.length > 0"
              class="info-section"
            >
              <div class="section-title">成員列表</div>
              <div class="members-list">
                <div
                  v-for="member in groupMembersWithStats"
                  :key="member.characterId"
                  class="member-item"
                >
                  <div class="member-avatar">
                    <img
                      v-if="member.avatar && !failedAvatars.has(member.avatar)"
                      :src="member.avatar"
                      :alt="member.name"
                      @error="failedAvatars.add(member.avatar!)"
                    />
                    <div
                      v-if="!member.avatar || failedAvatars.has(member.avatar)"
                      class="avatar-placeholder small"
                    >
                      <svg viewBox="0 0 24 24" fill="currentColor">
                        <path
                          d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"
                        />
                      </svg>
                    </div>
                  </div>
                  <div class="member-info">
                    <div class="member-name">
                      {{ member.nickname || member.name }}
                      <span v-if="member.isAdmin" class="badge admin"
                        >管理員</span
                      >
                      <span v-if="member.isMuted" class="badge muted"
                        >已禁言</span
                      >
                    </div>
                    <div class="member-stats">
                      {{ member.messageCount }} 條訊息
                    </div>
                  </div>
                </div>
              </div>
            </section>

            <!-- 聊天統計 -->
            <section class="info-section">
              <div class="section-title">統計</div>
              <div class="stats-grid" :class="{ 'group-mode': isGroupChat }">
                <div class="stat-item">
                  <div class="stat-value">{{ messageCount }}</div>
                  <div class="stat-label">總訊息</div>
                </div>
                <div class="stat-item highlight">
                  <div class="stat-value">{{ turnCount }}</div>
                  <div class="stat-label">目前輪次</div>
                </div>
                <div class="stat-item">
                  <div class="stat-value">{{ userMessageCount }}</div>
                  <div class="stat-label">用戶訊息</div>
                </div>
                <div class="stat-item">
                  <div class="stat-value">{{ aiMessageCount }}</div>
                  <div class="stat-label">AI 訊息</div>
                </div>
                <div class="stat-item">
                  <div class="stat-value">{{ createdAtFormatted }}</div>
                  <div class="stat-label">創建時間</div>
                </div>
                <!-- 群聊專屬：最活躍成員 -->
                <div
                  v-if="isGroupChat && mostActiveMember"
                  class="stat-item wide"
                >
                  <div class="stat-value small">
                    {{ mostActiveMember.name }}
                  </div>
                  <div class="stat-label">
                    最活躍 ({{ mostActiveMember.count }} 條)
                  </div>
                </div>
              </div>
            </section>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";

interface Message {
  id: string;
  role: "user" | "ai" | "system";
  content: string;
  timestamp: number;
  senderCharacterId?: string;
  senderCharacterName?: string;
}

interface GroupMemberInfo {
  characterId: string;
  name: string;
  nickname?: string;
  avatar?: string;
  isAdmin: boolean;
  isMuted: boolean;
}

const props = defineProps<{
  visible: boolean;
  // 單人聊天
  characterName: string;
  characterAvatar?: string;
  // 群聊
  isGroupChat?: boolean;
  groupName?: string;
  groupAvatar?: string;
  groupMembers?: GroupMemberInfo[];
  // 共用
  messages: Message[];
  createdAt?: number;
}>();

const emit = defineEmits<{
  close: [];
  openSettings: [];
}>();

// 統計數據
const failedAvatars = ref(new Set<string>());
const messageCount = computed(() => props.messages.length);
const userMessageCount = computed(
  () => props.messages.filter((m) => m.role === "user").length,
);
const aiMessageCount = computed(
  () => props.messages.filter((m) => m.role === "ai").length,
);
// 輪次計算：每輪 = 用戶發言 + AI 回覆，以用戶訊息數為準
const turnCount = computed(() => userMessageCount.value);

const createdAtFormatted = computed(() => {
  if (!props.createdAt) return "未知";
  const date = new Date(props.createdAt);
  return `${date.getMonth() + 1}/${date.getDate()}`;
});

// 群聊成員數
const memberCount = computed(() => props.groupMembers?.length || 0);

// 群聊成員統計
const groupMembersWithStats = computed(() => {
  if (!props.isGroupChat || !props.groupMembers) return [];

  // 計算每個成員的訊息數
  const memberMessageCounts = new Map<string, number>();

  for (const msg of props.messages) {
    if (msg.role === "ai" && msg.senderCharacterId) {
      const count = memberMessageCounts.get(msg.senderCharacterId) || 0;
      memberMessageCounts.set(msg.senderCharacterId, count + 1);
    }
  }

  return props.groupMembers
    .map((member) => ({
      ...member,
      messageCount: memberMessageCounts.get(member.characterId) || 0,
    }))
    .sort((a, b) => b.messageCount - a.messageCount);
});

// 最活躍成員
const mostActiveMember = computed(() => {
  if (!props.isGroupChat || groupMembersWithStats.value.length === 0)
    return null;
  const top = groupMembersWithStats.value[0];
  if (top.messageCount === 0) return null;
  return {
    name: top.nickname || top.name,
    count: top.messageCount,
  };
});

function close() {
  emit("close");
}

function openSettings() {
  emit("openSettings");
}
</script>

<style lang="scss" scoped>
.chat-info-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 2000;
  padding: 20px;
}

.chat-info-modal {
  background: var(--color-surface, #fff);
  border-radius: 16px;
  width: 100%;
  max-width: 400px;
  max-height: 80vh;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid var(--color-border, rgba(0, 0, 0, 0.1));

  h2 {
    margin: 0;
    font-size: 18px;
    font-weight: 600;
    color: var(--color-text, #333);
  }

  .close-btn {
    width: 32px;
    height: 32px;
    border: none;
    background: transparent;
    border-radius: 8px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--color-text-secondary, #666);
    transition: background 0.2s;

    &:hover {
      background: var(--color-hover, rgba(0, 0, 0, 0.05));
    }

    svg {
      width: 20px;
      height: 20px;
    }
  }
}

.modal-content {
  flex: 1;
  overflow-y: auto;
  padding: 16px 20px;
}

.info-section {
  margin-bottom: 24px;

  &:last-child {
    margin-bottom: 0;
  }

  .section-title {
    font-size: 12px;
    font-weight: 600;
    color: var(--color-text-secondary, #666);
    text-transform: uppercase;
    letter-spacing: 0.5px;
    margin-bottom: 12px;
  }
}

.character-info,
.group-info {
  display: flex;
  align-items: center;
  gap: 12px;
}

.character-avatar,
.group-avatar {
  width: 48px;
  height: 48px;
  border-radius: 12px;
  overflow: hidden;
  background: var(--color-background, #f5f5f5);
  flex-shrink: 0;

  img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
}

.avatar-placeholder {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--color-text-secondary, #999);
  background: var(--color-background, #f5f5f5);

  svg {
    width: 24px;
    height: 24px;
  }

  &.group {
    background: var(--color-primary-light, rgba(125, 211, 168, 0.2));
    color: var(--color-primary, #7dd3a8);
  }

  &.small {
    svg {
      width: 18px;
      height: 18px;
    }
  }
}

.character-details,
.group-details {
  flex: 1;
  min-width: 0;
}

.settings-btn {
  width: 36px;
  height: 36px;
  border: none;
  background: var(--color-background, #f5f5f5);
  border-radius: 10px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--color-text-secondary, #666);
  transition: all 0.2s;
  flex-shrink: 0;

  svg {
    width: 18px;
    height: 18px;
  }

  &:hover {
    background: var(--color-primary-light, rgba(125, 211, 168, 0.2));
    color: var(--color-primary, #7dd3a8);
  }
}

.character-name,
.group-name {
  font-size: 16px;
  font-weight: 600;
  color: var(--color-text, #333);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.message-count,
.member-count {
  font-size: 13px;
  color: var(--color-text-secondary, #666);
  margin-top: 2px;
}

// 成員列表
.members-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-height: 200px;
  overflow-y: auto;
}

.member-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 12px;
  background: var(--color-background, #f5f5f5);
  border-radius: 10px;
}

.member-avatar {
  width: 36px;
  height: 36px;
  border-radius: 10px;
  overflow: hidden;
  flex-shrink: 0;

  img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
}

.member-info {
  flex: 1;
  min-width: 0;
}

.member-name {
  font-size: 14px;
  font-weight: 500;
  color: var(--color-text, #333);
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

.badge {
  font-size: 10px;
  padding: 2px 6px;
  border-radius: 4px;
  font-weight: 500;

  &.admin {
    background: var(--color-primary-light, rgba(125, 211, 168, 0.2));
    color: var(--color-primary, #7dd3a8);
  }

  &.muted {
    background: rgba(239, 68, 68, 0.1);
    color: #ef4444;
  }
}

.member-stats {
  font-size: 12px;
  color: var(--color-text-secondary, #666);
  margin-top: 2px;
}

// 統計網格
.stats-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 12px;

  &.group-mode {
    grid-template-columns: repeat(3, 1fr);
  }

  .stat-item {
    padding: 12px;
    background: var(--color-background, #f5f5f5);
    border-radius: 12px;
    text-align: center;

    &.highlight {
      background: var(--color-primary-light, rgba(125, 211, 168, 0.15));
      border: 1px solid var(--color-primary, #7dd3a8);
    }

    &.wide {
      grid-column: span 3;
    }

    .stat-value {
      font-size: 20px;
      font-weight: 600;
      color: var(--color-primary, #7dd3a8);

      &.small {
        font-size: 16px;
      }
    }

    .stat-label {
      font-size: 12px;
      color: var(--color-text-secondary, #666);
      margin-top: 4px;
    }
  }
}

// 動畫
.modal-enter-active,
.modal-leave-active {
  transition: opacity 0.2s ease;

  .chat-info-modal {
    transition: transform 0.2s ease;
  }
}

.modal-enter-from,
.modal-leave-to {
  opacity: 0;

  .chat-info-modal {
    transform: scale(0.95);
  }
}
</style>
