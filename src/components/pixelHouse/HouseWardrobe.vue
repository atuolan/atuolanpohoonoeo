<script setup lang="ts">
/**
 * 衣櫃：幫住在小屋的角色換外觀。
 * - 上面是放大的他，可以看正面、背面、走路
 * - 每個部位挑款式（你畫的要用金幣買，買過就不用再付）和顏色（免費）
 * - 用戶可以上傳自己畫的部位（付一次裁縫費，之後每個角色都能穿）
 * 金幣用跟商店同一個錢包；外觀每個角色各一套，存到小屋的狀態。
 */
import { computed, onUnmounted, ref, watch } from "vue";
import {
  composeLook,
  composePartPreview,
  loadDollManifest,
  loadWardrobeCatalog,
  readUploadSheet,
  type ComposedLook,
} from "./dollCompose";
import { saveCustomParts, type ResidentLook } from "./houseState";
import { PART_COLORS, PART_SLOTS, partSlotDef, type PartSlot } from "./wardrobeData";
import {
  checkUploadSize,
  isStyleOwned,
  markOwned,
  officialStyles,
  outfitCost,
  resolveChoice,
  styleInfo,
  uploadFee,
  type CustomPart,
  type DollManifest,
  type Outfit,
  type WardrobeCatalog,
} from "./wardrobeLogic";
import { loadWardrobeBalance, payCoins } from "./wardrobeShop";

const props = defineProps<{
  open: boolean;
  charName: string;
  outfit: Outfit;
  customs: CustomPart[];
  /** public/pixel-house/ */
  asset: string;
  startSlot?: PartSlot | null;
}>();
const emit = defineEmits<{
  (e: "close"): void;
  (e: "save", outfit: Outfit): void;
  (e: "customs-changed", parts: CustomPart[]): void;
}>();

const CHARS = computed(() => `${props.asset}chars/`);
type Tab = PartSlot | "base";

const draft = ref<Outfit>(clone(props.outfit));
const tab = ref<Tab>("hair");
const pose = ref<"front" | "back" | "walk">("front");
const doll = ref<DollManifest | null>(null);
const catalog = ref<WardrobeCatalog | null>(null);
const preview = ref<ComposedLook | null>(null);
const thumbs = ref<Record<string, string>>({});
const balance = ref<number | null>(null);
const message = ref("");
const busy = ref(false);
const confirming = ref(false);
const leaving = ref(false);
const walkFrame = ref(0);
let walkTimer: ReturnType<typeof setInterval> | null = null;

/** 上傳中：選了圖還沒付錢時，part 先穿在預覽上 */
interface UploadState {
  slot: PartSlot;
  name: string;
  error: string;
  part: CustomPart | null;
}
const upload = ref<UploadState | null>(null);

function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}

watch(
  () => props.open,
  (open) => {
    if (!open) return;
    draft.value = clone(props.outfit);
    tab.value = props.startSlot ?? "hair";
    pose.value = "front";
    message.value = "";
    confirming.value = false;
    leaving.value = false;
    upload.value = null;
    void loadWardrobeBalance().then((b) => (balance.value = b));
  },
  { immediate: true },
);

// 身體換了就讀那個身體的紙娃娃
watch(
  () => [props.open, draft.value.base] as const,
  async ([open, base]) => {
    if (!open) return;
    const [d, c] = await Promise.all([loadDollManifest(CHARS.value, base), loadWardrobeCatalog(CHARS.value, base)]);
    if (draft.value.base !== base) return;
    doll.value = d;
    catalog.value = c;
  },
  { immediate: true },
);

const allCustoms = computed(() => [...props.customs, ...(upload.value?.part ? [upload.value.part] : [])]);

// 預覽：整套疊好
watch(
  () => [props.open, doll.value, JSON.stringify(draft.value), allCustoms.value] as const,
  async ([open, d]) => {
    if (!open || !d) {
      preview.value = null;
      return;
    }
    const want = JSON.stringify(draft.value);
    const look = await composeLook(d, `${CHARS.value}${draft.value.base}/`, draft.value, allCustoms.value);
    if (JSON.stringify(draft.value) === want) preview.value = look;
  },
  { immediate: true },
);

