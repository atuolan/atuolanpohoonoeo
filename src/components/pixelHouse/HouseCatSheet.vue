<script setup lang="ts">
/**
 * 寵物的面板，三種分頁：
 * - 每隻一頁：數值、個性、照顧（貓：摸、逗、罐頭、貓條、洗澡、訓練；狗：摸、丟球、潔牙骨、洗澡、散步、訓練；
 *   倉鼠：摸、葵花子、換木屑）、健康檢查、看醫生、改名
 * - 用品：家裡有養的種類用得到的東西、寵物保險（會自己用掉的顯示還夠幾天）
 * - 領養：選種類、花色、取名字（第一隻免費；貓狗每隻 32,000、倉鼠 1,500）
 * 數值是打開面板、照顧完才重算的（不是每秒更新）。
 */
import { computed, ref, watch } from "vue";
import {
  catLevels,
  CAT_NAME_MAX,
  CAT_PERSONALITIES,
  personalityDesc,
  PET_SPECIES_IDS,
  SPECIES_COLORS,
  SPECIES_NAMES,
  walkOverdue,
  type CatCare,
  type CatState,
  type PetColor,
  type PetSpecies,
} from "./houseCat";
import { HAMSTER_ART, walkerArt } from "./petArt";
import { pixelSvg } from "./pixelArt";
import {
  adoptPrice,
  checkupPrice,
  COVER_DAYS,
  INSURANCE_PRICE,
  isDaily,
  roomFor,
  SPECIES_INFO,
  speciesOwned,
  stockDays,
  SUPPLIES,
  SUPPLY_IDS,
  vetCost,
  type PetHome,
  type SupplyId,
} from "./petHome";

const props = defineProps<{
  open: boolean;
  home: PetHome;
  /** 算數值用的時間（打開面板、照顧完時更新） */
  now: number;
  /** 打開時看哪一頁：寵物的 id、"supplies"、"adopt"（沒給就看第一隻） */
  focus: string | null;
  /** 上一個動作沒做成的原因、或做完的話 */
  message: string;
  busy: boolean;
}>();
const emit = defineEmits<{
  close: [];
  adopt: [name: string, color: PetColor, species: PetSpecies];
  care: [id: string, kind: CatCare];
  rename: [id: string, name: string];
  buy: [id: SupplyId];
  insurance: [];
  checkup: [id: string];
  vet: [id: string];
  train: [id: string];
  walk: [id: string];
}>();

const tab = ref<string>("adopt");
/** 提示是在哪一頁發生的：換到別頁就不顯示（不然摸倉鼠的話會跑到領養那頁） */
const msgTab = ref<string>("");
watch(
  () => props.message,
  () => (msgTab.value = tab.value),
  { flush: "sync" },
);
const msg = computed(() => (msgTab.value === tab.value ? props.message : ""));
const species = ref<PetSpecies>("cat");
const color = ref<PetColor>("orange");
const name = ref("");
const renaming = ref(false);
const newName = ref("");

/** 還能養的種類（貓狗加起來三隻、倉鼠另外三隻） */
const canAdopt = (sp: PetSpecies) => roomFor(props.home, sp);
const anyRoom = computed(() => PET_SPECIES_IDS.some(canAdopt));

function pickSpecies(sp: PetSpecies) {
  species.value = sp;
  color.value = Object.keys(SPECIES_COLORS[sp])[0] as PetColor;
}

watch(
  () => [props.open, props.focus] as const,
  ([open]) => {
    if (!open) return;
    renaming.value = false;
    name.value = "";
    tab.value = props.focus ?? props.home.cats[0]?.id ?? "adopt";
    if (!canAdopt(species.value)) pickSpecies(PET_SPECIES_IDS.find(canAdopt) ?? "cat");
  },
);
// 領養完：跳到新來的那隻
watch(
  () => props.home.cats.length,
  (n, prev) => {
    if (props.open && n > prev) tab.value = props.home.cats[n - 1].id;
  },
);

