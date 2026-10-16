<template>
  <form class="mcp-editor" @submit.prevent="save">
    <label class="mcp-field">
      <span>網址</span>
      <input v-model.trim="draft.url" type="url" inputmode="url" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="https://example.com/mcp" />
      <small v-if="draft.url && !urlValid" class="mcp-error">網址要以 http:// 或 https:// 開頭。</small>
    </label>
    <label class="mcp-field">
      <span>Token（選填）</span>
      <span class="mcp-secret">
        <input v-model.trim="token" :type="showToken ? 'text' : 'password'" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="需要時才填" />
        <button type="button" class="mcp-btn" @click="showToken = !showToken">{{ showToken ? "隱藏" : "顯示" }}</button>
      </span>
      <small>送出時會加上 Authorization: Bearer …</small>
    </label>
    <details class="mcp-advanced" :open="draft.headers.length > 0">
      <summary>進階：自訂 header</summary>
      <div v-for="(header, index) in draft.headers" :key="index" class="mcp-header-row">
        <input v-model.trim="header.key" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="名稱，例如 X-Api-Key" aria-label="header 名稱" />
        <input v-model="header.value" type="password" autocomplete="off" placeholder="值" aria-label="header 值" />
        <button type="button" class="mcp-btn danger" aria-label="刪除這個 header" @click="draft.headers.splice(index, 1)">✕</button>
      </div>
      <button type="button" class="mcp-btn" @click="draft.headers.push({ key: '', value: '' })">＋ 加一個 header</button>
    </details>
    <button type="button" class="mcp-btn primary block" :disabled="!urlValid || testing" @click="discover">{{ testing ? "連線中…" : "連線並讀取工具" }}</button>
    <p v-if="error" class="mcp-error" role="alert">{{ error }}</p>
    <label class="mcp-field">
      <span>名稱</span>
      <input v-model.trim="draft.name" placeholder="例如：鎖手機" @input="autoName = false" />
    </label>
    <label class="mcp-field">
      <span>說明（給角色看；工具多時會用到）</span>
      <textarea v-model="draft.description" rows="3" placeholder="這台伺服器能做什麼" @input="autoDescription = false"></textarea>
    </label>
    <template v-if="draft.toolsFetchedAt">
      <p class="mcp-found">找到 {{ draft.tools.length }} 個工具</p>
      <McpToolList :tools="draft.tools" />
    </template>
    <div class="mcp-editor-actions">
      <button type="button" class="mcp-btn" @click="emit('cancel')">取消</button>
      <button type="submit" class="mcp-btn primary" :disabled="!urlValid">儲存</button>
    </div>
  </form>
</template>

<script setup lang="ts">
import { computed, reactive, ref } from "vue";
import McpToolList from "./McpToolList.vue";
import { defaultServerName, mergeDiscoveredTools, type McpServerConfig } from "@/types/mcp";

const props = defineProps<{ server: McpServerConfig }>();
const emit = defineEmits<{ (event: "save", server: McpServerConfig): void; (event: "cancel"): void }>();

const draft = reactive<McpServerConfig>(JSON.parse(JSON.stringify(props.server)));
const token = ref(props.server.token ?? "");
const showToken = ref(false);
const testing = ref(false);
const error = ref("");
// 名稱、說明還沒被使用者改過時，讀取工具後自動帶入伺服器提供的內容
const autoName = ref(!props.server.toolsFetchedAt);
const autoDescription = ref(!props.server.description);

const urlValid = computed(() => {
  try {
    const protocol = new URL(draft.url).protocol;
    return protocol === "https:" || protocol === "http:";
  } catch {
    return false;
  }
});

function snapshot(): McpServerConfig {
  const value: McpServerConfig = JSON.parse(JSON.stringify({ ...draft, headers: draft.headers.filter((header) => header.key.trim()) }));
  if (token.value) value.token = token.value;
  else delete value.token;
  if (!value.name.trim() || (autoName.value && !value.toolsFetchedAt)) value.name = defaultServerName(value.url);
  return value;
}

async function discover(): Promise<void> {
  testing.value = true;
  error.value = "";
  try {
    const { getMcpClientManager } = await import("@/services/mcp");
    const result = await getMcpClientManager().discover(snapshot());
    draft.tools = mergeDiscoveredTools(draft.tools, result.tools);
    draft.toolsFetchedAt = Date.now();
    draft.lastRoute = result.route;
    draft.lastError = undefined;
    if (autoName.value) draft.name = result.info.name?.trim() || defaultServerName(draft.url);
    if (autoDescription.value && result.info.instructions) draft.description = result.info.instructions.trim().slice(0, 500);
  } catch (caught) {
    error.value = caught instanceof Error ? caught.message : String(caught);
    draft.lastError = error.value;
  } finally {
    testing.value = false;
  }
}

function save(): void {
  if (urlValid.value) emit("save", snapshot());
}
</script>
