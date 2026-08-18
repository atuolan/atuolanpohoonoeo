<template>
  <div v-if="show" class="favorite-audio-modal-overlay" @click.self="close">
    <div class="favorite-audio-modal">
      <div class="modal-header">
        <h2>收藏的語音</h2>
        <button class="close-btn" @click="close" title="關閉">×</button>
      </div>

      <div class="modal-toolbar">
        <div class="filter-tabs">
          <button
            v-for="filter in filters"
            :key="filter.value"
            :class="{ active: currentFilter === filter.value }"
            @click="currentFilter = filter.value"
          >
            {{ filter.label }}
          </button>
        </div>
        <div class="sort-controls">
          <select v-model="sortBy">
            <option value="createdAt">收藏時間</option>
            <option value="playCount">播放次數</option>
            <option value="lastPlayedAt">最近播放</option>
            <option value="characterName">角色名稱</option>
          </select>
          <button @click="sortOrder = sortOrder === 'desc' ? 'asc' : 'desc'" title="排序">
            {{ sortOrder === 'desc' ? '↓' : '↑' }}
          </button>
        </div>
      </div>

      <div class="modal-content">
        <div v-if="filteredAudios.length === 0" class="empty-state">
          <p>還沒有收藏任何語音</p>
        </div>
        <div v-else class="audio-list">
          <div
            v-for="audio in filteredAudios"
            :key="audio.id"
            class="audio-item"
            :class="{ playing: currentPlayingId === audio.id }"
          >
            <div class="audio-avatar">
              <img
                v-if="audio.characterAvatar"
                :src="audio.characterAvatar"
                :alt="audio.characterName"
              />
              <div v-else class="avatar-placeholder">{{ audio.characterName[0] }}</div>
            </div>

            <div class="audio-info">
              <div class="audio-title">
                {{ audio.customTitle || audio.textContent || '語音訊息' }}
              </div>
              <div class="audio-meta">
                <span class="character-name">{{ audio.characterName }}</span>
                <span class="separator">•</span>
                <span class="audio-type">{{ getAudioTypeLabel(audio.audioType) }}</span>
                <span class="separator">•</span>
                <span class="duration">{{ formatDuration(audio.audioDuration) }}</span>
              </div>
              <div v-if="audio.note" class="audio-note">{{ audio.note }}</div>
              <div v-if="audio.tags && audio.tags.length > 0" class="audio-tags">
                <span v-for="tag in audio.tags" :key="tag" class="tag">{{ tag }}</span>
              </div>
            </div>

            <div class="audio-actions">
              <button
                class="play-btn"
                @click="togglePlay(audio)"
                :title="currentPlayingId === audio.id ? '暫停' : '播放'"
              >
                {{ currentPlayingId === audio.id ? '⏸' : '▶' }}
              </button>
              <button class="edit-btn" @click="editAudio(audio)" title="編輯">✏️</button>
              <button class="delete-btn" @click="deleteAudio(audio.id)" title="刪除">🗑️</button>
            </div>

            <div class="audio-stats">
              <span>播放 {{ audio.playCount || 0 }} 次</span>
            </div>
          </div>
        </div>
      </div>

      <!-- 編輯收藏語音 Modal -->
      <div v-if="editingAudio" class="edit-audio-overlay" @click.self="cancelEdit">
        <div class="edit-audio-modal">
          <h3>編輯收藏</h3>
          <div class="edit-form">
            <div class="form-group">
              <label>自訂標題</label>
              <input
                v-model="editForm.customTitle"
                type="text"
                placeholder="為這段語音取個名字"
              />
            </div>
            <div class="form-group">
              <label>備註</label>
              <textarea
                v-model="editForm.note"
                placeholder="添加備註..."
                rows="3"
              ></textarea>
            </div>
            <div class="form-group">
              <label>標籤（用逗號分隔）</label>
              <input
                v-model="tagsInput"
                type="text"
                placeholder="例如：搞笑,溫馨,重要"
              />
            </div>
          </div>
          <div class="edit-actions">
            <button @click="saveEdit">保存</button>
            <button @click="cancelEdit">取消</button>
          </div>
        </div>
      </div>
    </div>

    <!-- 音頻播放器（隱藏） -->
    <audio ref="audioPlayer" @ended="onAudioEnded"></audio>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';
