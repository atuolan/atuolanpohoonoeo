<script setup lang="ts">
import { OpenAICompatibleClient } from "@/api/OpenAICompatible";
import { useSettingsStore } from "@/stores";
import type { MultiCharMember } from "@/types/chat";
import { Loader2, Plus, Sparkles, Trash2, Users, X } from "lucide-vue-next";
import { computed, ref } from "vue";

const props = defineProps<{
  characterName: string;
  characterDescription: string;
}>();

const emit = defineEmits<{
  (
    e: "confirm",
    members: MultiCharMember[],
    options: { useGreeting: boolean },
  ): void;
  (e: "cancel"): void;
}>();

const settingsStore = useSettingsStore();

interface MemberDraft {
  name: string;
  avatar: string;
}

const members = ref<MemberDraft[]>([
  { name: "", avatar: "" },
  { name: "", avatar: "" },
]);

const useGreeting = ref(true);
const isDetecting = ref(false);
const detectError = ref("");

const canConfirm = computed(() => {
  const validMembers = members.value.filter((m) => m.name.trim());
  return validMembers.length >= 2;
});

function addMember() {
  members.value.push({ name: "", avatar: "" });
}

function removeMember(index: number) {
  if (members.value.length <= 2) return;
  members.value.splice(index, 1);
}

async function autoDetectCharacters() {
  if (!props.characterDescription.trim()) {
    detectError.value = "角色卡沒有 description，無法識別";
    return;
  }

  isDetecting.value = true;
  detectError.value = "";

  try {
    const client = new OpenAICompatibleClient(settingsStore.api);
    const result = await client.generate({
      messages: [
        {
          role: "system",
          content:
            '你是一個角色卡分析助手。用戶會給你一段角色卡的 description，你需要從中識別出所有角色的名字。只回覆一個 JSON 陣列，格式為 ["角色名1", "角色名2", ...]，不要包含任何其他文字或解釋。',
        },
        {
          role: "user",
          content: `請從以下角色卡 description 中識別出所有角色的名字：\n\n${props.characterDescription.slice(0, 8000)}`,
        },
      ],
      settings: {
        maxContextLength: 200000,
        maxResponseLength: 1000,
        temperature: 0.1,
        topP: 1,
        topK: 0,
        frequencyPenalty: 0,
        presencePenalty: 0,
        repetitionPenalty: 1,
        stopSequences: [],
        streaming: false,
        useStreamingWindow: false,
      },
      apiSettings: settingsStore.api,
    });

    // 解析 AI 回覆中的 JSON 陣列
    const content = result.content.trim();
    // 嘗試提取 JSON 陣列
    const jsonMatch = content.match(/\[[\s\S]*?\]/);
    if (jsonMatch) {
      const names: string[] = JSON.parse(jsonMatch[0]);
      if (Array.isArray(names) && names.length > 0) {
        // 用識別到的名字填充 members，保留已有的頭像
        const existingMap = new Map(
          members.value
            .filter((m) => m.name.trim())
            .map((m) => [m.name.trim(), m.avatar]),
        );

        members.value = names.map((name) => ({
          name: String(name).trim(),
          avatar: existingMap.get(String(name).trim()) || "",
        }));

        // 確保至少 2 個
        while (members.value.length < 2) {
          members.value.push({ name: "", avatar: "" });
        }
      } else {
        detectError.value = "AI 未識別到角色名字";
      }
    } else {
      detectError.value = "AI 回覆格式異常，請手動輸入";
    }
  } catch (e: any) {
    detectError.value = e.message || "API 呼叫失敗";
  } finally {
    isDetecting.value = false;
  }
}

function confirm() {
  if (!canConfirm.value) return;
  const result: MultiCharMember[] = members.value
    .filter((m) => m.name.trim())
    .map((m) => ({
      id: `multi_${crypto.randomUUID().slice(0, 8)}`,
      name: m.name.trim(),
      avatar: m.avatar.trim(),
    }));
  emit("confirm", result, { useGreeting: useGreeting.value });
}
</script>

<template>
  <div class="modal-overlay" @click.self="emit('cancel')">
    <div class="modal-container">
      <div class="modal-header">
        <Users :size="20" />
        <span>多人卡模式設定</span>
        <button class="btn-close" @click="emit('cancel')">
          <X :size="18" />
        </button>
      </div>

      <div class="modal-body">
        <p class="hint">
          為「{{ characterName }}」設定子角色。名字需與角色卡 description
          中的角色名一致。
        </p>

        <!-- AI 自動識別按鈕 -->
        <button
          class="btn-auto-detect"
          :disabled="isDetecting || !characterDescription"
          @click="autoDetectCharacters"
        >
          <Loader2 v-if="isDetecting" :size="16" class="spin" />
          <Sparkles v-else :size="16" />
          {{ isDetecting ? "識別中..." : "AI 自動識別角色" }}
        </button>
        <p v-if="detectError" class="detect-error">{{ detectError }}</p>

        <div class="member-list">
          <div
            v-for="(member, index) in members"
            :key="index"
            class="member-row"
          >
            <span class="member-index">{{ index + 1 }}</span>
            <input
              v-model="member.name"
              type="text"
              class="input-name"
              placeholder="角色名字（必填）"
            />
            <input
              v-model="member.avatar"
              type="text"
              class="input-avatar"
              placeholder="頭像 URL（選填）"
            />
            <button
              class="btn-remove"
              :disabled="members.length <= 2"
              @click="removeMember(index)"
            >
              <Trash2 :size="16" />
            </button>
          </div>
        </div>

        <button class="btn-add" @click="addMember">
          <Plus :size="16" />
          新增子角色
        </button>

        <!-- 開場白選項 -->
        <div class="greeting-option">
          <label class="toggle-label">
            <input v-model="useGreeting" type="checkbox" class="toggle-input" />
            <span class="toggle-switch"></span>
            <span class="toggle-text">使用角色卡開場白</span>
          </label>
          <p class="greeting-hint">
            {{
              useGreeting
                ? "將使用角色卡的 first_mes 作為開場白"
                : "無開場白，直接開始對話"
            }}
          </p>
        </div>
      </div>

      <div class="modal-footer">
        <button class="btn-cancel" @click="emit('cancel')">取消</button>
        <button class="btn-confirm" :disabled="!canConfirm" @click="confirm">
          確認（{{ members.filter((m) => m.name.trim()).length }} 位角色）
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
}