const owned = computed(() => speciesOwned(props.home));
const tabs = computed(() => [
  ...props.home.cats.map((c) => ({ id: c.id, label: c.name, alert: !!c.sickSince })),
  ...(props.home.cats.length
    ? [{ id: "supplies", label: "用品", alert: SUPPLY_IDS.some((id) => isDaily(id) && Number.isFinite(stockDays(props.home, id)) && props.home.stock[id] <= 0) }]
    : []),
  ...(anyRoom.value ? [{ id: "adopt", label: props.home.cats.length ? "＋" : "領養", alert: false }] : []),
]);

const cat = computed<CatState | undefined>(() => props.home.cats.find((c) => c.id === tab.value));
const levels = computed(() => (cat.value ? catLevels(cat.value, props.now) : { food: 0, clean: 0, mood: 0 }));
const insured = computed(() => props.home.insuranceUntil > props.now);
const away = computed(() => !!cat.value && Math.max(cat.value.vetUntil, cat.value.outUntil) > props.now);
const atVet = computed(() => !!cat.value && cat.value.vetUntil > props.now);
const info = computed(() => SPECIES_INFO[cat.value?.species ?? "cat"]);

function portraitOf(sp: PetSpecies, c: PetColor, sick = false): string {
  const palette = SPECIES_COLORS[sp][c]?.palette ?? {};
  if (sp === "hamster") return pixelSvg(HAMSTER_ART[sick ? "sleep" : "sit"], palette);
  // 狗坐著是側面，看不太出來：站著的比較好認
  return pixelSvg(walkerArt(sp).art[sick ? "sleep" : sp === "dog" ? "walk-a" : "sit"], palette);
}
const portraits = computed(() => Object.fromEntries(props.home.cats.map((c) => [c.id, portraitOf(c.species, c.color, !!c.sickSince)])));
const previews = computed(() =>
  Object.entries(SPECIES_COLORS[species.value]).map(([id, def]) => ({ id: id as PetColor, name: def.name, src: portraitOf(species.value, id as PetColor) })),
);
const price = computed(() => adoptPrice(props.home.cats.length, species.value));

const bars = computed(() => {
  const c = cat.value;
  if (!c) return [];
  return [
    { key: "food", name: "飽", value: levels.value.food },
    { key: "clean", name: c.species === "hamster" ? "籠子" : "乾淨", value: levels.value.clean },
    { key: "mood", name: "心情", value: levels.value.mood },
    { key: "affinity", name: "親密", value: Math.round(c.affinity) },
    ...(info.value.toilet ? [{ key: "training", name: "上廁所", value: Math.round(c.training) }] : []),
  ];
});

const days = (until: number) => Math.max(0, Math.ceil((until - props.now) / 86_400_000));

/** 這隻現在的狀況（一句話） */
const status = computed(() => {
  const c = cat.value;
  if (!c) return "";
  const mins = (until: number) => Math.max(1, Math.ceil((until - props.now) / 60_000));
  if (atVet.value) return `在醫院，大約 ${mins(c.vetUntil)} 分鐘後回家`;
  if (away.value) return `出門散步了，大約 ${mins(c.outUntil)} 分鐘後回來`;
  if (c.sickSince) return `生病了。帶去看醫生要 ${vetCost(c, props.now, insured.value).toLocaleString()} 金幣${insured.value ? "（保險付了一半）" : ""}`;
  const food = SUPPLIES[info.value.food].name;
  if (levels.value.food < 20) return props.home.stock[info.value.food] > 0 ? `${c.name}很餓，等一下會去吃` : `${c.name}很餓，${food}吃完了`;
  if (levels.value.clean < 20) return c.species === "hamster" ? "籠子髒了，該換木屑了" : `${c.name}髒髒的，該洗澡了`;
  if (walkOverdue(c, props.now)) return `${c.name}很久沒出門了，帶牠去散步吧`;
  if (levels.value.mood < 20) return `${c.name}心情不好，陪牠玩一下`;
  return personalityDesc(c.species, c.personality);
});