import type { FavoriteAudio } from '@/types/favoriteAudio';
import {
  getAllFavoriteAudios,
  getFavoriteAudiosByCharacter,
  getFavoriteAudiosByType,
  saveFavoriteAudio,
  deleteFavoriteAudio as dbDeleteFavoriteAudio,
  updateFavoriteAudioPlayStats,
  getAudioBlob,
} from '@/db/operations';

const props = defineProps<{
  show: boolean;
  characterId?: string;
}>();

const emit = defineEmits<{
  close: [];
}>();

// 數據
const audios = ref<FavoriteAudio[]>([]);
const currentFilter = ref<'all' | 'user' | 'tts' | 'phone'>('all');
const sortBy = ref<'createdAt' | 'playCount' | 'lastPlayedAt' | 'characterName'>('createdAt');
const sortOrder = ref<'asc' | 'desc'>('desc');
const currentPlayingId = ref<string | null>(null);
const audioPlayer = ref<HTMLAudioElement | null>(null);
const editingAudio = ref<FavoriteAudio | null>(null);
const editForm = ref({
  customTitle: '',
  note: '',
  tags: [] as string[],
});
const tagsInput = ref('');

const filters = [
  { label: '全部', value: 'all' },
  { label: '我的錄音', value: 'user' },
  { label: 'AI 語音', value: 'tts' },
  { label: '通話錄音', value: 'phone' },
];

// 計算屬性
const filteredAudios = computed(() => {
  let result = audios.value;

  // 按角色過濾
  if (props.characterId) {
    result = result.filter((a) => a.characterId === props.characterId);
  }

  // 按類型過濾
  if (currentFilter.value !== 'all') {
    result = result.filter((a) => a.audioType === currentFilter.value);
  }

  // 排序
  result = [...result].sort((a, b) => {
    let aVal: any = a[sortBy.value];
    let bVal: any = b[sortBy.value];

    if (sortBy.value === 'characterName') {
      aVal = aVal || '';
      bVal = bVal || '';
      return sortOrder.value === 'desc'
        ? bVal.localeCompare(aVal)
        : aVal.localeCompare(bVal);
    }

    aVal = aVal || 0;
    bVal = bVal || 0;
    return sortOrder.value === 'desc' ? bVal - aVal : aVal - bVal;
  });

  return result;
});

// 方法
async function loadAudios() {
  if (props.characterId) {
    audios.value = await getFavoriteAudiosByCharacter(props.characterId);
  } else {
    audios.value = await getAllFavoriteAudios();
  }
}

function getAudioTypeLabel(type: string): string {
  const labels: Record<string, string> = {
    user: '我的錄音',
    tts: 'AI 語音',
    phone: '通話錄音',
  };
  return labels[type] || type;
}

