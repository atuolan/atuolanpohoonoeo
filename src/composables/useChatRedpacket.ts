import { formatClaimAmount } from "@/utils/chatScreenHelpers";
import {
  initRedPacketState,
  applyClaim as applyRedpacketClaim,
  canClaim as canClaimRedpacket,
} from "@/services/RedPacketService";
import { useGameEconomyStore } from "@/stores/gameEconomy";
import { ref, type Ref } from "vue";

const GLOBAL_WALLET_ID = "global";

export function useChatRedpacket(context: {
  messages: Ref<any[]>;
  currentCharacter: Ref<any>;
  characterName: string;
  effectivePersona: Ref<any>;
  userStore: any;
  groupMetadata: Ref<any>;
  charactersStore: any;
  saveChatImmediate: () => Promise<void>;
  showToast?: (msg: string) => void;
}) {
  const gameEconomyStore = useGameEconomyStore();

  const voiceClaimModalState = ref<{
    visible: boolean;
    messageId: string;
    phrase: string;
    blessing: string;
  }>({ visible: false, messageId: "", phrase: "", blessing: "" });

  function getUserDisplayName(): string {
    return (
      context.effectivePersona.value?.name ||
      context.userStore.currentPersona?.name ||
      "User"
    );
  }

  function getCharacterDisplayNameFromMessage(msg?: any): string {
    return (
      msg?.senderCharacterName ||
      context.currentCharacter.value?.nickname ||
      context.currentCharacter.value?.data?.name ||
      context.characterName ||
      "角色"
    );
  }

  function getRedpacketPayerName(msg: any): string {
    if (msg.role === "user") return getUserDisplayName();
    return getCharacterDisplayNameFromMessage(msg);
  }

  function createTransactionClaimNoticeMessage(options: {
    claimerName: string;
    payerName: string;
    kind: "轉帳" | "紅包";
    amount: number;
    timestamp?: number;
    idSuffix?: string;
  }): any {
    const timestamp = options.timestamp ?? Date.now();
    const suffix = options.idSuffix ?? Math.random().toString(36).slice(2, 6);
    return {
      id: `msg_claim_${timestamp}_${suffix}`,
      role: "user",
      content: `${options.claimerName}領取了${options.payerName}的${options.kind}${formatClaimAmount(options.amount)}元`,
      timestamp,
      isTransactionClaimNotice: true,
    };
  }

  async function executeUserRedpacketClaim(msg: any, claimerDisplayName: string) {
    const cents = applyRedpacketClaim(msg, claimerDisplayName, undefined, true);
    if (cents <= 0) return;
    msg.redpacketState = { ...msg.redpacketState!, claims: [...msg.redpacketState!.claims] };
    const yuan = cents / 100;
    gameEconomyStore.earnMoney(
      GLOBAL_WALLET_ID,
      yuan,
      "transfer",
      `領取${msg.senderCharacterName ? msg.senderCharacterName + "的" : ""}紅包`,
    );
    await gameEconomyStore.saveState(GLOBAL_WALLET_ID);
    context.messages.value.push(
      createTransactionClaimNoticeMessage({
        claimerName: claimerDisplayName,
        payerName: getRedpacketPayerName(msg),
        kind: "紅包",
        amount: yuan,
        idSuffix: "rpc_user",
      }),
    );
    context.showToast?.(`你領到 ¥${yuan.toFixed(2)}`);
    await context.saveChatImmediate();
  }

  const onMessageClaimRedpacket = async (...args: unknown[]) => {
    const id = typeof args[0] === "string" ? args[0] : "";
    if (!id) return;
    const msg = context.messages.value.find((m) => m.id === id);
    if (!msg || !msg.isRedpacket || !msg.redpacketData) return;
    if (!msg.redpacketState) {
      msg.redpacketState = initRedPacketState(msg.redpacketData);
    }
    const userName = getUserDisplayName();

    if (msg.redpacketData.type === "voice") {
      const phrase = (msg.redpacketData.voice || msg.redpacketData.password || "").trim();
      if (phrase) {
        const pre = canClaimRedpacket(msg, userName, true);
        if (!pre.ok) {
          if (pre.reason === "exhausted") context.showToast?.("紅包已被領完");
          return;
        }
        voiceClaimModalState.value = {
          visible: true,
          messageId: id,
          phrase,
          blessing: msg.redpacketData.blessing || "",
        };
        return;
      }
    }

    const check = canClaimRedpacket(msg, userName, true);
    if (!check.ok) {
      if (check.reason === "exhausted") {
        context.showToast?.("紅包已被領完");
      } else if (check.reason === "not-target") {
        const target = (msg.redpacketData.target || "").trim();
        const aiMemberNames: string[] = [];
        const gm = context.groupMetadata.value;
        if (gm?.isMultiCharCard && gm.multiCharMembers) {
          aiMemberNames.push(...gm.multiCharMembers.map((m: any) => (m.name || "").trim()));
        } else if (gm?.members) {
          for (const member of gm.members) {
            const ch = context.charactersStore.characters.find((c: any) => c.id === member.characterId);
            const name = ch?.nickname || ch?.data?.name;
            if (name) aiMemberNames.push(name.trim());
          }
        }
        if (!aiMemberNames.some((n) => n === target)) {
          await executeUserRedpacketClaim(msg, target || userName);
          return;
        }
        context.showToast?.(`這是給 ${msg.redpacketData.target} 的專屬紅包`);
      }
      return;
    }
    await executeUserRedpacketClaim(msg, userName);
  };

  async function handleVoiceRedpacketSubmit(text: string) {
    const id = voiceClaimModalState.value.messageId;
    const msg = context.messages.value.find((m) => m.id === id);
    if (!msg || !msg.isRedpacket || !msg.redpacketData) {
      voiceClaimModalState.value.visible = false;
      return;
    }
    context.messages.value.push({
      id: `msg_${Date.now()}_rpc_voice`,
      role: "user",
      content: text,
      timestamp: Date.now(),
    });
    voiceClaimModalState.value.visible = false;
    await executeUserRedpacketClaim(msg, getUserDisplayName());
  }

  return {
    voiceClaimModalState,
    createTransactionClaimNoticeMessage,
    executeUserRedpacketClaim,
    onMessageClaimRedpacket,
    handleVoiceRedpacketSubmit,
    getUserDisplayName,
    getCharacterDisplayNameFromMessage,
    getRedpacketPayerName,
  };
}
