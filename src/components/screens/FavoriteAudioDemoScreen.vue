<template>
  <div class="favorite-audio-demo">
    <h1>收藏語音功能演示</h1>

    <div class="demo-section">
      <h2>快速測試</h2>
      <button @click="openFavoriteAudioModal" class="btn-primary">
        ⭐ 打開收藏語音管理
      </button>
      <button @click="createTestFavorite" class="btn-secondary">
        ➕ 創建測試收藏
      </button>
      <button @click="clearAllFavorites" class="btn-danger">
        🗑️ 清空所有收藏
      </button>
    </div>

    <div class="demo-section">
      <h2>當前收藏列表</h2>
      <div v-if="favorites.length === 0" class="empty-state">
        暫無收藏
      </div>
      <ul v-else class="favorites-list">
        <li v-for="fav in favorites" :key="fav.id" class="favorite-item">
          <div class="fav-info">
            <strong>{{ fav.customTitle || fav.textContent || '無標題' }}</strong>
            <div class="fav-meta">
              角色: {{ fav.characterName }} |
              類型: {{ getTypeLabel(fav.audioType) }} |
              播放: {{ fav.playCount }} 次
            </div>
          </div>
          <button @click="deleteFavorite(fav.id)" class="btn-delete">刪除</button>
        </li>
      </ul>
    </div>

    <div class="demo-section">
      <h2>使用說明</h2>
      <div class="instructions">
        <h3>1. 基本功能</h3>
        <ul>
          <li>點擊"打開收藏語音管理"可以查看和管理所有收藏</li>
          <li>點擊"創建測試收藏"會添加一個測試語音收藏</li>
          <li>在收藏管理界面中可以播放、編輯、刪除收藏</li>
        </ul>

        <h3>2. 集成到聊天</h3>
        <p>要在聊天中使用收藏功能，需要：</p>
        <ul>
          <li>在 ChatScreen 中導入 FavoriteAudioModal 組件</li>
          <li>在消息氣泡的音頻控制區域添加收藏按鈕</li>
          <li>使用 useFavoriteAudio composable 處理收藏邏輯</li>
        </ul>

        <h3>3. 數據持久化</h3>
        <p>所有收藏數據存儲在 IndexedDB 中，自動保存，刷新頁面不會丟失。</p>
      </div>
    </div>

    <!-- 收藏語音管理 Modal -->
    <FavoriteAudioModal
      :show="showModal"
      @close="showModal = false"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import FavoriteAudioModal from '@/components/modals/FavoriteAudioModal.vue';
import type { FavoriteAudio } from '@/types/favoriteAudio';
import {
  getAllFavoriteAudios,
  saveFavoriteAudio,
  deleteFavoriteAudio,
} from '@/db/operations';

const showModal = ref(false);
const favorites = ref<FavoriteAudio[]>([]);

onMounted(async () => {
  await loadFavorites();
});

async function loadFavorites() {
  favorites.value = await getAllFavoriteAudios();
}

function openFavoriteAudioModal() {
  showModal.value = true;
}

async function createTestFavorite() {
  const testAudio: FavoriteAudio = {
    id: crypto.randomUUID(),
    chatId: 'demo-chat-' + Date.now(),
    messageId: 'demo-msg-' + Date.now(),
    characterId: 'demo-char',
    characterName: '測試角色',
    characterAvatar: undefined,
    audioType: 'tts',
    ttsAudioUrl: 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=',
    audioDuration: 3,
    textContent: '這是一段測試語音：' + new Date().toLocaleTimeString(),
    customTitle: '測試收藏 ' + Math.floor(Math.random() * 1000),
    note: '這是演示用的測試收藏',
    tags: ['測試', '演示'],
    createdAt: Date.now(),
    playCount: 0,
  };

  await saveFavoriteAudio(testAudio);
  await loadFavorites();
  alert('已創建測試收藏！');
}

async function deleteFavorite(id: string) {
  if (!confirm('確定要刪除這個收藏嗎？')) return;
  await deleteFavoriteAudio(id);
  await loadFavorites();
}

async function clearAllFavorites() {
  if (!confirm('確定要清空所有收藏嗎？此操作無法撤銷！')) return;

  for (const fav of favorites.value) {
    await deleteFavoriteAudio(fav.id);
  }

  await loadFavorites();
  alert('已清空所有收藏！');
}

function getTypeLabel(type: string): string {
  const labels: Record<string, string> = {
    user: '用戶錄音',
    tts: 'AI 語音',
    phone: '通話錄音',
  };
  return labels[type] || type;
}
</script>

<style scoped lang="scss">
.favorite-audio-demo {
  padding: 20px;
  max-width: 1200px;
  margin: 0 auto;
  min-height: 100vh;
  background: var(--background);
  color: var(--text);

  h1 {
    font-size: 2rem;
    margin-bottom: 30px;
    color: var(--primary);
  }

  h2 {
    font-size: 1.5rem;
    margin-bottom: 15px;
    color: var(--text);
  }

  h3 {
    font-size: 1.2rem;
    margin: 20px 0 10px;
    color: var(--text);
  }
}

.demo-section {
  background: var(--surface);
  border-radius: 12px;
  padding: 20px;
  margin-bottom: 20px;
  border: 1px solid var(--border);
}

.btn-primary,
.btn-secondary,
.btn-danger {
  padding: 12px 24px;
  border: none;
  border-radius: 8px;
  font-size: 1rem;
  cursor: pointer;
  margin-right: 10px;
  margin-bottom: 10px;
  transition: all 0.2s;

  &:hover {
    opacity: 0.9;
    transform: translateY(-2px);
  }

  &:active {
    transform: translateY(0);
  }
}

.btn-primary {
  background: var(--primary);
  color: white;
}

.btn-secondary {
  background: var(--surface-hover);
  color: var(--text);
  border: 1px solid var(--border);
}

.btn-danger {
  background: var(--error, #ef4444);
  color: white;
}

.empty-state {
  padding: 40px;
  text-align: center;
  color: var(--text-secondary);
  font-size: 1.1rem;
}

.favorites-list {
  list-style: none;
  padding: 0;
  margin: 0;
}

.favorite-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 15px;
  margin-bottom: 10px;
  background: var(--background);
  border: 1px solid var(--border);
  border-radius: 8px;
  transition: all 0.2s;

  &:hover {
    border-color: var(--primary);
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  }
}

.fav-info {
  flex: 1;

  strong {
    display: block;
    margin-bottom: 5px;
    font-size: 1.1rem;
  }
}

.fav-meta {
  font-size: 0.9rem;
  color: var(--text-secondary);
}

.btn-delete {
  padding: 8px 16px;
  background: var(--error, #ef4444);
  color: white;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s;

  &:hover {
    opacity: 0.8;
  }
}

.instructions {
  line-height: 1.6;

  ul {
    margin: 10px 0;
    padding-left: 20px;
  }

  li {
    margin: 8px 0;
  }

  p {
    margin: 10px 0;
  }
}
</style>
