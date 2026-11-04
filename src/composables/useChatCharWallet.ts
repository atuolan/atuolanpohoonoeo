/**
 * 聊天裡的錢跟角色帳戶接起來：
 * - 收下角色的轉帳、領角色的紅包 → 從角色帳戶扣，不夠就失敗
 * - 角色收下使用者的轉帳 → 入角色帳戶；那一輪被換掉、改成退回 → 還原
 *
 * 多人卡的子角色沒有自己的角色卡，不扣帳戶（照舊做法）。
 */
import {
  creditCharWallet,
  debitCharWallet,
  revertCharWalletEntries,
  type CharWalletDebitResult,
} from "@/services/charWallet";

export interface WalletMessage {
  id: string;
  role: string;
  isTransfer?: boolean;
  transferType?: "pay" | "refund";
  transferAmount?: number;
  transferStatus?: "sent" | "pending" | "received" | "refunded";
  isUserRecalled?: boolean;
  senderCharacterName?: string;
  /** 這則轉帳記在角色帳戶的哪一筆（使用者轉給角色、角色收下時） */
  charWalletEntryId?: string;
  /** 使用者轉給角色時，入的是哪個角色的帳戶 */
  charWalletCharacterId?: string;
}

export interface ChatCharWalletDeps {
  chatId: () => string | undefined;
  /** 訊息是哪個角色送的（群聊用 senderCharacterName 對成員），對不到回 null */
  characterIdOf: (msg: Pick<WalletMessage, "role" | "senderCharacterName">) => string | null;
  /** 收入算到哪一天用的劇情時間 */
  storyNow: () => number;
  /** 使用者轉帳給誰（單人聊天是這個角色；群聊轉帳沒有對象，回 null） */
  userTransferTargetId: () => string | null;
}

export function useChatCharWallet(deps: ChatCharWalletDeps) {
  /** 角色付錢給使用者（收下轉帳、領紅包）；對不到角色時照舊直接成功 */
  async function chargeCharacter(
    msg: Pick<WalletMessage, "id" | "role" | "senderCharacterName">,
    amount: number,
    kind: "to_user" | "redpacket",
    description: string,
  ): Promise<CharWalletDebitResult & { characterId: string | null }> {
    const characterId = deps.characterIdOf(msg);
    if (!characterId || !(amount > 0)) return { ok: true, balance: 0, characterId: null };
    const result = await debitCharWallet({
      characterId,
      amount,
      kind,
      description,
      storyNowMs: deps.storyNow(),
      chatId: deps.chatId(),
      messageId: msg.id,
    });
    return { ...result, characterId };
  }

  /**
   * 使用者轉給角色的錢對到角色帳戶：收下的入帳，不再是收下的（退回、被換掉那一輪）還原。
   * 重複呼叫不會重複入帳。回傳有沒有改到訊息（要存檔）。
   */
  async function syncUserTransfers(messages: WalletMessage[]): Promise<boolean> {
    let changed = false;
    for (const m of messages) {
      if (m.role !== "user" || !m.isTransfer || m.transferType === "refund") continue;
      const received = m.transferStatus === "received" && !m.isUserRecalled && (m.transferAmount ?? 0) > 0;

      if (received && !m.charWalletEntryId) {
        const characterId = deps.userTransferTargetId();
        if (!characterId) continue;
        const { entryId } = await creditCharWallet({
          characterId,
          amount: m.transferAmount!,
          kind: "from_user",
          description: "收到轉帳",
          storyNowMs: deps.storyNow(),
          chatId: deps.chatId(),
          messageId: m.id,
        });
        m.charWalletEntryId = entryId;
        m.charWalletCharacterId = characterId;
        changed = true;
      } else if (!received && m.charWalletEntryId) {
        const entryId = m.charWalletEntryId;
        if (m.charWalletCharacterId) {
          await revertCharWalletEntries(m.charWalletCharacterId, (e) => e.id === entryId);
        }
        m.charWalletEntryId = undefined;
        m.charWalletCharacterId = undefined;
        changed = true;
      }
    }
    return changed;
  }

  return { chargeCharacter, syncUserTransfers };
}
