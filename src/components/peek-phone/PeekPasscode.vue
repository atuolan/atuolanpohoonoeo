<script setup lang="ts">
/**
 * 鎖屏密碼：4 位數字，跟使用者有關。解開＝找到一個秘密；可以跳過
 * 蓋在鎖定畫面上，解開後顯示這組數字的意義
 */
import type { PeekLockScreen } from "@/types/peekPhone";
import { Eye, LockOpen } from "lucide-vue-next";
import { computed, ref } from "vue";

const props = defineProps<{ lockScreen: PeekLockScreen }>();

const emit = defineEmits<{
  /** 密碼對了（父層記下找到秘密、解鎖） */
  solved: [];
  /** 跳過謎題 */
  skip: [];
  /** 沒輸入就取消，回鎖定畫面 */
  cancel: [];
  /** 解開後按「進入主畫面」 */
  done: [];
}>();

const code = ref("");
const wrong = ref(false);
// 連錯三次就給答案
const wrongCount = ref(0);
const showAnswer = computed(() => wrongCount.value >= 3);
const solved = ref(false);

const LETTERS = ["", "ABC", "DEF", "GHI", "JKL", "MNO", "PQRS", "TUV", "WXYZ"];
const keys = LETTERS.map((letters, i) => ({ digit: String(i + 1), letters }));

function press(digit: string) {
  if (solved.value) return;
  const next = (code.value + digit).slice(0, 4);
  if (next.length < 4) {
    code.value = next;
    wrong.value = false;
    return;
  }
  if (next === props.lockScreen.passcode) {
    code.value = next;
    solved.value = true;
    emit("solved");
  } else {
    code.value = "";
    wrong.value = true;
    wrongCount.value++;
  }
}

function back() {
  if (code.value) {
    code.value = code.value.slice(0, -1);
    wrong.value = false;
  } else {
    emit("cancel");
  }
}

const backLabel = computed(() => (code.value ? "刪除" : "取消"));
</script>

<template>
  <div class="passcode" role="dialog" aria-modal="true" aria-label="輸入密碼">
    <template v-if="!solved">
      <span class="passcode-title">輸入密碼</span>
      <div class="passcode-dots" :aria-label="`已輸入 ${code.length} 位，共 4 位`" role="status">
        <span v-for="i in 4" :key="i" class="passcode-dot" :class="{ 'is-filled': i <= code.length }" />
      </div>
      <div class="passcode-wrong" aria-live="polite">{{ wrong ? "密碼錯誤，再試一次" : "" }}</div>
      <div v-if="props.lockScreen.hint" class="passcode-hint">
        <Eye :size="14" aria-hidden="true" />
        <span>提示：{{ props.lockScreen.hint }}</span>
      </div>
      <div v-if="showAnswer" class="passcode-hint passcode-answer" role="status">
        <span>
          {{ props.lockScreen.giveUp || "真拿你沒辦法……" }}
          密碼是 <strong class="passcode-answer-code">{{ props.lockScreen.passcode }}</strong>
        </span>
      </div>

      <div class="passcode-keys">
        <button
          v-for="k in keys"
          :key="k.digit"
          type="button"
          class="passcode-key"
          :aria-label="k.digit"
          @click="press(k.digit)"
        >
          <span class="passcode-key-digit">{{ k.digit }}</span>
          <span class="passcode-key-letters" aria-hidden="true">{{ k.letters }}</span>
        </button>
        <span />
        <button type="button" class="passcode-key" aria-label="0" @click="press('0')">
          <span class="passcode-key-digit">0</span>
        </button>
        <span />
      </div>

      <div class="passcode-foot">
        <button type="button" class="passcode-skip" @click="emit('skip')">跳過謎題</button>
        <button type="button" class="passcode-back" @click="back">{{ backLabel }}</button>
      </div>
    </template>

    <div v-else class="passcode-ok" role="status">
      <LockOpen :size="40" :stroke-width="1.6" aria-hidden="true" />
      <span class="passcode-ok-title">已解鎖</span>
      <span v-if="props.lockScreen.reveal" class="passcode-ok-reveal">{{ props.lockScreen.reveal }}</span>
      <button type="button" class="passcode-ok-btn" @click="emit('done')">進入主畫面</button>
    </div>
  </div>