/** 照顧的按鈕：照種類不同 */
const careButtons = computed(() => {
  const c = cat.value;
  if (!c) return [];
  const stock = (id: SupplyId) => `剩 ${props.home.stock[id]}`;
  if (c.species === "hamster")
    return [
      { kind: "pet" as CatCare, label: "摸摸" },
      { kind: "treat" as CatCare, label: "葵花子", note: stock("seeds") },
      { kind: "wash" as CatCare, label: "換木屑", note: stock("bedding") },
    ];
  if (c.species === "dog")
    return [
      { kind: "pet" as CatCare, label: "摸摸" },
      { kind: "play" as CatCare, label: "丟球" },
      { kind: "treat" as CatCare, label: "潔牙骨", note: stock("chew") },
      { kind: "wash" as CatCare, label: "洗澡" },
    ];
  return [
    { kind: "pet" as CatCare, label: "摸摸" },
    { kind: "play" as CatCare, label: "逗牠玩" },
    { kind: "can" as CatCare, label: "罐頭", note: stock("can") },
    { kind: "treat" as CatCare, label: "貓條", note: stock("treat") },
    { kind: "wash" as CatCare, label: "洗澡" },
  ];
});

/** 用品：照種類分組，只列家裡有養的 */
const shopGroups = computed(() =>
  owned.value.map((sp) => ({ species: sp, name: SPECIES_NAMES[sp], ids: SUPPLY_IDS.filter((id) => SUPPLIES[id].species === sp) })),
);

function stockNote(id: SupplyId): string {
  const n = props.home.stock[id];
  const s = SUPPLIES[id];
  const d = stockDays(props.home, id);
  if (isDaily(id) && Number.isFinite(d)) return `還有 ${n} ${s.unit}，大約夠 ${d < 1 ? "不到 1" : Math.floor(d)} 天`;
  return `還有 ${n} ${s.unit}`;
}

function saveName() {
  if (cat.value && newName.value.trim()) emit("rename", cat.value.id, newName.value.trim());
  renaming.value = false;
}
</script>

