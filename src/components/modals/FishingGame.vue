<template>
  <teleport to="body">
    <transition name="modal">
      <div v-if="visible" class="game-overlay" @click.self="handleClose">
        <div class="game-modal pixel-theme">
          <!-- 頭部 -->
          <div class="modal-header">
            <div class="header-left">
              <div class="game-icon">
                <!-- Pixel Fish Icon -->
                <svg
                  viewBox="0 0 16 16"
                  fill="currentColor"
                  shape-rendering="crispEdges"
                >
                  <path
                    d="M3 5h2v1h1v1h1v-1h2v-1h3v1h1v1h1v2h1v1h-1v1h-1v1h-3v-1h-2v-1h-1v1h-1v1h-2v-1h-1v-1h-1v-2h1v-1h1v-1z M12 7h1v1h-1v-1z"
                  />
                </svg>
              </div>
              <div class="header-info">
                <h3>釣魚</h3>
                <p class="subtitle">裝備魚竿，釣取珍稀魚種</p>
              </div>
            </div>
            <div class="header-actions">
              <button
                class="guide-btn"
                @click="showGuide = true"
                title="遊戲指南"
              >
                <HelpCircle :size="18" />
              </button>
              <button class="close-btn" @click="handleClose">
                <X :size="20" />
              </button>
            </div>
          </div>

          <!-- 可滾動內容區 -->
          <div class="modal-body">
            <!-- 魚竿資訊 -->
            <div class="rod-section">
              <div
                v-if="equippedRod"
                class="rod-info clickable"
                @click="showRodSelector = true"
              >
                <div class="rod-icon" :class="getRodRarity(equippedRod)">
                  <PixelRod :rod-id="getRodItemId(equippedRod)" :size="40" />
                </div>
                <div class="rod-details">
                  <div class="rod-name">{{ equippedRod.name }}</div>
                  <div class="rod-stats">
                    <span class="durability">
                      <Heart :size="12" />
                      {{ equippedRod.durability }}/{{
                        equippedRod.maxDurability
                      }}
                    </span>
                    <span class="tier">
                      Tier {{ equippedRod.minFishTier }}-{{
                        equippedRod.maxFishTier
                      }}
                    </span>
                  </div>
                </div>
                <div class="durability-bar">
                  <div
                    class="durability-fill"
                    :style="{
                      width: `${(equippedRod.durability / equippedRod.maxDurability) * 100}%`,
                    }"
                    :class="{
                      low:
                        equippedRod.durability <
                        equippedRod.maxDurability * 0.2,
                    }"
                  />
                </div>
                <div class="change-hint">
                  <RefreshCw :size="14" />
                </div>
              </div>
              <div v-else class="no-rod">
                <AlertCircle :size="20" />
                <span>請先裝備魚竿</span>
                <button class="equip-btn" @click="showRodSelector = true">
                  選擇魚竿
                </button>
              </div>
            </div>

            <!-- 遊戲區域 -->
            <div class="game-area">
              <!-- 釣魚場景 -->
              <div class="fishing-scene" :class="gamePhase">
                <!-- 天空背景層 -->
                <div class="sky-layer">
                  <!-- 太陽 -->
                  <div class="sun"></div>
                  <!-- 像素雲朵 -->
                  <div class="cloud cloud-1"></div>
                  <div class="cloud cloud-2"></div>
                  <div class="cloud cloud-3"></div>
                </div>

                <!-- 遠山層 -->
                <div class="mountains-layer">
                  <div class="mountain mountain-far"></div>
                  <div class="mountain mountain-mid"></div>
                  <div class="mountain mountain-near"></div>
                </div>

                <!-- 樹林層 -->
                <div class="trees-layer">
                  <div class="tree tree-1"></div>
                  <div class="tree tree-2"></div>
                  <div class="tree tree-3"></div>
                  <div class="tree tree-4"></div>
                </div>

                <!-- 水面 -->
                <div class="water">
                  <div class="water-surface"></div>
                  <div class="water-reflection"></div>
                  <div class="water-sparkles">
                    <div class="sparkle s1"></div>
                    <div class="sparkle s2"></div>
                    <div class="sparkle s3"></div>
                    <div class="sparkle s4"></div>
                    <div class="sparkle s5"></div>
                  </div>
                </div>

                <!-- 船和史萊姆 -->
                <div class="boat-group">
                  <!-- 船身 -->
                  <div class="boat">
                    <svg viewBox="0 0 80 25" class="boat-svg">
                      <path
                        d="M5 8 L75 8 L70 22 Q40 25 10 22 L5 8"
                        fill="#92400e"
                        stroke="#451a03"
                        stroke-width="2"
                      />
                      <rect
                        x="3"
                        y="5"
                        width="74"
                        height="5"
                        fill="#a16207"
                        stroke="#451a03"
                        stroke-width="1"
                      />
                      <line
                        x1="20"
                        y1="10"
                        x2="20"
                        y2="20"
                        stroke="#78350f"
                        stroke-width="1"
                      />
                      <line
                        x1="40"
                        y1="10"
                        x2="40"
                        y2="21"
                        stroke="#78350f"
                        stroke-width="1"
                      />
                      <line
                        x1="60"
                        y1="10"
                        x2="60"
                        y2="20"
                        stroke="#78350f"
                        stroke-width="1"
                      />
                    </svg>
                  </div>

                  <!-- 像素史萊姆 -->
                  <div
                    class="slime-fisher"
                    :class="{
                      casting: gamePhase === 'casting',
                      hooked: gamePhase === 'hooked',
                    }"
                  >
                    <svg
                      viewBox="0 0 48 38"
                      class="slime-svg"
                      shape-rendering="crispEdges"
                    >
                      <!-- 像素史萊姆 - 藍色，面向右邊（用戶編輯版本，黑色瞳孔） -->
                      <!-- 第1行 - 頂部輪廓 -->
                      <rect x="12" y="2" width="4" height="4" fill="#1e3a5f" />
                      <rect x="16" y="2" width="4" height="4" fill="#1e3a5f" />
                      <rect x="20" y="2" width="4" height="4" fill="#1e3a5f" />
                      <rect x="24" y="2" width="4" height="4" fill="#1e3a5f" />
                      <rect x="28" y="2" width="4" height="4" fill="#1e3a5f" />
                      <rect x="32" y="2" width="4" height="4" fill="#1e3a5f" />

                      <!-- 第2行 -->
                      <rect x="8" y="6" width="4" height="4" fill="#1e3a5f" />
                      <rect x="12" y="6" width="4" height="4" fill="#a5d8ff" />
                      <rect x="16" y="6" width="4" height="4" fill="#a5d8ff" />
                      <rect x="20" y="6" width="4" height="4" fill="#a5d8ff" />
                      <rect x="24" y="6" width="4" height="4" fill="#74c0fc" />
                      <rect x="28" y="6" width="4" height="4" fill="#74c0fc" />
                      <rect x="32" y="6" width="4" height="4" fill="#74c0fc" />
                      <rect x="36" y="6" width="4" height="4" fill="#1e3a5f" />

                      <!-- 第3行 - 高光 -->
                      <rect x="4" y="10" width="4" height="4" fill="#1e3a5f" />
                      <rect x="8" y="10" width="4" height="4" fill="#a5d8ff" />
                      <rect x="12" y="10" width="4" height="4" fill="#fff" />
                      <rect x="16" y="10" width="4" height="4" fill="#a5d8ff" />
                      <rect x="20" y="10" width="4" height="4" fill="#74c0fc" />
                      <rect x="24" y="10" width="4" height="4" fill="#74c0fc" />
                      <rect x="28" y="10" width="4" height="4" fill="#4dabf7" />
                      <rect x="32" y="10" width="4" height="4" fill="#4dabf7" />
                      <rect x="36" y="10" width="4" height="4" fill="#4dabf7" />
                      <rect x="40" y="10" width="4" height="4" fill="#1e3a5f" />

                      <!-- 第4行 -->
                      <rect x="4" y="14" width="4" height="4" fill="#1e3a5f" />
                      <rect x="8" y="14" width="4" height="4" fill="#a5d8ff" />
                      <rect x="12" y="14" width="4" height="4" fill="#a5d8ff" />
                      <rect x="16" y="14" width="4" height="4" fill="#74c0fc" />
                      <rect x="20" y="14" width="4" height="4" fill="#74c0fc" />
                      <rect x="24" y="14" width="4" height="4" fill="#4dabf7" />
                      <rect x="28" y="14" width="4" height="4" fill="#4dabf7" />
                      <rect x="32" y="14" width="4" height="4" fill="#4dabf7" />
                      <rect x="36" y="14" width="4" height="4" fill="#339af0" />
                      <rect x="40" y="14" width="4" height="4" fill="#1e3a5f" />

                      <!-- 第5行 - 眼睛（往右看，黑色瞳孔） -->
                      <rect x="4" y="18" width="4" height="4" fill="#1e3a5f" />
                      <rect x="8" y="18" width="4" height="4" fill="#74c0fc" />
                      <rect x="12" y="18" width="4" height="4" fill="#74c0fc" />
                      <rect x="16" y="18" width="4" height="4" fill="#ffffff" />
                      <rect x="20" y="18" width="4" height="4" fill="#000000" />
                      <rect x="24" y="18" width="4" height="4" fill="#4dabf7" />
                      <rect x="28" y="18" width="4" height="4" fill="#fff" />
                      <rect x="32" y="18" width="4" height="4" fill="#000000" />
                      <rect x="36" y="18" width="4" height="4" fill="#339af0" />
                      <rect x="40" y="18" width="4" height="4" fill="#1e3a5f" />

                      <!-- 第6行 - 臉部下半（眼睛下方黑色） -->
                      <rect x="4" y="22" width="4" height="4" fill="#1e3a5f" />
                      <rect x="8" y="22" width="4" height="4" fill="#74c0fc" />
                      <rect x="12" y="22" width="4" height="4" fill="#4dabf7" />
                      <rect x="16" y="22" width="4" height="4" fill="#000000" />
                      <rect x="20" y="22" width="4" height="4" fill="#000000" />
                      <rect x="24" y="22" width="4" height="4" fill="#339af0" />
                      <rect x="28" y="22" width="4" height="4" fill="#000000" />
                      <rect x="32" y="22" width="4" height="4" fill="#000000" />
                      <rect x="36" y="22" width="4" height="4" fill="#228be6" />
                      <rect x="40" y="22" width="4" height="4" fill="#1e3a5f" />

                      <!-- 第7行 - 底部 -->
                      <rect x="4" y="26" width="4" height="4" fill="#1e3a5f" />
                      <rect x="8" y="26" width="4" height="4" fill="#4dabf7" />
                      <rect x="12" y="26" width="4" height="4" fill="#4dabf7" />
                      <rect x="16" y="26" width="4" height="4" fill="#339af0" />
                      <rect x="20" y="26" width="4" height="4" fill="#339af0" />
                      <rect x="24" y="26" width="4" height="4" fill="#339af0" />
                      <rect x="28" y="26" width="4" height="4" fill="#228be6" />
                      <rect x="32" y="26" width="4" height="4" fill="#228be6" />
                      <rect x="36" y="26" width="4" height="4" fill="#1e3a5f" />

                      <!-- 第8行 - 最底部（淺色反光） -->
                      <rect x="8" y="30" width="4" height="4" fill="#1e3a5f" />
                      <rect x="12" y="30" width="4" height="4" fill="#a5d8ff" />
                      <rect x="16" y="30" width="4" height="4" fill="#a5d8ff" />
                      <rect x="20" y="30" width="4" height="4" fill="#a5d8ff" />
                      <rect x="24" y="30" width="4" height="4" fill="#a5d8ff" />
                      <rect x="28" y="30" width="4" height="4" fill="#a5d8ff" />
                      <rect x="32" y="30" width="4" height="4" fill="#1e3a5f" />
                    </svg>
                  </div>

                  <!-- 像素魚竿（根據裝備的魚竿顯示） -->
                  <div
                    class="fishing-rod"
                    :class="{
                      casting: gamePhase === 'casting',
                      hooked: gamePhase === 'hooked',
                    }"
                  >
                    <PixelRod
                      :rod-id="
                        equippedRod ? getRodItemId(equippedRod) : 'rod_bamboo'
                      "
                      :size="100"
                    />
                  </div>
                </div>

                <!-- 魚線和浮標（移到 boat-group 外面） -->
                <div
                  class="fishing-line-group"
                  :class="{
                    casting: gamePhase === 'casting',
                    waiting: gamePhase === 'waiting',
                    hooked: gamePhase === 'hooked',
                    caught: gamePhase === 'caught',
                  }"
                >
                  <div class="line"></div>
                  <div class="bobber">
                    <svg viewBox="0 0 12 18" class="bobber-svg">
                      <ellipse
                        cx="6"
                        cy="9"
                        rx="5"
                        ry="8"
                        fill="#ef4444"
                        stroke="#1e293b"
                        stroke-width="1"
                      />
                      <ellipse cx="6" cy="13" rx="5" ry="4" fill="#fff" />
                      <ellipse
                        cx="4"
                        cy="6"
                        rx="1.5"
                        ry="2"
                        fill="#fff"
                        opacity="0.5"
                      />
                    </svg>
                  </div>
                </div>

                <!-- 魚（上鉤時顯示） -->
                <transition name="fish">
                  <div
                    v-if="gamePhase === 'hooked' || gamePhase === 'caught'"
                    class="fish-sprite"
                    :class="{ caught: gamePhase === 'caught' }"
                  >
                    <!-- 根據釣到的魚顯示對應圖案 -->
                    <PixelFish
                      :fish-id="caughtFish?.fishTypeId || 'fish_goldfish'"
                      :size="42"
                    />
                  </div>
                </transition>

                <!-- 水中小魚裝飾 -->
                <div class="underwater-fish">
                  <div class="small-fish fish-a"></div>
                  <div class="small-fish fish-b"></div>
                </div>

                <!-- 提示文字 -->
                <div class="phase-hint" :class="gamePhase">
                  <div class="hint-box">
                    <div class="hint-icon">
                      <template v-if="gamePhase === 'idle'">
                        <svg viewBox="0 0 16 16" fill="currentColor">
                          <path
                            d="M8 2v2h2v2h2v2h-2v2h-2v2h-2v-2h-2v-2h-2v-2h2v-2h2v-2z"
                          />
                        </svg>
                      </template>
                      <template v-else-if="gamePhase === 'hooked'">
                        <svg viewBox="0 0 16 16" fill="currentColor">
                          <path d="M7 2h2v8h-2zM7 12h2v2h-2z" />
                        </svg>
                      </template>
                      <template v-else-if="gamePhase === 'caught'">
                        <svg viewBox="0 0 16 16" fill="currentColor">
                          <path d="M2 8l2-2 3 3 5-5 2 2-7 7z" />
                        </svg>
                      </template>
                      <template v-else>
                        <svg viewBox="0 0 16 16" fill="currentColor">
                          <path d="M4 4h8v2h-8zM4 8h6v2h-6zM4 12h4v2h-4z" />
                        </svg>
                      </template>
                    </div>
                    <div class="hint-text">
                      <template v-if="gamePhase === 'idle'">
                        <span v-if="equippedRod">PRESS CAST</span>
                        <span v-else>EQUIP ROD</span>
                      </template>
                      <template v-else-if="gamePhase === 'casting'">
                        <span>CASTING...</span>
                      </template>
                      <template v-else-if="gamePhase === 'waiting'">
                        <span>WAITING...</span>
                      </template>
                      <template v-else-if="gamePhase === 'hooked'">
                        <span class="alert-text">!!! PULL !!!</span>
                      </template>
                      <template v-else-if="gamePhase === 'caught'">
                        <span class="success-text">CAUGHT!</span>
                      </template>
                      <template v-else-if="gamePhase === 'missed'">
                        <span class="fail-text">MISSED...</span>
                      </template>
                    </div>
                  </div>
                </div>
              </div>
              <!-- 結束 fishing-scene -->

              <!-- 操作按鈕 -->
              <div class="action-buttons">
                <!-- 掛機中狀態 -->
                <template v-if="isIdling">
                  <div class="idle-status">
                    <div class="idle-info">
                      <Clock :size="16" />
                      <span>掛機中 {{ idleDurationText }}</span>
                    </div>
                    <div class="idle-preview">
                      <Fish :size="14" />
                      <span>預計 {{ idleRewards?.fishCount || 0 }} 條魚</span>
                    </div>
                  </div>
                  <button class="claim-btn pixel-btn" @click="handleClaimIdle">
                    <Gift :size="20" />
                    <span>領取收益</span>
                  </button>
                  <button
                    class="cancel-idle-btn pixel-btn secondary"
                    @click="handleCancelIdle"
                  >
                    <X :size="16" />
                    <span>取消</span>
                  </button>
                </template>
                <!-- 正常遊戲狀態 -->
                <template v-else>
                  <button
                    v-if="gamePhase === 'idle'"
                    class="cast-btn pixel-btn"
                    :disabled="!canFish"
                    @click="startFishing"
                  >
                    <Anchor :size="20" />
                    <span>拋竿</span>
                  </button>
                  <button
                    v-if="gamePhase === 'idle' && canFish"
                    class="idle-btn pixel-btn secondary"
                    @click="handleStartIdle"
                  >
                    <Moon :size="18" />
                    <span>掛機釣魚</span>
                  </button>
                  <button
                    v-if="gamePhase === 'hooked'"
                    class="reel-btn pixel-btn"
                    @click="reelIn"
                  >
                    <ArrowUp :size="20" />
                    <span>收竿！</span>
                  </button>
                  <button
                    v-if="gamePhase === 'caught' || gamePhase === 'missed'"
                    class="continue-btn pixel-btn"
                    @click="resetGame"
                  >
                    <RotateCcw :size="20" />
                    <span>繼續</span>
                  </button>
                </template>
              </div>
              <!-- 結束 action-buttons -->
            </div>
            <!-- 結束 game-area -->

            <!-- 釣到的魚展示 -->
            <transition name="catch-result">
              <div
                v-if="caughtFish && gamePhase === 'caught'"
                class="catch-result"
              >
                <div class="fish-card" :class="caughtFish.rarity">
                  <div class="fish-icon">
                    <PixelFish :fish-id="caughtFish.fishTypeId" :size="32" />
                  </div>
                  <div class="fish-info">
                    <div class="fish-name">{{ caughtFish.name }}</div>
                    <div class="fish-details">
                      <span class="weight"
                        >{{ caughtFish.weight.toFixed(2) }} kg</span
                      >
                      <span class="rarity-badge" :class="caughtFish.rarity">{{
                        rarityLabels[caughtFish.rarity]
                      }}</span>
                    </div>
                    <div class="fish-price">
                      <Coins :size="14" />
                      <span>{{ caughtFish.finalPrice }}</span>
                    </div>
                  </div>
                </div>
              </div>
            </transition>

            <!-- 魚簍 -->
            <div class="inventory-section">
              <div class="section-header">
                <Package :size="18" />
                <span>魚簍 ({{ fishInventory.length }})</span>
                <button
                  v-if="fishInventory.length > 0"
                  class="sell-all-btn pixel-btn"
                  @click="handleSellAll"
                >
                  <Coins :size="14" />
                  <span>全部賣出 ({{ totalFishValue }})</span>
                </button>
              </div>
              <div v-if="fishInventory.length > 0" class="fish-list">
                <div
                  v-for="fish in fishInventory.slice(0, 6)"
                  :key="fish.id"
                  class="fish-item"
                  :class="fish.rarity"
                >
                  <div class="fish-mini-icon">
                    <PixelFish :fish-id="fish.fishTypeId" :size="20" />
                  </div>
                  <div class="fish-mini-info">
                    <span class="name">{{ fish.name }}</span>
                    <span class="price">{{ fish.finalPrice }}</span>
                  </div>
                </div>
                <div v-if="fishInventory.length > 6" class="more-fish">
                  +{{ fishInventory.length - 6 }} MORE
                </div>
              </div>
              <div v-else class="empty-inventory">
                <span>魚簍是空的</span>
              </div>
            </div>
          </div>
          <!-- 結束 modal-body -->

          <!-- 魚竿選擇器 -->
          <transition name="slide-up">
            <div
              v-if="showRodSelector"
              class="rod-selector-overlay"
              @click.self="showRodSelector = false"
            >
              <div class="rod-selector pixel-theme">
                <div class="selector-header">
                  <h4>SELECT ROD</h4>
                  <button class="close-btn" @click="showRodSelector = false">
                    <X :size="18" />
                  </button>
                </div>
                <div class="rod-list">
                  <!-- 直接顯示每根魚竿（每種類型只有一根） -->
                  <div
                    v-for="rod in sortedRods"
                    :key="rod.id"
                    class="rod-item"
                    :class="{
                      selected: equippedRod?.id === rod.id,
                      [getRodRarity(rod)]: true,
                    }"
                    @click="selectRod(rod)"
                  >
                    <div class="rod-item-icon" :class="getRodRarity(rod)">
                      <PixelRod :rod-id="getRodItemId(rod)" :size="32" />
                    </div>
                    <div class="rod-item-info">
                      <span class="rod-item-name">{{ rod.name }}</span>
                      <div class="rod-item-durability">
                        <div
                          class="dur-bar"
                          :style="{
                            width: `${(rod.durability / rod.maxDurability) * 100}%`,
                          }"
                          :class="{
                            low: rod.durability < rod.maxDurability * 0.2,
                          }"
                        />
                      </div>
                      <span class="rod-item-stats">
                        {{ rod.durability }}/{{ rod.maxDurability }}
                      </span>
                    </div>
                    <CheckCircle
                      v-if="equippedRod?.id === rod.id"
                      :size="20"
                      class="check-icon"
                    />
                  </div>
                  <div v-if="fishingRods.length === 0" class="no-rods">
                    <span>NO RODS AVAILABLE</span>
                  </div>
                </div>
              </div>
            </div>
          </transition>

          <!-- 遊戲指南 -->
          <FishingGuideModal :visible="showGuide" @close="showGuide = false" />
        </div>
      </div>
    </transition>
  </teleport>
