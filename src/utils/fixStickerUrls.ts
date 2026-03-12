/**
 * 自動修復表情包 URL
 * 將錯誤的 aguacloud.uk 修正為 aguacloudreve.aguacloud.uk
 */

import { db, DB_STORES } from "@/db/database";

export async function autoFixStickerUrls(): Promise<{
  fixed: number;
  total: number;
}> {
  try {
    console.log("[FixStickerUrls] 開始檢查表情包 URL...");

    // 獲取所有表情包分類
    const categories = await db.getAll(DB_STORES.STICKERS);

    let totalFixed = 0;
    let totalStickers = 0;

    for (const category of categories) {
      if (!category.stickers || !Array.isArray(category.stickers)) {
        continue;
      }

      let categoryFixed = 0;

      for (const sticker of category.stickers) {
        totalStickers++;

        // 檢查是否需要修復
        if (
          sticker.url &&
          sticker.url.includes("aguacloud.uk") &&
          !sticker.url.includes("aguacloudreve")
        ) {
          const oldUrl = sticker.url;
          sticker.url = sticker.url.replace(
            "aguacloud.uk",
            "aguacloudreve.aguacloud.uk",
          );

          console.log(
            `[FixStickerUrls] 修復: ${sticker.name}`,
            oldUrl,
            "→",
            sticker.url,
          );

          categoryFixed++;
          totalFixed++;
        }
      }

      // 如果這個分類有修復，保存回數據庫
      if (categoryFixed > 0) {
        await db.put(DB_STORES.STICKERS, category);
        console.log(
          `[FixStickerUrls] 分類「${category.name}」已更新 (${categoryFixed} 個表情包)`,
        );
      }
    }

    if (totalFixed > 0) {
      console.log(
        `[FixStickerUrls] ✅ 修復完成！總共修復 ${totalFixed}/${totalStickers} 個表情包`,
      );
    } else {
      console.log(
        `[FixStickerUrls] ✅ 檢查完成，無需修復 (${totalStickers} 個表情包)`,
      );
    }

    return { fixed: totalFixed, total: totalStickers };
  } catch (error) {
    console.error("[FixStickerUrls] 修復失敗:", error);
    return { fixed: 0, total: 0 };
  }
}