<template>
  <div v-if="open" class="cs-wrap" @click.self="emit('close')">
    <section class="cs-card" role="dialog" aria-label="寵物">
      <div v-if="tabs.length > 1" class="cs-tabs" role="tablist">
        <button
          v-for="t in tabs"
          :key="t.id"
          class="cs-tab"
          :class="{ 'is-on': tab === t.id }"
          role="tab"
          :aria-selected="tab === t.id"
          @click="tab = t.id; renaming = false"
        >
          {{ t.label }}<i v-if="t.alert" class="cs-dot" aria-label="要注意"></i>
        </button>
      </div>

      <!-- 領養 -->
      <template v-if="tab === 'adopt'">
        <h2 class="cs-title">{{ home.cats.length ? "再養一隻" : "領養寵物" }}</h2>
        <div class="cs-kinds" role="radiogroup" aria-label="種類">
          <button
            v-for="sp in PET_SPECIES_IDS"
            :key="sp"
            class="cs-kind"
            :class="{ 'is-on': species === sp }"
            role="radio"
            :aria-checked="species === sp"
            :disabled="!canAdopt(sp)"
            @click="pickSpecies(sp)"
          >
            {{ SPECIES_NAMES[sp] }}<small>{{ canAdopt(sp) ? (home.cats.length ? `${SPECIES_INFO[sp].price.toLocaleString()}` : "免費") : "滿了" }}</small>
          </button>
        </div>
        <p class="cs-note">
          <template v-if="species === 'dog'">一天要散步兩次，吃狗糧、用尿布墊上廁所。</template>
          <template v-else-if="species === 'hamster'">住在客廳角落的籠子裡，白天睡覺、晚上跑滾輪。吃鼠糧，大約一週換一次木屑。</template>
          <template v-else>會跳上窗台、跟著走。吃貓糧、用貓砂盆。</template>
          {{ home.cats.length ? "" : "第一隻免費。" }}每隻個性不一樣，來的時候送一份新手包。
        </p>
        <div class="cs-colors" role="radiogroup" aria-label="花色">
          <button
            v-for="p in previews"
            :key="p.id"
            class="cs-color"
            :class="{ 'is-on': color === p.id }"
            role="radio"
            :aria-checked="color === p.id"
            @click="color = p.id"
          >
            <img :src="p.src" alt="" draggable="false" />
            <span>{{ p.name }}</span>
          </button>
        </div>
        <label class="cs-field">
          <span>名字</span>
          <input v-model="name" type="text" :maxlength="CAT_NAME_MAX" :placeholder="SPECIES_COLORS[species][color]?.name ?? SPECIES_NAMES[species]" />
        </label>
        <p v-if="msg" class="cs-msg" role="status">{{ msg }}</p>
        <button class="cs-btn is-main" :disabled="busy || !canAdopt(species)" @click="emit('adopt', name, color, species)">
          帶牠回家<small v-if="price">{{ price.toLocaleString() }} 金幣</small>
        </button>
      </template>

      <!-- 用品 -->
      <template v-else-if="tab === 'supplies'">
        <h2 class="cs-title">用品</h2>
        <p class="cs-note">吃的和上廁所用的用完了，牠們會餓、會在地上上廁所。</p>
        <ul class="cs-shop">
          <template v-for="g in shopGroups" :key="g.species">
            <li v-if="shopGroups.length > 1" class="cs-shop-group">{{ g.name }}</li>
            <li v-for="id in g.ids" :key="id" class="cs-shop-row">
              <div class="cs-shop-info">
                <strong>{{ SUPPLIES[id].name }}<small>（{{ SUPPLIES[id].pack }} {{ SUPPLIES[id].unit }}）</small></strong>
                <span :class="{ 'is-low': isDaily(id) && home.stock[id] <= 0 }">{{ stockNote(id) }}</span>
              </div>
              <button class="cs-buy" :disabled="busy" @click="emit('buy', id)">{{ SUPPLIES[id].price.toLocaleString() }}</button>
            </li>
          </template>
          <li class="cs-shop-row">
            <div class="cs-shop-info">
              <strong>寵物保險<small>（{{ COVER_DAYS }} 天）</small></strong>
              <span>{{ insured ? `有效，還有 ${days(home.insuranceUntil)} 天` : "看醫生打對折，全部寵物都有" }}</span>
            </div>
            <button class="cs-buy" :disabled="busy" @click="emit('insurance')">{{ INSURANCE_PRICE.toLocaleString() }}</button>
          </li>
        </ul>
        <p v-if="msg" class="cs-msg" role="status">{{ msg }}</p>
      </template>

      <!-- 一隻 -->
      <template v-else-if="cat">
        <div class="cs-head">
          <img class="cs-portrait" :src="portraits[cat.id]" alt="" draggable="false" />
          <div class="cs-name">
            <template v-if="renaming">
              <input v-model="newName" type="text" :maxlength="CAT_NAME_MAX" aria-label="名字" @keyup.enter="saveName" />
              <button class="cs-mini" @click="saveName">好</button>
            </template>
            <template v-else>
              <strong>{{ cat.name }}</strong>
              <span class="cs-chip">{{ SPECIES_NAMES[cat.species] }}．{{ CAT_PERSONALITIES[cat.personality].name }}</span>
              <button class="cs-mini" @click="renaming = true; newName = cat.name">改名</button>
            </template>
          </div>
        </div>

        <div v-for="b in bars" :key="b.key" class="cs-stat">
          <span class="cs-stat-name">{{ b.name }}</span>
          <div class="cs-bar" role="progressbar" :aria-label="b.name" :aria-valuenow="b.value" aria-valuemin="0" aria-valuemax="100">
            <i :class="{ 'is-low': b.value < 20 && b.key !== 'training' && b.key !== 'affinity', 'is-soft': b.key === 'training' || b.key === 'affinity' }" :style="{ width: `${b.value}%` }"></i>
          </div>
          <span class="cs-stat-num">{{ b.value }}</span>
        </div>

        <p class="cs-note" :class="{ 'is-alert': !!cat.sickSince }" role="status">{{ msg || status }}</p>

        <button v-if="cat.sickSince && !atVet" class="cs-btn is-main" :disabled="busy" @click="emit('vet', cat.id)">
          帶去看醫生<small>{{ vetCost(cat, now, insured).toLocaleString() }} 金幣</small>
        </button>
        <button v-else-if="cat.species === 'dog'" class="cs-btn is-main" :disabled="busy || away" @click="emit('walk', cat.id)">
          去散步<small>{{ away ? "在外面" : "陪牠出門半小時" }}</small>
        </button>

        <div class="cs-actions">
          <button v-for="b in careButtons" :key="b.kind" class="cs-btn" :disabled="away" @click="emit('care', cat.id, b.kind)">
            {{ b.label }}<small v-if="b.note">{{ b.note }}</small>
          </button>
          <button v-if="info.toilet" class="cs-btn" :disabled="away" @click="emit('train', cat.id)">
            訓練上廁所
          </button>
        </div>
        <button class="cs-btn is-line" :disabled="busy || away" @click="emit('checkup', cat.id)">
          健康檢查<small>{{ cat.checkupUntil > now ? `有效，還有 ${days(cat.checkupUntil)} 天．再做一次 ` : "做了之後比較不會生病．" }}{{ checkupPrice(cat.species).toLocaleString() }} 金幣</small>
        </button>
      </template>

      <button class="cs-btn is-cancel" @click="emit('close')">關閉</button>
    </section>
  </div>
