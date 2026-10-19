<template>
  <Teleport to="body">
    <div class="mcp-panel-overlay" @click.self="close">
      <section class="mcp-panel" role="dialog" aria-modal="true" aria-labelledby="mcp-panel-title">
        <header class="mcp-panel-header">
          <button type="button" class="mcp-back" aria-label="返回" @click="back">‹</button>
          <h2 id="mcp-panel-title">{{ title }}</h2>
        </header>
        <div class="mcp-panel-body">
          <McpServerEditor v-if="editing" :key="editing.id" :server="editing" @save="saveServer" @cancel="editing = null" />
          <template v-else>
            <p class="mcp-intro">讓角色使用外部工具，例如幫你鎖 App、陪你玩電腦遊戲。工具由你加入的 MCP 伺服器提供。</p>
            <div v-if="toolsDisabled" class="mcp-banner">
              <span>目前的 API 配置沒有開「允許工具呼叫」，這些工具不會生效。</span>
              <button type="button" class="mcp-btn primary" @click="enableTools">開啟</button>
            </div>
            <p v-if="saveError" class="mcp-error" role="alert">{{ saveError }}</p>
            <p v-if="!servers.length" class="mcp-empty">還沒有加入任何 MCP 伺服器。</p>
            <article v-for="server in servers" :key="server.id" class="mcp-card">
              <div class="mcp-card-head">
                <div class="mcp-card-title">
                  <strong>{{ server.name }}</strong>
                  <small>{{ server.url }}</small>
                </div>
                <label class="mcp-switch">
                  <input v-model="server.enabled" type="checkbox" :aria-label="`啟用 ${server.name}`" @change="persist" />
                  <span class="mcp-switch-track" aria-hidden="true"></span>
                </label>
              </div>
              <p class="mcp-card-status" :class="{ error: Boolean(server.lastError) }">{{ statusOf(server) }}</p>
              <div class="mcp-card-actions">
                <button type="button" class="mcp-btn" :disabled="!server.tools.length" :aria-expanded="expandedId === server.id" @click="toggleTools(server.id)">工具 {{ expandedId === server.id ? "▴" : "▾" }}</button>
                <button type="button" class="mcp-btn" :disabled="refreshingId === server.id" @click="refreshTools(server)">{{ refreshingId === server.id ? "讀取中…" : "重新讀取" }}</button>
                <button type="button" class="mcp-btn" @click="editServer(server)">編輯</button>
                <button type="button" class="mcp-btn danger" @click="removeServer(server)">刪除</button>
              </div>
              <McpToolList v-if="expandedId === server.id" :tools="server.tools" @change="persist" />
            </article>
            <button type="button" class="mcp-add" @click="addServer">＋ 新增 MCP 伺服器</button>
            <details class="mcp-help">
              <summary>電腦上的 MCP 怎麼連？</summary>
              <p>手機連不到電腦的區網位址（例如 http://192.168.x.x）。請在電腦上用 Cloudflare Tunnel（cloudflared）之類的工具，把 MCP 伺服器開成一個 https 網址，再貼到這裡。</p>
              <p>只支援 HTTP 類型的 MCP，網址通常以 /mcp 或 /sse 結尾。用 npx 直接啟動的本機 MCP，要先用 supergateway 之類的工具轉成 HTTP。</p>
            </details>
            <details class="mcp-help">
              <summary>鎖 App 這類功能是怎麼做到的？</summary>
              <p>這類伺服器會記住角色下的指令（例如「鎖住小紅書」），再搭配 iPhone「捷徑」的個人自動化：打開某個 App 時自動去問伺服器，被鎖就跳回主畫面。所以角色操作時你不用一直點。</p>
              <p>伺服器回傳的內容會直接交給角色，只加入你信任的伺服器。</p>
            </details>
            <details class="mcp-help">
              <summary>角色都不用工具怎麼辦？</summary>
              <p>有些中轉 API 不支援原生工具呼叫。到 API 設定把「工具協議」改成文字協議再試試。</p>
            </details>
          </template>
        </div>
      </section>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import McpServerEditor from "./McpServerEditor.vue";
