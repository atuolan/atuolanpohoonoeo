<script setup lang="ts">
import { useWaimaiAddressBookStore } from "@/stores/waimaiAddressBook";
import type {
  DeliveryAddress,
  TemporaryAddress,
  WaimaiDestinationSnapshot,
} from "@/types/waimaiDelivery";
import { computed, nextTick, reactive, ref, watch } from "vue";

interface AddressPickerConfirmPayload {
  destination: WaimaiDestinationSnapshot;
}

interface Props {
  visible: boolean;
}

const props = defineProps<Props>();

const emit = defineEmits<{
  close: [];
  confirm: [payload: AddressPickerConfirmPayload];
}>();

const addressBookStore = useWaimaiAddressBookStore();

const tab = ref<"address_book" | "manual_temp">("address_book");
const selectedAddressId = ref<string>("");
const searchKeyword = ref("");
// 儲存表單／臨時地址的必填提示；確認時地址簿為空的提示另外放
const formError = ref("");
const confirmError = ref("");
const formBlockRef = ref<HTMLElement | null>(null);

const form = reactive({
  id: "",
  label: "家",
  recipientName: "",
  phone: "",
  countryCode: "TW",
  countryName: "台灣",
  city: "台北市",
  addressLine: "",
  lat: "",
  lon: "",
  isDefault: false,
});

const manualTemp = reactive<TemporaryAddress>({
  source: "manual_temp",
  displayName: "",
  countryCode: "TW",
  countryName: "台灣",
  city: "台北市",
  addressLine: "",
  lat: undefined,
  lon: undefined,
});

const LABEL_PRESETS = ["家", "公司", "學校", "朋友家", "其他"];

const COUNTRY_OPTIONS = [
  { code: "TW", name: "台灣" },
  { code: "CN", name: "中國大陸" },
  { code: "JP", name: "日本" },
  { code: "KR", name: "韓國" },
  { code: "US", name: "美國" },
  { code: "DE", name: "德國" },
  { code: "GB", name: "英國" },
  { code: "SG", name: "新加坡" },
  { code: "AU", name: "澳洲" },
  { code: "CA", name: "加拿大" },
  { code: "HK", name: "香港" },
  { code: "MO", name: "澳門" },
  { code: "TH", name: "泰國" },
  { code: "MY", name: "馬來西亞" },
  { code: "VN", name: "越南" },
];

const DEFAULT_CITY = "台北市";

const editingId = computed(() => form.id);
const editingLabel = computed(
  () => addressBookStore.addresses.find((a) => a.id === form.id)?.label || form.label,
);

const filteredAddresses = computed(() =>
  addressBookStore.searchAddresses(searchKeyword.value),
);

function resetAddressForm() {
  form.id = "";
  form.label = "家";
  form.recipientName = "";
  form.phone = "";
  form.countryCode = "TW";
  form.countryName = "台灣";
  form.city = "台北市";
  form.addressLine = "";
  form.lat = "";
  form.lon = "";
  form.isDefault = false;
}

function fillFormFromAddress(addr: DeliveryAddress) {
  form.id = addr.id;
  form.label = addr.label;
  form.recipientName = addr.recipientName;
  form.phone = addr.phone || "";
  form.countryCode = addr.countryCode;
  form.countryName = addr.countryName;
  form.city = addr.city;
  form.addressLine = addr.addressLine;
  form.lat = addr.lat != null ? String(addr.lat) : "";
  form.lon = addr.lon != null ? String(addr.lon) : "";
  form.isDefault = !!addr.isDefault;
}

function resetManualTemp() {
  manualTemp.displayName = "";
  manualTemp.countryCode = "TW";
  manualTemp.countryName = "台灣";
  manualTemp.city = DEFAULT_CITY;
  manualTemp.addressLine = "";
  manualTemp.lat = undefined;
  manualTemp.lon = undefined;
}

function onChangeCountryForForm(code: string) {
  const option = COUNTRY_OPTIONS.find((c) => c.code === code);
  form.countryCode = code;
  form.countryName = option?.name || code;
  // 預設城市是台北市，換到別國就清掉，避免寄到「日本 台北市」
  if (code !== "TW" && form.city === DEFAULT_CITY) form.city = "";
}