function formatDuration(seconds?: number): string {
  if (!seconds) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

async function togglePlay(audio: FavoriteAudio) {
  if (currentPlayingId.value === audio.id) {
    // 暫停
    audioPlayer.value?.pause();
    currentPlayingId.value = null;
    return;
  }

  // 停止當前播放
  if (audioPlayer.value) {
    audioPlayer.value.pause();
    audioPlayer.value.currentTime = 0;
  }

  try {
    let audioUrl: string | null = null;

    // 獲取音頻 URL
    if (audio.audioBlobId) {
      const blobRecord = await getAudioBlob(audio.audioBlobId);
      if (blobRecord) {
        audioUrl = URL.createObjectURL(blobRecord.blob);
      }
    } else if (audio.ttsAudioUrl) {
      audioUrl = audio.ttsAudioUrl;
    }

    if (audioUrl && audioPlayer.value) {
      audioPlayer.value.src = audioUrl;
      await audioPlayer.value.play();
      currentPlayingId.value = audio.id;

      // 更新播放統計
      await updateFavoriteAudioPlayStats(audio.id);
      await loadAudios();
    }
  } catch (error) {
    console.error('播放失敗:', error);
    alert('播放失敗');
  }
}

function onAudioEnded() {
  currentPlayingId.value = null;
}

function editAudio(audio: FavoriteAudio) {
  editingAudio.value = audio;
  editForm.value = {
    customTitle: audio.customTitle || '',
    note: audio.note || '',
    tags: audio.tags || [],
  };
  tagsInput.value = (audio.tags || []).join(', ');
}

async function saveEdit() {
  if (!editingAudio.value) return;

  const updated: FavoriteAudio = {
    ...editingAudio.value,
    customTitle: editForm.value.customTitle,
    note: editForm.value.note,
    tags: tagsInput.value
      .split(',')
      .map((t) => t.trim())
      .filter((t) => t),
  };

  await saveFavoriteAudio(updated);
  await loadAudios();
  cancelEdit();
}

function cancelEdit() {
  editingAudio.value = null;
}

async function deleteAudio(id: string) {
  if (!confirm('確定要刪除這個收藏嗎？')) return;

  await dbDeleteFavoriteAudio(id);
  await loadAudios();

  if (currentPlayingId.value === id) {
    audioPlayer.value?.pause();
    currentPlayingId.value = null;
  }
}

function close() {
  if (audioPlayer.value) {
    audioPlayer.value.pause();
    currentPlayingId.value = null;
  }
  emit('close');
}

onMounted(() => {
  if (props.show) {
    loadAudios();
  }
});

onUnmounted(() => {
  if (audioPlayer.value) {
    audioPlayer.value.pause();
    audioPlayer.value.src = '';
  }
});

// 監聽 show 變化
import { watch } from 'vue';
watch(
  () => props.show,
  (newVal) => {
    if (newVal) {
      loadAudios();
    }
  },
);
</script>

<style scoped lang="scss">
.favorite-audio-modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.7);
  backdrop-filter: blur(10px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10000;
  padding: 20px;
}

