<script setup lang="ts">
/**
 * 看螢幕模式（像 DC 分享螢幕）：聊天加號選單裡「分享螢幕」打開的面板。
 * 開始後系統會跳出「開始廣播」視窗，按下開始就會分享。
 */
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import {
  getScreenWatchAvailability,
  getScreenWatchStatus,
  startScreenWatch,
  stopScreenWatch,
  type ScreenWatchStatus,
} from "@/native/screenWatch";

const props = defineProps<{
  chatId: string;
  characterName: string;
}>();

const emit = defineEmits<{ (e: "close"): void }>();

const SETTINGS_KEY = "screenWatch.settings";
const intervalOptions = [3, 5, 10, 15];
const maxOptions = [30, 60, 120];

function loadSettings(): { intervalMinutes: number; maxMinutes: number } {
  try {
    const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}");
    return {
      intervalMinutes: intervalOptions.includes(saved.intervalMinutes) ? saved.intervalMinutes : 5,
      maxMinutes: maxOptions.includes(saved.maxMinutes) ? saved.maxMinutes : 60,
    };
  } catch {
    return { intervalMinutes: 5, maxMinutes: 60 };
  }
}

const saved = loadSettings();
const intervalMinutes = ref(saved.intervalMinutes);
const maxMinutes = ref(saved.maxMinutes);

const availability = ref<{ available: boolean; reason?: string } | null>(null);
const status = ref<ScreenWatchStatus>({ active: false });
const busy = ref(false);
const message = ref("");
const errorText = ref("");

const sharingHere = computed(() => status.value.active && status.value.chatId === props.chatId);
const sharingElsewhere = computed(() => status.value.active && status.value.chatId !== props.chatId);

async function refreshStatus() {
  status.value = await getScreenWatchStatus();
}

let timer: ReturnType<typeof setInterval> | null = null;

onMounted(async () => {
  availability.value = await getScreenWatchAvailability();
  if (availability.value.available) {
    await refreshStatus();
    timer = setInterval(refreshStatus, 3000);
  }
});

onBeforeUnmount(() => {
  if (timer) clearInterval(timer);
});

function saveSettings() {
  try {
    localStorage.setItem(
      SETTINGS_KEY,
      JSON.stringify({ intervalMinutes: intervalMinutes.value, maxMinutes: maxMinutes.value }),
    );
  } catch {
    // 存不了也沒關係，下次用預設值
  }
}

async function start() {
  busy.value = true;
  errorText.value = "";
  message.value = "準備中…";
  saveSettings();
  try {
    await startScreenWatch({
      chatId: props.chatId,
      intervalMinutes: intervalMinutes.value,
      maxMinutes: maxMinutes.value,
    });
    message.value = `在跳出來的視窗按「開始廣播」，就會開始分享給${props.characterName}。`;
  } catch (err) {
    message.value = "";
    errorText.value = err instanceof Error ? err.message : String(err);
  } finally {
    busy.value = false;
  }
}

async function stop() {
  busy.value = true;
  errorText.value = "";
  try {
    await stopScreenWatch();
    message.value = "已經叫它停止，幾秒內上方的紅色標示就會消失。";
    setTimeout(refreshStatus, 1500);
  } catch (err) {
    errorText.value = err instanceof Error ? err.message : String(err);
  } finally {
    busy.value = false;
  }
}

function formatStartedAt(ms?: number): string {
  if (!ms) return "";
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}
</script>

