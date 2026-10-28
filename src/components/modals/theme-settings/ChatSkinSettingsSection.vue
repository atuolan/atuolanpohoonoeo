<script setup lang="ts">
import { computed } from "vue";
import {
  CHAT_SKIN_SLOTS,
  CHAT_SKIN_SLOT_LABELS,
  OWN_COLOR_SLOTS,
  getPiecesForSlot,
  getChatSkinPiece,
  type ChatSkinSlot,
} from "@/data/chatSkins";
import { CHAT_SKIN_NONE } from "@/utils/chatSkinResolve";
import { useGameEconomyStore } from "@/stores/gameEconomy";
import { useChatSkinsStore } from "@/stores/chatSkins";

const props = defineProps<{
  scope: "global" | "chat";
  chatId?: string;
}>();

const emit = defineEmits<{
  (e: "openShop"): void;
}>();

const GLOBAL_WALLET_ID = "global";
const gameEconomyStore = useGameEconomyStore();
const chatSkinsStore = useChatSkinsStore();

const loadout = computed(() => gameEconomyStore.getChatSkinLoadout(GLOBAL_WALLET_ID));
const hasAnyOwned = computed(() => loadout.value.owned.length > 0);

const chatOverrides = computed(() => {
  if (props.scope !== "chat" || !props.chatId) return {};
  return chatSkinsStore.getChatOverrides(props.chatId);
});

function ownedPiecesForSlot(slot: ChatSkinSlot) {
  const pieces = getPiecesForSlot(slot);
  return pieces.filter((p) => loadout.value.owned.includes(p.id));
}

function globalEquippedPiece(slot: ChatSkinSlot) {
  const pieceId = loadout.value.equipped[slot];
  if (!pieceId) return null;
  return getChatSkinPiece(pieceId) ?? null;
}

function isSlotEquipped(slot: ChatSkinSlot): boolean {
  if (props.scope === "global") {
    return !!loadout.value.equipped[slot];
  }
  const override = chatOverrides.value.slots?.[slot];
  if (override !== undefined) {
    return override !== CHAT_SKIN_NONE;
  }
  return !!loadout.value.equipped[slot];
}

async function selectGlobalSlot(slot: ChatSkinSlot, pieceId: string | null) {
  gameEconomyStore.equipChatSkin(GLOBAL_WALLET_ID, slot, pieceId);
  await gameEconomyStore.saveState(GLOBAL_WALLET_ID);
}

function selectChatSlot(slot: ChatSkinSlot, choice: "inherit" | "none" | string) {
  if (!props.chatId) return;
  const current = chatSkinsStore.getChatOverrides(props.chatId);
  const nextSlots = { ...(current.slots ?? {}) };

  if (choice === "inherit") {
    delete nextSlots[slot];
  } else {
    nextSlots[slot] = choice;
  }

  const next = {
    ...current,
    slots: Object.keys(nextSlots).length > 0 ? nextSlots : undefined,
  };
  chatSkinsStore.setChatOverrides(props.chatId, next);
}

async function setGlobalOwnColors(slot: ChatSkinSlot, value: boolean) {
  gameEconomyStore.setChatSkinOwnColors(GLOBAL_WALLET_ID, slot, value);
  await gameEconomyStore.saveState(GLOBAL_WALLET_ID);
}

function setChatOwnColors(slot: ChatSkinSlot, mode: "inherit" | "on" | "off") {
  if (!props.chatId) return;
  const current = chatSkinsStore.getChatOverrides(props.chatId);
  const nextOwnColors = { ...(current.ownColors ?? {}) };

  if (mode === "inherit") {
    delete nextOwnColors[slot];
  } else {
    nextOwnColors[slot] = mode === "on";
  }

  const next = {
    ...current,
    ownColors: Object.keys(nextOwnColors).length > 0 ? nextOwnColors : undefined,
  };
  chatSkinsStore.setChatOverrides(props.chatId, next);
}
</script>