</template>

<script setup lang="ts">
import PixelFish from "@/components/common/PixelFish.vue";
import PixelRod from "@/components/common/PixelRod.vue";
import FishingGuideModal from "@/components/modals/FishingGuideModal.vue";
import { getShopItemById } from "@/data/shopItems";
import type { CaughtFish, FishingRod, Rarity } from "@/schemas/gameEconomy";
import { useNotificationStore } from "@/stores";
import { useGameEconomyStore } from "@/stores/gameEconomy";
import {
    AlertCircle,
    Anchor,
    ArrowUp,
    CheckCircle,
    Clock,
    Coins,
    Fish,
    Gift,
    Heart,
    HelpCircle,
    Moon,
    Package,
    RefreshCw,
    RotateCcw,
    X,
} from "lucide-vue-next";
import { computed, onUnmounted, ref, watch } from "vue";

type GamePhase =
  | "idle"
  | "casting"
  | "waiting"
  | "hooked"
  | "caught"
  | "missed";

const props = defineProps<{
  visible: boolean;
  chatId?: string;
}>();

const emit = defineEmits<{
  close: [];
  catch: [fish: CaughtFish];
}>();

// Store
const gameEconomyStore = useGameEconomyStore();
const notificationStore = useNotificationStore();

// 全局錢包 ID
const GLOBAL_WALLET_ID = "global";