.favorite-audio-modal {
  background: var(--color-surface, #ffffff);
  border-radius: 16px;
  width: 100%;
  max-width: 800px;
  max-height: 90vh;
  display: flex;
  flex-direction: column;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 20px;
  border-bottom: 1px solid var(--color-border, #e2e8f0);

  h2 {
    margin: 0;
    font-size: 1.5rem;
    color: var(--color-text, #333333);
  }

  .close-btn {
    background: none;
    border: none;
    font-size: 2rem;
    color: var(--color-text-secondary, #666666);
    cursor: pointer;
    width: 40px;
    height: 40px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 8px;
    transition: all 0.2s;

    &:hover {
      background: var(--color-surface-hover, #f5f5f5);
      color: var(--color-text, #333333);
    }
  }
}

.modal-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid var(--color-border, #e2e8f0);
  gap: 16px;
  flex-wrap: wrap;
}

.filter-tabs {
  display: flex;
  gap: 8px;

  button {
    padding: 8px 16px;
    border: 1px solid var(--color-border, #e2e8f0);
    background: var(--color-surface, #ffffff);
    color: var(--color-text-secondary, #666666);
    border-radius: 8px;
    cursor: pointer;
    transition: all 0.2s;
    font-size: 0.9rem;

    &:hover {
      background: var(--color-surface-hover, #f5f5f5);
    }

    &.active {
      background: var(--color-primary, #00723a);
      color: white;
      border-color: var(--color-primary, #00723a);
    }
  }
}

.sort-controls {
  display: flex;
  gap: 8px;

  select {
    padding: 8px 12px;
    border: 1px solid var(--color-border, #e2e8f0);
    background: var(--color-surface, #ffffff);
    color: var(--color-text, #333333);
    border-radius: 8px;
    cursor: pointer;
    font-size: 0.9rem;

    &:focus {
      outline: none;
      border-color: var(--color-primary, #00723a);
    }
  }

  button {
    padding: 8px 12px;
    border: 1px solid var(--color-border, #e2e8f0);
    background: var(--color-surface, #ffffff);
    color: var(--color-text, #333333);
    border-radius: 8px;
    cursor: pointer;
    transition: all 0.2s;
    font-size: 1rem;
    width: 40px;

    &:hover {
      background: var(--color-surface-hover, #f5f5f5);
    }
  }
}

.modal-content {
  flex: 1;
  overflow-y: auto;
  padding: 20px;
}

.empty-state {
  text-align: center;
  padding: 60px 20px;
  color: var(--color-text-secondary, #666666);

  p {
    font-size: 1.1rem;
  }
}

.audio-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.audio-item {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 16px;
  background: var(--color-background, #fafafa);
  border: 1px solid var(--color-border, #e2e8f0);
  border-radius: 12px;
  transition: all 0.2s;

  &:hover {
    border-color: var(--color-primary, #00723a);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  }

  &.playing {
    border-color: var(--color-primary, #00723a);
    background: var(--color-primary-light, #c7fcbb);
  }
}

.audio-avatar {
  flex-shrink: 0;
  width: 48px;
  height: 48px;
  border-radius: 50%;
  overflow: hidden;

  img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .avatar-placeholder {
    width: 100%;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--color-primary, #00723a);
    color: white;
    font-size: 1.2rem;
    font-weight: bold;
  }
}

.audio-info {
  flex: 1;
  min-width: 0;

  .audio-title {
    font-weight: 500;
    color: var(--color-text, #333333);
    margin-bottom: 4px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .audio-meta {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 0.85rem;
    color: var(--color-text-secondary, #666666);

    .separator {
      opacity: 0.5;
    }
  }

  .audio-note {
    margin-top: 8px;
    font-size: 0.9rem;
    color: var(--color-text-secondary, #666666);
    font-style: italic;
  }

  .audio-tags {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin-top: 8px;

    .tag {
      padding: 2px 8px;
      background: var(--color-primary-light, #c7fcbb);
      color: var(--color-primary, #00723a);
      border-radius: 4px;
      font-size: 0.8rem;
    }
  }
}

.audio-actions {
  display: flex;
  gap: 8px;
  flex-shrink: 0;

  button {
    padding: 8px 12px;
    border: 1px solid var(--color-border, #e2e8f0);
    background: var(--color-surface, #ffffff);
    border-radius: 8px;
    cursor: pointer;
    transition: all 0.2s;
    font-size: 1rem;

    &:hover {
      background: var(--color-surface-hover, #f5f5f5);
    }

    &.play-btn:hover {
      background: var(--color-primary, #00723a);
      border-color: var(--color-primary, #00723a);
      color: white;
    }

    &.delete-btn:hover {
      background: var(--color-error, #b3261e);
      border-color: var(--color-error, #b3261e);
      color: white;
    }
  }
}

.audio-stats {
  flex-shrink: 0;
  font-size: 0.8rem;
  color: var(--color-text-muted, #999999);
}

/* 編輯 Modal */
.edit-audio-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10001;
}

.edit-audio-modal {
  background: var(--color-surface, #ffffff);
  border-radius: 12px;
  padding: 24px;
  width: 90%;
  max-width: 500px;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.3);

  h3 {
    margin: 0 0 20px;
    color: var(--color-text, #333333);
  }
}

.edit-form {
  display: flex;
  flex-direction: column;
  gap: 16px;

  .form-group {
    display: flex;
    flex-direction: column;
    gap: 8px;

    label {
      font-size: 0.9rem;
      color: var(--color-text-secondary, #666666);
      font-weight: 500;
    }

    input,
    textarea {
      padding: 10px 12px;
      border: 1px solid var(--color-border, #e2e8f0);
      background: var(--color-background, #fafafa);
      color: var(--color-text, #333333);
      border-radius: 8px;
      font-size: 0.95rem;
      font-family: inherit;

      &:focus {
        outline: none;
        border-color: var(--color-primary, #00723a);
      }
    }

    textarea {
      resize: vertical;
      min-height: 80px;
    }
  }
}

.edit-actions {
  display: flex;
  gap: 12px;
  margin-top: 24px;
  justify-content: flex-end;

  button {
    padding: 10px 20px;
    border: none;
    border-radius: 8px;
    cursor: pointer;
    font-size: 0.95rem;
    transition: all 0.2s;

    &:first-child {
      background: var(--color-primary, #00723a);
      color: white;

      &:hover {
        opacity: 0.9;
      }
    }

    &:last-child {
      background: var(--color-surface-hover, #f5f5f5);
      color: var(--color-text, #333333);

      &:hover {
        background: var(--color-border, #e2e8f0);
      }
    }
  }
}
</style>
