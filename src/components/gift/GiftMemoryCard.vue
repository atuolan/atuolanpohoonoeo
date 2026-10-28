<script setup lang="ts">
/**
 * 禮物回憶卡詳情
 *
 * 全螢幕遮罩中間一張卡：圖示、名稱、送出／收到資訊、小卡、角色感想、日記
 */
import { computed } from "vue";
import { X } from "lucide-vue-next";
import { GIFT_ITEMS } from "@/data/shopItems";
import { getGiftIcon } from "@/utils/giftIcon";
import type { GiftMemory } from "@/services/giftMemories";

const props = defineProps<{
  memory: GiftMemory;
  characterName: string;
  characterAvatar?: string;
}>();

const emit = defineEmits<{
  close: [];
}>();

const rarity = computed<string>(() => {
  if (!props.memory.itemId) return "special";
  return GIFT_ITEMS.find((item) => item.id === props.memory.itemId)?.rarity ?? "special";
});

const rarityLabels: Record<string, string> = {
  common: "普通",
  uncommon: "優良",
  rare: "稀有",
  epic: "史詩",
  legendary: "傳說",
  special: "他的心意",
};

const rarityLabel = computed(() => rarityLabels[rarity.value] || "");

const giftIcon = computed(() => getGiftIcon(props.memory.itemId));

function pad(value: number): string {
  return value < 10 ? `0${value}` : String(value);
}

const sentDate = computed(() => {
  const date = new Date(props.memory.sentAt);
  return `${date.getFullYear()}/${pad(date.getMonth() + 1)}/${pad(date.getDate())}`;
});

const directionLine = computed(() =>
  props.memory.direction === "to-char"
    ? `送給 ${props.characterName}・${sentDate.value}`
    : `${props.characterName} 送的・${sentDate.value}`,
);

const entries = computed(() =>
  (props.memory.entries || []).map((entry) => ({
    ...entry,
    excerpt:
      entry.content.length > 60 ? `${entry.content.slice(0, 60)}…` : entry.content,
  })),
);
</script>

<template>
  <Teleport to="body">
    <div class="memory-card-overlay" @click.self="emit('close')">
      <div class="memory-card" @click.stop>
        <button class="card-close" type="button" @click="emit('close')">
          <X :size="18" />
        </button>

        <div class="gift-icon" :class="`rarity-${rarity}`">
          <component :is="giftIcon" :size="40" />
        </div>

        <div class="card-heading">
          <h2 class="gift-name">{{ memory.name }}</h2>
          <span v-if="memory.doll" class="doll-tag">已連結</span>
        </div>
        <span class="rarity-text" :class="`rarity-${rarity}`">{{ rarityLabel }}</span>

        <p class="direction-line">{{ directionLine }}</p>

        <p v-if="memory.description" class="gift-description">
          {{ memory.description }}
        </p>

        <div v-if="memory.cardText" class="card-paper">
          <span class="paper-label">小卡</span>
          <p class="paper-text">{{ memory.cardText }}</p>
        </div>

        <blockquote v-if="memory.reaction" class="reaction">
          <p class="reaction-text">「{{ memory.reaction }}」</p>
          <footer class="reaction-author">— {{ characterName }}</footer>
        </blockquote>

        <section v-if="entries.length" class="diary">
          <h3 class="diary-title">日記</h3>
          <article v-for="entry in entries" :key="entry.id" class="diary-entry">
            <div class="entry-date">{{ entry.date }}</div>
            <p class="entry-content">{{ entry.excerpt }}</p>
          </article>
        </section>
      </div>
    </div>
  </Teleport>
</template>

<style lang="scss" scoped>
.memory-card-overlay {
  position: fixed;
  inset: 0;
  z-index: 1200;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  background: rgba(0, 0, 0, 0.55);
}