// 遊戲狀態
const gamePhase = ref<GamePhase>("idle");
const caughtFish = ref<CaughtFish | null>(null);
const showRodSelector = ref(false);
const showGuide = ref(false);

// 計時器
let waitTimer: ReturnType<typeof setTimeout> | null = null;
let hookTimer: ReturnType<typeof setTimeout> | null = null;

// 稀有度標籤
const rarityLabels: Record<Rarity, string> = {
  common: "普通",
  uncommon: "稀有",
  rare: "珍稀",
  epic: "史詩",
  legendary: "傳說",
};

// 計算屬性
const equippedRod = computed(() => {
  return gameEconomyStore.getEquippedRod(GLOBAL_WALLET_ID);
});

const fishingRods = computed(() => {
  return gameEconomyStore.getFishingRods(GLOBAL_WALLET_ID);
});

const fishInventory = computed(() => {
  return gameEconomyStore.getFishInventory(GLOBAL_WALLET_ID);
});

const totalFishValue = computed(() => {
  return fishInventory.value.reduce((sum, fish) => sum + fish.finalPrice, 0);
});

const canFish = computed(() => {
  return equippedRod.value && equippedRod.value.durability > 0;
});

// 掛機相關
const isIdling = computed(() => {
  return gameEconomyStore.isIdle(GLOBAL_WALLET_ID);
});