import McpToolList from "./McpToolList.vue";
import { planMcpExposure } from "@/services/mcp/mcpToolSource";
import { useSettingsStore } from "@/stores/settings";
import { createMcpServerConfig, mergeDiscoveredTools, type McpServerConfig } from "@/types/mcp";
import { describeMcpServerStatus } from "@/utils/mcpServerStatus";

const emit = defineEmits<{ (event: "close"): void }>();
const settingsStore = useSettingsStore();

const servers = computed(() => settingsStore.mcp.servers);
const editing = ref<McpServerConfig | null>(null);
const isNew = ref(false);
const expandedId = ref<string | null>(null);
const refreshingId = ref<string | null>(null);
const saveError = ref("");

const title = computed(() => (editing.value ? (isNew.value ? "新增 MCP 伺服器" : "編輯 MCP 伺服器") : "MCP 伺服器"));
const toolsDisabled = computed(() => settingsStore.api.toolsEnabled === false);
const exposure = computed(() => new Map(planMcpExposure(servers.value).map((entry) => [entry.serverId, entry])));

function statusOf(server: McpServerConfig): string {
  return describeMcpServerStatus(server, exposure.value.get(server.id));
}

async function persist(): Promise<void> {
  saveError.value = "";
  try {
    await settingsStore.saveSettings();
  } catch (error) {
    saveError.value = `儲存失敗：${error instanceof Error ? error.message : String(error)}`;
  }
}

function close(): void {
  emit("close");
}

function back(): void {
  if (editing.value) editing.value = null;
  else close();
}

function toggleTools(id: string): void {
  expandedId.value = expandedId.value === id ? null : id;
}

function addServer(): void {
  // 名稱先留空顯示提示文字；存檔時還是空的就用網址的主機名稱
  editing.value = { ...createMcpServerConfig(""), name: "" };
  isNew.value = true;
}

function editServer(server: McpServerConfig): void {
  editing.value = JSON.parse(JSON.stringify(server));
  isNew.value = false;
}

async function saveServer(server: McpServerConfig): Promise<void> {
  const list = settingsStore.mcp.servers;
  const index = list.findIndex((entry) => entry.id === server.id);
  const next = { ...server, updatedAt: Date.now() };
  if (index === -1) list.push(next);
  else list.splice(index, 1, next);
  editing.value = null;
  await persist();
}

async function removeServer(server: McpServerConfig): Promise<void> {
  if (!window.confirm(`要刪除「${server.name}」嗎？`)) return;
  const list = settingsStore.mcp.servers;
  const index = list.findIndex((entry) => entry.id === server.id);
  if (index !== -1) list.splice(index, 1);
  if (expandedId.value === server.id) expandedId.value = null;
  await persist();
}

async function refreshTools(server: McpServerConfig): Promise<void> {
  refreshingId.value = server.id;
  try {
    const { getMcpClientManager } = await import("@/services/mcp");
    const result = await getMcpClientManager().discover(JSON.parse(JSON.stringify(server)));
    server.tools = mergeDiscoveredTools(server.tools, result.tools);
    server.toolsFetchedAt = Date.now();
    server.lastRoute = result.route;
    server.lastError = undefined;
  } catch (error) {
    server.lastError = error instanceof Error ? error.message : String(error);
  } finally {
    server.updatedAt = Date.now();
    refreshingId.value = null;
    await persist();
  }
}

/** 角色工具開關屬於 API 設定檔：連目前設定檔一起改，重新整理後才不會變回關閉 */
async function enableTools(): Promise<void> {
  settingsStore.api.toolsEnabled = true;
  const profile = settingsStore.profiles.find((entry) => entry.id === settingsStore.currentProfileId);
  if (profile) profile.api = { ...profile.api, toolsEnabled: true };
  await persist();
}
</script>

