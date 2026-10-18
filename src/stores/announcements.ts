/**
 * 作者公告 — Pinia Store
 * 管理開 App 時跳的明信片、203 號房的信箱、完整行程頁
 */

import {
  loadAnnouncementRecords,
  loadAnnouncements,
  markAnnouncements,
  planAnnouncementPopup,
  type Announcement,
  type AnnouncementStatus,
} from "@/services/AnnouncementService";
import { defineStore } from "pinia";
import { computed, ref } from "vue";

export const useAnnouncementStore = defineStore("announcements", () => {
  const items = ref<Announcement[]>([]);
  const statuses = ref<Record<string, AnnouncementStatus>>({});
  const loaded = ref(false);

  const popupId = ref<string | null>(null);
  const itineraryId = ref<string | null>(null);
  const mailboxOpen = ref(false);

  const findById = (id: string | null) =>
    id ? (items.value.find((item) => item.id === id) ?? null) : null;

  const popup = computed(() => findById(popupId.value));
  const itinerary = computed(() => findById(itineraryId.value));
  const unreadCount = computed(
    () => items.value.filter((item) => statuses.value[item.id] !== "read").length,
  );
  /** 信箱裡除了正在跳的這張以外，還沒拆的張數 */
  const otherUnreadCount = computed(
    () =>
      items.value.filter(
        (item) => item.id !== popupId.value && statuses.value[item.id] !== "read",
      ).length,
  );

  function isRead(id: string): boolean {
    return statuses.value[id] === "read";
  }

  async function setStatus(ids: string[], status: AnnouncementStatus): Promise<void> {
    // seen 不能蓋掉 read
    const targets = status === "seen" ? ids.filter((id) => !isRead(id)) : ids;
    if (targets.length === 0) return;
    statuses.value = {
      ...statuses.value,
      ...Object.fromEntries(targets.map((id) => [id, status])),
    };
    await markAnnouncements(targets, status);
  }

  let initPromise: Promise<void> | null = null;

  /** 啟動時呼叫一次：載入信箱，決定要不要跳明信片 */
  function init(): Promise<void> {
    if (!initPromise) {
      initPromise = (async () => {
        const [list, records] = await Promise.all([
          loadAnnouncements(),
          loadAnnouncementRecords(),
        ]);
        items.value = list;
        loaded.value = true;
        // 讀不到紀錄時不跳，免得把所有人當成新用戶
        if (!records) return;
        statuses.value = Object.fromEntries(records);
        const plan = planAnnouncementPopup(list, records);
        await setStatus(plan.markRead, "read");
        await setStatus(plan.markSeen, "seen");
        popupId.value = plan.popupId;
      })();
    }
    return initPromise;
  }

  /** 收下了：標成已讀，關掉這則的明信片和完整行程 */
  async function receive(id: string): Promise<void> {
    if (popupId.value === id) popupId.value = null;
    if (itineraryId.value === id) itineraryId.value = null;
    await setStatus([id], "read");
  }

  /** 稍後再看：不再跳，留在信箱裡 */
  function later(): void {
    popupId.value = null;
  }

  function openItinerary(id: string): void {
    itineraryId.value = id;
    // 看了完整行程就算拆開了；電報還是要按「收下了」
    if (findById(id)?.level !== "critical") void setStatus([id], "read");
  }

  function closeItinerary(): void {
    itineraryId.value = null;
  }

  function openMailbox(): void {
    popupId.value = null;
    mailboxOpen.value = true;
    void init();
  }

  function closeMailbox(): void {
    mailboxOpen.value = false;
  }

  return {
    items,
    statuses,
    loaded,
    popup,
    itinerary,
    mailboxOpen,
    unreadCount,
    otherUnreadCount,
    isRead,
    init,
    receive,
    later,
    openItinerary,
    closeItinerary,
    openMailbox,
    closeMailbox,
  };
});
