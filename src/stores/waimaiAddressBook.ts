import type { DeliveryAddress } from "@/types/waimaiDelivery";
import { defineStore } from "pinia";
import { computed, ref } from "vue";

const STORAGE_KEY = "waimai-address-book-v1";

interface UpsertAddressInput {
  id?: string;
  label: string;
  recipientName: string;
  phone?: string;
  countryCode: string;
  countryName: string;
  city: string;
  addressLine: string;
  lat?: number;
  lon?: number;
  isDefault?: boolean;
}

function safeParseAddresses(raw: string | null): DeliveryAddress[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as DeliveryAddress[];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item) => item && typeof item.id === "string");
  } catch {
    return [];
  }
}

export const useWaimaiAddressBookStore = defineStore("waimaiAddressBook", () => {
  const addresses = ref<DeliveryAddress[]>([]);
  const loaded = ref(false);

  const sortedAddresses = computed(() =>
    [...addresses.value].sort((a, b) => {
      if (a.isDefault && !b.isDefault) return -1;
      if (!a.isDefault && b.isDefault) return 1;
      return b.updatedAt - a.updatedAt;
    }),
  );

  const defaultAddress = computed(
    () => addresses.value.find((a) => a.isDefault) ?? sortedAddresses.value[0] ?? null,
  );

  function persist() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(addresses.value));
    } catch {
      // ignore
    }
  }

  function ensureLoaded() {
    if (loaded.value) return;

    addresses.value = safeParseAddresses(localStorage.getItem(STORAGE_KEY));

    if (addresses.value.length === 0) {
      const now = Date.now();
      addresses.value = [
        {
          id: crypto.randomUUID(),
          label: "家",
          recipientName: "我",
          countryCode: "TW",
          countryName: "台灣",
          city: "台北市",
          addressLine: "信義區市府路 1 號",
          isDefault: true,
          createdAt: now,
          updatedAt: now,
        },
      ];
      persist();
    }

    loaded.value = true;
  }

  function setDefaultAddress(id: string) {
    ensureLoaded();
    let changed = false;
    addresses.value = addresses.value.map((addr) => {
      const shouldDefault = addr.id === id;
      if (addr.isDefault !== shouldDefault) {
        changed = true;
        return {
          ...addr,
          isDefault: shouldDefault,
          updatedAt: Date.now(),
        };
      }
      return addr;
    });
    if (changed) persist();
  }

  function upsertAddress(input: UpsertAddressInput): DeliveryAddress {
    ensureLoaded();

    const now = Date.now();
    const payload: DeliveryAddress = {
      id: input.id || crypto.randomUUID(),
      label: input.label.trim() || "其他",
      recipientName: input.recipientName.trim() || "收件人",
      phone: input.phone?.trim() || undefined,
      countryCode: input.countryCode.trim().toUpperCase(),
      countryName: input.countryName.trim(),
      city: input.city.trim(),
      addressLine: input.addressLine.trim(),
      lat: input.lat,
      lon: input.lon,
      isDefault: !!input.isDefault,
      createdAt: now,
      updatedAt: now,
    };

    const index = addresses.value.findIndex((a) => a.id === payload.id);
    if (index >= 0) {
      payload.createdAt = addresses.value[index].createdAt;
      addresses.value[index] = payload;
    } else {
      addresses.value.unshift(payload);
    }

    if (payload.isDefault) {
      setDefaultAddress(payload.id);
      return addresses.value.find((a) => a.id === payload.id) as DeliveryAddress;
    }

    persist();
    return payload;
  }

  function deleteAddress(id: string) {
    ensureLoaded();
    const target = addresses.value.find((a) => a.id === id);
    addresses.value = addresses.value.filter((a) => a.id !== id);

    if (target?.isDefault && addresses.value.length > 0) {
      addresses.value[0].isDefault = true;
      addresses.value[0].updatedAt = Date.now();
    }

    persist();
  }

  function searchAddresses(keyword: string): DeliveryAddress[] {
    ensureLoaded();
    const q = keyword.trim().toLowerCase();
    if (!q) return sortedAddresses.value;

    return sortedAddresses.value.filter((addr) => {
      const text = [addr.label, addr.recipientName, addr.city, addr.addressLine, addr.countryName]
        .join(" ")
        .toLowerCase();
      return text.includes(q);
    });
  }

  return {
    addresses,
    sortedAddresses,
    defaultAddress,
    ensureLoaded,
    searchAddresses,
    upsertAddress,
    deleteAddress,
    setDefaultAddress,
  };
});