function onChangeCountryForTemp(code: string) {
  const option = COUNTRY_OPTIONS.find((c) => c.code === code);
  manualTemp.countryCode = code;
  manualTemp.countryName = option?.name || code;
  if (code !== "TW" && manualTemp.city === DEFAULT_CITY) manualTemp.city = "";
}

function startEdit(addr: DeliveryAddress) {
  fillFormFromAddress(addr);
  formError.value = "";
  void nextTick(() => {
    formBlockRef.value?.scrollIntoView({ behavior: "smooth", block: "start" });
  });
}

function cancelEdit() {
  resetAddressForm();
  formError.value = "";
}

function removeAddress(addr: DeliveryAddress) {
  if (!confirm(`確定要刪除「${addr.label}」嗎？`)) return;
  addressBookStore.deleteAddress(addr.id);
  if (selectedAddressId.value === addr.id) {
    selectedAddressId.value = addressBookStore.defaultAddress?.id || "";
  }
  // 正在編輯被刪掉的那筆時，表單也要清掉，否則會把它存回來
  if (form.id === addr.id) resetAddressForm();
}

function saveAddressForm() {
  const missing: string[] = [];
  if (!form.recipientName.trim()) missing.push("收件人");
  if (!form.city.trim()) missing.push("城市");
  if (!form.addressLine.trim()) missing.push("完整地址");
  if (missing.length > 0) {
    formError.value = `請填寫：${missing.join("、")}`;
    return;
  }

  const saved = addressBookStore.upsertAddress({
    id: form.id || undefined,
    label: form.label,
    recipientName: form.recipientName,
    phone: form.phone || undefined,
    countryCode: form.countryCode,
    countryName: form.countryName,
    city: form.city,
    addressLine: form.addressLine,
    // 表單不再顯示經緯度，但編輯舊地址時要原樣帶回去
    lat: form.lat ? Number(form.lat) : undefined,
    lon: form.lon ? Number(form.lon) : undefined,
    isDefault: form.isDefault,
  });

  selectedAddressId.value = saved.id;
  resetAddressForm();
}

function pickAddress(addr: DeliveryAddress) {
  selectedAddressId.value = addr.id;
}

function toDestinationFromAddress(addr: DeliveryAddress): WaimaiDestinationSnapshot {
  return {
    source: "address_book",
    addressId: addr.id,
    recipientName: addr.recipientName,
    phone: addr.phone,
    countryCode: addr.countryCode,
    countryName: addr.countryName,
    city: addr.city,
    addressLine: addr.addressLine,
    lat: addr.lat,
    lon: addr.lon,
  };
}

function toDestinationFromTemp(): WaimaiDestinationSnapshot {
  return {
    source: "manual_temp",
    recipientName: manualTemp.displayName?.trim() || "臨時收件人",
    countryCode: manualTemp.countryCode,
    countryName: manualTemp.countryName,
    city: manualTemp.city.trim(),
    addressLine: manualTemp.addressLine.trim(),
    lat: manualTemp.lat,
    lon: manualTemp.lon,
  };
}

function handleConfirm() {
  if (tab.value === "address_book") {
    const selected =
      addressBookStore.addresses.find((a) => a.id === selectedAddressId.value) ||
      addressBookStore.defaultAddress;
    if (!selected) {
      confirmError.value = "請先新增一個地址";
      return;
    }
    emit("confirm", { destination: toDestinationFromAddress(selected) });
    return;
  }

  const missing: string[] = [];
  if (!manualTemp.city.trim()) missing.push("城市");
  if (!manualTemp.addressLine.trim()) missing.push("完整地址");
  if (missing.length > 0) {
    formError.value = `請填寫：${missing.join("、")}`;
    return;
  }
  emit("confirm", { destination: toDestinationFromTemp() });
}

watch(
  () => props.visible,
  (visible) => {
    if (!visible) return;
    addressBookStore.ensureLoaded();
    selectedAddressId.value = addressBookStore.defaultAddress?.id || "";
    // 每次打開都從乾淨狀態開始
    tab.value = "address_book";
    searchKeyword.value = "";
    resetAddressForm();
    resetManualTemp();
    formError.value = "";
    confirmError.value = "";
  },
);

