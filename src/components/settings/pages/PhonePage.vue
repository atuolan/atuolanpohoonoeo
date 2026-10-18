<script setup lang="ts">
/**
 * 日曆與定位：「加到手機日曆」用什麼方式（只存在這台裝置）、iPhone 捷徑怎麼建、定位權限與測試。
 */
import {
  addToPhoneCalendar,
  DEFAULT_SHORTCUT_NAME,
  detectPlatform,
  loadPhoneCalendarSettings,
  needsMethodChoice,
  phoneCalendarHint,
  phoneCalendarMethodLabel,
  resolvePhoneCalendarMethod,
  savePhoneCalendarSettings,
  SHORTCUT_FILE_URL,
  type PhoneCalendarMethod,
} from "@/services/phoneCalendar";
import { formatDate } from "@/services/toolCalling/toolFormat";
import { getBrowserLocation, reverseGeocode } from "@/services/WeatherService";
import { computed, onActivated, onMounted, reactive, ref, watch } from "vue";
import SettingsGroup from "../ui/SettingsGroup.vue";
import SettingsRow from "../ui/SettingsRow.vue";
import SettingsSelectRow from "../ui/SettingsSelectRow.vue";
import SettingsSheet from "../ui/SettingsSheet.vue";

// ===== 加到手機日曆 =====
const platform = detectPlatform();
const settings = reactive(loadPhoneCalendarSettings());
watch(settings, () => savePhoneCalendarSettings({ ...settings }));

const effectiveMethod = computed(() => resolvePhoneCalendarMethod(settings.method));
const label = (method: ReturnType<typeof resolvePhoneCalendarMethod>) => phoneCalendarMethodLabel(method, platform);

const methodOptions = computed<Array<{ value: PhoneCalendarMethod; label: string }>>(() => [
  {
    value: "auto",
    label: needsMethodChoice("auto", platform) ? "自動（第一次按的時候問你）" : `自動（這台用${label(resolvePhoneCalendarMethod("auto"))}）`,
  },
  { value: "shortcut", label: label("shortcut") },
  { value: "ics", label: label("ics") },
  { value: "google", label: label("google") },
]);

const METHOD_NOTES: Record<ReturnType<typeof resolvePhoneCalendarMethod>, string> = {
  shortcut: "按下去會跳到「捷徑」App 直接寫進日曆，加好後自己切回來。第一次用要先按下面的「安裝捷徑」。",
  ics:
    platform === "android"
      ? "按下去會下載一個行事曆檔，從通知列或檔案管理點開，選手機的日曆（小米、華為等）匯入。沒有 Google 服務的手機用這個。在微信、QQ 裡打開下載不了，要改用瀏覽器。"
      : "按下去會產生一個行事曆檔，照手機的提示加入日曆。從主畫面打開的 App 不一定跳得出提示，不行就改用「iPhone 捷徑」（可以一鍵安裝）。",
  google: "按下去會打開填好內容的 Google 日曆，確認後按「儲存」。要登入 Google 帳號，大陸手機沒有 Google 服務的話用「手機日曆」。",
};

// 列上只放短的值，說明才有地方寫
const methodDisplay = computed(() => (settings.method === "auto" ? "自動" : label(settings.method)));
const methodNote = computed(() => {
  if (needsMethodChoice(settings.method, platform)) {
    return "第一次在聊天裡按「加到手機日曆」時，會問你用手機日曆還是 Google 日曆，之後就照你選的。";
  }
  return (settings.method === "auto" ? `這台會用「${label(effectiveMethod.value)}」。` : "") + METHOD_NOTES[effectiveMethod.value];
});

const calendarHint = ref("");

function addTestEvent() {
  // 不能先 await，要在點擊當下直接打開，不然瀏覽器可能擋下
  const method = addToPhoneCalendar(
    {
      title: "203 Phone 測試行程（可以刪掉）",
      date: formatDate(new Date()),
      startTime: "12:00",
      endTime: "12:30",
      description: "確認「加到手機日曆」能用",
    },
    { ...settings },
  );
  calendarHint.value = phoneCalendarHint(method, platform);
}

const showShortcutGuide = ref(false);

// ===== 位置 =====
const permission = ref<PermissionState | "unknown">("unknown");

async function readPermission() {
  try {
    const status = await navigator.permissions.query({ name: "geolocation" });
    permission.value = status.state;
  } catch {
    permission.value = "unknown";
  }
}

const permissionLabel = computed(
  () =>
    ({
      granted: "已允許",
      prompt: "用到時會問",
      denied: "已封鎖",
      unknown: "按「測試定位」看看",
    })[permission.value],
);

const locating = ref(false);
const locationResult = ref("");

async function testLocation() {
  locating.value = true;
  locationResult.value = "";
  try {
    const coords = await getBrowserLocation({ enableHighAccuracy: false });
    const place = await reverseGeocode(coords.lat, coords.lon);
    locationResult.value = `${place || "拿到座標了，但查不到地名"}（誤差約 ${Math.round(coords.accuracy)} 公尺）`;
  } catch (e) {
    locationResult.value = e instanceof Error ? e.message : String(e);
  } finally {
    locating.value = false;
    void readPermission();
  }
}