const idleSession = computed(() => {
  return gameEconomyStore.getCurrentIdleSession(GLOBAL_WALLET_ID);
});

const idleRewards = computed(() => {
  if (!isIdling.value) return null;
  return gameEconomyStore.calculateIdleRewards(GLOBAL_WALLET_ID);
});

const idleDurationText = computed(() => {
  if (!idleRewards.value) return "";
  const minutes = Math.floor(idleRewards.value.duration / 60000);
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hours > 0) {
    return `${hours}小時${mins}分鐘`;
  }
  return `${mins}分鐘`;
});

// 掛機更新計時器
let idleUpdateTimer: ReturnType<typeof setInterval> | null = null;
const idleUpdateTrigger = ref(0);

function startIdleUpdateTimer() {
  if (idleUpdateTimer) return;
  idleUpdateTimer = setInterval(() => {
    idleUpdateTrigger.value++;
  }, 10000); // 每 10 秒更新一次顯示
}

function stopIdleUpdateTimer() {
  if (idleUpdateTimer) {
    clearInterval(idleUpdateTimer);
    idleUpdateTimer = null;
  }
}

// 按稀有度排序魚竿
const sortedRods = computed(() => {
  const rarityOrder = ["common", "uncommon", "rare", "epic", "legendary"];
  return [...fishingRods.value].sort((a, b) => {
    const rarityA = getRodRarity(a);
    const rarityB = getRodRarity(b);
    return rarityOrder.indexOf(rarityA) - rarityOrder.indexOf(rarityB);
  });
});

// 方法
function handleClose() {
  clearTimers();
  emit("close");
}

function clearTimers() {
  if (waitTimer) {
    clearTimeout(waitTimer);
    waitTimer = null;
  }
  if (hookTimer) {
    clearTimeout(hookTimer);
    hookTimer = null;
  }
}

function getRodRarity(rod: FishingRod): string {
  // 根據魚竿名稱找到對應的商品來獲取稀有度
  const rodItems = [
    "rod_bamboo",
    "rod_wooden",
    "rod_carbon",
    "rod_steel",
    "rod_pro",
    "rod_titanium",
    "rod_gold",
    "rod_legendary",
  ];
  for (const itemId of rodItems) {
    const item = getShopItemById(itemId);
    if (item && item.name === rod.name) {
      return item.rarity;
    }
  }
  return "common";
}

function getRodItemId(rod: FishingRod): string {
  // 根據魚竿名稱找到對應的商品 ID
  const rodItems = [
    "rod_bamboo",
    "rod_wooden",
    "rod_carbon",
    "rod_steel",
    "rod_pro",
    "rod_titanium",
    "rod_gold",
    "rod_legendary",
  ];
  for (const itemId of rodItems) {
    const item = getShopItemById(itemId);
    if (item && item.name === rod.name) {
      return itemId;
    }
  }
  return "rod_bamboo";
}

function startFishing() {
  if (!canFish.value) return;

  gamePhase.value = "casting";
  caughtFish.value = null;

  // 拋竿動畫後進入等待
  setTimeout(() => {
    gamePhase.value = "waiting";

    // 隨機等待時間 (2-8 秒)
    const waitTime = 2000 + Math.random() * 6000;
    waitTimer = setTimeout(() => {
      gamePhase.value = "hooked";

      // 上鉤後有 3 秒時間收竿
      hookTimer = setTimeout(() => {
        if (gamePhase.value === "hooked") {
          gamePhase.value = "missed";
        }
      }, 3000);
    }, waitTime);
  }, 800);
}

async function reelIn() {
  if (gamePhase.value !== "hooked") return;

  clearTimers();

  // 執行釣魚邏輯
  const result = gameEconomyStore.catchFish(GLOBAL_WALLET_ID);

  if (result.success && result.fish) {
    caughtFish.value = result.fish;
    gamePhase.value = "caught";

    // 保存狀態
    await gameEconomyStore.saveState(GLOBAL_WALLET_ID);

    // 魚竿損壞通知
    if (result.rodBroken) {
      notificationStore.notifyFishingStamina();
    }

    // 發送事件
    emit("catch", result.fish);
  } else {
    gamePhase.value = "missed";
  }
}

