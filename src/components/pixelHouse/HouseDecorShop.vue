<script setup lang="ts">
/**
 * 擺件商店：用金幣（跟商店、衣櫃同一個錢包）買東西。
 * - 擺件：買了就出現在房間裡預設的位置，之後跟其他家具一樣可以搬。買過的可以收起來、再擺出來，不用再付錢。
 * - 換款式：家具的別的顏色、花樣。買了馬上換上；買過的可以隨時換回原本的或換別的，不用再付錢。
 */
import { computed, ref, watch } from "vue";
import { skinSlot, type DecorDef, type RoomId, type SkinDef } from "./houseData";
import { loadWardrobeBalance, payCoins } from "./wardrobeShop";

const props = defineProps<{
  open: boolean;
  /** public/pixel-house/ */
  asset: string;
  defs: DecorDef[];
  /** 買過的擺件 id → 有沒有擺出來 */
  owned: Record<string, boolean>;
  skinDefs: SkinDef[];
  /** 買過的款式："房間:家具:款式" */
  ownedSkins: string[];
  /** 每件家具現在用哪個款式："房間:家具" → 款式 id */
  wornSkins: Record<string, string>;
  roomNames: Record<RoomId, string>;
}>();
const emit = defineEmits<{
  (e: "close"): void;
  (e: "change", owned: Record<string, boolean>): void;
  (e: "change-skins", next: { owned: string[]; worn: Record<string, string> }): void;
  /** 去房間看這件 */
  (e: "show", id: string): void;
  (e: "show-item", room: RoomId, item: string): void;
}>();

type Tab = "decor" | "skins";
const tab = ref<Tab>("decor");

const balance = ref<number | null>(null);

// ===== 換款式 =====
interface SkinGroup {
  slot: string;
  room: RoomId;
  item: string;
  itemName: string;
  base: string;
  w: number;
  h: number;
  variants: SkinDef[];
}

/** 一件家具一組：原本的＋它的所有款式；擺件的款式要先買了擺件才看得到 */
const skinGroups = computed<SkinGroup[]>(() => {
  const decorIds = new Set(props.defs.map((d) => d.id));
  const groups = new Map<string, SkinGroup>();
  for (const v of props.skinDefs) {
    if (decorIds.has(v.item) && !(v.item in props.owned)) continue;
    const slot = skinSlot(v.room, v.item);
    let g = groups.get(slot);
    if (!g) {
      g = { slot, room: v.room, item: v.item, itemName: v.itemName, base: v.base, w: v.w, h: v.h, variants: [] };
      groups.set(slot, g);
    }
    g.variants.push(v);
  }
  return [...groups.values()];
});

function skinOwned(v: SkinDef): boolean {
  return props.ownedSkins.includes(`${skinSlot(v.room, v.item)}:${v.id}`);
}

/** 這件家具現在用的款式（空字串 = 原本的） */
function worn(g: SkinGroup): string {
  return props.wornSkins[g.slot] ?? "";
}

function wear(g: SkinGroup, id: string, owned = props.ownedSkins) {
  const next = { ...props.wornSkins };
  if (id) next[g.slot] = id;
  else delete next[g.slot];
  emit("change-skins", { owned, worn: next });
  const name = id ? g.variants.find((v) => v.id === id)?.name : "原本的";
  message.value = `${props.roomNames[g.room]}的${g.itemName}換成${name}了`;
}

async function buySkin(g: SkinGroup, v: SkinDef) {
  if (busy.value) return;
  if (skinOwned(v)) {
    wear(g, v.id);
    return;
  }
  const key = `${g.slot}:${v.id}`;
  busy.value = key;
  message.value = "";
  try {
    const r = await payCoins(v.price, `小屋家具款式：${g.itemName}（${v.name}）`, `pixel-house:skin:${key}`);
    if (!r.ok) {
      message.value =
        r.error === "insufficient_funds" ? `金幣不夠，還差 ${(v.price - (balance.value ?? 0)).toLocaleString()}` : "付款失敗，再試一次";
      return;
    }
    balance.value = r.balance;
    wear(g, v.id, [...props.ownedSkins, key]);
  } finally {
    busy.value = null;
  }
}