onMounted(readPermission);
onActivated(readPermission);
</script>

<template>
  <div class="st-page">
    <SettingsGroup
      title="加到手機日曆"
      footer="角色幫你記的行程，在聊天裡會有一張卡片，按「加到手機日曆」才會寫進手機。網頁版沒辦法自己寫進手機日曆，所以每次都要你按。這個設定只存在這台裝置。"
    >
      <SettingsSelectRow
        v-model="settings.method"
        label="加入方式"
        :display="methodDisplay"
        :description="methodNote"
        :options="methodOptions"
      />
      <template v-if="effectiveMethod === 'shortcut'">
        <div class="st-pad">
          <a
            class="st-btn st-btn--primary st-btn--block phone-install"
            :href="SHORTCUT_FILE_URL"
            :download="`${DEFAULT_SHORTCUT_NAME}.shortcut`"
          >
            安裝捷徑
          </a>
          <p class="st-hint">
            會下載「{{ DEFAULT_SHORTCUT_NAME }}」捷徑，打開後按「加入捷徑」，名稱不要改。第一次加行程時，捷徑會問能不能取用行事曆，選允許。
          </p>
        </div>
        <div class="st-fields">
          <div class="st-field">
            <label for="phone-shortcut-name" class="st-field__label">捷徑名稱</label>
            <input
              id="phone-shortcut-name"
              v-model.trim="settings.shortcutName"
              type="text"
              class="st-input"
              :placeholder="DEFAULT_SHORTCUT_NAME"
              autocomplete="off"
            />
            <p class="st-hint">要和「捷徑」App 裡的名稱一字不差。</p>
          </div>
        </div>
        <SettingsRow clickable label="安裝不了？自己建立" chevron="right" @click="showShortcutGuide = true" />
      </template>
      <div class="st-pad">
        <button type="button" class="st-btn st-btn--soft st-btn--block" @click="addTestEvent">
          加一筆測試行程
        </button>
        <p v-if="calendarHint" class="st-hint" role="status">{{ calendarHint }}</p>
      </div>
    </SettingsGroup>

    <SettingsGroup
      title="位置"
      footer="角色用「查我的位置」時每次都會先問你。只會告訴 AI 你在哪一區、附近有什麼地點，不會給精確地址。角色要能用，還要在「主要模型 › 進階」開啟「允許工具呼叫」。"
    >
      <SettingsRow
        label="位置權限"
        :value="permissionLabel"
        :description="permission === 'denied' ? '到手機的「設定」裡，允許這個 App（或瀏覽器）取用位置' : undefined"
      />
      <div class="st-pad">
        <button
          type="button"
          class="st-btn st-btn--soft st-btn--block"
          :disabled="locating"
          @click="testLocation"
        >
          {{ locating ? "定位中…" : "測試定位" }}
        </button>
        <p v-if="locationResult" class="st-hint" role="status">{{ locationResult }}</p>
      </div>
    </SettingsGroup>

    <SettingsSheet
      :open="showShortcutGuide"
      title="建立捷徑"
      done-label="完成"
      @close="showShortcutGuide = false"
    >
      <SettingsGroup footer="選項名稱可能隨 iOS 版本略有不同，找最接近的就好。">
        <ol class="phone-steps">
          <li>
            打開「捷徑」App，按右上角「＋」建立新捷徑，名稱改成「{{ settings.shortcutName || DEFAULT_SHORTCUT_NAME }}」。
          </li>
          <li>搜尋「辭典」，加入「從輸入取得辭典」，輸入選「捷徑輸入」。如果最上面出現「接收…輸入」，類型選「文字」或「任何」。</li>
          <li>
            搜尋「辭典值」，加入「取得辭典值」五次，鍵分別填 <code>title</code>、<code>start</code>、<code>end</code>、<code>allDay</code>、<code>notes</code>；每一個的「辭典」都選第 2 步的「辭典」。
          </li>
          <li>
            搜尋「行程」，加入「加入新行程」：標題選 title、開始日期選 start、結束日期選 end、整天選 allDay、備忘錄選 notes，再選要放進哪個行事曆。
          </li>
          <li>
            回到這頁，加入方式選「iPhone 捷徑」，按「加一筆測試行程」。第一次會問你允不允許捷徑取用行事曆，選允許。
          </li>
          <li>
            要給玩家用：在捷徑 App 長按這個捷徑 →「分享」→ 拷貝 iCloud 連結傳給他們，加入後名稱不要改。
          </li>
        </ol>
      </SettingsGroup>
    </SettingsSheet>
  </div>
</template>

<style scoped lang="scss">
.phone-install {
  text-decoration: none;
}

.phone-steps {
  margin: 0;
  padding: 14px 16px 14px 34px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  font-size: 14px;
  line-height: 1.6;
  color: var(--st-text);

  code {
    padding: 1px 5px;
    border-radius: 6px;
    background: color-mix(in srgb, var(--st-text) 8%, transparent);
    font-size: 13px;
  }
}
</style>
