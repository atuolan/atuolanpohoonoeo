/**
 * 聊天裝扮表情包 → 表情包面板的分類
 *
 * 從擁有紀錄算出來、不寫進資料庫，所以備份與同步都不用管；分類和表情都是唯讀。
 */
import { CHAT_SKIN_STICKER_PACKS, getChatSkinSeries } from "@/data/chatSkins";
import type { StickerCategory } from "@/types/sticker";

export const SKIN_PACK_CATEGORY_PREFIX = "skin-pack:";

export function buildSkinStickerCategories(owned: readonly string[]): StickerCategory[] {
  return CHAT_SKIN_STICKER_PACKS.filter((pack) => owned.includes(pack.id)).map((pack) => ({
    id: `${SKIN_PACK_CATEGORY_PREFIX}${pack.id}`,
    name: getChatSkinSeries(pack.seriesId)?.name ?? pack.name,
    icon: pack.icon,
    isCustom: false,
    isSkinPack: true,
    stickers: pack.stickers.map((sticker, i) => ({
      id: `${pack.id}-${i + 1}`,
      name: sticker.name,
      url: sticker.file,
      emotion: sticker.emotion,
      readOnly: true,
    })),
  }));
}
