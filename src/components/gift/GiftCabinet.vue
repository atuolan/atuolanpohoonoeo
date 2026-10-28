<script setup lang="ts">
/**
 * 禮物櫃
 *
 * 第一層：有回憶卡的角色；第二層：該角色「我送的」與「他送的」禮物格子
 */
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { Gift } from "lucide-vue-next";
import GiftMemoryCard from "@/components/gift/GiftMemoryCard.vue";
import { useCharactersStore } from "@/stores/characters";
import {
  GIFT_MEMORIES_CHANGED_EVENT,
  listGiftMemoryCharacterIds,
  loadGiftMemories,
  type GiftMemory,
} from "@/services/giftMemories";
import { getGiftIcon } from "@/utils/giftIcon";

interface GiftCabinetGroup {
  characterId: string;
  name: string;
  avatar: string;
  sent: number;
  received: number;
  memories: GiftMemory[];
}

const charactersStore = useCharactersStore();

const groups = ref<GiftCabinetGroup[]>([]);
const selectedCharacterId = ref<string | null>(null);
const cardMemory = ref<GiftMemory | null>(null);
const loading = ref(false);

const selectedGroup = computed(() => {
  if (!selectedCharacterId.value) return null;
  return groups.value.find((g) => g.characterId === selectedCharacterId.value) ?? null;
});

const sentMemories = computed(() =>
  (selectedGroup.value?.memories ?? []).filter((m) => m.direction === "to-char"),
);

const receivedMemories = computed(() =>
  (selectedGroup.value?.memories ?? []).filter((m) => m.direction === "to-user"),
);

const receivedTitle = computed(() =>
  selectedGroup.value ? `${selectedGroup.value.name} 送的` : "他送的",
);

function characterNameOf(character: { nickname?: string; data?: { name?: string } }): string {
  return character.nickname || character.data?.name || "角色";
}

function pad(value: number): string {
  return value < 10 ? `0${value}` : String(value);
}

function formatShortDate(timestamp: number): string {
  const date = new Date(timestamp);
  return `${pad(date.getMonth() + 1)}/${pad(date.getDate())}`;
}

async function reload(): Promise<void> {
  loading.value = true;
  try {
    if (!charactersStore.characters.length) {
      await charactersStore.loadCharacters();
    }
    const ids = await listGiftMemoryCharacterIds();
    const nextGroups: GiftCabinetGroup[] = [];
    for (const characterId of ids) {
      const character = charactersStore.getCharacterById(characterId);
      // 角色已刪除就不顯示
      if (!character) continue;
      const memories = await loadGiftMemories(characterId);
      if (!memories.length) continue;
      nextGroups.push({
        characterId,
        name: characterNameOf(character),
        avatar: character.avatar || "",
        sent: memories.filter((m) => m.direction === "to-char").length,
        received: memories.filter((m) => m.direction === "to-user").length,
        memories,
      });
    }
    nextGroups.sort(
      (a, b) => (b.memories[0]?.sentAt ?? 0) - (a.memories[0]?.sentAt ?? 0),
    );
    groups.value = nextGroups;
    if (
      selectedCharacterId.value &&
      !nextGroups.some((g) => g.characterId === selectedCharacterId.value)
    ) {
      selectedCharacterId.value = null;
    }
  } catch (error) {
    console.warn("[GiftCabinet] 讀取禮物回憶失敗", error);
    groups.value = [];
  } finally {
    loading.value = false;
  }
}

function openCharacter(characterId: string): void {
  selectedCharacterId.value = characterId;
  cardMemory.value = null;
}

function backToList(): void {
  selectedCharacterId.value = null;
  cardMemory.value = null;
}

function openCard(memory: GiftMemory): void {
  cardMemory.value = memory;
}

function closeCard(): void {
  cardMemory.value = null;
}

function handleMemoriesChanged(): void {
  void reload();
}

onMounted(() => {
  void reload();
  if (typeof window !== "undefined") {
    window.addEventListener(GIFT_MEMORIES_CHANGED_EVENT, handleMemoriesChanged);
  }
});

onBeforeUnmount(() => {
  if (typeof window !== "undefined") {
    window.removeEventListener(GIFT_MEMORIES_CHANGED_EVENT, handleMemoriesChanged);
  }
});
</script>

