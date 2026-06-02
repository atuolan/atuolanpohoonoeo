import { ref, type ComputedRef } from "vue";
import type { MultiCharMember } from "@/types/chat";

export function useMultiCharMembers(context: {
  groupMetadata: ComputedRef<any>;
}) {
  const showAddMultiCharMember = ref(false);
  const newMultiCharName = ref("");
  const newMultiCharAvatar = ref("");
  const multiCharAvatarInput = ref<HTMLInputElement | null>(null);
  const editingMultiCharId = ref<string | null>(null);
  const failedMultiCharAvatars = ref(new Set<string>());

  // 代理外部圖片 URL（繞過 CORS/CSP）
  function getProxiedUrl(url: string): string {
    if (
      !url ||
      url.startsWith("data:") ||
      url.startsWith("blob:") ||
      url.startsWith("/")
    ) {
      return url;
    }

    // 使用 /ai-proxy/ 路徑（nginx 已配置），同時相容 vite dev server 的 /image-proxy
    try {
      const parsed = new URL(url);
      const hostAndPath = parsed.host + parsed.pathname + parsed.search;
      if (parsed.protocol === "https:") {
        return `/ai-proxy/${hostAndPath}`;
      }
      return `/ai-proxy-http/${hostAndPath}`;
    } catch {
      return `/image-proxy?url=${encodeURIComponent(url)}`;
    }
  }

  function triggerMultiCharAvatarUpload() {
    const input = multiCharAvatarInput.value as any;
    if (Array.isArray(input)) {
      const el = input.find((el: any) => el != null);
      el?.click();
    } else {
      input?.click();
    }
  }

  function handleMultiCharAvatarChange(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      newMultiCharAvatar.value = e.target?.result as string;
    };
    reader.readAsDataURL(file);
    // 清空 input 以便重複選擇同一檔案
    input.value = "";
  }

  function addMultiCharMember() {
    if (!context.groupMetadata.value || !newMultiCharName.value.trim()) return;
    if (!context.groupMetadata.value.multiCharMembers) {
      context.groupMetadata.value.multiCharMembers = [];
    }

    if (editingMultiCharId.value) {
      // 編輯模式
      const member = context.groupMetadata.value.multiCharMembers.find(
        (m: MultiCharMember) => m.id === editingMultiCharId.value,
      );
      if (member) {
        member.name = newMultiCharName.value.trim();
        if (newMultiCharAvatar.value) member.avatar = newMultiCharAvatar.value;
      }
    } else {
      // 新增模式
      context.groupMetadata.value.multiCharMembers.push({
        id: `multi_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        name: newMultiCharName.value.trim(),
        avatar: newMultiCharAvatar.value,
      });
    }

    resetMultiCharForm();
  }

  function editMultiCharMember(member: MultiCharMember) {
    editingMultiCharId.value = member.id;
    newMultiCharName.value = member.name;
    newMultiCharAvatar.value = member.avatar;
    showAddMultiCharMember.value = true;
  }

  function removeMultiCharMember(id: string) {
    if (!context.groupMetadata.value?.multiCharMembers) return;
    context.groupMetadata.value.multiCharMembers =
      context.groupMetadata.value.multiCharMembers.filter(
        (m: MultiCharMember) => m.id !== id,
      );
  }

  function resetMultiCharForm() {
    showAddMultiCharMember.value = false;
    newMultiCharName.value = "";
    newMultiCharAvatar.value = "";
    editingMultiCharId.value = null;
  }

  return {
    showAddMultiCharMember,
    newMultiCharName,
    newMultiCharAvatar,
    multiCharAvatarInput,
    editingMultiCharId,
    failedMultiCharAvatars,
    getProxiedUrl,
    triggerMultiCharAvatarUpload,
    handleMultiCharAvatarChange,
    addMultiCharMember,
    editMultiCharMember,
    removeMultiCharMember,
    resetMultiCharForm,
  };
}
