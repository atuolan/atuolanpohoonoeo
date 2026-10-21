<script setup lang="ts">
/**
 * AI 導演面板：所有設定都只 emit，不在元件內存狀態
 */
import { computed } from "vue";
import { Loader2, MessagesSquare, Pencil, Repeat, Sparkles, Store, X } from "lucide-vue-next";
import PlurkAvatar from "@/components/plurk/PlurkAvatar.vue";
import type { DirectorRosterItem } from "@/components/plurk/types";
import {
  LIVELINESS_LABELS,
  MODE_HINTS,
  NPC_LEVEL_LABELS,
  ROLE_LABELS,
  ROUTINE_LABELS,
  STRICTNESS_HINTS,
  STRICTNESS_LABELS,
  type DirectorMode,
  type DirectorRole,
  type DirectorRoutine,
  type DirectorStrictness,
  type PlurkDirectorConfig,
} from "@/utils/plurkDirectorConfig";

const props = withDefaults(
  defineProps<{
    open: boolean;
    config: PlurkDirectorConfig;
    roster: DirectorRosterItem[];
    busy: boolean;
    /** 例：「約每小時 1.5 次 AI 呼叫，每天最多 25 次」 */
    callsPerHourText: string;
  }>(),
  {
    roster: () => [],
    busy: false,
    callsPerHourText: "",
  },
);

const emit = defineEmits<{
  (e: "close"): void;
  (e: "update", patch: Partial<PlurkDirectorConfig>): void;
  (e: "postNow"): void;
  (e: "postNowPick"): void;
  (e: "replyNow"): void;
  (e: "fillSquare"): void;
}>();

const MODE_ORDER: DirectorMode[] = ["off", "free", "list"];
const MODE_LABELS: Record<DirectorMode, string> = { off: "關閉", free: "自由", list: "只用名單" };
const ROLE_ORDER: DirectorRole[] = ["often", "reply", "mute"];
const ROUTINE_CYCLE: DirectorRoutine[] = ["any", "early", "day", "night"];
const STRICTNESS_ORDER: DirectorStrictness[] = ["loose", "mid", "hard"];
const CAP_STEP = 5;
const CAP_MIN = 5;
const CAP_MAX = 200;
const MEMORY_STEP = 5;
const MEMORY_MIN = 5;
const MEMORY_MAX = 50;

type SwitchKey = "memoryEnabled" | "usePeekPhone" | "followRoutine" | "repliesAfterUser";

interface SwitchDef {
  key: SwitchKey;
  label: string;
  sub: string;
  peek?: boolean;
}

const SWITCHES: SwitchDef[] = [
  {
    key: "memoryEnabled",
    label: "讀取聊天記錄",
    sub: "角色會記得你們之前聊過的事",
  },
  {
    key: "usePeekPhone",
    label: "參考角色手機裡的內容",
    sub: "發噗時會提到他手機裡的訊息、照片和行程",
    peek: true,
  },
  {
    key: "followRoutine",
    label: "照角色作息出現",
    sub: "睡覺時間不發噗，深夜型的角色晚上才活躍",
  },
  {
    key: "repliesAfterUser",
    label: "你回應後角色會接話",
    sub: "你回覆角色之後，他會再回你一句",
  },
];

const livelinessText = computed(
  () => LIVELINESS_LABELS[props.config.liveliness - 1] ?? LIVELINESS_LABELS[0],
);

const modeHint = computed(() => MODE_HINTS[props.config.mode] ?? "");

const npcText = computed(
  () => NPC_LEVEL_LABELS[props.config.npcLevel - 1] ?? NPC_LEVEL_LABELS[2],
);

const canStepMemory = computed(() => props.config.memoryEnabled);

function roleOf(id: string): DirectorRole {
  return props.config.roles[id] ?? "often";
}

function routineOf(id: string): DirectorRoutine {
  return props.config.routines[id] ?? "any";
}

function setMode(mode: DirectorMode) {
  if (props.config.mode === mode) return;
  emit("update", { mode });
}