watch(
  () => [props.open, pose.value] as const,
  ([open, p]) => {
    if (walkTimer) clearInterval(walkTimer);
    walkTimer = null;
    walkFrame.value = 0;
    if (open && p === "walk") walkTimer = setInterval(() => walkFrame.value++, doll.value?.poses.walk?.ms ?? 150);
  },
  { immediate: true },
);
onUnmounted(() => {
  if (walkTimer) clearInterval(walkTimer);
});

const previewSrc = computed(() => {
  const frames = preview.value?.[pose.value] ?? preview.value?.front ?? [];
  return frames.length ? frames[walkFrame.value % frames.length] : "";
});
const hasPose = (p: string) => !!doll.value?.poses[p];

// ===== 部位、款式 =====
const tabs = computed<{ id: Tab; label: string }[]>(() => [
  { id: "base", label: "身體" },
  ...PART_SLOTS.map((d) => ({ id: d.slot as Tab, label: d.label })),
]);
const slotDef = computed(() => (tab.value === "base" ? null : partSlotDef(tab.value)));

interface StyleCard {
  key: string;
  /** "01"、"u-…"，或 null（不穿） */
  style: string | null;
  name: string;
  badge: string;
  custom?: CustomPart;
}

const cards = computed<StyleCard[]>(() => {
  const def = slotDef.value;
  if (!def || !def.styles) return [];
  const slot = def.slot;
  const out: StyleCard[] = [];
  if (def.optional) out.push({ key: "none", style: null, name: "不穿", badge: "" });
  for (const style of officialStyles(doll.value, slot)) {
    const info = styleInfo(catalog.value, slot, style);
    const owned = isStyleOwned(draft.value, catalog.value, slot, style);
    out.push({ key: style, style, name: info.name, badge: owned ? (info.price ? "已擁有" : "免費") : `${info.price.toLocaleString()} 金幣` });
  }
  for (const c of allCustoms.value) {
    if (c.base === draft.value.base && c.slot === slot) out.push({ key: c.id, style: c.id, name: c.name, badge: "自己畫的", custom: c });
  }
  return out;
});

function currentStyle(slot: PartSlot): string | null {
  const choice = resolveChoice(draft.value, doll.value, slot, allCustoms.value);
  if (choice.kind === "none") return null;
  return choice.kind === "official" ? choice.style : choice.part.id;
}

function pickStyle(card: StyleCard) {
  const def = slotDef.value;
  if (!def) return;
  draft.value.parts[def.slot] = card.style;
  // 自己畫的先用原本的顏色（想換再換）
  if (card.custom) delete draft.value.colors[def.slot];
  message.value = "";
}

// 款式小圖：身體＋這個部位（用現在選的顏色）
watch(
  () => [props.open, doll.value, tab.value, JSON.stringify(draft.value.colors), draft.value.base, allCustoms.value] as const,
  async ([open, d]) => {
    const def = slotDef.value;
    if (!open || !d || !def?.styles) return;
    const out: Record<string, string> = {};
    for (const card of cards.value) {
      if (card.style === null) continue;
      const o: Outfit = { ...draft.value, parts: { [def.slot]: card.style } };
      out[card.key] = await composePartPreview(d, `${CHARS.value}${draft.value.base}/`, o, allCustoms.value, ["body", def.slot, ...(def.colorAlso ?? [])]);
    }
    thumbs.value = out;
  },
  { immediate: true },
);

// ===== 顏色 =====
const colors = computed(() => (slotDef.value ? PART_COLORS[slotDef.value.slot] : []));
const currentColor = computed(() => (slotDef.value ? (draft.value.colors[slotDef.value.slot] ?? null) : null));
function pickColor(c: string | null) {
  const def = slotDef.value;
  if (!def) return;
  if (c) draft.value.colors[def.slot] = c.toUpperCase();
  else delete draft.value.colors[def.slot];
}
function onColorInput(e: Event) {
  pickColor((e.target as HTMLInputElement).value);
}

// ===== 身體 =====
const bases: { id: ResidentLook; label: string }[] = [
  { id: "boy", label: "男生" },
  { id: "girl", label: "女生" },
];
const baseReady = ref<Record<string, boolean>>({});
watch(
  () => props.open,
  async (open) => {
    if (!open) return;
    for (const b of bases) baseReady.value[b.id] = !!(await loadDollManifest(CHARS.value, b.id));
  },
  { immediate: true },
);
function pickBase(b: ResidentLook) {
  if (!baseReady.value[b] || draft.value.base === b) return;
  // 款式是照身體畫的，換身體就回到第一款；顏色留著
  draft.value = { ...draft.value, base: b, parts: {} };
}

