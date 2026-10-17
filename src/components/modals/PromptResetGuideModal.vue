<script setup lang="ts">
/**
 * 提示詞強制重置引導（線上模式／面對面模式）
 * 提示詞重大更新後，舊設定無法沿用；此彈窗無法關閉，必須完成重置才會消失。
 */
import { usePromptManagerStore } from "@/stores/promptManager";
import { AlertTriangle, CheckCircle2, RotateCcw } from "lucide-vue-next";
import { computed, ref } from "vue";

type PromptResetGuideMode = "online" | "faceToFace";

const props = defineProps<{
  mode: PromptResetGuideMode;
}>();

const emit = defineEmits<{
  done: [];
}>();

const promptManagerStore = usePromptManagerStore();

const COPY: Record<
  PromptResetGuideMode,
  { label: string; changes: string; others: string; extraNote?: string; tab: string }
> = {
  online: {
    label: "線上模式",
    changes:
      "條目照面對面的寫法重新分區排列，刪掉幾個一直沒有作用的條目，功能標籤的格式也整理成各只寫在一處。",
    others: "面對面、群聊、日記等其他提示詞不受影響",
    extraNote: "角色獨立設定的提示詞順序會換成新的排列，原本條目的開關照舊",
    tab: "線上模式",
  },
  faceToFace: {
    label: "面對面",
    changes: "篝火預設的開場手札和涅芙角色設定重新改寫，說書改以「溫養靈魂、深層共鳴」為核心。",
    others: "一般聊天、群聊、日記等其他提示詞不受影響",
    tab: "面對面",
  },
};

const copy = computed(() => COPY[props.mode]);

// intro → confirm → done
const step = ref<"intro" | "confirm" | "done">("intro");
const isResetting = ref(false);
const errorMessage = ref("");

async function handleReset() {
  if (isResetting.value) return;
  isResetting.value = true;
  errorMessage.value = "";
  try {
    if (props.mode === "online") {
      await promptManagerStore.resetOnlineForUpdate();
    } else {
      await promptManagerStore.resetFaceToFaceToDefault();
    }
    step.value = "done";
  } catch (error) {
    console.error(`[PromptResetGuide] ${props.mode} 重置失敗:`, error);
    errorMessage.value = "重置失敗，請再試一次。";
  } finally {
    isResetting.value = false;
  }
}
</script>

<template>
  <div class="prompt-reset-overlay">
    <div class="prompt-reset-window" role="dialog" aria-modal="true" aria-labelledby="prompt-reset-title">
      <header class="prompt-reset-header">
        <div class="prompt-reset-icon" :class="{ success: step === 'done' }">
          <CheckCircle2 v-if="step === 'done'" :size="22" />
          <AlertTriangle v-else :size="22" />
        </div>
        <div>
          <div class="prompt-reset-level">{{ step === "done" ? "完成" : "必要更新" }}</div>
          <h2 id="prompt-reset-title" class="prompt-reset-title">
            {{ copy.label }}提示詞{{ step === "done" ? "已更新" : "需要重置" }}
          </h2>
        </div>
      </header>

      <div v-if="step === 'intro'" class="prompt-reset-body">
        <p>{{ copy.label }}的預設提示詞有<strong>重要更新</strong>：{{ copy.changes }}</p>
        <p>已經存過的{{ copy.label }}提示詞會一直沿用舊內容，所以每個人都必須重置一次才會換成新版。</p>
        <div class="prompt-reset-note">
          <strong>重置只影響{{ copy.label }}</strong>
          <ul>
            <li>你對{{ copy.label }}提示詞做過的修改、新增的條目和開關設定會被清除</li>
            <li v-if="copy.extraNote">{{ copy.extraNote }}</li>
            <li>{{ copy.others }}</li>
            <li>聊天記錄和角色資料都不會被刪除</li>
          </ul>
        </div>
      </div>

      <div v-else-if="step === 'confirm'" class="prompt-reset-body">
        <p>確定要重置{{ copy.label }}提示詞嗎？</p>
        <p class="prompt-reset-warn">你在{{ copy.label }}提示詞裡的自訂修改會被清除，這個動作無法復原。</p>
        <p v-if="errorMessage" class="prompt-reset-error">{{ errorMessage }}</p>
      </div>

      <div v-else class="prompt-reset-body">
        <p>{{ copy.label }}提示詞已重置為最新版本，可以正常使用了。</p>
        <p>如果之前有自訂的內容，可以到「提示詞管理」的{{ copy.tab }}分頁重新調整。</p>
      </div>

      <footer class="prompt-reset-actions">
        <button v-if="step === 'intro'" class="btn-primary" @click="step = 'confirm'">
          <RotateCcw :size="16" />
          前往重置
        </button>
        <template v-else-if="step === 'confirm'">
          <button class="btn-secondary" :disabled="isResetting" @click="step = 'intro'">返回</button>
          <button class="btn-primary" :disabled="isResetting" @click="handleReset">
            {{ isResetting ? "重置中…" : "確定重置" }}
          </button>
        </template>
        <button v-else class="btn-primary success" @click="emit('done')">開始使用</button>
      </footer>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.prompt-reset-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.55);
  backdrop-filter: blur(6px);
  z-index: 1100;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
}

.prompt-reset-window {
  background: var(--bg-color, #fff);
  color: var(--text-color, #222);
  border-radius: 18px;
  width: 100%;
  max-width: 420px;
  max-height: 85vh;
  overflow-y: auto;
  border: 1px solid #ef4444;
  box-shadow: 0 18px 50px rgba(239, 68, 68, 0.28);
}

.prompt-reset-header {
  display: flex;
  gap: 12px;
  padding: 20px 20px 12px;
  align-items: flex-start;
}

.prompt-reset-icon {
  flex-shrink: 0;
  width: 36px;
  height: 36px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(239, 68, 68, 0.15);
  color: #ef4444;

  &.success {
    background: rgba(34, 197, 94, 0.15);
    color: #22c55e;
  }
}

.prompt-reset-level {
  font-size: 11px;
  letter-spacing: 0.05em;
  opacity: 0.65;
}

.prompt-reset-title {
  font-size: 18px;
  font-weight: 700;
  margin: 4px 0 2px;
  line-height: 1.3;
}

.prompt-reset-body {
  padding: 4px 20px;
  font-size: 14px;
  line-height: 1.6;

  p {
    margin: 0 0 10px;
  }

  strong {
    font-weight: 700;
  }
}

.prompt-reset-note {
  border-radius: 12px;
  padding: 12px 14px;
  background: rgba(245, 158, 11, 0.1);
  border: 1px solid rgba(245, 158, 11, 0.45);

  ul {
    margin: 6px 0 0;
    padding-left: 20px;
  }
}

.prompt-reset-warn {
  color: #ef4444;
}

.prompt-reset-error {
  color: #ef4444;
  font-weight: 600;
}

.prompt-reset-actions {
  display: flex;
  gap: 10px;
  padding: 14px 20px 18px;

  button {
    flex: 1;
    padding: 10px 14px;
    border-radius: 10px;
    border: none;
    font-size: 14px;
    font-weight: 500;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;

    &:disabled {
      opacity: 0.6;
      cursor: default;
    }
  }

  .btn-secondary {
    background: transparent;
    color: inherit;
    border: 1px solid rgba(0, 0, 0, 0.15);
  }

  .btn-primary {
    background: #ef4444;
    color: #fff;

    &.success {
      background: #22c55e;
    }
  }
}
</style>