function setRole(id: string, role: DirectorRole) {
  if (roleOf(id) === role) return;
  emit("update", { roles: { ...props.config.roles, [id]: role } });
}

function cycleRoutine(id: string) {
  const current = routineOf(id);
  const index = ROUTINE_CYCLE.indexOf(current);
  const next = ROUTINE_CYCLE[(index + 1) % ROUTINE_CYCLE.length];
  emit("update", { routines: { ...props.config.routines, [id]: next } });
}

function setLiveliness(level: number) {
  if (props.config.liveliness === level) return;
  emit("update", { liveliness: level });
}

function setNpcLevel(level: number) {
  if (props.config.npcLevel !== level) emit("update", { npcLevel: level });
}

function setStrictness(s: DirectorStrictness) {
  if (props.config.strictness !== s) emit("update", { strictness: s });
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function stepDailyCap(delta: number) {
  const next = clamp(props.config.dailyCap + delta, CAP_MIN, CAP_MAX);
  if (next === props.config.dailyCap) return;
  emit("update", { dailyCap: next });
}

function stepMemory(delta: number) {
  if (!props.config.memoryEnabled) return;
  const next = clamp(props.config.memoryCount + delta, MEMORY_MIN, MEMORY_MAX);
  if (next === props.config.memoryCount) return;
  emit("update", { memoryCount: next });
}

function toggleSwitch(key: SwitchKey) {
  const patch: Partial<PlurkDirectorConfig> = {};
  patch[key] = !props.config[key];
  emit("update", patch);
}
</script>

<template>
  <Teleport to="body">
    <Transition name="plurk-dim-fade">
      <div v-if="props.open" class="plurk-dim" @click="emit('close')"></div>
    </Transition>

    <Transition name="plurk-sheet-slide">
      <section
        v-if="props.open"
        class="director-sheet"
        role="dialog"
        aria-modal="true"
        aria-label="AI 導演"
      >
        <span class="sheet-handle" aria-hidden="true"></span>

        <header class="sheet-head">
          <div class="head-text">
            <span class="head-title">
              <Sparkles :size="22" class="head-icon" aria-hidden="true" />
              AI 導演
            </span>
            <span class="head-sub">決定角色們什麼時候、用什麼方式出現在河道上</span>
          </div>
          <button type="button" class="head-close" aria-label="關閉" @click="emit('close')">
            <X :size="14" />
          </button>
        </header>

        <section class="block">
          <span class="block-label">現在就讓…</span>
          <div class="now-grid">
            <div class="now-card now-card-strong">
              <button
                type="button"
                class="now-hit"
                :disabled="props.busy"
                aria-label="讓某位角色發一則噗"
                @click="emit('postNow')"
              ></button>
              <Loader2 v-if="props.busy" :size="22" class="now-icon spin" aria-hidden="true" />
              <Pencil v-else :size="22" class="now-icon" aria-hidden="true" />
              <span class="now-foot">
                <span class="now-text">
                  <span class="now-title">某人發一則噗</span>
                  <span class="now-sub">隨機挑一位角色</span>
                </span>
                <button
                  type="button"
                  class="now-pick"
                  :disabled="props.busy"
                  @click="emit('postNowPick')"
                >
                  指定
                </button>
              </span>
            </div>

            <button
              type="button"
              class="now-card now-card-soft"
              :disabled="props.busy"
              @click="emit('replyNow')"
            >
              <Loader2 v-if="props.busy" :size="22" class="now-icon spin" aria-hidden="true" />
              <MessagesSquare v-else :size="22" class="now-icon" aria-hidden="true" />
              <span class="now-text">
                <span class="now-title">大家來回應</span>
                <span class="now-sub">針對你最新的一則噗</span>
              </span>
            </button>
          </div>
        </section>

        <section class="block">
          <span class="block-label">自動模式</span>
          <div class="seg" role="group" aria-label="自動模式">
            <button
              v-for="mode in MODE_ORDER"
              :key="mode"
              type="button"
              class="seg-btn"
              :class="{ 'is-on': props.config.mode === mode }"
              :aria-pressed="props.config.mode === mode"
              @click="setMode(mode)"
            >
              {{ MODE_LABELS[mode] }}
            </button>
          </div>
          <span class="hint">{{ modeHint }}</span>
        </section>

        <section class="block">
          <div class="block-row">
            <span class="block-label">角色名單</span>
            <span class="block-note">點右邊切換</span>
          </div>

          <div v-if="props.roster.length === 0" class="empty">還沒有好友角色，先去聊天吧</div>

          <ul v-else class="cast-list">
            <li
              v-for="character in props.roster"
              :key="character.id"
              class="cast-row"
              :class="{ 'is-mute': roleOf(character.id) === 'mute' }"
            >
              <PlurkAvatar
                :src="character.avatar"
                :name="character.name"
                :size="36"
                class="cast-avatar"
              />
              <button
                type="button"
                class="cast-main"
                :aria-label="`${character.name} 的作息是 ${ROUTINE_LABELS[routineOf(character.id)]}，點一下切換`"
                @click="cycleRoutine(character.id)"
              >
                <span class="cast-name">{{ character.name }}</span>
                <span class="cast-note">
                  <Repeat :size="11" aria-hidden="true" />
                  {{ ROUTINE_LABELS[routineOf(character.id)] }}
                </span>
              </button>
              <div class="role-seg" role="group" :aria-label="`${character.name} 的出現方式`">
                <button
                  v-for="role in ROLE_ORDER"
                  :key="role"
                  type="button"
                  class="role-btn"
                  :class="{
                    'is-on': roleOf(character.id) === role,
                    'is-mute': role === 'mute' && roleOf(character.id) === role,
                  }"
                  :aria-pressed="roleOf(character.id) === role"
                  @click="setRole(character.id, role)"
                >
                  {{ ROLE_LABELS[role] }}
                </button>
              </div>
            </li>
          </ul>
        </section>

        <section class="block">
          <div class="block-row">
            <span class="block-label">熱鬧程度</span>
            <span class="block-value">{{ livelinessText }}</span>
          </div>
          <div class="level-grid" role="group" aria-label="熱鬧程度">
            <button
              v-for="level in 5"
              :key="level"
              type="button"
              class="level-btn"
              :class="{ 'is-on': level <= props.config.liveliness }"
              :aria-label="`熱鬧程度 ${level}`"
              :aria-pressed="level === props.config.liveliness"
              @click="setLiveliness(level)"
            ></button>
          </div>
          <div class="level-ends">
            <span>很安靜</span>
            <span>很熱鬧</span>
          </div>
          <span v-if="props.callsPerHourText" class="hint">{{ props.callsPerHourText }}</span>

          <div class="step-row">
            <span class="step-label">每天最多幾次</span>
            <button
              type="button"
              class="step-btn"
              aria-label="減少每日上限"
              :disabled="props.config.dailyCap <= CAP_MIN"
              @click="stepDailyCap(-CAP_STEP)"
            >
              −
            </button>
            <span class="step-num">{{ props.config.dailyCap }}</span>
            <button
              type="button"
              class="step-btn"
              aria-label="增加每日上限"
              :disabled="props.config.dailyCap >= CAP_MAX"
              @click="stepDailyCap(CAP_STEP)"
            >
              +
            </button>
          </div>
        </section>

        <section class="block">
          <div class="block-row">
            <span class="block-label">廣場</span>
            <span class="block-value">{{ npcText }}</span>
          </div>
          <span class="hint">路人會在廣場發噗，角色偶爾也會去逛。自動模式開著時才會自己出現。</span>

          <div class="level-grid" role="group" aria-label="路人多寡">
            <button
              v-for="level in 5"
              :key="level"
              type="button"
              class="level-btn"
              :class="{ 'is-on': level <= props.config.npcLevel }"
              :aria-label="`路人多寡 ${level}`"
              :aria-pressed="level === props.config.npcLevel"
              @click="setNpcLevel(level)"
            ></button>
          </div>
          <div class="level-ends">
            <span>很少</span>
            <span>很多</span>
          </div>

          <div class="seg" role="group" aria-label="版主嚴格度">
            <button
              v-for="s in STRICTNESS_ORDER"
              :key="s"
              type="button"
              class="seg-btn"
              :class="{ 'is-on': props.config.strictness === s }"
              :aria-pressed="props.config.strictness === s"
              @click="setStrictness(s)"
            >
              {{ STRICTNESS_LABELS[s] }}
            </button>
          </div>
          <span class="hint">版主 阿杏：{{ STRICTNESS_HINTS[props.config.strictness] }}</span>

          <button
            type="button"
            class="fill-btn"
            :disabled="props.busy"
            aria-label="現在讓廣場熱鬧一下"
            @click="emit('fillSquare')"
          >
            <Loader2 v-if="props.busy" :size="18" class="spin" aria-hidden="true" />
            <Store v-else :size="18" aria-hidden="true" />
            現在讓廣場熱鬧一下
          </button>
        </section>

        <section class="block">
          <span class="block-label">記憶</span>

          <div class="step-row" :class="{ 'is-disabled': !canStepMemory }">
            <span class="step-label">讀取最近幾則對話</span>
            <button
              type="button"
              class="step-btn"
              aria-label="減少讀取的對話則數"
              :disabled="!canStepMemory || props.config.memoryCount <= MEMORY_MIN"
              @click="stepMemory(-MEMORY_STEP)"
            >
              −
            </button>
            <span class="step-num">{{ props.config.memoryCount }}</span>
            <button
              type="button"
              class="step-btn"
              aria-label="增加讀取的對話則數"
              :disabled="!canStepMemory || props.config.memoryCount >= MEMORY_MAX"
              @click="stepMemory(MEMORY_STEP)"
            >
              +
            </button>
          </div>

          <div v-for="item in SWITCHES" :key="item.key" class="switch-row">
            <span class="switch-text">
              <span class="switch-label">
                {{ item.label }}
                <span v-if="item.peek" class="peek-tag">PEEK 連動</span>
              </span>
              <span class="switch-sub">{{ item.sub }}</span>
            </span>
            <button
              type="button"
              role="switch"
              class="switch"
              :class="{ 'is-on': props.config[item.key] }"
              :aria-checked="props.config[item.key]"
              :aria-label="item.label"
              @click="toggleSwitch(item.key)"
            >
              <span class="switch-knob" aria-hidden="true"></span>
            </button>
          </div>
        </section>
      </section>
    </Transition>
  </Teleport>