.memory-card {
  position: relative;
  width: 100%;
  max-width: 400px;
  max-height: 85vh;
  overflow-y: auto;
  padding: 24px 20px 28px;
  border-radius: 20px;
  background: var(--color-surface, #fff);
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.25);

  &::-webkit-scrollbar {
    width: 4px;
  }

  &::-webkit-scrollbar-thumb {
    background: var(--color-border, #eee);
    border-radius: 2px;
  }
}

.card-close {
  position: absolute;
  top: 12px;
  right: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  padding: 0;
  border: none;
  border-radius: 50%;
  background: var(--color-surface-hover, #f0f0f0);
  color: var(--color-text-secondary, #666);
  cursor: pointer;

  &:active {
    transform: scale(0.94);
  }
}

.gift-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 76px;
  height: 76px;
  margin: 0 auto 14px;
  border-radius: 50%;
  color: var(--color-text, #333);
  background: var(--color-surface-hover, #f0f0f0);

  &.rarity-common {
    background: #f1f2f4;
    color: #6b7280;
  }

  &.rarity-uncommon {
    background: #e3f6ec;
    color: #34a853;
  }

  &.rarity-rare {
    background: #e4eefc;
    color: #3b82f6;
  }

  &.rarity-epic {
    background: #efe8fd;
    color: #8b5cf6;
  }

  &.rarity-legendary {
    background: linear-gradient(135deg, #fdf0c8 0%, #fbdfd4 100%);
    color: #d97706;
  }

  &.rarity-special {
    background: #fdeee2;
    color: #e07a3f;
  }
}

.card-heading {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
}

.gift-name {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
  text-align: center;
  color: var(--color-text, #333);
}

.doll-tag {
  padding: 2px 8px;
  border-radius: 10px;
  font-size: 11px;
  font-weight: 500;
  color: var(--color-primary, #7dd3a8);
  background: rgba(125, 211, 168, 0.15);
}

.rarity-text {
  display: block;
  margin-top: 4px;
  font-size: 11px;
  text-align: center;
  color: var(--color-text-secondary, #666);

  &.rarity-legendary {
    color: #d97706;
  }

  &.rarity-special {
    color: #e07a3f;
  }
}

.direction-line {
  margin: 6px 0 0;
  font-size: 12px;
  text-align: center;
  color: var(--color-text-secondary, #666);
}

.gift-description {
  margin: 12px 0 0;
  font-size: 13px;
  line-height: 1.6;
  text-align: center;
  color: var(--color-text-secondary, #666);
}

.card-paper {
  position: relative;
  margin: 18px 2px 0;
  padding: 20px 14px 14px;
  border: 1px dashed var(--color-border, #ddd);
  border-radius: 8px;
  background: #fdf8ee;
  transform: rotate(-1deg);
}

.paper-label {
  position: absolute;
  top: 6px;
  left: 10px;
  font-size: 10px;
  letter-spacing: 1px;
  color: #b09a7c;
}

.paper-text {
  margin: 0;
  font-size: 13px;
  line-height: 1.7;
  color: #5a4a38;
  white-space: pre-wrap;
}

.reaction {
  margin: 18px 0 0;
  padding: 12px 14px;
  border-left: 3px solid var(--color-primary, #7dd3a8);
  border-radius: 0 10px 10px 0;
  background: var(--color-surface-hover, #f7f7f7);
}

.reaction-text {
  margin: 0;
  font-size: 13px;
  line-height: 1.7;
  color: var(--color-text, #333);
}

.reaction-author {
  margin-top: 6px;
  font-size: 12px;
  text-align: right;
  color: var(--color-text-secondary, #666);
}

.diary {
  margin-top: 20px;
  padding-top: 14px;
  border-top: 1px solid var(--color-border, #eee);
}

.diary-title {
  margin: 0 0 10px;
  font-size: 13px;
  font-weight: 600;
  color: var(--color-text, #333);
}

.diary-entry {
  padding: 10px 12px;
  border-radius: 10px;
  background: var(--color-surface-hover, #f7f7f7);

  & + & {
    margin-top: 8px;
  }
}

.entry-date {
  font-size: 11px;
  color: var(--color-text-secondary, #666);
}

.entry-content {
  margin: 4px 0 0;
  font-size: 12px;
  line-height: 1.6;
  color: var(--color-text, #333);
  white-space: pre-wrap;
}

body.is-night-mode {
  .gift-icon {
    &.rarity-common {
      background: rgba(255, 255, 255, 0.08);
      color: var(--color-text-secondary, #aaa);
    }

    &.rarity-uncommon {
      background: rgba(52, 211, 153, 0.15);
      color: #6ee7b7;
    }

    &.rarity-rare {
      background: rgba(96, 165, 250, 0.15);
      color: #93c5fd;
    }

    &.rarity-epic {
      background: rgba(167, 139, 250, 0.18);
      color: #c4b5fd;
    }

    &.rarity-legendary {
      background: linear-gradient(135deg, rgba(251, 191, 36, 0.2) 0%, rgba(248, 113, 113, 0.2) 100%);
      color: #fcd34d;
    }

    &.rarity-special {
      background: rgba(255, 183, 77, 0.15);
      color: #ffb74d;
    }
  }

  .card-close {
    background: var(--color-surface-hover, #2a2a3e);
    color: var(--color-text-secondary, #aaa);
  }

  .card-paper {
    border-color: rgba(240, 230, 216, 0.25);
    background: #3a3530;
  }

  .paper-label {
    color: #a8987f;
  }

  .paper-text {
    color: #f0e6d8;
  }

  .rarity-text {
    &.rarity-legendary {
      color: #fcd34d;
    }

    &.rarity-special {
      color: #ffb74d;
    }
  }
}
</style>