/** 縮圖放大幾倍，放進 box×box 的格子：放得下就整數倍（不會糊），太大的（地毯）照比例縮小 */
function fit(w: number, h: number, box: number): number {
  const k = box / Math.max(w, h);
  return k >= 1 ? Math.min(4, Math.floor(k)) : k;
}
const busy = ref<string | null>(null);
const message = ref("");

watch(
  () => props.open,
  (open) => {
    if (!open) return;
    message.value = "";
    void loadWardrobeBalance().then((b) => (balance.value = b));
  },
);

function isOwned(id: string): boolean {
  return id in props.owned;
}

async function buy(d: DecorDef) {
  if (busy.value || isOwned(d.id)) return;
  busy.value = d.id;
  message.value = "";
  try {
    const r = await payCoins(d.price, `小屋擺件：${d.name}`, `pixel-house:decor:${d.id}`);
    if (!r.ok) {
      message.value =
        r.error === "insufficient_funds" ? `金幣不夠，還差 ${(d.price - (balance.value ?? 0)).toLocaleString()}` : "付款失敗，再試一次";
      return;
    }
    balance.value = r.balance;
    emit("change", { ...props.owned, [d.id]: true });
    message.value = `買好了，${d.name}放在${props.roomNames[d.room]}`;
  } finally {
    busy.value = null;
  }
}

function toggle(d: DecorDef) {
  emit("change", { ...props.owned, [d.id]: !props.owned[d.id] });
}

/** 小圖放大幾倍：整數倍才不會糊，最大的那邊不超過 72px */
function zoom(d: DecorDef): number {
  return Math.max(1, Math.min(4, Math.floor(72 / Math.max(d.w, d.h))));
}
</script>

<template>
  <Transition name="ds-sheet">
    <div v-if="open" class="ds-wrap" @click.self="emit('close')">
      <section class="ds-sheet" role="dialog" aria-label="擺件商店">
        <header class="ds-head">
          <h2>擺件商店</h2>
          <span class="ds-coins" aria-label="金幣">金幣 {{ balance === null ? "…" : balance.toLocaleString() }}</span>
          <button class="ds-close" aria-label="關閉" @click="emit('close')">×</button>
        </header>
        <div class="ds-tabs" role="tablist">
          <button role="tab" class="ds-tab" :class="{ 'is-on': tab === 'decor' }" :aria-selected="tab === 'decor'" @click="tab = 'decor'; message = ''">
            擺件
          </button>
          <button role="tab" class="ds-tab" :class="{ 'is-on': tab === 'skins' }" :aria-selected="tab === 'skins'" @click="tab = 'skins'; message = ''">
            換款式
          </button>
        </div>
        <p class="ds-note">
          {{ tab === "decor" ? "買了會出現在房間裡，長按房間可以搬到喜歡的位置。" : "家具換顏色、換花樣。買了馬上換上，買過的隨時可以換回來。" }}
        </p>
        <p v-if="message" class="ds-msg" role="status">{{ message }}</p>

        <div v-if="tab === 'skins'" class="ds-list">
          <section v-for="g in skinGroups" :key="g.slot" class="ds-group">
            <header class="ds-group-head">
              <span class="ds-name">{{ g.itemName }}</span>
              <span class="ds-sub">{{ roomNames[g.room] }}</span>
              <button class="ds-link" @click="emit('show-item', g.room, g.item)">去看</button>
            </header>
            <div class="ds-cards">
              <button class="ds-card" :class="{ 'is-on': worn(g) === '' }" :aria-pressed="worn(g) === ''" @click="wear(g, '')">
                <span class="ds-card-img">
                  <img :src="`${asset}${g.base}`" alt="" draggable="false" :style="{ width: `${g.w * fit(g.w, g.h, 60)}px`, height: `${g.h * fit(g.w, g.h, 60)}px` }" />
                </span>
                <span class="ds-card-name">原本的</span>
                <span class="ds-card-tag">{{ worn(g) === "" ? "使用中" : "換上" }}</span>
              </button>
              <button
                v-for="v in g.variants"
                :key="v.id"
                class="ds-card"
                :class="{ 'is-on': worn(g) === v.id, 'is-locked': !skinOwned(v) }"
                :aria-pressed="worn(g) === v.id"
                :disabled="busy !== null"
                @click="buySkin(g, v)"
              >
                <span class="ds-card-img">
                  <img
                    :src="`${asset}skins/${v.room}/${v.item}/${v.id}.png`"
                    alt=""
                    draggable="false"
                    :style="{ width: `${v.w * fit(v.w, v.h, 60)}px`, height: `${v.h * fit(v.w, v.h, 60)}px` }"
                  />
                </span>
                <span class="ds-card-name">{{ v.name }}</span>
                <span class="ds-card-tag">
                  {{ worn(g) === v.id ? "使用中" : skinOwned(v) ? "換上" : busy === `${g.slot}:${v.id}` ? "付款中…" : `${v.price.toLocaleString()} 金幣` }}
                </span>
              </button>
            </div>
          </section>
          <p v-if="!skinGroups.length" class="ds-note">現在沒有款式可以換。</p>
        </div>

        <ul v-else class="ds-list">
          <li v-for="d in defs" :key="d.id" class="ds-item">
            <div class="ds-thumb">
              <img
                :src="`${asset}decor/${d.id}.png`"
                alt=""
                draggable="false"
                :style="{ width: `${d.w * zoom(d)}px`, height: `${d.h * zoom(d)}px` }"
              />
            </div>
            <div class="ds-info">
              <div class="ds-name">{{ d.name }}</div>
              <div class="ds-sub">{{ roomNames[d.room] }}．{{ d.wall ? "掛在牆上" : "放在地上或家具上" }}</div>
            </div>
            <div class="ds-actions">
              <template v-if="isOwned(d.id)">
                <button class="ds-btn" @click="toggle(d)">{{ owned[d.id] ? "收起來" : "擺出來" }}</button>
                <button v-if="owned[d.id]" class="ds-btn is-ghost" @click="emit('show', d.id)">去看</button>
              </template>
              <button v-else class="ds-btn is-primary" :disabled="busy !== null" @click="buy(d)">
                {{ busy === d.id ? "付款中…" : `${d.price.toLocaleString()} 金幣` }}
              </button>
            </div>
          </li>
        </ul>
        <p v-if="tab === 'decor' && !defs.length" class="ds-note">現在沒有擺件可以買。</p>
      </section>
    </div>
  </Transition>
