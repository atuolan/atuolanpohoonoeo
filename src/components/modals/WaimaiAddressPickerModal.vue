<script setup lang="ts">
import { useWaimaiAddressBookStore } from "@/stores/waimaiAddressBook";
import type {
  DeliveryAddress,
  TemporaryAddress,
  WaimaiDestinationSnapshot,
} from "@/types/waimaiDelivery";
import { computed, reactive, ref, watch } from "vue";

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

const COUNTRY_OPTIONS = [
  { code: "TW", name: "台灣" },
  { code: "JP", name: "日本" },
  { code: "KR", name: "韓國" },
  { code: "US", name: "美國" },
  { code: "DE", name: "德國" },
  { code: "GB", name: "英國" },
  { code: "SG", name: "新加坡" },
  { code: "AU", name: "澳洲" },
  { code: "CA", name: "加拿大" },
  { code: "TH", name: "泰國" },
  { code: "MY", name: "馬來西亞" },
  { code: "VN", name: "越南" },
];

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

function onChangeCountryForForm(code: string) {
  const option = COUNTRY_OPTIONS.find((c) => c.code === code);
  form.countryCode = code;
  form.countryName = option?.name || code;
}

function onChangeCountryForTemp(code: string) {
  const option = COUNTRY_OPTIONS.find((c) => c.code === code);
  manualTemp.countryCode = code;
  manualTemp.countryName = option?.name || code;
}

function saveAddressForm() {
  if (!form.recipientName.trim() || !form.city.trim() || !form.addressLine.trim()) {
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
    if (!selected) return;
    emit("confirm", { destination: toDestinationFromAddress(selected) });
    return;
  }

  if (!manualTemp.city.trim() || !manualTemp.addressLine.trim()) {
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
    resetAddressForm();
  },
);
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
                <button
                  v-for="addr in filteredAddresses"
                  :key="addr.id"
                  class="address-item"
                  :class="{ active: selectedAddressId === addr.id }"
                  @click="pickAddress(addr)"
                >
                  <div class="row-top">
                    <strong>{{ addr.label }}</strong>
                    <span v-if="addr.isDefault" class="chip">預設</span>
                  </div>
                  <div class="row-sub">{{ addr.recipientName }} ・ {{ addr.countryName }} {{ addr.city }}</div>
                  <div class="row-sub">{{ addr.addressLine }}</div>
                  <div class="row-actions">
                    <button type="button" @click.stop="fillFormFromAddress(addr)">編輯</button>
                    <button type="button" @click.stop="addressBookStore.setDefaultAddress(addr.id)">設預設</button>
                    <button type="button" class="danger" @click.stop="addressBookStore.deleteAddress(addr.id)">刪除</button>
                  </div>
                </button>
              </div>
            </div>

            <div class="section-block form-block">
              <h4>新增 / 編輯地址</h4>
              <div class="form-grid">
                <input v-model="form.label" class="text-input" type="text" placeholder="標籤（家/公司）" />
                <input v-model="form.recipientName" class="text-input" type="text" placeholder="收件人" />
                <input v-model="form.phone" class="text-input" type="text" placeholder="電話（可選）" />

                <select :value="form.countryCode" class="text-input" @change="onChangeCountryForForm(($event.target as HTMLSelectElement).value)">
                  <option v-for="country in COUNTRY_OPTIONS" :key="country.code" :value="country.code">
                    {{ country.name }} ({{ country.code }})
                  </option>
                </select>

                <input v-model="form.city" class="text-input" type="text" placeholder="城市" />
                <input v-model="form.addressLine" class="text-input full" type="text" placeholder="完整地址" />
                <input v-model="form.lat" class="text-input" type="text" placeholder="緯度（可選）" />
                <input v-model="form.lon" class="text-input" type="text" placeholder="經度（可選）" />
              </div>

              <label class="check-row">
                <input v-model="form.isDefault" type="checkbox" />
                <span>設為預設地址</span>
              </label>

              <button class="save-btn" type="button" @click="saveAddressForm">儲存地址</button>
            </div>
          </template>

          <template v-else>
            <div class="section-block form-block">
              <p class="hint">此為一次性地址，不會寫入地址簿。</p>
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
            </div>
          </template>

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
  border-radius: 18px 18px 0 0;
  padding: 14px;
}

.sheet-head {
  display: flex;
  align-items: center;
  justify-content: space-between;

  h3 {
    margin: 0;
    font-size: 18px;
  }

  .close-btn {
    width: 28px;
    height: 28px;
    border: none;
    border-radius: 50%;
    background: #eef2ff;
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
    font-size: 12px;
    padding: 4px 8px;
    cursor: pointer;

    &.danger {
      border-color: #fecaca;
      color: #b91c1c;
    }
  }
}

.check-row {
  margin-top: 8px;
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
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

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