// 使用者改動欄位後清掉錯誤
watch([form, manualTemp], () => {
  formError.value = "";
  confirmError.value = "";
});

watch(tab, () => {
  formError.value = "";
  confirmError.value = "";
});
</script>

<template>
  <teleport to="body">
    <transition name="fade">
      <div v-if="visible" class="waimai-address-overlay" @click="emit('close')">
        <div class="waimai-address-sheet" @click.stop>
          <div class="sheet-head">
            <h3>選擇收貨地</h3>
            <button class="close-btn" @click="emit('close')">×</button>
          </div>

          <div class="tabs">
            <button :class="{ active: tab === 'address_book' }" @click="tab = 'address_book'">
              地址簿
            </button>
            <button :class="{ active: tab === 'manual_temp' }" @click="tab = 'manual_temp'">
              臨時地址
            </button>
          </div>

          <template v-if="tab === 'address_book'">
            <div class="section-block">
              <input
                v-model="searchKeyword"
                class="text-input"
                type="text"
                placeholder="搜尋標籤 / 城市 / 地址"
              />

              <div class="address-list">
                <div
                  v-for="addr in filteredAddresses"
                  :key="addr.id"
                  class="address-item"
                  :class="{ active: selectedAddressId === addr.id }"
                  role="button"
                  tabindex="0"
                  @click="pickAddress(addr)"
                  @keydown.enter.self="pickAddress(addr)"
                  @keydown.space.prevent.self="pickAddress(addr)"
                >
                  <div class="row-top">
                    <strong>{{ addr.label }}</strong>
                    <span v-if="addr.isDefault" class="chip">預設</span>
                  </div>
                  <div class="row-sub">{{ addr.recipientName }} ・ {{ addr.countryName }} {{ addr.city }}</div>
                  <div class="row-sub">{{ addr.addressLine }}</div>
                  <div class="row-actions">
                    <button type="button" @click.stop="startEdit(addr)">編輯</button>
                    <button type="button" @click.stop="addressBookStore.setDefaultAddress(addr.id)">設預設</button>
                    <button type="button" class="danger" @click.stop="removeAddress(addr)">刪除</button>
                  </div>
                </div>
              </div>
              <p class="list-hint">想寄給角色？新增一個地址，收件人寫角色的名字。</p>
            </div>

            <div ref="formBlockRef" class="section-block form-block">
              <h4>{{ editingId ? `編輯地址：${editingLabel}` : "新增地址" }}</h4>
              <div class="label-chips-row">
                <button
                  v-for="preset in LABEL_PRESETS"
                  :key="preset"
                  type="button"
                  class="label-chip"
                  :class="{ active: form.label === preset }"
                  @click="form.label = preset"
                >{{ preset }}</button>
              </div>
              <div class="form-grid">
                <input v-model="form.label" class="text-input" type="text" placeholder="自訂標籤" />
                <input v-model="form.recipientName" class="text-input" type="text" placeholder="收件人" />
                <input v-model="form.phone" class="text-input" type="text" placeholder="電話（可選）" />

                <select :value="form.countryCode" class="text-input" @change="onChangeCountryForForm(($event.target as HTMLSelectElement).value)">
                  <option v-for="country in COUNTRY_OPTIONS" :key="country.code" :value="country.code">
                    {{ country.name }} ({{ country.code }})
                  </option>
                </select>

                <input v-model="form.city" class="text-input" type="text" placeholder="城市" />
                <input v-model="form.addressLine" class="text-input full" type="text" placeholder="完整地址" />
              </div>

              <label class="check-row">
                <input v-model="form.isDefault" type="checkbox" />
                <span>設為預設地址</span>
              </label>

              <p v-if="formError" class="error-text">{{ formError }}</p>

              <div class="form-actions">
                <button class="save-btn" type="button" @click="saveAddressForm">
                  {{ editingId ? "儲存修改" : "新增地址" }}
                </button>
                <button v-if="editingId" class="cancel-edit-btn" type="button" @click="cancelEdit">
                  取消編輯
                </button>
              </div>
            </div>
          </template>

          <template v-else>
            <div class="section-block form-block">
              <p class="hint">此為一次性地址，不會寫入地址簿。</p>
              <div class="label-chips-row">
                <button
                  v-for="preset in LABEL_PRESETS"
                  :key="preset"
                  type="button"
                  class="label-chip"
                  :class="{ active: manualTemp.displayName === preset }"
                  @click="manualTemp.displayName = preset"
                >{{ preset }}</button>
              </div>
              <div class="form-grid">
                <input v-model="manualTemp.displayName" class="text-input" type="text" placeholder="地點名稱（旅館/朋友家）" />

                <select :value="manualTemp.countryCode" class="text-input" @change="onChangeCountryForTemp(($event.target as HTMLSelectElement).value)">
                  <option v-for="country in COUNTRY_OPTIONS" :key="country.code" :value="country.code">
                    {{ country.name }} ({{ country.code }})
                  </option>
                </select>

                <input v-model="manualTemp.city" class="text-input" type="text" placeholder="城市" />
                <input v-model="manualTemp.addressLine" class="text-input full" type="text" placeholder="完整地址" />
              </div>
              <p v-if="formError" class="error-text">{{ formError }}</p>
            </div>
          </template>

          <p v-if="confirmError" class="error-text footer-error">{{ confirmError }}</p>

          <div class="footer-actions">
            <button class="btn ghost" type="button" @click="emit('close')">取消</button>
            <button class="btn primary" type="button" @click="handleConfirm">確認此收貨地</button>
          </div>
        </div>
      </div>
    </transition>
  </teleport>