</template>

<style scoped lang="scss">
@use "@/components/plurk/plurk-theme.scss" as *;

.plurk-dim {
  @include plurk-dim;
}

.director-sheet {
  @include plurk-sheet;

  display: flex;
  flex-direction: column;
  gap: 18px;
  padding-bottom: calc(28px + var(--safe-area-inset-bottom, env(safe-area-inset-bottom)));
}

.sheet-handle {
  align-self: center;
  width: 36px;
  height: 5px;
  border-radius: 3px;
  background: var(--color-border);
  flex-shrink: 0;
}

.sheet-head {
  display: flex;
  align-items: flex-start;
  gap: 8px;
}

.head-text {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.head-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 22px;
  font-weight: 700;
  color: var(--color-text);
}

.head-icon {
  flex-shrink: 0;
  color: var(--color-primary);
}

.head-sub {
  font-size: 13px;
  line-height: 1.4;
  color: var(--color-text-secondary);
}

.head-close {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  margin: -4px -10px 0 0;
  padding: 0;
  border: none;
  background: none;
  cursor: pointer;
  flex-shrink: 0;

  &::before {
    content: "";
    position: absolute;
    width: 32px;
    height: 32px;
    border-radius: 16px;
    background: var(--color-surface-hover);
  }

  > svg {
    position: relative;
    z-index: 1;
    color: var(--color-text);
  }
}