</template>

<style scoped>
.ds-wrap {
  position: absolute;
  inset: 0;
  z-index: 30;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  background: rgba(30, 20, 18, 0.4);
  -webkit-backdrop-filter: blur(2px);
  backdrop-filter: blur(2px);
}

.ds-sheet {
  position: relative;
  width: min(100%, 480px);
  max-height: 80%;
  display: flex;
  flex-direction: column;
  background: #fffbf5;
  border-radius: 24px 24px 0 0;
  box-shadow: 0 -10px 40px rgba(30, 20, 18, 0.25);
  color: #3b2a26;
  padding-bottom: env(safe-area-inset-bottom);
}

.ds-head {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 18px 14px 6px 20px;
}

.ds-head h2 {
  margin: 0;
  flex: 1;
  font-size: 19px;
  font-weight: 700;
}

.ds-coins {
  padding: 4px 10px;
  border-radius: 999px;
  background: #f8e3a3;
  font-size: 13px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}

.ds-close {
  width: 34px;
  height: 34px;
  border: 0;
  border-radius: 50%;
  background: rgba(59, 42, 38, 0.08);
  color: #3b2a26;
  font-family: inherit;
  font-size: 20px;
  line-height: 1;
  cursor: pointer;
}

.ds-note,
.ds-msg {
  margin: 0;
  padding: 2px 20px 8px;
  font-size: 13px;
  color: rgba(59, 42, 38, 0.7);
}

.ds-msg {
  color: #8a4a2a;
  font-weight: 600;
}

.ds-list {
  margin: 0;
  padding: 4px 16px 20px;
  list-style: none;
  overflow-y: auto;
  overscroll-behavior: contain;
  touch-action: pan-y;
  -webkit-overflow-scrolling: touch;
}

.ds-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 0;
  border-bottom: 1px solid rgba(59, 42, 38, 0.1);
}

.ds-item:last-child {
  border-bottom: 0;
}

.ds-thumb {
  flex: none;
  width: 84px;
  height: 84px;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  border-radius: 14px;
  background: #f7e8cf;
}

.ds-thumb img {
  display: block;
  image-rendering: crisp-edges;
  image-rendering: pixelated;
}