</template>

<style scoped lang="scss">
.waimai-address-overlay {
  position: fixed;
  inset: 0;
  z-index: 5600;
  background: rgba(0, 0, 0, 0.45);
  display: flex;
  align-items: flex-end;
}

.waimai-address-sheet {
  width: 100%;
  max-height: 90vh;
  overflow-y: auto;
  background: #fff;
  color: #111827;
  border-radius: 18px 18px 0 0;
  padding: 14px 14px calc(14px + env(safe-area-inset-bottom, 0px));
}

.sheet-head {
  display: flex;
  align-items: center;
  justify-content: space-between;

  h3 {
    margin: 0;
    font-size: 18px;
    color: #111827;
  }

  .close-btn {
    width: 28px;
    height: 28px;
    border: none;
    border-radius: 50%;
    background: #eef2ff;
    color: #111827;
    cursor: pointer;
    font-size: 18px;
  }
}

.tabs {
  margin-top: 12px;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;

  button {
    border: 1px solid #d1d5db;
    background: #fff;
    border-radius: 10px;
    padding: 10px;
    font-weight: 700;
    color: #374151;
    cursor: pointer;

    &.active {
      border-color: #4f46e5;
      background: #eef2ff;
      color: #312e81;
    }
  }
}

.section-block {
  margin-top: 12px;
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  padding: 10px;
}

.form-block h4 {
  margin: 0 0 8px;
  font-size: 14px;
  color: #111827;
}

.hint {
  margin: 0 0 8px;
  font-size: 12px;
  color: #6b7280;
}

.text-input {
  width: 100%;
  border: 1px solid #d1d5db;
  border-radius: 10px;
  padding: 9px 10px;
  font-size: 13px;
  background: #fff;
  color: #111827;
}

.list-hint {
  margin: 8px 0 0;
  font-size: 12px;
  color: #6b7280;
}

.error-text {
  margin: 8px 0 0;
  font-size: 12px;
  color: #dc2626;

  &.footer-error {
    margin: 10px 0 0;
    text-align: center;
  }
}

.form-actions {
  display: flex;
  gap: 8px;
  align-items: center;
}

.cancel-edit-btn {
  margin-top: 8px;
  border: 1px solid #d1d5db;
  border-radius: 10px;
  background: #f3f4f6;
  color: #374151;
  padding: 10px 12px;
  font-weight: 700;
  cursor: pointer;
}

.form-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;

  .full {
    grid-column: 1 / -1;
  }
}

.address-list {
  margin-top: 8px;
  display: grid;
  gap: 8px;
}

.address-item {
  border: 1px solid #d1d5db;
  border-radius: 10px;
  background: #fff;
  padding: 10px;
  text-align: left;
  color: #111827;
  cursor: pointer;

  &.active {
    border-color: #4f46e5;
    background: #eef2ff;
  }
}