<template>
  <section class="settings-card chat-skin-settings-section">
    <div class="card-head">
      <h3 class="section-title">聊天裝扮</h3>
    </div>
    <p class="section-hint">
      {{ scope === "global" ? "套用到所有聊天" : "只改這個聊天，選「跟全域」就和其他聊天一樣" }}
    </p>

    <!-- 一件部件都沒有 -->
    <div v-if="!hasAnyOwned" class="empty-decorations">
      <p>還沒有聊天裝扮</p>
      <button class="open-shop-btn" @click="emit('openShop')">去商城看看</button>
    </div>

    <!-- 欄位設定列表 -->
    <div v-else class="slots-list">
      <div v-for="slot in CHAT_SKIN_SLOTS" :key="slot" class="slot-row">
        <div class="slot-header">
          <span class="slot-label">{{ CHAT_SKIN_SLOT_LABELS[slot] }}</span>
        </div>

        <!-- 部件選擇 grid -->
        <div class="decoration-grid">
          <!-- 單聊專屬：跟全域選項 -->
          <button
            v-if="scope === 'chat'"
            class="decoration-item"
            :class="{ active: chatOverrides.slots?.[slot] === undefined }"
            @click="selectChatSlot(slot, 'inherit')"
          >
            <span class="decoration-icon inherit">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="9" />
                <path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" />
              </svg>
            </span>
            <span class="decoration-name">
              跟全域{{ globalEquippedPiece(slot) ? `（${globalEquippedPiece(slot)?.name}）` : "（無）" }}
            </span>
          </button>

          <!-- 不裝選項 -->
          <button
            class="decoration-item"
            :class="{
              active:
                scope === 'global'
                  ? !loadout.equipped[slot]
                  : chatOverrides.slots?.[slot] === CHAT_SKIN_NONE,
            }"
            @click="scope === 'global' ? selectGlobalSlot(slot, null) : selectChatSlot(slot, CHAT_SKIN_NONE)"
          >
            <span class="decoration-icon none">
              <svg viewBox="0 0 24 24" fill="currentColor">
                <path
                  d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"
                />
              </svg>
            </span>
            <span class="decoration-name">不裝</span>
          </button>

          <!-- 已擁有部件 -->
          <button
            v-for="piece in ownedPiecesForSlot(slot)"
            :key="piece.id"
            class="decoration-item"
            :class="{
              active:
                scope === 'global'
                  ? loadout.equipped[slot] === piece.id
                  : chatOverrides.slots?.[slot] === piece.id,
            }"
            @click="scope === 'global' ? selectGlobalSlot(slot, piece.id) : selectChatSlot(slot, piece.id)"
          >
            <span class="decoration-icon piece-icon" :class="piece.rarity">
              <img
                v-if="piece.previewImage?.day"
                :src="piece.previewImage.day"
                :alt="piece.name"
                class="piece-preview-img"
              />
              <svg v-else viewBox="0 0 24 24" fill="currentColor">
                <path
                  d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 3c1.66 0 3 1.34 3 3s-1.34 3-3 3-3-1.34-3-3 1.34-3 3-3z"
                />
              </svg>
            </span>
            <span class="decoration-name">{{ piece.name }}</span>
          </button>
        </div>

        <!-- 用我自己的顏色：OWN_COLOR_SLOTS 且目前這一欄有裝部件時顯示 -->
        <div v-if="OWN_COLOR_SLOTS.includes(slot) && isSlotEquipped(slot)" class="own-colors-row">
          <span class="own-colors-label">用我自己的顏色</span>

          <!-- 全域：開關 toggle -->
          <label v-if="scope === 'global'" class="switch">
            <input
              type="checkbox"
              :checked="loadout.ownColors[slot] ?? false"
              @change="setGlobalOwnColors(slot, ($event.target as HTMLInputElement).checked)"
            />
            <span class="slider"></span>
          </label>

          <!-- 單聊：三選一（跟全域 / 開 / 關） -->
          <div v-else class="seg-control">
            <button
              type="button"
              :class="{ active: chatOverrides.ownColors?.[slot] === undefined }"
              @click="setChatOwnColors(slot, 'inherit')"
            >
              跟全域
            </button>
            <button
              type="button"
              :class="{ active: chatOverrides.ownColors?.[slot] === true }"
              @click="setChatOwnColors(slot, 'on')"
            >
              開
            </button>
            <button
              type="button"
              :class="{ active: chatOverrides.ownColors?.[slot] === false }"
              @click="setChatOwnColors(slot, 'off')"
            >
              關
            </button>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped lang="scss">
@use "@/styles/theme-settings-shared";

.chat-skin-settings-section {
  display: flex;
  flex-direction: column;
  gap: 12px;
  flex-shrink: 0;
  padding: 14px;
  border-radius: 18px;
  background: color-mix(in srgb, var(--color-background) 55%, var(--color-surface));
  box-shadow: inset 0 0 0 1.5px transparent;
}

