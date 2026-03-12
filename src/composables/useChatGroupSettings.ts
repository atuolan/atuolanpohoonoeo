import { ref, type Ref, type ComputedRef } from "vue";

/**
 * 群聊設定管理功能
 * 從 ChatScreen.vue 抽取的獨立 composable
 */
export function useChatGroupSettings(deps: {
  isGroupChat: ComputedRef<boolean>;
  groupMetadata: ComputedRef<any>;
  showChatInfoModal: Ref<boolean>;
  saveChatImmediate: () => Promise<void>;
  resetMultiCharForm: () => void;
}) {
  const showGroupSettingsModal = ref(false);
  const editGroupName = ref("");
  const editGroupLorebookIds = ref<string[]>([]);
  const groupAvatarInput = ref<HTMLInputElement | null>(null);

  function handleOpenGroupSettings() {
    if (!deps.isGroupChat.value || !deps.groupMetadata.value) return;
    deps.showChatInfoModal.value = false;
    editGroupName.value = deps.groupMetadata.value.groupName;
    editGroupLorebookIds.value = [
      ...(deps.groupMetadata.value.lorebookIds || []),
    ];
    showGroupSettingsModal.value = true;
  }

  function closeGroupSettings() {
    showGroupSettingsModal.value = false;
    deps.resetMultiCharForm();
  }

  function toggleGroupLorebook(lorebookId: string) {
    const idx = editGroupLorebookIds.value.indexOf(lorebookId);
    if (idx === -1) {
      editGroupLorebookIds.value.push(lorebookId);
    } else {
      editGroupLorebookIds.value.splice(idx, 1);
    }
  }

  function triggerGroupAvatarUpload() {
    groupAvatarInput.value?.click();
  }

  function handleGroupAvatarChange(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file || !deps.groupMetadata.value) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      if (deps.groupMetadata.value) {
        deps.groupMetadata.value.groupAvatar = e.target?.result as string;
      }
    };
    reader.readAsDataURL(file);
    input.value = "";
  }

  function removeGroupAvatar() {
    if (deps.groupMetadata.value) {
      deps.groupMetadata.value.groupAvatar = undefined;
    }
  }

  async function saveGroupSettings() {
    if (!deps.groupMetadata.value) return;
    deps.groupMetadata.value.groupName =
      editGroupName.value.trim() || deps.groupMetadata.value.groupName;
    deps.groupMetadata.value.lorebookIds = [...editGroupLorebookIds.value];
    await deps.saveChatImmediate();
    closeGroupSettings();
  }

  function toggleGroupMemberAdmin(characterId: string) {
    if (!deps.groupMetadata.value) return;
    const member = deps.groupMetadata.value.members.find(
      (m: any) => m.characterId === characterId,
    );
    if (member) member.isAdmin = !member.isAdmin;
  }

  function toggleGroupMemberMute(characterId: string) {
    if (!deps.groupMetadata.value) return;
    const member = deps.groupMetadata.value.members.find(
      (m: any) => m.characterId === characterId,
    );
    if (member) member.isMuted = !member.isMuted;
  }

  function removeGroupMember(characterId: string) {
    if (!deps.groupMetadata.value) return;
    const members = deps.groupMetadata.value.members;
    if (members.length <= 2) {
      alert("群聊至少需要 2 位成員");
      return;
    }
    deps.groupMetadata.value.members = members.filter(
      (m: any) => m.characterId !== characterId,
    );
  }

  function addMemberToGroup(characterId: string) {
    if (!deps.groupMetadata.value) return;
    const exists = deps.groupMetadata.value.members.some(
      (m: any) => m.characterId === characterId,
    );
    if (exists) return;
    deps.groupMetadata.value.members.push({
      characterId,
      isAdmin: false,
      isMuted: false,
      joinedAt: Date.now(),
    });
  }

  return {
    showGroupSettingsModal,
    editGroupName,
    editGroupLorebookIds,
    groupAvatarInput,
    handleOpenGroupSettings,
    closeGroupSettings,
    toggleGroupLorebook,
    triggerGroupAvatarUpload,
    handleGroupAvatarChange,
    removeGroupAvatar,
    saveGroupSettings,
    toggleGroupMemberAdmin,
    toggleGroupMemberMute,
    removeGroupMember,
    addMemberToGroup,
  };
}