</template>

<style scoped>
.cs-wrap {
  position: absolute;
  inset: 0;
  z-index: 25;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  background: rgba(30, 20, 18, 0.4);
  -webkit-backdrop-filter: blur(2px);
  backdrop-filter: blur(2px);
}

.cs-card button {
  -webkit-tap-highlight-color: transparent;
}

.cs-card {
  width: 100%;
  max-width: 300px;
  max-height: 100%;
  overflow-y: auto;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 18px 16px 12px;
  border-radius: 20px;
  background: #fffbf5;
  color: #3b2a26;
  box-shadow: 0 16px 40px rgba(30, 20, 18, 0.28);
}

.cs-title {
  margin: 0;
  font-size: 17px;
  font-weight: 600;
  text-align: center;
}

.cs-note {
  margin: 0;
  min-height: 36px;
  font-size: 13px;
  line-height: 18px;
  color: rgba(59, 42, 38, 0.72);
}

.cs-colors {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
}

.cs-color {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 8px 4px 6px;
  border: 2px solid transparent;
  border-radius: 14px;
  background: #f4ead8;
  color: inherit;
  font-family: inherit;
  font-size: 13px;
  cursor: pointer;
}

.cs-kinds {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 6px;
}

.cs-kind {
  min-width: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1px;
  padding: 6px 4px;
  border: 2px solid transparent;
  border-radius: 12px;
  background: #f4ead8;
  color: inherit;
  font-family: inherit;
  font-size: 14px;
  cursor: pointer;
}

.cs-kind small {
  font-size: 11px;
  opacity: 0.7;
}

.cs-kind.is-on {
  border-color: #e8a33d;
  background: #fff1c9;
}

.cs-kind:disabled {
  opacity: 0.45;
}

.cs-shop-group {
  margin: 4px 0 0;
  font-size: 12px;
  font-weight: 600;
  color: rgba(59, 42, 38, 0.6);
}

.cs-color.is-on {
  border-color: #e8a33d;
  background: #fff1c9;
}

.cs-color img,
.cs-portrait {
  width: 72px;
  height: 48px;
  object-fit: contain;
  image-rendering: crisp-edges;
  image-rendering: pixelated;
  -webkit-user-drag: none;
}

.cs-field {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 14px;
}

.cs-field input,
.cs-name input {
  flex: 1;
  min-width: 0;
  height: 40px;
  padding: 0 12px;
  border: 1px solid rgba(59, 42, 38, 0.22);
  border-radius: 10px;
  background: #fff;
  color: inherit;
  font-family: inherit;
  /* 16px 以上：iOS 點輸入框時畫面不會自己放大 */
  font-size: 16px;
}

