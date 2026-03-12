<script setup lang="ts">
import { useCharactersStore } from "@/stores";
import { Phone, X } from "lucide-vue-next";
import { computed, ref } from "vue";

const emit = defineEmits<{
  (e: "close"): void;
  (e: "call", characterId: string): void;
}>();

const charactersStore = useCharactersStore();
const searchQuery = ref("");

const filteredCharacters = computed(() => {
  const q = searchQuery.value.toLowerCase().trim();
  if (!q) return charactersStore.characters;
  return charactersStore.characters.filter((c) => {
    const name = c.nickname || c.data.name;
    return name.toLowerCase().includes(q);
  });
});

function handleCall(characterId: string) {
  emit("call", characterId);
}

function getDisplayName(c: (typeof charactersStore.characters)[0]) {
  return c.nickname || c.data.name || "未命名角色";
}

function getInitial(c: (typeof charactersStore.characters)[0]) {
  const name = getDisplayName(c);
  return name.charAt(0);
}
</script>

<template>
  <Teleport to="body">
    <div class="phone-picker-overlay" @click.self="emit('close')">
      <div class="phone-picker-modal">
        <!-- 標題列 -->
        <div class="picker-header">
          <Phone :size="20" :stroke-width="1.5" />
          <span class="picker-title">撥打電話</span>
          <button class="close-btn" @click="emit('close')">
            <X :size="18" :stroke-width="1.5" />
          </button>
        </div>

        <!-- 搜尋 -->
        <div class="picker-search">
          <input
            v-model="searchQuery"
            type="text"
            placeholder="搜尋聯絡人..."
            class="search-input"
          />
        </div>

        <!-- 聯絡人列表 -->
        <div class="contact-list">
          <div v-if="filteredCharacters.length === 0" class="empty-state">
            <Phone :size="32" :stroke-width="1.2" style="opacity: 0.5" />
            <p>{{ searchQuery ? "找不到聯絡人" : "尚無角色，請先建立角色" }}</p>
          </div>
          <button
            v-for="character in filteredCharacters"
            :key="character.id"
            class="contact-item"
            @click="handleCall(character.id)"
          >
            <div class="contact-avatar">
              <img
                v-if="character.avatar"
                :src="character.avatar"
                :alt="getDisplayName(character)"
              />
              <span v-else class="avatar-initial">{{
                getInitial(character)
              }}</span>
            </div>
            <div class="contact-info">
              <span class="contact-name">{{ getDisplayName(character) }}</span>
            </div>
            <div class="call-icon">
              <Phone :size="16" :stroke-width="1.5" />
            </div>
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style lang="scss" scoped>
.phone-picker-overlay {
  position: fixed;
  inset: 0;
  z-index: 200;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  backdrop-filter: blur(4px);
}

.phone-picker-modal {
  width: 320px;
  max-height: 70vh;
  background: rgba(30, 41, 59, 0.95);
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 16px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  color: #fff;
}

.picker-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 14px 16px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);

  .picker-title {
    flex: 1;
    font-size: 15px;
    font-weight: 600;
  }

  .close-btn {
    background: none;
    border: none;
    color: rgba(255, 255, 255, 0.6);
    cursor: pointer;
    padding: 4px;
    border-radius: 6px;
    display: flex;
    align-items: center;

    &:hover {
      color: #fff;
      background: rgba(255, 255, 255, 0.1);
    }
  }
}

.picker-search {
  padding: 10px 12px;

  .search-input {
    width: 100%;
    padding: 8px 12px;
    background: rgba(255, 255, 255, 0.08);
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: 8px;
    color: #fff;
    font-size: 13px;
    outline: none;

    &::placeholder {
      color: rgba(255, 255, 255, 0.4);
    }

    &:focus {
      border-color: rgba(125, 211, 168, 0.5);
    }
  }
}

.contact-list {
  flex: 1;
  overflow-y: auto;
  padding: 4px 8px 12px;
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 32px 16px;
  color: rgba(255, 255, 255, 0.4);

  p {
    font-size: 13px;
    margin: 0;
  }
}

.contact-item {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 10px 12px;
  background: none;
  border: none;
  border-radius: 10px;
  color: #fff;
  cursor: pointer;
  text-align: left;
  transition: background 0.15s;

  &:hover {
    background: rgba(255, 255, 255, 0.08);
  }

  &:active {
    background: rgba(255, 255, 255, 0.12);
  }
}

.contact-avatar {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  overflow: hidden;
  flex-shrink: 0;
  background: rgba(125, 211, 168, 0.2);
  display: flex;
  align-items: center;
  justify-content: center;

  img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .avatar-initial {
    font-size: 16px;
    font-weight: 600;
    color: #7dd3a8;
  }
}

.contact-info {
  flex: 1;
  min-width: 0;

  .contact-name {
    font-size: 14px;
    font-weight: 500;
    display: block;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
}

.call-icon {
  flex-shrink: 0;
  color: #7dd3a8;
  display: flex;
  align-items: center;
  padding: 6px;
  border-radius: 50%;
  background: rgba(125, 211, 168, 0.15);
}
</style>