.block {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.block-row {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
}

.block-label {
  font-size: 12px;
  font-weight: 700;
  color: var(--color-text-secondary);
}

.block-note {
  font-size: 11px;
  color: var(--color-text-secondary);
}

.block-value {
  font-size: 12px;
  font-weight: 700;
  color: var(--color-text);
}

.hint {
  font-size: 12px;
  line-height: 1.5;
  color: var(--color-text-secondary);
}

.empty {
  padding: 6px 0 12px;
  font-size: 13px;
  color: var(--color-text-muted);
}

/* ── 現在就讓… ───────────────────────────── */
.now-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}

.now-card {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px;
  width: 100%;
  min-height: 84px;
  padding: 12px 14px;
  border: none;
  border-radius: 18px;
  font-family: inherit;
  text-align: left;
  cursor: pointer;

  &:disabled {
    cursor: default;
    opacity: 0.7;
  }
}

.now-card-strong {
  background: var(--color-text);
  color: var(--color-background);
}

.now-card-soft {
  background: var(--color-surface-hover);
  border: 1px solid var(--color-border);
  color: var(--color-text);
}

.now-hit {
  position: absolute;
  inset: 0;
  z-index: 1;
  padding: 0;
  border: none;
  border-radius: inherit;
  background: none;
  cursor: pointer;

  &:disabled {
    cursor: default;
  }
}

