/**
 * 導入帶內嵌世界書的角色卡：世界書轉成世界書庫裡的一本並綁定，
 * 卡上不再留 character_book，聊天時同樣的條目才不會送兩次。
 */
import "fake-indexeddb/auto";
import { deleteDB } from "idb";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { closeDatabase, db, DB_STORES } from "@/db/database";
import { getImportExportService } from "@/services/ImportExportService";
import type { StoredCharacter } from "@/types/character";

beforeEach(async () => {
  closeDatabase();
  await deleteDB("aguaphone-db");
  await db.init();
});

afterEach(() => {
  closeDatabase();
});

function cardFile(card: unknown): File {
  return new File([JSON.stringify(card)], "card.json", {
    type: "application/json",
  });
}

describe("導入角色卡的內嵌世界書", () => {
  it("轉成世界書庫的一本並綁定，卡上不留內嵌那份", async () => {
    const result = await getImportExportService().importFromJson(
      cardFile({
        spec: "chara_card_v2",
        spec_version: "2.0",
        data: {
          name: "譚堯",
          description: "描述",
          first_mes: "你好",
          character_book: {
            name: "譚堯的世界",
            entries: [
              {
                id: 0,
                keys: ["學校"],
                secondary_keys: [],
                comment: "學校",
                content: "一所高中",
                constant: false,
                selective: false,
                insertion_order: 100,
                enabled: true,
                position: "before_char",
                use_regex: false,
                extensions: {},
              },
            ],
          },
        },
      }),
    );

    expect(result.success).toBe(true);
    expect(result.character?.lorebookIds).toHaveLength(1);
    expect(result.character?.data.character_book).toBeUndefined();

    const stored = await db.get<StoredCharacter>(
      DB_STORES.CHARACTERS,
      result.character!.id,
    );
    expect(stored?.data.character_book).toBeUndefined();
    expect(stored?.lorebookIds).toEqual(result.character?.lorebookIds);
  });
});