<style lang="scss">
/* 不用 scoped：McpServerEditor、McpToolList 都畫在 .mcp-panel 裡，共用這份樣式 */
.mcp-panel-overlay {
  position: fixed;
  inset: 0;
  z-index: 2100;
  display: flex;
  justify-content: center;
  background: rgba(0, 0, 0, 0.45);
}

.mcp-panel {
  display: flex;
  flex-direction: column;
  width: min(100%, 480px);
  height: 100dvh;
  background: var(--color-background, #f7f7f9);
  color: var(--color-text, #333);
  box-shadow: 0 0 24px rgba(0, 0, 0, 0.2);

  .mcp-panel-header {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: calc(var(--safe-area-inset-top, env(safe-area-inset-top)) + 10px) 12px 10px;
    background: var(--color-surface, #fff);
    border-bottom: 1px solid var(--color-border, #e2e8f0);

    h2 { margin: 0; font-size: 17px; font-weight: 600; }
  }

  .mcp-back {
    width: 36px;
    height: 36px;
    border: none;
    border-radius: 50%;
    background: transparent;
    color: var(--color-text, #333);
    font-size: 28px;
    line-height: 1;
    cursor: pointer;
  }

  .mcp-panel-body {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 12px 16px 0;
    overflow-y: auto;
    -webkit-overflow-scrolling: touch;

    /* 用撐開的空白代替底部內距：內距會讓 sticky 的儲存列停在離底邊一段距離，下面露出內容 */
    &::after {
      content: "";
      flex: 0 0 calc(var(--safe-area-inset-bottom, env(safe-area-inset-bottom)) + 12px);
    }
  }

  .mcp-intro,
  .mcp-empty { margin: 0; font-size: 14px; line-height: 1.6; color: var(--color-text-secondary, #666); }

  .mcp-banner {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 12px 14px;
    border-radius: 12px;
    font-size: 14px;
    background: rgba(255, 193, 7, 0.15);
  }

  .mcp-error { margin: 0; font-size: 13px; color: var(--color-error, #d9534f); overflow-wrap: anywhere; }

  .mcp-card {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 14px 16px;
    border-radius: 12px;
    background: var(--color-surface, #fff);
    border: 1px solid var(--color-border, #e2e8f0);
  }

  .mcp-card-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; }

  .mcp-card-title {
    display: flex;
    flex-direction: column;
    min-width: 0;

    strong { font-size: 15px; overflow-wrap: anywhere; }
    small { font-size: 12px; color: var(--color-text-muted, #999); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  }

  .mcp-card-status {
    margin: 0;
    font-size: 13px;
    color: var(--color-text-secondary, #666);
    overflow-wrap: anywhere;

    &.error { color: var(--color-error, #d9534f); }
  }

  .mcp-card-actions { display: flex; flex-wrap: wrap; gap: 8px; }

  .mcp-btn {
    padding: 6px 12px;
    border-radius: 999px;
    border: 1px solid var(--color-border, #e2e8f0);
    background: var(--color-surface, #fff);
    color: var(--color-text, #333);
    font-size: 13px;
    cursor: pointer;

    &:disabled { opacity: 0.5; cursor: default; }
    &.primary { background: var(--color-primary, #7dd3a8); border-color: transparent; color: #fff; }
    &.danger { color: var(--color-error, #d9534f); }
    &.block { width: 100%; padding: 10px 12px; font-size: 14px; }
  }

  .mcp-add {
    padding: 14px;
    border-radius: 12px;
    border: 1px dashed var(--color-border, #cbd5e1);
    background: transparent;
    color: var(--color-primary, #4caf50);
    font-size: 15px;
    cursor: pointer;
  }

  .mcp-switch {
    position: relative;
    flex-shrink: 0;
    width: 44px;
    height: 26px;
    cursor: pointer;

    input { position: absolute; inset: 0; width: 100%; height: 100%; margin: 0; opacity: 0; cursor: pointer; }

    .mcp-switch-track {
      position: absolute;
      inset: 0;
      border-radius: 13px;
      background: var(--color-text-muted, #ccc);
      transition: background 0.2s;
      pointer-events: none;

      &::after {
        content: "";
        position: absolute;
        top: 3px;
        left: 3px;
        width: 20px;
        height: 20px;
        border-radius: 50%;
        background: #fff;
        transition: transform 0.2s;
      }
    }

    input:checked + .mcp-switch-track {
      background: linear-gradient(135deg, #a8e6cf, #7dd3a8);

      &::after { transform: translateX(18px); }
    }

    input:focus-visible + .mcp-switch-track { outline: 2px solid var(--color-primary, #7dd3a8); outline-offset: 2px; }
  }

  .mcp-tool-list { display: flex; flex-direction: column; margin: 0; padding: 0; list-style: none; }
  .mcp-tool { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 8px 0; border-top: 1px solid var(--color-border, #eef2f7); }
  .mcp-tool-text { display: flex; flex-direction: column; min-width: 0; }
  .mcp-tool-name { font-size: 14px; overflow-wrap: anywhere; }
  .mcp-tool-id { font-size: 11px; color: var(--color-text-muted, #999); }
  .mcp-tool-desc { display: -webkit-box; overflow: hidden; font-size: 12px; color: var(--color-text-secondary, #666); -webkit-line-clamp: 2; -webkit-box-orient: vertical; }
  .mcp-tool-controls { display: flex; flex-shrink: 0; align-items: center; gap: 10px; }
  .mcp-confirm { display: flex; align-items: center; gap: 4px; font-size: 12px; color: var(--color-text-secondary, #666); white-space: nowrap; }

  .mcp-help {
    font-size: 14px;
    color: var(--color-text-secondary, #666);

    summary { padding: 4px 0; color: var(--color-text, #333); cursor: pointer; }
    p { margin: 6px 0 0; line-height: 1.6; }
  }

  .mcp-editor { display: flex; flex-direction: column; gap: 14px; }

  .mcp-field {
    display: flex;
    flex-direction: column;
    gap: 6px;
    font-size: 14px;

    > span:first-child { font-weight: 600; }
    small { font-size: 12px; color: var(--color-text-muted, #999); }

    input,
    textarea {
      width: 100%;
      box-sizing: border-box;
      padding: 10px 12px;
      border-radius: 10px;
      border: 1px solid var(--color-border, #e2e8f0);
      background: var(--color-surface, #fff);
      color: var(--color-text, #333);
      font-size: 16px;
      font-family: inherit;
    }

    textarea { resize: vertical; }
  }

  .mcp-secret {
    display: flex;
    align-items: center;
    gap: 8px;

    input { flex: 1; min-width: 0; }
  }

  .mcp-advanced {
    font-size: 14px;

    summary { color: var(--color-text-secondary, #666); cursor: pointer; }
  }

  .mcp-header-row {
    display: flex;
    gap: 6px;
    margin: 8px 0;

    input {
      flex: 1;
      min-width: 0;
      padding: 8px 10px;
      border-radius: 8px;
      border: 1px solid var(--color-border, #e2e8f0);
      background: var(--color-surface, #fff);
      color: var(--color-text, #333);
      font-size: 16px;
    }
  }

  .mcp-found { margin: 0; font-size: 14px; font-weight: 600; }

  .mcp-editor-actions {
    position: sticky;
    bottom: 0;
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    padding: 8px 0 calc(var(--safe-area-inset-bottom, env(safe-area-inset-bottom)) + 8px);
    background: var(--color-background, #f7f7f9);
    border-top: 1px solid var(--color-border, #e2e8f0);
  }
}
</style>