.now-icon {
  flex-shrink: 0;
}

.now-foot {
  position: relative;
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 6px;
  width: 100%;
  pointer-events: none;
}

.now-text {
  display: flex;
  flex-direction: column;
  min-width: 0;
  line-height: 1.35;
}

.now-title {
  font-size: 15px;
  font-weight: 700;
}

.now-card-strong .now-sub {
  font-size: 11px;
  opacity: 0.75;
}

.now-card-soft .now-sub {
  font-size: 11px;
  color: var(--color-text-secondary);
}

.now-pick {
  position: relative;
  z-index: 2;
  flex-shrink: 0;
  height: 24px;
  padding: 0 8px;
  border: 1px solid currentColor;
  border-radius: 12px;
  background: none;
  color: inherit;
  font-family: inherit;
  font-size: 11px;
  font-weight: 700;
  opacity: 0.85;
  pointer-events: auto;
  cursor: pointer;

  &:disabled {
    cursor: default;
  }
}

.spin {
  animation: director-spin 0.9s linear infinite;
}

@keyframes director-spin {
  to {
    transform: rotate(360deg);
  }
}

/* ── 自動模式 ─────────────────────────────── */
.seg {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  padding: 3px;
  border-radius: 12px;
  background: var(--color-surface-hover);
}

.seg-btn {
  height: 38px;
  border: none;
  border-radius: 10px;
  background: transparent;
  color: var(--color-text);
  font-family: inherit;
  font-size: 14px;
  font-weight: 400;
  cursor: pointer;

  &.is-on {
    background: var(--color-surface);
    font-weight: 700;
    box-shadow: 0 1px 4px rgba(var(--color-primary-rgb), 0.18);
  }
}

/* ── 角色名單 ─────────────────────────────── */
.cast-list {
  display: flex;
  flex-direction: column;
  margin: 0;
  padding: 0;
  list-style: none;
}

.cast-row {
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 58px;
  border-bottom: 1px solid var(--color-border);

  &:last-child {
    border-bottom: none;
  }

  &.is-mute {
    .cast-avatar,
    .cast-main {
      opacity: 0.45;
    }
  }
}

.cast-avatar {
  flex-shrink: 0;
}

.cast-main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 1px;
  padding: 8px 0;
  border: none;
  background: none;
  color: var(--color-text);
  font-family: inherit;
  text-align: left;
  line-height: 1.35;
  cursor: pointer;
}

