import type { ComputedRef } from "vue";
import type { GroupChatMetadata } from "@/types/chat";

/**
 * 群聊成員管理（管理員、禁言、移除）
 * 群名、頭像、加成員等都在群組詳情頁（ChatDetailsScreen）即時修改
 */
export function useChatGroupSettings(deps: {
  groupMetadata: ComputedRef<GroupChatMetadata | undefined>;
}) {
  function toggleGroupMemberAdmin(characterId: string) {
    const member = deps.groupMetadata.value?.members.find(
      (m) => m.characterId === characterId,
    );
    if (member) member.isAdmin = !member.isAdmin;
  }

  function toggleGroupMemberMute(characterId: string) {
    const member = deps.groupMetadata.value?.members.find(
      (m) => m.characterId === characterId,
    );
    if (member) member.isMuted = !member.isMuted;
  }

  /** 移除成員；群裡至少要留 2 位 */
  function removeGroupMember(characterId: string) {
    const meta = deps.groupMetadata.value;
    if (!meta) return;
    if (meta.members.length <= 2) {
      alert("群聊至少需要 2 位成員");
      return;
    }
    meta.members = meta.members.filter((m) => m.characterId !== characterId);
  }

  return {
    toggleGroupMemberAdmin,
    toggleGroupMemberMute,
    removeGroupMember,
  };
}