<template>
  <div class="gift-cabinet">
    <!-- 第一層：角色列表 -->
    <div v-if="!selectedGroup" class="cabinet-characters">
      <button
        v-for="group in groups"
        :key="group.characterId"
        type="button"
        class="character-row"
        @click="openCharacter(group.characterId)"
      >
        <img v-if="group.avatar" class="character-avatar" :src="group.avatar" alt="" />
        <div v-else class="character-avatar avatar-fallback">
          {{ group.name.slice(0, 1) }}
        </div>
        <div class="character-info">
          <div class="character-name">{{ group.name }}</div>
          <div class="character-counts">
            送出 {{ group.sent }}・收到 {{ group.received }}
          </div>
        </div>
        <span class="row-chevron">›</span>
      </button>

      <div v-if="!loading && groups.length === 0" class="empty-state">
        <Gift :size="48" />
        <p class="empty-title">還沒有送出或收到的禮物</p>
        <p class="empty-hint">去聊天裡送他一份吧</p>
      </div>
    </div>

    <!-- 第二層：該角色的禮物 -->
    <div v-else class="cabinet-detail">
      <button type="button" class="detail-back" @click="backToList">
        ‹ {{ selectedGroup.name }}
      </button>

      <section class="gift-section">
        <h3 class="section-title">我送的</h3>
        <div v-if="sentMemories.length" class="gift-grid">
          <button
            v-for="memory in sentMemories"
            :key="memory.id"
            type="button"
            class="gift-cell"
            @click="openCard(memory)"
          >
            <span class="cell-icon">
              <component :is="getGiftIcon(memory.itemId)" :size="22" />
            </span>
            <span class="cell-name">{{ memory.name }}</span>
            <span class="cell-date">{{ formatShortDate(memory.sentAt) }}</span>
          </button>
        </div>
        <p v-else class="section-empty">還沒有</p>
      </section>

      <section class="gift-section">
        <h3 class="section-title">{{ receivedTitle }}</h3>
        <div v-if="receivedMemories.length" class="gift-grid">
          <button
            v-for="memory in receivedMemories"
            :key="memory.id"
            type="button"
            class="gift-cell"
            @click="openCard(memory)"
          >
            <span class="cell-icon">
              <component :is="getGiftIcon(memory.itemId)" :size="22" />
            </span>
            <span class="cell-name">{{ memory.name }}</span>
            <span class="cell-date">{{ formatShortDate(memory.sentAt) }}</span>
          </button>
        </div>
        <p v-else class="section-empty">還沒有</p>
      </section>
    </div>

    <GiftMemoryCard
      v-if="cardMemory && selectedGroup"
      :memory="cardMemory"
      :character-name="selectedGroup.name"
      :character-avatar="selectedGroup.avatar"
      @close="closeCard"
    />
  </div>
</template>

<style lang="scss" scoped>
.gift-cabinet {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 16px;
  padding-bottom: calc(
    var(--safe-area-inset-bottom, env(safe-area-inset-bottom)) + 16px
  );
  background: var(--color-background, #f8f9fa);
}

.cabinet-characters {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.character-row {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  padding: 12px 14px;
  border: 1px solid var(--color-border, #eee);
  border-radius: 14px;
  background: var(--color-surface, #fff);
  text-align: left;
  cursor: pointer;
  transition: background 0.2s;

  &:active {
    background: var(--color-surface-hover, #f0f0f0);
  }
}

.character-avatar {
  flex-shrink: 0;
  width: 44px;
  height: 44px;
  border-radius: 50%;
  object-fit: cover;
  background: var(--color-surface-hover, #f0f0f0);
}

.avatar-fallback {
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 17px;
  font-weight: 600;
  color: var(--color-text-secondary, #666);
}

.character-info {
  flex: 1;
  min-width: 0;
}

.character-name {
  font-size: 15px;
  font-weight: 600;
  color: var(--color-text, #333);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.character-counts {
  margin-top: 2px;
  font-size: 12px;
  color: var(--color-text-secondary, #666);
}

.row-chevron {
  font-size: 18px;
  color: var(--color-text-secondary, #666);
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 48px 16px;
  text-align: center;
  color: var(--color-text-secondary, #666);
}

.empty-title {
  margin: 12px 0 0;
  font-size: 14px;
  color: var(--color-text, #333);
}

.empty-hint {
  margin: 6px 0 0;
  font-size: 12px;
  color: var(--color-text-secondary, #666);
}

.detail-back {
  display: inline-flex;
  align-items: center;
  padding: 6px 12px 6px 8px;
  border: none;
  border-radius: 16px;
  background: var(--color-surface, #fff);
  font-size: 14px;
  font-weight: 600;
  color: var(--color-text, #333);
  cursor: pointer;

  &:active {
    background: var(--color-surface-hover, #f0f0f0);
  }
}

.gift-section {
  margin-top: 18px;
}

.section-title {
  margin: 0 0 10px;
  font-size: 13px;
  font-weight: 600;
  color: var(--color-text-secondary, #666);
}

.gift-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 10px;
}

.gift-cell {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 12px 6px;
  border: 1px solid var(--color-border, #eee);
  border-radius: 12px;
  background: var(--color-surface, #fff);
  cursor: pointer;
  transition: transform 0.15s;

  &:active {
    transform: scale(0.97);
  }
}

.cell-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: var(--color-surface-hover, #f0f0f0);
  color: var(--color-primary, #7dd3a8);
}

.cell-name {
  width: 100%;
  font-size: 12px;
  font-weight: 500;
  text-align: center;
  color: var(--color-text, #333);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.cell-date {
  font-size: 11px;
  color: var(--color-text-secondary, #666);
}

.section-empty {
  margin: 0;
  padding: 8px 2px;
  font-size: 12px;
  color: var(--color-text-secondary, #666);
  opacity: 0.7;
}

body.is-night-mode {
  .character-row,
  .gift-cell {
    border-color: var(--color-border);
    background: var(--color-surface);
  }

  .detail-back {
    background: var(--color-surface);
    color: var(--color-text);
  }

  .character-avatar,
  .avatar-fallback,
  .cell-icon {
    background: var(--color-surface-hover);
  }

  .empty-title,
  .character-name,
  .cell-name {
    color: var(--color-text);
  }

  .empty-hint,
  .character-counts,
  .row-chevron,
  .section-title,
  .cell-date,
  .section-empty {
    color: var(--color-text-secondary);
  }
}
</style>