.modal-container {
  background: var(--color-surface, #fff);
  border-radius: 16px;
  width: 90%;
  max-width: 420px;
  max-height: 80vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.modal-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 16px;
  border-bottom: 1px solid var(--color-border, #eee);
  font-weight: 600;

  .btn-close {
    margin-left: auto;
    background: none;
    border: none;
    cursor: pointer;
    color: var(--color-text-secondary, #999);
    padding: 4px;
    border-radius: 6px;

    &:hover {
      background: var(--color-hover, #f0f0f0);
    }
  }
}

.modal-body {
  padding: 16px;
  overflow-y: auto;
  flex: 1;

  .hint {
    font-size: 13px;
    color: var(--color-text-secondary, #888);
    margin-bottom: 12px;
    line-height: 1.5;
  }
}

.btn-auto-detect {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  padding: 10px 14px;
  margin-bottom: 12px;
  background: rgba(137, 207, 240, 0.12);
  border: 1px solid rgba(137, 207, 240, 0.3);
  border-radius: 10px;
  cursor: pointer;
  font-size: 14px;
  color: #89cff0;
  justify-content: center;
  transition: all 0.2s;

  &:hover:not(:disabled) {
    background: rgba(137, 207, 240, 0.2);
    border-color: #89cff0;
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
}

.spin {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}

.detect-error {
  font-size: 12px;
  color: #e53e3e;
  margin: -6px 0 10px;
}

.member-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.member-row {
  display: flex;
  align-items: center;
  gap: 6px;

  .member-index {
    font-size: 12px;
    color: var(--color-text-secondary, #999);
    width: 18px;
    text-align: center;
    flex-shrink: 0;
  }

  .input-name {
    flex: 1;
    min-width: 0;
    padding: 8px 10px;
    border: 1px solid var(--color-border, #ddd);
    border-radius: 8px;
    font-size: 14px;
    background: var(--color-input-bg, #fafafa);
    color: var(--color-text, #333);

    &::placeholder {
      color: var(--color-text-secondary, #aaa);
    }
  }

  .input-avatar {
    flex: 1.2;
    min-width: 0;
    padding: 8px 10px;
    border: 1px solid var(--color-border, #ddd);
    border-radius: 8px;
    font-size: 13px;
    background: var(--color-input-bg, #fafafa);
    color: var(--color-text, #333);

    &::placeholder {
      color: var(--color-text-secondary, #aaa);
    }
  }

  .btn-remove {
    background: none;
    border: none;
    cursor: pointer;
    color: var(--color-text-secondary, #999);
    padding: 6px;
    border-radius: 6px;
    flex-shrink: 0;

    &:hover:not(:disabled) {
      color: #e53e3e;
      background: rgba(229, 62, 62, 0.1);
    }

    &:disabled {
      opacity: 0.3;
      cursor: not-allowed;
    }
  }
}

.btn-add {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-top: 10px;
  padding: 8px 12px;
  background: none;
  border: 1px dashed var(--color-border, #ccc);
  border-radius: 8px;
  cursor: pointer;
  font-size: 13px;
  color: var(--color-text-secondary, #888);
  width: 100%;
  justify-content: center;

  &:hover {
    border-color: var(--color-primary, #7dd3a8);
    color: var(--color-primary, #7dd3a8);
  }
}

.greeting-option {
  margin-top: 14px;
  padding-top: 14px;
  border-top: 1px solid var(--color-border, #eee);

  .toggle-label {
    display: flex;
    align-items: center;
    gap: 8px;
    cursor: pointer;
  }

  .toggle-input {
    display: none;
  }

  .toggle-switch {
    position: relative;
    width: 36px;
    height: 20px;
    background: var(--color-border, #ccc);
    border-radius: 10px;
    flex-shrink: 0;
    transition: background 0.2s;

    &::after {
      content: "";
      position: absolute;
      top: 2px;
      left: 2px;
      width: 16px;
      height: 16px;
      background: #fff;
      border-radius: 50%;
      transition: transform 0.2s;
    }
  }

  .toggle-input:checked + .toggle-switch {
    background: var(--color-primary, #7dd3a8);

    &::after {
      transform: translateX(16px);
    }
  }

  .toggle-text {
    font-size: 14px;
    color: var(--color-text, #333);
  }

  .greeting-hint {
    font-size: 12px;
    color: var(--color-text-secondary, #999);
    margin-top: 4px;
    margin-left: 44px;
  }
}

.modal-footer {
  display: flex;
  gap: 8px;
  padding: 12px 16px;
  border-top: 1px solid var(--color-border, #eee);
  justify-content: flex-end;

  .btn-cancel,
  .btn-confirm {
    padding: 8px 20px;
    border-radius: 10px;
    font-size: 14px;
    cursor: pointer;
    border: none;
  }

  .btn-cancel {
    background: var(--color-hover, #f0f0f0);
    color: var(--color-text, #333);
  }

  .btn-confirm {
    background: var(--color-primary, #7dd3a8);
    color: #fff;

    &:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
  }
}
</style>