function resetGame() {
  clearTimers();
  gamePhase.value = "idle";
  caughtFish.value = null;
}

async function selectRod(rod: FishingRod) {
  if (rod.durability <= 0) return;

  gameEconomyStore.equipRod(GLOBAL_WALLET_ID, rod.id);
  await gameEconomyStore.saveState(GLOBAL_WALLET_ID);
  showRodSelector.value = false;
}

async function handleSellAll() {
  const amount = gameEconomyStore.sellAllFish(GLOBAL_WALLET_ID);
  if (amount > 0) {
    await gameEconomyStore.saveState(GLOBAL_WALLET_ID);
  }
}

// 掛機操作
async function handleStartIdle() {
  if (!canFish.value) return;

  const result = gameEconomyStore.startIdleSession(GLOBAL_WALLET_ID);
  if (result.success) {
    await gameEconomyStore.saveState(GLOBAL_WALLET_ID);
    startIdleUpdateTimer();
  }
}

async function handleClaimIdle() {
  // 先檢查是否達到 24h 上限
  const rewards = gameEconomyStore.calculateIdleRewards(GLOBAL_WALLET_ID);
  const hitDailyLimit =
    rewards.hasSession && rewards.duration > rewards.effectiveDuration;

  const result = gameEconomyStore.claimIdleRewards(GLOBAL_WALLET_ID);
  if (result.success) {
    await gameEconomyStore.saveState(GLOBAL_WALLET_ID);
    stopIdleUpdateTimer();

    // 魚竿損壞通知
    if (result.rodBroken) {
      notificationStore.notifyFishingStamina();
    }

    // 24h 掛機上限通知
    if (hitDailyLimit) {
      notificationStore.notifyFishingDailyLimit();
    }
  }
}

async function handleCancelIdle() {
  gameEconomyStore.cancelIdleSession(GLOBAL_WALLET_ID);
  await gameEconomyStore.saveState(GLOBAL_WALLET_ID);
  stopIdleUpdateTimer();
}

// 監聯可見性
watch(
  () => props.visible,
  async (visible) => {
    if (visible) {
      // 強制重新載入狀態（會自動合併魚竿）
      await gameEconomyStore.loadState(GLOBAL_WALLET_ID, true);
      // 額外保存一次確保合併結果被保存
      await gameEconomyStore.saveState(GLOBAL_WALLET_ID);
      resetGame();
      // 如果正在掛機，啟動更新計時器
      if (gameEconomyStore.isIdle(GLOBAL_WALLET_ID)) {
        startIdleUpdateTimer();
      }
    } else {
      clearTimers();
      stopIdleUpdateTimer();
    }
  },
  { immediate: true },
);

// 清理
onUnmounted(() => {
  clearTimers();
  stopIdleUpdateTimer();
});
</script>

<style scoped lang="scss">
@import url("https://fonts.googleapis.com/css2?family=Press+Start+2P&display=swap");

// Pixel Art Theme Variables
$pixel-black: #1a1a1a;
$pixel-white: #ffffff;
$pixel-gray: #9ca3af;
$pixel-dark-gray: #4b5563;
$pixel-border: 4px solid $pixel-black;
$pixel-shadow: 4px 4px 0px rgba(0, 0, 0, 0.2);
$pixel-font: "Press Start 2P", "Courier New", monospace;

.game-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10000;
  backdrop-filter: none; // Disable glass effect for retro look
  padding: 20px;
}

.game-modal {
  background: $pixel-white;
  border-radius: 0; // No rounded corners
  border: $pixel-border; // Hard border
  width: 100%;
  max-width: 420px;
  max-height: 90vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  box-shadow: 8px 8px 0px rgba(0, 0, 0, 0.5); // Hard block shadow
  font-family: $pixel-font; // Retro font
}

// ===== 可滾動內容區 =====
.modal-body {
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  scrollbar-width: thin;
  scrollbar-color: $pixel-black #e5e7eb;

  &::-webkit-scrollbar {
    width: 8px;
  }
  &::-webkit-scrollbar-thumb {
    background: $pixel-black;
    border-radius: 0;
  }
  &::-webkit-scrollbar-track {
    background: #e5e7eb;
  }
}