// ===== 存 =====
const cost = computed(() => outfitCost(draft.value, doll.value, catalog.value, allCustoms.value));
const changed = computed(() => JSON.stringify(draft.value) !== JSON.stringify(props.outfit));
const canWear = computed(() => !!doll.value);

async function wear() {
  if (busy.value || !canWear.value) return;
  const c = cost.value;
  if (c.total > 0 && !confirming.value) {
    confirming.value = true;
    return;
  }
  busy.value = true;
  try {
    let next = clone(draft.value);
    if (c.total > 0) {
      const names = c.items.map((i) => i.name).join("、");
      const r = await payCoins(c.total, `幫${props.charName}買衣服：${names}`, `pixel-house:${next.base}`);
      if (!r.ok) {
        message.value =
          r.error === "insufficient_funds" ? `金幣不夠，還差 ${(c.total - (balance.value ?? 0)).toLocaleString()}` : "付款失敗，再試一次";
        confirming.value = false;
        return;
      }
      balance.value = r.balance;
      next = markOwned(next, c.items);
    }
    draft.value = next;
    // 給一份複本，之後在衣櫃裡改不會直接改到已經存的
    emit("save", clone(next));
    confirming.value = false;
    message.value = "換好了";
  } finally {
    busy.value = false;
  }
}

function reset() {
  draft.value = clone(props.outfit);
  confirming.value = false;
  message.value = "";
}

function tryClose() {
  if (changed.value && !leaving.value) {
    leaving.value = true;
    return;
  }
  emit("close");
}

// ===== 上傳自己畫的 =====
const fee = computed(() => uploadFee(catalog.value));
const poseW = computed(() => doll.value?.poses.front?.w ?? 25);
const poseH = computed(() => doll.value?.poses.front?.h ?? 41);
const templateUrl = computed(() => `${CHARS.value}${draft.value.base}/template.png`);
const guideUrl = computed(() => `${CHARS.value}${draft.value.base}/template-guide.png`);
let beforeUpload: string | null | undefined;

function startUpload() {
  const def = slotDef.value;
  if (!def?.upload) return;
  beforeUpload = draft.value.parts[def.slot];
  upload.value = { slot: def.slot, name: "", error: "", part: null };
}

