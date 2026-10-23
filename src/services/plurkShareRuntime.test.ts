import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PlurkShareSnapshot } from "@/types/chat";
import type { QZonePost } from "@/types/qzone";
import { lookupPlurkShareCandidate, plurkRef } from "@/utils/plurkShare";

const store = {
  posts: [] as QZonePost[],
  settings: {} as Record<string, unknown>,
  isLoaded: true,
  loadPosts: vi.fn(async () => {}),
  addComment: vi.fn(async (_postId: string, _draft: Record<string, unknown>) => ({ id: "new-c" })),
  deleteComment: vi.fn(async (_postId: string, _commentId: string) => {}),
};

vi.mock("@/stores/qzone", () => ({ useQzoneStore: () => store }));

vi.mock("@/stores/characters", () => ({
  useCharactersStore: () => ({
    getCharacterById: (id: string) =>
      id === "char-a" ? { id: "char-a", nickname: "阿杏", data: { name: "阿杏" } } : null,
  }),
}));

vi.mock("@/services/plurkCast", () => ({
  buildCastContext: async () => ({
    allCharacterIds: ["char-a", "char-b"],
    friendIds: new Set(["char-a", "char-b"]),
    mutedIds: new Set<string>(),
  }),
  getViewerIds: (post: QZonePost) => post.privateTo ?? ["char-a", "char-b"],
}));

const { applyCharPlurkComment, buildPlurkShareGuideForChat, removePlurkActivity, restorePlurkActivity } =
  await import("./plurkShareRuntime");

function makePost(id: string, extra: Partial<QZonePost> = {}): QZonePost {
  return {
    id,
    authorId: "user",
    username: "我",
    type: "shuoshuo",
    content: `噗 ${id}`,
    timestamp: 1000,
    comments: [],
    likes: [],
    visibility: "public",
    audience: "all",
    authorType: "user",
    ...extra,
  } as QZonePost;
}

function makeShare(postId: string, extra: Partial<PlurkShareSnapshot> = {}): PlurkShareSnapshot {
  return {
    ref: plurkRef(postId),
    postId,
    sharedBy: "user",
    authorKind: "char",
    authorName: "阿杏",
    audience: "all",
    text: "嗨",
    imageCount: 0,
    postedAt: 1000,
    responseCount: 0,
    recentResponses: [],
    ...extra,
  };
}

describe("噗浪分享執行層", () => {
  beforeEach(() => {
    store.posts = [];
    store.settings = {};
    store.isLoaded = true;
    store.addComment.mockClear();
    store.deleteComment.mockClear();
    store.loadPosts.mockClear();
  });

  it("聊天裡分享過的噗，看得到就能留言", async () => {
    store.posts = [makePost("p1", { authorId: "char-a", username: "阿杏", authorType: "ai" })];
    const history = [{ plurkShare: makeShare("p1") }];

    const guide = await buildPlurkShareGuideForChat({ characterId: "char-a", history, shareCount: 0 });
    expect(guide).toContain("<plurk-comment");
    expect(guide).not.toContain("<share-plurk");
  });

  it("shareCount 3 時挑 3 則最近的噗，代號查得回來", async () => {
    store.posts = ["p1", "p2", "p3", "p4", "p5"].map((id, i) => makePost(id, { timestamp: 1000 + i }));
    const guide = await buildPlurkShareGuideForChat({ characterId: "char-a", history: [], shareCount: 3 });

    expect(guide).toContain("最近的噗：");
    const lines = guide.split("\n").filter((l) => l.includes("· ref="));
    expect(lines).toHaveLength(3);

    const refs = lines.map((l) => /ref=([0-9a-z]+)/.exec(l)![1]);
    expect(lookupPlurkShareCandidate(refs[0])?.postId).toBe("p5");
  });

  it("角色自己的偷偷說不能留言", async () => {
    store.posts = [makePost("p1", { authorId: "char-a", authorType: "ai", anonOf: "char-a", audience: "anon" })];
    const history = [{ plurkShare: makeShare("p1") }];

    const guide = await buildPlurkShareGuideForChat({ characterId: "char-a", history, shareCount: 0 });
    expect(guide).not.toContain("<plurk-comment");
  });

  it("角色留言：一般噗新增留言、單則回應帶 replyToId", async () => {
    store.posts = [
      makePost("p1", { authorId: "char-a", authorType: "ai" }),
      makePost("p2", {
        authorId: "user",
        comments: [
          { id: "c1", authorId: "char-b", username: "小美", avatar: "", content: "原回應", timestamp: 1 },
        ],
      }),
    ];
    const character = { id: "char-a", name: "阿杏", avatar: "a.png" };

    const plain = await applyCharPlurkComment({
      character,
      history: [{ plurkShare: makeShare("p1") }],
      comment: { content: " 好喔 " },
    });
    expect(store.addComment).toHaveBeenCalledTimes(1);
    expect(plain?.commentId).toBe("new-c");
    expect(plain?.content).toBe("好喔");

    store.addComment.mockClear();
    const reply = await applyCharPlurkComment({
      character,
      history: [{ plurkShare: makeShare("p2", { comment: { id: "c1", name: "小美", text: "原回應" } }) }],
      comment: { content: "回你", qualifier: "覺得" },
    });
    expect(reply?.replyToId).toBe("c1");
    const draft = store.addComment.mock.calls[0][1] as Record<string, unknown>;
    expect(draft.replyToId).toBe("c1");
    expect(draft.qualifier).toBe("覺得");
  });

  it("看不到的私噗不留言，空白內容也不留言", async () => {
    store.posts = [makePost("p1", { authorId: "char-b", authorType: "ai", audience: "private", privateTo: ["char-b"] })];
    const character = { id: "char-a", name: "阿杏" };

    const hidden = await applyCharPlurkComment({
      character,
      history: [{ plurkShare: makeShare("p1") }],
      comment: { content: "偷看" },
    });
    expect(hidden).toBeNull();
    expect(store.addComment).not.toHaveBeenCalled();

    const empty = await applyCharPlurkComment({
      character,
      history: [{ plurkShare: makeShare("p1") }],
      comment: { content: "   " },
    });
    expect(empty).toBeNull();
    expect(store.addComment).not.toHaveBeenCalled();
  });

  it("換輪次時刪掉留言、換回來時補回留言", async () => {
    store.posts = [
      makePost("p1", {
        authorId: "char-a",
        authorType: "ai",
        comments: [{ id: "c-old", authorId: "char-a", username: "阿杏", avatar: "", content: "晚安", timestamp: 2 }],
      }),
    ];
    const activity = { postId: "p1", commentId: "c-old", content: "午安", qualifier: "說" };

    await removePlurkActivity(activity);
    expect(store.deleteComment).toHaveBeenCalledWith("p1", "c-old");

    store.posts = [makePost("p1", { authorId: "char-a", authorType: "ai" })];

    const restored = await restorePlurkActivity(activity, { id: "char-a", name: "阿杏" });
    expect(store.addComment).toHaveBeenCalledTimes(1);
    expect(restored?.commentId).toBe("new-c");
    expect(restored?.content).toBe("午安");
  });
});
