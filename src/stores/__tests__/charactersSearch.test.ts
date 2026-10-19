import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it } from "vitest";

import { useCharactersStore } from "@/stores/characters";
import { createDefaultStoredCharacter, type StoredCharacter } from "@/types/character";

function makeCharacter(id: string, overrides: {
  nickname?: string;
  name: string;
  creator?: string;
  tags?: string[];
}): StoredCharacter {
  const base = createDefaultStoredCharacter();
  return {
    ...base,
    id,
    nickname: overrides.nickname ?? "",
    data: {
      ...base.data,
      name: overrides.name,
      creator: overrides.creator ?? "",
      tags: overrides.tags ?? [],
    },
  };
}

describe("角色庫搜尋", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it("有暱稱時用本名也搜得到，也比對標籤和創建者", () => {
    const store = useCharactersStore();
    store.characters = [
      makeCharacter("a", { nickname: "阿堯", name: "譚堯", tags: ["古風"] }),
      makeCharacter("b", { name: "片桐稔", creator: "小白" }),
    ];

    store.setSearchQuery("譚堯");
    expect(store.filteredCharacters.map((c) => c.id)).toEqual(["a"]);

    store.setSearchQuery("古風");
    expect(store.filteredCharacters.map((c) => c.id)).toEqual(["a"]);

    store.setSearchQuery("小白");
    expect(store.filteredCharacters.map((c) => c.id)).toEqual(["b"]);

    store.setSearchQuery("  ");
    expect(store.filteredCharacters).toHaveLength(2);
  });
});