async function onFile(e: Event) {
  const u = upload.value;
  const file = (e.target as HTMLInputElement).files?.[0];
  (e.target as HTMLInputElement).value = "";
  if (!u || !file) return;
  const r = await readUploadSheet(file, poseW.value, poseH.value, (w, h) => checkUploadSize(w, h, poseW.value, poseH.value));
  if (!r.ok) {
    u.error = r.error;
    u.part = null;
    return;
  }
  u.error = "";
  u.part = {
    id: `u-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    base: draft.value.base,
    slot: u.slot,
    name: u.name.trim() || "自己畫的",
    sheet: r.sheet,
    cells: r.cells,
    createdAt: Date.now(),
  };
  // 先穿上給他看（用原本的顏色）
  draft.value.parts[u.slot] = u.part.id;
  delete draft.value.colors[u.slot];
}

function cancelUpload() {
  const u = upload.value;
  if (u) {
    if (beforeUpload === undefined) delete draft.value.parts[u.slot];
    else draft.value.parts[u.slot] = beforeUpload;
  }
  upload.value = null;
}

async function confirmUpload() {
  const u = upload.value;
  if (!u?.part || busy.value) return;
  busy.value = true;
  try {
    const part: CustomPart = { ...u.part, name: u.name.trim().slice(0, 20) || "自己畫的" };
    const next = [...props.customs, part];
    // 先確定存得下才收錢
    if (!saveCustomParts(next)) {
      u.error = "手機的空間不夠，存不下這張圖";
      return;
    }
    const r = await payCoins(fee.value, `上傳自己畫的${partSlotDef(u.slot)?.label ?? ""}：${part.name}`, `pixel-house:${part.id}`);
    if (!r.ok) {
      saveCustomParts(props.customs);
      u.error = r.error === "insufficient_funds" ? `金幣不夠，上傳要 ${fee.value.toLocaleString()}` : "付款失敗，再試一次";
      return;
    }
    balance.value = r.balance;
    emit("customs-changed", next);
    draft.value.parts[u.slot] = part.id;
    upload.value = null;
    message.value = `「${part.name}」放進衣櫃了，按「換上」就會穿上`;
  } finally {
    busy.value = false;
  }
}

function deleteCustom(c: CustomPart) {
  const next = props.customs.filter((p) => p.id !== c.id);
  saveCustomParts(next);
  emit("customs-changed", next);
  if (draft.value.parts[c.slot] === c.id) delete draft.value.parts[c.slot];
  message.value = `刪掉「${c.name}」了`;
}

const selectedCustom = computed(() => {
  const def = slotDef.value;
  if (!def || upload.value) return null;
  const id = draft.value.parts[def.slot];
  return props.customs.find((c) => c.id === id) ?? null;
});
</script>

<template>
  <Transition name="ph-sheet">
    <div v-if="open" class="wd-wrap" @click.self="tryClose">
      <section class="wd" role="dialog" :aria-label="`${charName}的衣櫃`">
        <header class="wd-head">
          <h2>{{ charName }}的衣櫃</h2>
          <span class="wd-coins" aria-label="金幣">金幣 {{ balance === null ? "…" : balance.toLocaleString() }}</span>
          <button class="wd-x" aria-label="關閉" @click="tryClose">×</button>
        </header>

        <div class="wd-body">
          <div class="wd-stage">
            <img v-if="previewSrc" class="wd-doll" :src="previewSrc" :alt="`${charName}現在的樣子`" />
            <p v-else-if="doll === null" class="wd-empty">這個身體的小人還沒畫好</p>
            <div class="wd-poses" role="group" aria-label="看哪一面">
              <button :class="{ on: pose === 'front' }" :disabled="!hasPose('front')" @click="pose = 'front'">正面</button>
              <button :class="{ on: pose === 'back' }" :disabled="!hasPose('back')" @click="pose = 'back'">背面</button>
              <button :class="{ on: pose === 'walk' }" :disabled="!hasPose('walk')" @click="pose = 'walk'">走路</button>
            </div>
          </div>

          <nav class="wd-tabs" aria-label="部位">
            <button v-for="t in tabs" :key="t.id" :class="{ on: tab === t.id }" @click="tab = t.id; upload = null">{{ t.label }}</button>
          </nav>

          <!-- 身體 -->
          <div v-if="tab === 'base'" class="wd-panel">
            <div class="wd-grid">
              <button
                v-for="b in bases"
                :key="b.id"
                class="wd-card"
                :class="{ on: draft.base === b.id }"
                :disabled="!baseReady[b.id]"
                @click="pickBase(b.id)"
              >
                <span class="wd-card-name">{{ b.label }}</span>
                <span class="wd-badge">{{ baseReady[b.id] ? (draft.base === b.id ? "現在" : "") : "還沒開放" }}</span>
              </button>
            </div>
            <p class="wd-note">換身體後，款式會回到第一款，顏色會留著。</p>
          </div>

          <!-- 部位 -->
          <div v-else-if="slotDef" class="wd-panel">
            <template v-if="upload">
              <div class="wd-upload">
                <h3>上傳自己畫的{{ slotDef.label }}</h3>
                <ol class="wd-steps">
                  <li>下載<a :href="templateUrl" download>人胚</a>（還有<a :href="guideUrl" target="_blank" rel="noopener">說明圖</a>），照它的位置畫。</li>
                  <li>只畫{{ slotDef.label }}，不要畫身體；1 格 {{ poseW }}×{{ poseH }}，1 像素就是 1 格。</li>
                  <li>
                    一格一格往右排：正面｜背面｜走路 1（{{ poseW * 3 }}×{{ poseH }}）。<br />
                    想畫完整的走路，再加走路 2～4（{{ poseW * 6 }}×{{ poseH }}）；沒畫的會用走路 1 跟著身體上下動。
                  </li>
                  <li>匯出 PNG，透明背景；2 倍、3 倍匯出也可以。</li>
                </ol>
                <label class="wd-file">
                  <input type="file" accept="image/png,image/webp,image/gif" @change="onFile" />
                  <span>{{ upload.part ? "換一張" : "選圖" }}</span>
                </label>
                <p v-if="upload.error" class="wd-error" role="alert">{{ upload.error }}</p>
                <template v-if="upload.part">
                  <img class="wd-sheet" :src="upload.part.sheet" alt="上傳的圖" />
                  <label class="wd-name">名字<input v-model="upload.name" maxlength="20" placeholder="自己畫的" /></label>
                </template>
                <div class="wd-actions">
                  <button class="wd-btn" @click="cancelUpload">取消</button>
                  <button class="wd-btn is-main" :disabled="!upload.part || busy" @click="confirmUpload">
                    付 {{ fee.toLocaleString() }} 金幣上傳
                  </button>
                </div>
                <p class="wd-note">上傳一次之後，每個角色都可以穿；只存在這支手機（會跟著備份）。</p>
              </div>
            </template>
            <template v-else>
              <template v-if="slotDef.styles">
                <h3 class="wd-sub">款式</h3>
                <div class="wd-grid">
                  <button
                    v-for="c in cards"
                    :key="c.key"
                    class="wd-card"
                    :class="{ on: currentStyle(slotDef.slot) === c.style }"
                    @click="pickStyle(c)"
                  >
                    <img v-if="c.style && thumbs[c.key]" class="wd-thumb" :src="thumbs[c.key]" alt="" />
                    <span v-else class="wd-thumb wd-thumb-none" aria-hidden="true">✕</span>
                    <span class="wd-card-name">{{ c.name }}</span>
                    <span class="wd-badge">{{ c.badge }}</span>
                  </button>
                  <button v-if="slotDef.upload" class="wd-card wd-card-add" @click="startUpload">
                    <span class="wd-thumb wd-thumb-none" aria-hidden="true">＋</span>
                    <span class="wd-card-name">上傳自己畫的</span>
                    <span class="wd-badge">{{ fee.toLocaleString() }} 金幣</span>
                  </button>
                </div>
                <button v-if="selectedCustom" class="wd-link" @click="deleteCustom(selectedCustom)">刪掉「{{ selectedCustom.name }}」</button>
              </template>

              <h3 class="wd-sub">顏色<span class="wd-sub-note">免費</span></h3>
              <div class="wd-colors">
                <button class="wd-swatch is-original" :class="{ on: !currentColor }" aria-label="原色" @click="pickColor(null)">原色</button>
                <button
                  v-for="c in colors"
                  :key="c"
                  class="wd-swatch"
                  :class="{ on: currentColor === c.toUpperCase() }"
                  :style="{ background: c }"
                  :aria-label="c"
                  @click="pickColor(c)"
                ></button>
                <label class="wd-swatch is-custom" aria-label="自己選顏色">
                  <input type="color" :value="currentColor ?? '#888888'" @input="onColorInput" />
                  <span>自選</span>
                </label>
              </div>
            </template>
          </div>
        </div>

        <footer class="wd-foot">
          <p v-if="leaving" class="wd-msg">還沒換上，確定要離開？</p>
          <p v-else-if="confirming" class="wd-msg">
            要付 {{ cost.total.toLocaleString() }} 金幣買：{{ cost.items.map((i) => i.name).join("、") }}
          </p>
          <p v-else-if="message" class="wd-msg" role="status">{{ message }}</p>
          <div v-if="leaving" class="wd-actions">
            <button class="wd-btn" @click="leaving = false">繼續換</button>
            <button class="wd-btn is-main" @click="emit('close')">不存，離開</button>
          </div>
          <div v-else-if="!upload" class="wd-actions">
            <button class="wd-btn" :disabled="!changed || busy" @click="reset">還原</button>
            <button v-if="confirming" class="wd-btn" @click="confirming = false">先不要</button>
            <button class="wd-btn is-main" :disabled="!changed || busy || !canWear" @click="wear">
              {{ cost.total > 0 ? (confirming ? "確定付款" : `付 ${cost.total.toLocaleString()} 金幣換上`) : "換上" }}
            </button>
          </div>
        </footer>
      </section>
    </div>
  </Transition>
</template>

<style scoped>
.wd-wrap {
  position: absolute;
  inset: 0;
  z-index: 35;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  background: rgba(30, 20, 18, 0.4);
  -webkit-backdrop-filter: blur(2px);
  backdrop-filter: blur(2px);
}

.wd {
  position: relative;
  width: min(100%, 480px);
  height: min(100%, 780px);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: #fffbf5;
  border-radius: 24px 24px 0 0;
  box-shadow: 0 -10px 40px rgba(30, 20, 18, 0.25);
  color: #3b2a26;
  padding-bottom: env(safe-area-inset-bottom);
}

.wd-head {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 18px 14px 10px 20px;
}

.wd-head h2 {
  flex: 1;
  min-width: 0;
  margin: 0;
  font-size: 19px;
  font-weight: 700;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.wd-coins {
  padding: 5px 12px;
  border-radius: 999px;
  background: #fbe9bd;
  color: #7a5a1e;
  font-size: 13px;
  font-weight: 600;
  white-space: nowrap;
}

.wd-x {
  width: 34px;
  height: 34px;
  flex: none;
  border: 0;
  border-radius: 50%;
  background: rgba(59, 42, 38, 0.08);
  color: #3b2a26;
  font-family: inherit;
  font-size: 20px;
  line-height: 1;
  cursor: pointer;
}

.wd-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
  touch-action: pan-y;
  -webkit-overflow-scrolling: touch;
}

.wd-stage {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  margin: 0 16px;
  padding: 16px 12px 12px;
  border-radius: 20px;
  background: radial-gradient(circle at 50% 40%, #fff6e3 0%, #f3e4c8 70%);
  box-shadow: inset 0 0 0 1px rgba(59, 42, 38, 0.06);
}

.wd-doll {
  width: 125px;
  height: 205px;
  image-rendering: pixelated;
}

.wd-empty {
  height: 205px;
  margin: 0;
  display: flex;
  align-items: center;
  font-size: 14px;
  opacity: 0.7;
}

.wd-poses,
.wd-tabs {
  display: flex;
  gap: 6px;
}

.wd-poses button,
.wd-tabs button {
  min-height: 32px;
  padding: 0 14px;
  border: 0;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.85);
  color: #3b2a26;
  font-family: inherit;
  font-size: 14px;
  white-space: nowrap;
  cursor: pointer;
  box-shadow: 0 1px 3px rgba(59, 42, 38, 0.12);
  transition: background 150ms ease, color 150ms ease;
}

.wd-poses button.on,
.wd-tabs button.on {
  background: #3b2a26;
  color: #fff;
}

.wd-poses button:disabled {
  opacity: 0.35;
  cursor: default;
}

.wd-tabs {
  overflow-x: auto;
  touch-action: pan-x;
  padding: 14px 16px 8px;
  scrollbar-width: none;
}

.wd::before {
  content: "";
  position: absolute;
  left: 50%;
  top: 7px;
  width: 38px;
  height: 5px;
  margin-left: -19px;
  border-radius: 999px;
  background: rgba(59, 42, 38, 0.18);
}

.wd-tabs::-webkit-scrollbar {
  display: none;
}

.wd-panel {
  padding: 0 16px 18px;
}

.wd-sub {
  margin: 14px 2px 8px;
  font-size: 13px;
  font-weight: 600;
  opacity: 0.55;
}

.wd-sub-note {
  margin-left: 6px;
  font-size: 12px;
  opacity: 0.7;
}

.wd-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(78px, 1fr));
  gap: 8px;
  margin-top: 10px;
}

.wd-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 3px;
  padding: 8px 4px 9px;
  border: 0;
  border-radius: 16px;
  background: #fff;
  color: #3b2a26;
  font-family: inherit;
  cursor: pointer;
  box-shadow: 0 1px 4px rgba(59, 42, 38, 0.12);
  transition: box-shadow 150ms ease, transform 150ms ease;
}

.wd-card.on {
  box-shadow: 0 0 0 2.5px #e8a33d, 0 4px 12px rgba(232, 163, 61, 0.3);
  background: #fffaf0;
}

.wd-card:disabled {
  opacity: 0.45;
  cursor: default;
}

.wd-card-add {
  background: transparent;
  box-shadow: inset 0 0 0 1.5px rgba(59, 42, 38, 0.25);
}

.wd-thumb {
  width: 50px;
  height: 82px;
  image-rendering: pixelated;
}

.wd-thumb-none {
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 22px;
  opacity: 0.5;
}

.wd-card-name {
  font-size: 12px;
  line-height: 16px;
  text-align: center;
  word-break: break-all;
}

.wd-badge {
  min-height: 14px;
  font-size: 11px;
  line-height: 14px;
  opacity: 0.7;
}

.wd-colors {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.wd-swatch {
  position: relative;
  width: 34px;
  height: 34px;
  padding: 0;
  border: 0;
  border-radius: 50%;
  cursor: pointer;
  font-family: inherit;
  font-size: 11px;
  color: #3b2a26;
  box-shadow: inset 0 0 0 1px rgba(59, 42, 38, 0.18), 0 1px 3px rgba(59, 42, 38, 0.15);
}

.wd-swatch.on {
  box-shadow: 0 0 0 2px #fffbf5, 0 0 0 4.5px #e8a33d;
}

.wd-swatch.is-original,
.wd-swatch.is-custom {
  width: auto;
  min-width: 48px;
  padding: 0 10px;
  border-radius: 999px;
  background: #fff;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.wd-swatch.is-custom input {
  position: absolute;
  inset: 0;
  opacity: 0;
  cursor: pointer;
}

.wd-link {
  margin-top: 10px;
  padding: 4px 2px;
  border: 0;
  background: none;
  color: #c0443a;
  font-family: inherit;
  font-size: 13px;
  cursor: pointer;
}

.wd-note {
  margin: 10px 0 0;
  font-size: 12px;
  line-height: 18px;
  opacity: 0.65;
}

.wd-upload h3 {
  margin: 6px 0 8px;
  font-size: 17px;
  font-weight: 700;
}

.wd-steps {
  margin: 0;
  padding: 12px 14px 12px 32px;
  border-radius: 14px;
  background: #fff;
  font-size: 13px;
  line-height: 21px;
  box-shadow: 0 1px 3px rgba(59, 42, 38, 0.1);
}

.wd-steps a {
  color: #2d6fa8;
  margin: 0 2px;
}

.wd-file {
  position: relative;
  display: inline-flex;
  align-items: center;
  margin-top: 12px;
  min-height: 42px;
  padding: 0 18px;
  border-radius: 12px;
  background: #3b2a26;
  color: #fff;
  font-weight: 500;
  cursor: pointer;
}

.wd-file input {
  position: absolute;
  inset: 0;
  opacity: 0;
  cursor: pointer;
}

.wd-sheet {
  display: block;
  margin-top: 12px;
  max-width: 100%;
  height: 82px;
  image-rendering: pixelated;
  border-radius: 10px;
  background: #f3e4c8;
}

.wd-name {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 10px;
  font-size: 14px;
}

.wd-name input {
  flex: 1;
  min-height: 38px;
  padding: 0 12px;
  border: 1px solid rgba(59, 42, 38, 0.2);
  border-radius: 10px;
  background: #fff;
  font-family: inherit;
  font-size: 16px;
}

.wd-error {
  margin: 8px 0 0;
  color: #b0453c;
  font-size: 13px;
}

.wd-foot {
  padding: 10px 16px 12px;
  border-top: 1px solid rgba(59, 42, 38, 0.08);
  background: #fffbf5;
}

.wd-msg {
  margin: 0 0 8px;
  font-size: 13px;
  line-height: 18px;
}

.wd-actions {
  display: flex;
  gap: 8px;
  margin-top: 10px;
}

.wd-foot .wd-actions {
  margin-top: 0;
}

.wd-btn {
  flex: 1;
  min-height: 46px;
  padding: 0 12px;
  border: 0;
  border-radius: 14px;
  background: rgba(59, 42, 38, 0.07);
  color: #3b2a26;
  font-family: inherit;
  font-size: 15px;
  font-weight: 500;
  cursor: pointer;
}

.wd-btn.is-main {
  flex: 1.6;
  background: #3b2a26;
  color: #fff;
  font-weight: 600;
}

.wd-btn:disabled {
  opacity: 0.4;
  cursor: default;
}

.ph-sheet-enter-active,
.ph-sheet-leave-active {
  transition: opacity 220ms ease;
}

.ph-sheet-enter-active .wd,
.ph-sheet-leave-active .wd {
  transition: transform 260ms cubic-bezier(0.3, 0.9, 0.3, 1);
}

.ph-sheet-enter-from,
.ph-sheet-leave-to {
  opacity: 0;
}

.ph-sheet-enter-from .wd,
.ph-sheet-leave-to .wd {
  transform: translateY(40px);
}
</style>