.cast-name {
  font-size: 14px;
  font-weight: 700;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.cast-note {
  display: flex;
  align-items: center;
  gap: 3px;
  font-size: 11px;
  color: var(--color-text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.role-seg {
  display: flex;
  flex-shrink: 0;
  padding: 2px;
  border-radius: 10px;
  background: var(--color-surface-hover);
}

.role-btn {
  position: relative;
  height: 32px;
  padding: 0 8px;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: var(--color-text-secondary);
  font-family: inherit;
  font-size: 11px;
  font-weight: 400;
  white-space: nowrap;
  cursor: pointer;

  &::after {
    content: "";
    position: absolute;
    inset: -6px 0;
  }

  &.is-on {
    background: var(--color-text);
    color: var(--color-background);
    font-weight: 700;
  }

  &.is-mute {
    background: var(--color-error);
    color: #ffffff;
  }
}

/* ── 熱鬧程度 ─────────────────────────────── */
.level-grid {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 4px;
}

.level-btn {
  height: 36px;
  padding: 0;
  border: none;
  border-radius: 8px;
  background: var(--color-surface-hover);
  cursor: pointer;

  &.is-on {
    background: var(--color-primary);
  }
}

.level-ends {
  display: flex;
  justify-content: space-between;
  font-size: 11px;
  color: var(--color-text-secondary);
}

/* ── 步進列 / 開關列 ──────────────────────── */
.step-row,
.switch-row {
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 52px;
  border-bottom: 1px solid var(--color-border);
}

.switch-row {
  min-height: 60px;
}

.fill-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  width: 100%;
  height: 44px;
  padding: 0 14px;
  border: 1px solid var(--color-border);
  border-radius: 22px;
  background: var(--color-surface);
  color: var(--color-text);
  font-family: inherit;
  font-size: 15px;
  font-weight: 700;
  flex-shrink: 0;
  cursor: pointer;

  &:disabled {
    opacity: 0.6;
    cursor: default;
  }
}

.step-label {
  flex: 1;
  min-width: 0;
  font-size: 14px;
  color: var(--color-text);
}

.step-btn {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  padding: 0;
  border: none;
  border-radius: 18px;
  background: var(--color-surface-hover);
  color: var(--color-text);
  font-family: inherit;
  font-size: 18px;
  line-height: 1;
  flex-shrink: 0;
  cursor: pointer;

  &::after {
    content: "";
    position: absolute;
    inset: -4px;
  }

  &:disabled {
    color: var(--color-text-muted);
    cursor: default;
  }
}

.step-row.is-disabled .step-label {
  color: var(--color-text-muted);
}

.step-num {
  width: 40px;
  text-align: center;
  font-size: 17px;
  font-weight: 600;
  color: var(--color-text);
}

.step-row.is-disabled .step-num {
  color: var(--color-text-muted);
}

.switch-text {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
  line-height: 1.4;
}

.switch-label {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 14px;
  color: var(--color-text);
}

.switch-sub {
  font-size: 12px;
  color: var(--color-text-secondary);
}

.peek-tag {
  height: 20px;
  padding: 0 7px;
  display: inline-flex;
  align-items: center;
  border: 1px dashed #c08a1e;
  border-radius: 10px;
  color: #c08a1e;
  font-size: 10px;
  font-weight: 700;
  flex-shrink: 0;
}

.switch {
  position: relative;
  width: 52px;
  height: 32px;
  padding: 0;
  border: none;
  border-radius: 16px;
  background: var(--color-border);
  flex-shrink: 0;
  cursor: pointer;
  transition: background 0.16s ease;

  &.is-on {
    background: var(--color-primary);
  }
}

.switch-knob {
  position: absolute;
  top: 3px;
  left: 3px;
  width: 26px;
  height: 26px;
  border-radius: 13px;
  background: #ffffff;
  box-shadow: 0 1px 3px rgba(var(--color-primary-rgb), 0.3);
  transition: left 0.16s ease;
}

.switch.is-on .switch-knob {
  left: 23px;
}


body.is-night-mode .peek-tag {
  color: #f0c46a;
  border-color: #f0c46a;
}

.plurk-dim-fade-enter-active,
.plurk-dim-fade-leave-active {
  transition: opacity 0.2s ease;
}

.plurk-dim-fade-enter-from,
.plurk-dim-fade-leave-to {
  opacity: 0;
}

.plurk-sheet-slide-enter-active,
.plurk-sheet-slide-leave-active {
  transition: transform 0.26s cubic-bezier(0.32, 0.72, 0, 1);
}

.plurk-sheet-slide-enter-from,
.plurk-sheet-slide-leave-to {
  transform: translateY(100%);
}
</style>
