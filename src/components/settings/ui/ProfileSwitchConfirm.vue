<script setup lang="ts">
/** 切換配置時，目前表單還有沒保存的改動 */
import SettingsDialog from "./SettingsDialog.vue";

defineProps<{ open: boolean; busy?: boolean }>();

defineEmits<{
  (e: "save"): void;
  (e: "discard"): void;
  (e: "cancel"): void;
}>();
</script>

<template>
  <SettingsDialog
    :open="open"
    title="目前配置有未保存的改動"
    text="表單和這個配置存的內容不一樣，直接切換會丟掉這些改動。"
    @close="$emit('cancel')"
  >
    <template #actions>
      <button type="button" class="st-btn st-btn--primary st-btn--block" :disabled="busy" @click="$emit('save')">
        先更新目前配置再切換
      </button>
      <button type="button" class="st-btn st-btn--block" :disabled="busy" @click="$emit('discard')">
        丟掉改動並切換
      </button>
      <button type="button" class="st-btn st-btn--block" style="border-color: transparent" @click="$emit('cancel')">
        取消
      </button>
    </template>
  </SettingsDialog>
</template>