// ===== 頭部 =====
.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: $pixel-border;
  background: #f3f4f6;

  .header-left {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .game-icon {
    width: 44px;
    height: 44px;
    background: #22d3ee;
    border: 2px solid $pixel-black;
    border-radius: 0;
    box-shadow: 2px 2px 0px rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;

    svg {
      width: 28px;
      height: 28px;
      color: $pixel-black;
    }
  }

  .header-info {
    h3 {
      margin: 0;
      font-size: 14px; // Smaller pixel font
      font-weight: 400; // Pixel font usually doesn't need bold
      color: $pixel-black;
      line-height: 1.5;
    }

    .subtitle {
      margin: 4px 0 0;
      font-size: 10px;
      color: $pixel-dark-gray;
    }
  }

  .header-actions {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .guide-btn {
    width: 36px;
    height: 36px;
    border: 2px solid $pixel-black;
    background: #3b82f6;
    border-radius: 0;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    color: white;
    transition: none;
    box-shadow: 2px 2px 0px rgba(0, 0, 0, 0.5);

    &:active {
      transform: translate(2px, 2px);
      box-shadow: none;
    }

    &:hover {
      background: #2563eb;
    }
  }

  .close-btn {
    width: 36px;
    height: 36px;
    border: 2px solid $pixel-black;
    background: #ef4444;
    border-radius: 0;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    color: white;
    transition: none; // No smooth transition
    box-shadow: 2px 2px 0px rgba(0, 0, 0, 0.5);

    &:active {
      transform: translate(2px, 2px);
      box-shadow: none;
    }
  }
}

// ===== 魚竿區域 =====
.rod-section {
  padding: 12px 20px;
  background: #ffffff;
  border-bottom: $pixel-border;
}

.rod-info {
  display: flex;
  align-items: center;
  gap: 12px;
  position: relative;

  &.clickable {
    cursor: pointer;
    transition: background 0.1s;
    padding: 8px;
    margin: -8px;
    border: 2px solid transparent;

    &:hover {
      background: rgba(0, 0, 0, 0.05);
      border-color: #d1d5db;
    }

    &:active {
      background: rgba(0, 0, 0, 0.1);
    }
  }

  .change-hint {
    color: #9ca3af;
    display: flex;
    align-items: center;
    margin-left: 8px;
  }

  .rod-icon {
    width: 40px;
    height: 40px;
    border: 2px solid $pixel-black;
    box-shadow: 2px 2px 0px rgba(0, 0, 0, 0.3);
    border-radius: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    color: $pixel-black;
    background: #e5e7eb;

    svg {
      width: 24px;
      height: 24px;
    }

    &.common {
      background: #d1d5db;
    }
    &.uncommon {
      background: #86efac;
    }
    &.rare {
      background: #93c5fd;
    }
    &.epic {
      background: #d8b4fe;
    }
    &.legendary {
      background: #fcd34d;
    }
  }

  .rod-details {
    flex: 1;

    .rod-name {
      font-size: 12px;
      font-weight: 400;
      color: $pixel-black;
      margin-bottom: 4px;
    }

    .rod-stats {
      display: flex;
      gap: 12px;
      font-size: 10px;
      color: $pixel-dark-gray;

      span {
        display: flex;
        align-items: center;
        gap: 4px;
      }
    }
  }

  .durability-bar {
    width: 60px;
    height: 12px;
    background: #e5e7eb;
    border: 2px solid $pixel-black;
    border-radius: 0;
    overflow: hidden;

    .durability-fill {
      height: 100%;
      background: #22c55e;
      border-right: 2px solid $pixel-black; // Indicator line
      transition: width 0.3s steps(5); // Stepped animation

      &.low {
        background: #ef4444;
      }
    }
  }
}

.no-rod {
  display: flex;
  align-items: center;
  gap: 8px;
  color: $pixel-dark-gray;
  font-size: 10px;

  .equip-btn {
    margin-left: auto;
    padding: 8px 12px;
    background: #06b6d4;
    border: 2px solid $pixel-black;
    border-radius: 0;
    font-size: 10px;
    font-weight: 400;
    color: white;
    cursor: pointer;
    box-shadow: 2px 2px 0px rgba(0, 0, 0, 0.5);
    font-family: $pixel-font;

    &:active {
      transform: translate(2px, 2px);
      box-shadow: none;
    }
  }
}

// ===== 釣魚場景 - 精緻像素風格 =====
.game-area {
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
  background: #f0f9ff;
}

.fishing-scene {
  position: relative;
  overflow: hidden;
  border-bottom: $pixel-border;
  image-rendering: pixelated;
  height: 220px;
  min-height: 220px;

  // 天空漸層背景
  background: linear-gradient(
    180deg,
    #7dd3fc 0%,
    #38bdf8 25%,
    #0ea5e9 50%,
    #bae6fd 75%,
    #e0f2fe 100%
  );
}

// ===== 天空層 =====
.sky-layer {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 55%;
  pointer-events: none;
}

.sun {
  position: absolute;
  top: 12px;
  right: 25px;
  width: 28px;
  height: 28px;
  background: #fef08a;
  border: 3px solid #fde047;
  box-shadow: 0 0 0 3px rgba(253, 224, 71, 0.3);
}

.cloud {
  position: absolute;
  background: #fff;

  &::before,
  &::after {
    content: "";
    position: absolute;
    background: #fff;
  }

  &.cloud-1 {
    top: 18px;
    left: 12%;
    width: 40px;
    height: 14px;

    &::before {
      top: -7px;
      left: 6px;
      width: 28px;
      height: 10px;
    }
    &::after {
      top: -3px;
      left: 24px;
      width: 14px;
      height: 6px;
    }
  }

  &.cloud-2 {
    top: 32px;
    left: 50%;
    width: 32px;
    height: 10px;

    &::before {
      top: -5px;
      left: 5px;
      width: 22px;
      height: 8px;
    }
  }

  &.cloud-3 {
    top: 45px;
    left: 22%;
    width: 24px;
    height: 8px;
    opacity: 0.7;

    &::before {
      top: -4px;
      left: 3px;
      width: 18px;
      height: 6px;
    }
  }
}

// ===== 遠山層 =====
.mountains-layer {
  position: absolute;
  bottom: 48%;
  left: 0;
  right: 0;
  height: 50px;
  pointer-events: none;
}

.mountain {
  position: absolute;
  bottom: 0;

  &.mountain-far {
    left: 3%;
    width: 0;
    height: 0;
    border-left: 45px solid transparent;
    border-right: 45px solid transparent;
    border-bottom: 38px solid #c7d2fe;
    opacity: 0.7;
  }

  &.mountain-mid {
    left: 22%;
    width: 0;
    height: 0;
    border-left: 60px solid transparent;
    border-right: 60px solid transparent;
    border-bottom: 48px solid #a5b4fc;
    opacity: 0.8;
  }

  &.mountain-near {
    right: 8%;
    width: 0;
    height: 0;
    border-left: 55px solid transparent;
    border-right: 55px solid transparent;
    border-bottom: 42px solid #818cf8;
    opacity: 0.85;
  }
}

// ===== 樹林層 =====
.trees-layer {
  position: absolute;
  bottom: 48%;
  left: 0;
  right: 0;
  height: 35px;
  pointer-events: none;
}

.tree {
  position: absolute;
  bottom: 0;

  &::before {
    content: "";
    position: absolute;
    bottom: 7px;
    left: 50%;
    transform: translateX(-50%);
    width: 0;
    height: 0;
    border-left: 10px solid transparent;
    border-right: 10px solid transparent;
    border-bottom: 18px solid #166534;
  }

  &::after {
    content: "";
    position: absolute;
    bottom: 0;
    left: 50%;
    transform: translateX(-50%);
    width: 5px;
    height: 8px;
    background: #78350f;
  }

  &.tree-1 {
    left: 3%;
  }
  &.tree-2 {
    left: 10%;
    &::before {
      border-bottom-color: #15803d;
    }
  }
  &.tree-3 {
    right: 12%;
  }
  &.tree-4 {
    right: 3%;
    &::before {
      border-bottom-color: #14532d;
    }
  }
}

// ===== 水面 =====
.water {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  height: 48%;
  background: linear-gradient(180deg, #0284c7 0%, #0369a1 40%, #075985 100%);

  .water-surface {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    height: 6px;
    background: repeating-linear-gradient(
      90deg,
      #7dd3fc 0px,
      #7dd3fc 6px,
      #38bdf8 6px,
      #38bdf8 12px
    );
  }

  .water-reflection {
    position: absolute;
    top: 8px;
    left: 0;
    right: 0;
    bottom: 0;
    background: repeating-linear-gradient(
      0deg,
      transparent 0px,
      transparent 10px,
      rgba(125, 211, 252, 0.12) 10px,
      rgba(125, 211, 252, 0.12) 12px
    );
  }

  .water-sparkles {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
  }

  .sparkle {
    position: absolute;
    width: 3px;
    height: 3px;
    background: rgba(255, 255, 255, 0.5);

    &.s1 {
      top: 18%;
      left: 12%;
    }
    &.s2 {
      top: 32%;
      left: 42%;
    }
    &.s3 {
      top: 22%;
      right: 22%;
    }
    &.s4 {
      top: 48%;
      left: 28%;
    }
    &.s5 {
      top: 38%;
      right: 38%;
    }
  }
}

// ===== 船和史萊姆 =====
.boat-group {
  position: absolute;
  bottom: 44%;
  left: 15%;
  width: 200px;
  height: 70px;
}

.boat {
  position: absolute;
  bottom: 0;
  left: 10px;
  width: 80px;
  height: 25px;

  .boat-svg {
    width: 100%;
    height: 100%;
  }
}

.slime-fisher {
  position: absolute;
  bottom: 12px;
  left: 25px;
  width: 48px;
  height: 38px;

  .slime-svg {
    width: 100%;
    height: 100%;
    image-rendering: pixelated;
  }

  &.casting {
    animation: slimeCast 0.5s ease-out;
  }

  &.hooked {
    animation: slimePull 0.3s steps(2) infinite;
  }
}

.fishing-rod {
  position: absolute;
  bottom: 10px;
  left: 65px;
  width: 100px;
  height: 40px;
  transform-origin: left center;

  .rod-svg {
    width: 100%;
    height: 100%;
    image-rendering: pixelated;
  }

  &.casting {
    animation: rodCast 0.5s ease-out;
  }

  &.hooked {
    animation: rodPull 0.3s steps(2) infinite;
  }
}

@keyframes rodCast {
  0% {
    transform: rotate(0deg);
  }
  30% {
    transform: rotate(-8deg);
  }
  60% {
    transform: rotate(3deg);
  }
  100% {
    transform: rotate(0deg);
  }
}

@keyframes rodPull {
  0%,
  100% {
    transform: rotate(0deg);
  }
  50% {
    transform: rotate(-3deg);
  }
}

@keyframes slimeCast {
  0% {
    transform: rotate(0deg);
  }
  30% {
    transform: rotate(-3deg) scaleY(0.95);
  }
  60% {
    transform: rotate(2deg) scaleY(1.02);
  }
  100% {
    transform: rotate(0deg) scaleY(1);
  }
}

@keyframes slimePull {
  0%,
  100% {
    transform: scaleX(1) scaleY(1);
  }
  50% {
    transform: scaleX(1.02) scaleY(0.98);
  }
}

.fishing-line-group {
  position: absolute;
  top: 35%;
  left: 50%;
  display: flex;
  flex-direction: column;
  align-items: center;

  .line {
    width: 1px;
    height: 0;
    background: #475569;
  }

  .bobber {
    width: 14px;
    height: 20px;
    opacity: 0;

    .bobber-svg {
      width: 100%;
      height: 100%;
    }
  }

  &.waiting,
  &.hooked,
  &.caught {
    .line {
      height: 45px;
    }
    .bobber {
      opacity: 1;
    }
  }

  &.casting {
    .line {
      height: 45px;
      transition: height 0.4s ease-out;
    }
    .bobber {
      opacity: 1;
      transition: opacity 0.3s ease-out 0.2s;
    }
  }

  &.waiting .bobber {
    animation: bobberFloat 1.5s ease-in-out infinite;
  }

  &.hooked {
    .bobber {
      animation: bobberAlert 0.2s steps(2) infinite;
    }
    .line {
      animation: linePull 0.2s steps(2) infinite;
    }
  }
}

@keyframes bobberFloat {
  0%,
  100% {
    transform: translateY(0);
  }
  50% {
    transform: translateY(3px);
  }
}

@keyframes bobberAlert {
  0%,
  100% {
    transform: translateY(0) scale(1);
  }
  50% {
    transform: translateY(-8px) scale(1.15);
  }
}

@keyframes linePull {
  0%,
  100% {
    transform: scaleY(1);
  }
  50% {
    transform: scaleY(0.95);
  }
}

// ===== 魚 =====
.fish-sprite {
  position: absolute;
  top: 62%;
  left: 48%;
  animation: fishStruggle 0.5s steps(3) infinite alternate;

  svg {
    width: 42px;
    height: 42px;
    filter: drop-shadow(2px 2px 0 rgba(0, 0, 0, 0.25));
  }

  &.caught {
    animation: fishCaught 0.5s ease-out forwards;
  }
}

@keyframes fishStruggle {
  0% {
    transform: translateX(0) rotate(0deg);
  }
  100% {
    transform: translateX(-6px) rotate(-8deg);
  }
}

@keyframes fishCaught {
  0% {
    transform: translateY(0);
    opacity: 1;
  }
  100% {
    transform: translateY(-35px);
    opacity: 0;
  }
}

// ===== 水中小魚裝飾 =====
.underwater-fish {
  position: absolute;
  bottom: 4%;
  left: 0;
  right: 0;
  pointer-events: none;
}

.small-fish {
  position: absolute;
  width: 10px;
  height: 6px;

  &::before {
    content: "";
    position: absolute;
    width: 6px;
    height: 5px;
    background: rgba(251, 191, 36, 0.35);
    border-radius: 50% 50% 50% 50% / 60% 60% 40% 40%;
  }

  &::after {
    content: "";
    position: absolute;
    left: -3px;
    top: 1px;
    width: 0;
    height: 0;
    border-top: 2px solid transparent;
    border-bottom: 2px solid transparent;
    border-right: 4px solid rgba(251, 191, 36, 0.35);
  }

  &.fish-a {
    left: 18%;
    bottom: 28%;
  }

  &.fish-b {
    right: 22%;
    bottom: 48%;
    transform: scaleX(-1);
  }
}

// ===== 提示框 =====
.phase-hint {
  position: absolute;
  bottom: 10px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 10;

  .hint-box {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 6px 12px;
    background: rgba(255, 255, 255, 0.95);
    border: 3px solid #1e293b;
    box-shadow:
      3px 3px 0 rgba(0, 0, 0, 0.25),
      inset 0 -2px 0 rgba(0, 0, 0, 0.08);

    .hint-icon {
      width: 14px;
      height: 14px;
      color: #475569;

      svg {
        width: 100%;
        height: 100%;
      }
    }

    .hint-text {
      font-size: 10px;
      font-weight: 600;
      color: #1e293b;
      letter-spacing: 0.5px;
    }
  }

  &.hooked .hint-box {
    background: #fef3c7;
    border-color: #d97706;
    animation: hintPulse 0.3s steps(2) infinite;

    .hint-icon {
      color: #d97706;
    }
    .alert-text {
      color: #c2410c;
    }
  }

  &.caught .hint-box {
    background: #dcfce7;
    border-color: #16a34a;

    .hint-icon {
      color: #16a34a;
    }
    .success-text {
      color: #15803d;
    }
  }

  &.missed .hint-box {
    background: #fee2e2;
    border-color: #dc2626;

    .hint-icon {
      color: #dc2626;
    }
    .fail-text {
      color: #b91c1c;
    }
  }
}

@keyframes hintPulse {
  0%,
  100% {
    transform: scale(1);
  }
  50% {
    transform: scale(1.02);
  }
}

.action-buttons {
  padding: 16px 20px;
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 10px;
  background: #f3f4f6;
  border-top: $pixel-border; // Separate game area from buttons

  .pixel-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    padding: 12px 24px;
    border: 4px solid black; // Extra thick border for main buttons
    border-radius: 0;
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
    font-family: $pixel-font;
    box-shadow: 4px 4px 0px rgba(0, 0, 0, 0.5);
    transition: none;

    &:active:not(:disabled) {
      transform: translate(4px, 4px);
      box-shadow: none;
    }

    &:disabled {
      opacity: 0.5;
      cursor: not-allowed;
      box-shadow: none;
      transform: translate(2px, 2px);
    }

    &.secondary {
      padding: 10px 16px;
      font-size: 10px;
      border-width: 3px;
      box-shadow: 3px 3px 0px rgba(0, 0, 0, 0.4);

      &:active:not(:disabled) {
        transform: translate(3px, 3px);
      }
    }
  }

  .cast-btn {
    background: #06b6d4;
    color: white;
  }
  .reel-btn {
    background: #f59e0b;
    color: white;
    animation: btnPulse 0.5s steps(2) infinite;
  }
  .continue-btn {
    background: #6b7280;
    color: white;
  }
  .idle-btn {
    background: #8b5cf6;
    color: white;
  }
  .claim-btn {
    background: #22c55e;
    color: white;
  }
  .cancel-idle-btn {
    background: #ef4444;
    color: white;
  }

  .idle-status {
    width: 100%;
    display: flex;
    justify-content: center;
    gap: 16px;
    padding: 8px 12px;
    background: #ede9fe;
    border: 2px solid #8b5cf6;
    margin-bottom: 8px;
    font-family: $pixel-font;
    font-size: 10px;

    .idle-info {
      display: flex;
      align-items: center;
      gap: 6px;
      color: #6d28d9;
    }

    .idle-preview {
      display: flex;
      align-items: center;
      gap: 6px;
      color: #7c3aed;
    }
  }
}

@keyframes btnPulse {
  0% {
    background: #f59e0b;
  }
  50% {
    background: #d97706;
  }
}

// ===== 釣魚結果 =====
.catch-result {
  padding: 16px 20px;
  background: #fef3c7;
  border-bottom: $pixel-border;
}

.fish-card {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  background: white;
  border: 4px solid black;
  box-shadow: 4px 4px 0 rgba(0, 0, 0, 0.2);

  &.common {
    border-color: #9ca3af;
  }
  &.uncommon {
    border-color: #22c55e;
  }
  &.rare {
    border-color: #3b82f6;
  }
  &.epic {
    border-color: #a855f7;
  }
  &.legendary {
    border-color: #f59e0b;
    background: #fffbeb;
  }

  .fish-icon {
    width: 64px;
    height: 64px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(0, 0, 0, 0.05);
    border: 2px solid black;

    svg {
      width: 48px;
      height: 48px;
    }
  }

  // Icon colors
  &.common .fish-icon {
    color: #6b7280;
  }
  &.uncommon .fish-icon {
    color: #16a34a;
  }
  &.rare .fish-icon {
    color: #2563eb;
  }
  &.epic .fish-icon {
    color: #9333ea;
  }
  &.legendary .fish-icon {
    color: #d97706;
  }

  .fish-info {
    flex: 1;

    .fish-name {
      font-size: 14px;
      font-weight: 600;
      color: black;
      margin-bottom: 8px;
    }

    .fish-details {
      display: flex;
      flex-direction: column;
      gap: 4px;

      .weight {
        font-size: 10px;
        color: #4b5563;
      }

      .rarity-badge {
        display: inline-block;
        padding: 4px 6px;
        font-size: 10px;
        color: white;
        background: black;
        width: fit-content;

        &.common {
          background: #9ca3af;
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
          background: #f59e0b;
        }
      }
    }

    .fish-price {
      display: flex;
      align-items: center;
      gap: 4px;
      margin-top: 8px;
      font-size: 12px;
      color: #d97706;
      font-weight: bold;
    }
  }
}

// ===== 魚簍區域 =====
.inventory-section {
  padding: 16px 20px;
  background: #ffffff;

  .section-header {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 12px;
    font-size: 12px;
    color: black;

    .sell-all-btn {
      margin-left: auto;
      display: flex;
      align-items: center;
      gap: 4px;
      padding: 6px 10px;
      background: #d97706;
      border: 2px solid black;
      color: white;
      font-size: 10px;
      cursor: pointer;
      box-shadow: 2px 2px 0 rgba(0, 0, 0, 0.3);
      font-family: $pixel-font;

      &:active {
        transform: translate(2px, 2px);
        box-shadow: none;
      }
    }
  }

  .fish-list {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }

  .fish-item {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 6px;
    background: white;
    border: 2px solid;
    box-shadow: 2px 2px 0 rgba(0, 0, 0, 0.1);

    &.common {
      border-color: #d1d5db;
    }
    &.uncommon {
      border-color: #86efac;
    }
    &.rare {
      border-color: #93c5fd;
    }
    &.epic {
      border-color: #d8b4fe;
    }
    &.legendary {
      border-color: #fcd34d;
      background: #fffbeb;
    }

    .fish-mini-icon {
      width: 16px;
      height: 16px;
      svg {
        width: 100%;
        height: 100%;
      }
    }

    // Mini icon colors
    &.common .fish-mini-icon {
      color: #6b7280;
    }
    &.uncommon .fish-mini-icon {
      color: #16a34a;
    }
    &.rare .fish-mini-icon {
      color: #2563eb;
    }
    &.epic .fish-mini-icon {
      color: #9333ea;
    }
    &.legendary .fish-mini-icon {
      color: #d97706;
    }

    .fish-mini-info {
      display: flex;
      flex-direction: column;
      .name {
        font-size: 10px;
        color: black;
      }
      .price {
        font-size: 8px;
        color: #d97706;
      }
    }
  }
}

// ===== 魚竿選擇器 =====
.rod-selector-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10;
  padding: 20px;
}