.row-top {
  display: flex;
  align-items: center;
  justify-content: space-between;

  strong {
    color: #111827;
  }
}

.chip {
  font-size: 11px;
  color: #312e81;
  background: #c7d2fe;
  border-radius: 999px;
  padding: 2px 7px;
}

.row-sub {
  margin-top: 4px;
  font-size: 12px;
  color: #4b5563;
}

.row-actions {
  margin-top: 8px;
  display: flex;
  gap: 6px;

  button {
    border: 1px solid #cbd5e1;
    border-radius: 8px;
    background: #fff;
    color: #374151;
    font-size: 12px;
    padding: 4px 8px;
    cursor: pointer;

    &.danger {
      border-color: #fecaca;
      color: #b91c1c;
    }
  }
}

.label-chips-row {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 8px;
}

.label-chip {
  border: 1px solid #d1d5db;
  border-radius: 999px;
  background: #f9fafb;
  padding: 5px 14px;
  font-size: 13px;
  font-weight: 600;
  color: #374151;
  cursor: pointer;
  transition: background 0.15s, border-color 0.15s, color 0.15s;

  &.active {
    border-color: #4f46e5;
    background: #eef2ff;
    color: #312e81;
  }
}

.check-row {
  margin-top: 8px;
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: #374151;
}

.save-btn {
  margin-top: 8px;
  border: none;
  border-radius: 10px;
  background: #111827;
  color: #fff;
  padding: 10px 12px;
  font-weight: 700;
  cursor: pointer;
}

.footer-actions {
  margin-top: 14px;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;

  .btn {
    border: none;
    border-radius: 10px;
    padding: 12px;
    font-weight: 700;
    cursor: pointer;

    &.ghost {
      background: #f3f4f6;
      color: #374151;
    }

    &.primary {
      background: #111827;
      color: #fff;
    }
  }
}

// body.is-night-mode 由 theme store 切換，保持巢狀讓 scoped 附在內層元素上。
body.is-night-mode {
  .waimai-address-sheet {
    background: var(--color-surface);
    color: var(--color-text);
  }

  .sheet-head {
    h3 {
      color: var(--color-text);
    }

    .close-btn {
      background: rgba(255, 255, 255, 0.1);
      color: var(--color-text);
    }
  }

  .tabs button {
    border-color: var(--color-border);
    background: var(--color-surface-hover);
    color: var(--color-text);

    &.active {
      border-color: #818cf8;
      background: rgba(129, 140, 248, 0.15);
      color: #c7d2fe;
    }
  }

  .section-block {
    border-color: var(--color-border);
  }

  .form-block h4 {
    color: var(--color-text);
  }

  .hint,
  .list-hint {
    color: var(--color-text-secondary);
  }

  .text-input {
    border-color: var(--color-border);
    background: var(--color-surface-hover);
    color: var(--color-text);
  }

  .address-item {
    border-color: var(--color-border);
    background: var(--color-surface-hover);
    color: var(--color-text);

    &.active {
      border-color: #818cf8;
      background: rgba(129, 140, 248, 0.15);
    }
  }

  .row-top strong {
    color: var(--color-text);
  }

  .chip {
    background: rgba(129, 140, 248, 0.25);
    color: #c7d2fe;
  }

  .row-sub {
    color: var(--color-text-secondary);
  }

  .row-actions button {
    border-color: var(--color-border);
    background: var(--color-surface);
    color: var(--color-text);

    &.danger {
      border-color: rgba(248, 113, 113, 0.4);
      color: #f87171;
    }
  }

  .label-chip {
    border-color: var(--color-border);
    background: var(--color-surface-hover);
    color: var(--color-text);

    &.active {
      border-color: #818cf8;
      background: rgba(129, 140, 248, 0.15);
      color: #c7d2fe;
    }
  }

  .check-row {
    color: var(--color-text);
  }

  .error-text {
    color: #f87171;
  }

  .cancel-edit-btn,
  .footer-actions .btn.ghost {
    border-color: var(--color-border);
    background: var(--color-surface-hover);
    color: var(--color-text);
  }

  .save-btn,
  .footer-actions .btn.primary {
    background: var(--color-text);
    color: #1a1a2e;
  }
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
