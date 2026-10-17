import { beforeEach, describe, expect, it, vi } from "vitest";

const { stores } = vi.hoisted(() => ({
  stores: { books: new Map<string, any>(), appSettings: new Map<string, any>() } as Record<string, Map<string, any>>,
}));

vi.mock("@/db/database", () => ({
  DB_STORES: { BOOKS: "books", BOOK_PROGRESS: "bookProgress", APP_SETTINGS: "appSettings" },
  db: {
    get: vi.fn(async (s: string, k: string) => stores[s]?.get(k)),
    getAll: vi.fn(async (s: string) => [...(stores[s]?.values() ?? [])]),
    getAllKeys: vi.fn(async (s: string) => [...(stores[s]?.keys() ?? [])]),
    put: vi.fn(async (s: string, v: any) => {
      stores[s].set(v.id, v);
      return v.id;
    }),
    delete: vi.fn(async (s: string, k: string) => {
      stores[s]?.delete(k);
    }),
  },
}));

import { BookService } from "@/services/BookService";

function book(id: string, title: string) {
  return {
    id,
    title,
    format: "txt",
    chapters: [{ id: `${id}-c1`, title: "一", content: "北冥有魚", order: 0 }],
    totalChars: 4,
    createdAt: 1,
    updatedAt: 1,
  };
}

beforeEach(() => {
  stores.books.clear();
  stores.appSettings.clear();
});

describe("書架索引", () => {
  it("沒有索引時從書本建出來，且不含內文", async () => {
    stores.books.set("a", book("a", "莊子"));
    const shelf = await BookService.getShelf();
    expect(shelf).toHaveLength(1);
    expect(shelf[0]).toMatchObject({ id: "a", title: "莊子", chapterTitles: ["一"], chapterLengths: [4] });
    expect(JSON.stringify(shelf)).not.toContain("北冥有魚");
    expect(stores.appSettings.get("book-shelf-index").books.a.title).toBe("莊子");
  });

  it("備份還原多出的書會補進來，已刪的書會移掉", async () => {
    stores.appSettings.set("book-shelf-index", {
      id: "book-shelf-index",
      books: { gone: { id: "gone", title: "舊書" } },
    });
    stores.books.set("b", book("b", "紅樓夢"));
    const shelf = await BookService.getShelf();
    expect(shelf.map((m) => m.id)).toEqual(["b"]);
  });

  it("刪書時一起從索引移掉", async () => {
    stores.books.set("a", book("a", "莊子"));
    await BookService.getShelf();
    await BookService.deleteBook("a");
    expect(stores.appSettings.get("book-shelf-index").books).toEqual({});
  });
});