.rod-selector {
  width: 100%;
  max-width: 380px;
  background: white;
  border: $pixel-border;
  box-shadow: 8px 8px 0 rgba(0, 0, 0, 0.5);
  max-height: 70%;
  display: flex;
  flex-direction: column;
  font-family: $pixel-font;

  .selector-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 16px;
    border-bottom: 2px solid black;
    background: #f3f4f6;

    h4 {
      margin: 0;
      font-size: 12px;
      color: black;
    }

    .close-btn {
      width: 28px;
      height: 28px;
      border: 2px solid black;
      background: #ef4444;
      color: white;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: 2px 2px 0 rgba(0, 0, 0, 0.3);

      &:active {
        translate: 2px 2px;
        box-shadow: none;
      }
    }
  }

  .rod-list {
    flex: 1;
    overflow-y: auto;
    padding: 12px;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .rod-item {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 10px 12px;
    border: 2px solid #e5e7eb;
    cursor: pointer;
    transition: all 0.15s;

    &:hover {
      background: #f3f4f6;
      border-color: #d1d5db;
    }

    &.selected {
      background: #ecfdf5;
      border: 2px solid #10b981;
      box-shadow: 2px 2px 0 #10b981;
    }

    &.common {
      border-left: 4px solid #9ca3af;
    }
    &.uncommon {
      border-left: 4px solid #22c55e;
    }
    &.rare {
      border-left: 4px solid #3b82f6;
    }
    &.epic {
      border-left: 4px solid #a855f7;
    }
    &.legendary {
      border-left: 4px solid #f59e0b;
    }

    .rod-item-icon {
      width: 36px;
      height: 36px;
      border: 2px solid black;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;

      &.common {
        background: #d1d5db;
      }
      &.uncommon {
        background: #86efac;
      }
      &.rare {
        background: #93c5fd;
      }
      &.epic {
        background: #d8b4fe;
      }
      &.legendary {
        background: #fcd34d;
      }
    }

    .rod-item-info {
      flex: 1;
      display: flex;
      flex-direction: column;
      gap: 4px;

      .rod-item-name {
        font-size: 11px;
        font-weight: 600;
        color: black;
      }

      .rod-item-durability {
        width: 100%;
        height: 8px;
        background: #e5e7eb;
        border: 1px solid #9ca3af;

        .dur-bar {
          height: 100%;
          background: #22c55e;
          transition: width 0.2s;

          &.low {
            background: #ef4444;
          }
        }
      }

      .rod-item-stats {
        font-size: 9px;
        color: #6b7280;
      }
    }

    .check-icon {
      color: #10b981;
      flex-shrink: 0;
    }
  }
}

// Transitions
.modal-enter-active,
.modal-leave-active {
  transition: opacity 0.2s steps(4);
}
.modal-enter-from,
.modal-leave-to {
  opacity: 0;
}
</style>