.ds-info {
  flex: 1;
  min-width: 0;
}

.ds-name {
  font-size: 15px;
  font-weight: 700;
}

.ds-sub {
  margin-top: 2px;
  font-size: 12px;
  color: rgba(59, 42, 38, 0.65);
}

.ds-actions {
  flex: none;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.ds-btn {
  min-width: 86px;
  min-height: 34px;
  padding: 0 12px;
  border: 0;
  border-radius: 999px;
  background: rgba(59, 42, 38, 0.1);
  color: #3b2a26;
  font-family: inherit;
  font-size: 13px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  cursor: pointer;
}

.ds-btn.is-primary {
  background: #3b2a26;
  color: #fffbf5;
}

.ds-btn.is-ghost {
  background: transparent;
  box-shadow: inset 0 0 0 1px rgba(59, 42, 38, 0.25);
}

.ds-btn:disabled {
  opacity: 0.5;
  cursor: default;
}

.ds-tabs {
  display: flex;
  gap: 6px;
  margin: 0 20px 8px;
  padding: 4px;
  border-radius: 999px;
  background: rgba(59, 42, 38, 0.08);
}

.ds-tab {
  flex: 1;
  min-height: 34px;
  border: 0;
  border-radius: 999px;
  background: transparent;
  color: rgba(59, 42, 38, 0.7);
  font-family: inherit;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
}

.ds-tab.is-on {
  background: #fffbf5;
  color: #3b2a26;
  box-shadow: 0 1px 4px rgba(59, 42, 38, 0.15);
}

.ds-group {
  padding: 10px 0 12px;
  border-bottom: 1px solid rgba(59, 42, 38, 0.1);
}

.ds-group:last-of-type {
  border-bottom: 0;
}

.ds-group-head {
  display: flex;
  align-items: baseline;
  gap: 8px;
  margin-bottom: 8px;
}

.ds-group-head .ds-sub {
  flex: 1;
}

.ds-link {
  padding: 4px 2px;
  border: 0;
  background: transparent;
  color: #8a4a2a;
  font-family: inherit;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
}

.ds-cards {
  display: flex;
  gap: 8px;
  overflow-x: auto;
  overscroll-behavior-x: contain;
  touch-action: pan-x;
  margin: 0 -16px;
  padding: 2px 16px 4px;
  scrollbar-width: none;
  -webkit-overflow-scrolling: touch;
}

.ds-cards::-webkit-scrollbar {
  display: none;
}

.ds-card {
  flex: none;
  width: 84px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 6px 4px 8px;
  border: 0;
  border-radius: 14px;
  background: #f7e8cf;
  color: #3b2a26;
  font-family: inherit;
  cursor: pointer;
  box-shadow: inset 0 0 0 2px transparent;
}

.ds-card.is-on {
  box-shadow: inset 0 0 0 2px #3b2a26;
}

.ds-card:disabled {
  cursor: default;
}

.ds-card-img {
  width: 72px;
  height: 64px;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}

.ds-card-img img {
  display: block;
  image-rendering: crisp-edges;
  image-rendering: pixelated;
}

.ds-card-name {
  font-size: 13px;
  font-weight: 600;
}

.ds-card-tag {
  font-size: 12px;
  font-variant-numeric: tabular-nums;
  color: rgba(59, 42, 38, 0.65);
}

.ds-card.is-locked .ds-card-tag {
  color: #8a4a2a;
  font-weight: 600;
}

.ds-card.is-on .ds-card-tag {
  color: #3b2a26;
  font-weight: 700;
}

.ds-sheet-enter-active,
.ds-sheet-leave-active {
  transition: opacity 0.2s ease;
}

.ds-sheet-enter-active .ds-sheet,
.ds-sheet-leave-active .ds-sheet {
  transition: transform 0.24s ease;
}

.ds-sheet-enter-from,
.ds-sheet-leave-to {
  opacity: 0;
}

.ds-sheet-enter-from .ds-sheet,
.ds-sheet-leave-to .ds-sheet {
  transform: translateY(100%);
}

@media (prefers-reduced-motion: reduce) {
  .ds-sheet-enter-active,
  .ds-sheet-leave-active,
  .ds-sheet-enter-active .ds-sheet,
  .ds-sheet-leave-active .ds-sheet {
    transition: none;
  }
}
</style>