</template>

<style scoped lang="scss">
.passcode {
  position: absolute;
  inset: 0;
  z-index: 5;
  background: rgba(10, 10, 12, 0.55);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  color: #ffffff;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: calc(var(--safe-top, 0px) + 96px) 16px calc(var(--safe-bottom, 0px) + 30px);
  box-sizing: border-box;
  overflow-y: auto;
}

.passcode-title {
  font-size: 18px;
  font-weight: 500;
}

.passcode-dots {
  display: flex;
  gap: 18px;
  margin-top: 18px;
}

.passcode-dot {
  width: 13px;
  height: 13px;
  border-radius: 7px;
  border: 1.5px solid #ffffff;
  box-sizing: border-box;

  &.is-filled {
    background: #ffffff;
  }
}

.passcode-wrong {
  height: 22px;
  margin-top: 12px;
  font-size: 13px;
  color: #ffc9c2;
}

.passcode-hint {
  display: flex;
  align-items: center;
  gap: 6px;
  min-height: 32px;
  max-width: 100%;
  margin-top: 8px;
  padding: 6px 12px 6px 10px;
  box-sizing: border-box;
  border-radius: 16px;
  border: 1px dashed var(--p-peek);
  background: var(--p-peek-soft);
  color: var(--p-peek);
  font-size: 12px;
  line-height: 1.4;

  svg {
    flex-shrink: 0;
  }
}

.passcode-answer {
  margin-top: 8px;
  border-style: solid;
}

.passcode-answer-code {
  font-family: var(--p-num);
  font-size: 14px;
  letter-spacing: 0.12em;
}

.passcode-keys {
  display: grid;
  grid-template-columns: repeat(3, 76px);
  gap: 16px 24px;
  margin-top: 28px;
}

.passcode-key {
  width: 76px;
  height: 76px;
  border-radius: 38px;
  border: none;
  background: rgba(255, 255, 255, 0.16);
  color: #ffffff;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  padding: 0;
  font-family: inherit;

  &:active {
    background: rgba(255, 255, 255, 0.32);
  }
}

.passcode-key-digit {
  font-family: var(--p-num);
  font-size: 32px;
  font-weight: 400;
  line-height: 1;
}

.passcode-key-letters {
  height: 11px;
  margin-top: 2px;
  font-size: 9px;
  letter-spacing: 0.2em;
}

.passcode-foot {
  width: 276px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 20px;
}

.passcode-skip {
  height: 44px;
  padding: 0;
  border: none;
  background: none;
  color: var(--p-peek);
  font-family: inherit;
  font-size: 13px;
  text-decoration: underline;
  text-decoration-style: dashed;
  text-underline-offset: 4px;
  cursor: pointer;
}

.passcode-back {
  height: 44px;
  padding: 0 4px;
  border: none;
  background: none;
  color: #ffffff;
  font-family: inherit;
  font-size: 15px;
  cursor: pointer;
}

.passcode-ok {
  margin: auto 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  text-align: center;
}

.passcode-ok-title {
  font-size: 20px;
  font-weight: 700;
}

.passcode-ok-reveal {
  max-width: 300px;
  font-size: 13px;
  line-height: 1.5;
  color: var(--p-peek);
}

.passcode-ok-btn {
  margin-top: 18px;
  width: 220px;
  height: 52px;
  border: none;
  border-radius: 26px;
  background: #ffffff;
  color: var(--p-app-glyph);
  font-family: inherit;
  font-size: 15px;
  font-weight: 700;
  cursor: pointer;
}
</style>