<template>
  <div class="sw-backdrop" @click.self="emit('close')">
    <div class="sw-card" role="dialog" aria-label="分享螢幕">
      <div class="sw-header">
        <h3>分享螢幕給{{ characterName }}</h3>
        <button class="sw-close" aria-label="關閉" @click="emit('close')">×</button>
      </div>

      <p class="sw-intro">
        像在 DC 分享螢幕一樣。{{ characterName }}每隔幾分鐘看一次你的畫面，用通知回你；
        回到 App 時，他說的話會出現在聊天裡。
      </p>

      <div v-if="availability === null" class="sw-note">檢查中…</div>

      <div v-else-if="!availability.available" class="sw-error">{{ availability.reason }}</div>

      <template v-else>
        <div v-if="status.active" class="sw-status">
          <span class="sw-dot" />
          <span v-if="sharingHere">
            正在分享給{{ characterName }}（{{ formatStartedAt(status.startedAt) }} 開始，已經回了
            {{ status.replies ?? 0 }} 次）
          </span>
          <span v-else>正在分享給{{ status.characterName || "別的角色" }}</span>
        </div>
        <div v-if="status.lastError" class="sw-error">上一次看螢幕失敗：{{ status.lastError }}</div>

        <template v-if="!status.active">
          <label class="sw-field">
            <span>多久看一次</span>
            <select v-model.number="intervalMinutes">
              <option v-for="m in intervalOptions" :key="m" :value="m">{{ m }} 分鐘</option>
            </select>
          </label>
          <label class="sw-field">
            <span>最多分享多久</span>
            <select v-model.number="maxMinutes">
              <option v-for="m in maxOptions" :key="m" :value="m">{{ m }} 分鐘後自動停止</option>
            </select>
          </label>
        </template>

        <ul class="sw-tips">
          <li>每看一次會用一次看圖的 API 額度；畫面沒變的時候不會看。</li>
          <li>分享時上方會一直有紅色錄影標示，這是系統規定。點它也可以停止。</li>
          <li>開著勿擾／專注模式時，通知不會跳出來，會收在通知中心。</li>
          <li>畫面上的東西都會被看到，輸入密碼、看私密資料前請先停止。</li>
        </ul>

        <div v-if="message" class="sw-note">{{ message }}</div>
        <div v-if="errorText" class="sw-error">{{ errorText }}</div>

        <button v-if="sharingHere || sharingElsewhere" class="sw-button sw-stop" :disabled="busy" @click="stop">
          停止分享
        </button>
        <button v-else class="sw-button" :disabled="busy" @click="start">
          {{ busy ? "準備中…" : "開始分享" }}
        </button>
      </template>
    </div>
  </div>
</template>

<style scoped>
.sw-backdrop {
  position: fixed;
  inset: 0;
  z-index: 10000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  background: rgba(0, 0, 0, 0.45);
}

.sw-card {
  width: 100%;
  max-width: 380px;
  max-height: 85vh;
  overflow-y: auto;
  padding: 18px 18px 16px;
  border-radius: 18px;
  background: #fff;
  color: #222;
  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.25);
}

.sw-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.sw-header h3 {
  margin: 0;
  font-size: 17px;
  font-weight: 600;
}

.sw-close {
  border: none;
  background: none;
  font-size: 24px;
  line-height: 1;
  color: #888;
  cursor: pointer;
}

.sw-intro {
  margin: 10px 0 14px;
  font-size: 14px;
  line-height: 1.55;
  color: #444;
}

.sw-field {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 10px;
  font-size: 14px;
}

.sw-field select {
  padding: 6px 8px;
  border: 1px solid #ddd;
  border-radius: 8px;
  background: #fafafa;
  font-size: 14px;
  color: inherit;
}

.sw-tips {
  margin: 12px 0;
  padding-left: 18px;
  font-size: 12.5px;
  line-height: 1.6;
  color: #666;
}

.sw-status {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 10px;
  padding: 8px 10px;
  border-radius: 10px;
  background: #fdecec;
  font-size: 14px;
}

.sw-dot {
  flex: none;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #e53935;
}

.sw-note {
  margin: 8px 0;
  font-size: 13px;
  color: #555;
}

.sw-error {
  margin: 8px 0;
  font-size: 13px;
  color: #c62828;
  word-break: break-word;
}

.sw-button {
  width: 100%;
  margin-top: 6px;
  padding: 11px;
  border: none;
  border-radius: 12px;
  background: #5865f2;
  color: #fff;
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
}

.sw-button:disabled {
  opacity: 0.6;
}

.sw-stop {
  background: #e53935;
}

@media (prefers-color-scheme: dark) {
  .sw-card {
    background: #1f1f22;
    color: #eee;
  }

  .sw-intro,
  .sw-note {
    color: #bbb;
  }

  .sw-tips {
    color: #999;
  }

  .sw-field select {
    border-color: #444;
    background: #2a2a2e;
  }

  .sw-status {
    background: #3a2224;
  }
}
</style>