.card-head {
  display: flex;
  align-items: center;
  gap: 8px;
}

.section-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--color-text-secondary);
  margin: 0;
  padding-top: 0;
}

.section-hint {
  font-size: 12px;
  color: var(--color-text-muted);
  margin: -4px 0 4px;
  line-height: 1.4;
}

.empty-decorations {
  text-align: center;
  padding: 24px 16px;
  color: var(--color-text-secondary);

  p {
    margin: 0 0 12px;
    font-size: 14px;
  }

  .open-shop-btn {
    padding: 8px 18px;
    background: var(--color-primary);
    color: var(--color-on-primary-contrast, #fff);
    border: none;
    border-radius: 999px;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    transition: opacity 0.2s ease;

    &:hover {
      opacity: 0.9;
    }
    &:active {
      transform: scale(0.97);
    }
  }
}

.slots-list {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.slot-row {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding-bottom: 12px;
  border-bottom: 1px solid color-mix(in srgb, var(--color-border) 40%, transparent);

  &:last-child {
    padding-bottom: 0;
    border-bottom: none;
  }
}

.slot-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.slot-label {
  font-size: 13px;
  font-weight: 600;
  color: var(--color-text);
}

.decoration-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(90px, 1fr));
  gap: 10px;
}

.decoration-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: 10px 6px;
  background: var(--color-background);
  border: none;
  border-radius: 16px;
  cursor: pointer;
  transition:
    background 0.2s,
    box-shadow 0.18s ease,
    transform 0.18s ease;

  &:hover {
    background: var(--color-surface-hover);
  }

  &:active {
    transform: scale(0.97);
  }

  &.active {
    background: var(--color-primary-light);
    box-shadow: inset 0 0 0 2px var(--color-primary);
  }

  .decoration-icon {
    width: 44px;
    height: 44px;
    border-radius: 12px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: white;
    overflow: hidden;

    svg {
      width: 24px;
      height: 24px;
    }

    &.inherit {
      background: #64748b;
    }

    &.none {
      background: #9ca3af;
    }

    &.common {
      background: #6b7280;
    }

    &.uncommon {
      background: #22c55e;
    }

    &.rare {
      background: #3b82f6;
    }

    &.epic {
      background: #a855f7;
    }

    &.legendary {
      background: linear-gradient(135deg, #f59e0b 0%, #ef4444 100%);
    }

    .piece-preview-img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }
  }

  .decoration-name {
    font-size: 11px;
    color: var(--color-text);
    text-align: center;
    line-height: 1.3;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
}

.own-colors-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  margin-top: 4px;
  background: var(--color-background);
  border-radius: 12px;
}

.own-colors-label {
  font-size: 12px;
  color: var(--color-text-secondary);
}

// 開關 (Toggle Switch)
.switch {
  position: relative;
  display: inline-block;
  width: 38px;
  height: 22px;

  input {
    opacity: 0;
    width: 0;
    height: 0;

    &:checked + .slider {
      background-color: var(--color-primary);

      &:before {
        transform: translateX(16px);
      }
    }
  }

  .slider {
    position: absolute;
    cursor: pointer;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background-color: rgba(0, 0, 0, 0.2);
    transition: 0.2s;
    border-radius: 22px;

    &:before {
      position: absolute;
      content: "";
      height: 16px;
      width: 16px;
      left: 3px;
      bottom: 3px;
      background-color: white;
      transition: 0.2s;
      border-radius: 50%;
    }
  }
}

body.is-night-mode .switch input:not(:checked) + .slider {
  background-color: rgba(255, 255, 255, 0.2);
}

// 分段控制項 (Seg Control)
.seg-control {
  display: flex;
  background: color-mix(in srgb, var(--color-border) 40%, transparent);
  padding: 2px;
  border-radius: 8px;
  gap: 2px;

  button {
    border: none;
    background: transparent;
    padding: 4px 10px;
    font-size: 12px;
    font-weight: 500;
    color: var(--color-text-secondary);
    border-radius: 6px;
    cursor: pointer;
    transition: all 0.15s ease;

    &:hover {
      color: var(--color-text);
    }

    &.active {
      background: var(--color-surface);
      color: var(--color-primary);
      font-weight: 600;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
    }
  }
}

body.is-night-mode .seg-control button.active {
  background: rgba(255, 255, 255, 0.12);
}
</style>