.cs-head {
  display: flex;
  align-items: center;
  gap: 12px;
}

.cs-name {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 17px;
}

.cs-name strong {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-weight: 600;
}

.cs-mini {
  flex: none;
  height: 32px;
  padding: 0 10px;
  border: 0;
  border-radius: 999px;
  background: #f4ead8;
  color: inherit;
  font-family: inherit;
  font-size: 13px;
  cursor: pointer;
}

.cs-stat {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
}

.cs-stat-name {
  width: 44px;
}

.cs-stat-num {
  width: 26px;
  text-align: right;
  font-variant-numeric: tabular-nums;
}

.cs-bar {
  flex: 1;
  height: 10px;
  border-radius: 999px;
  background: #efe4d0;
  overflow: hidden;
}

.cs-bar i {
  display: block;
  height: 100%;
  border-radius: 999px;
  background: #8cc79a;
}

.cs-bar i.is-low {
  background: #e58a7a;
}

.cs-actions {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}

.cs-btn {
  min-height: 44px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  border: 0;
  border-radius: 12px;
  background: #f6e2b5;
  color: #3b2a26;
  font-family: inherit;
  font-size: 15px;
  font-weight: 500;
  line-height: 1.2;
  cursor: pointer;
}

.cs-btn small {
  font-size: 11px;
  font-weight: 400;
  opacity: 0.7;
}

.cs-btn.is-main {
  background: #e8a33d;
  font-weight: 600;
}

.cs-btn.is-cancel {
  background: transparent;
  color: rgba(59, 42, 38, 0.6);
}

.cs-tabs {
  display: flex;
  gap: 6px;
  overflow-x: auto;
  scrollbar-width: none;
  margin: -4px -4px 2px;
  padding: 2px 4px 4px;
}

.cs-tabs::-webkit-scrollbar {
  display: none;
}

.cs-tab {
  position: relative;
  flex: none;
  max-width: 7.5em;
  height: 34px;
  padding: 0 12px;
  border: 0;
  border-radius: 999px;
  background: #f4ead8;
  color: inherit;
  font-family: inherit;
  font-size: 14px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  cursor: pointer;
}

.cs-tab.is-on {
  background: #3b2a26;
  color: #fffbf5;
}

.cs-dot {
  position: absolute;
  top: 5px;
  right: 5px;
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #d9453a;
}

.cs-chip {
  flex: none;
  padding: 2px 8px;
  border-radius: 999px;
  background: #e7f1df;
  color: #4c6b3e;
  font-size: 12px;
}

.cs-msg {
  margin: 0;
  font-size: 13px;
  color: #b5452f;
}

.cs-note.is-alert {
  color: #b5452f;
}

.cs-bar i.is-soft {
  background: #e8b866;
}

.cs-btn.is-line {
  background: transparent;
  border: 1px solid rgba(59, 42, 38, 0.2);
}

.cs-btn:disabled {
  opacity: 0.45;
  cursor: default;
}

.cs-shop {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.cs-shop-row {
  display: flex;
  align-items: center;
  gap: 10px;
}

.cs-shop-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  font-size: 13px;
  line-height: 18px;
}

.cs-shop-info strong {
  font-size: 15px;
  font-weight: 600;
}

.cs-shop-info small {
  font-weight: 400;
  opacity: 0.65;
}

.cs-shop-info span {
  color: rgba(59, 42, 38, 0.7);
}

.cs-shop-info span.is-low {
  color: #b5452f;
}

.cs-buy {
  flex: none;
  min-width: 72px;
  height: 40px;
  padding: 0 12px;
  border: 0;
  border-radius: 12px;
  background: #f6e2b5;
  color: #3b2a26;
  font-family: inherit;
  font-size: 14px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  cursor: pointer;
}

.cs-buy:disabled {
  opacity: 0.45;
}
</style>
