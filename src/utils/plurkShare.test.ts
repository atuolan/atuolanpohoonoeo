import { describe, it, expect } from "vitest";
import type { QZonePost, QZoneComment } from "@/types/qzone";
import type { PlurkShareSnapshot } from "@/types/chat";
import {
  PLURK_SHARE_NOTE_REGEX,
  buildPlurkShareGuide,
  buildPlurkShareSnapshot,
  canCharComment,
  describePlurkShareForPrompt,
  formatShareCandidateLine,
  lookupPlurkShareCandidate,
  pickShareCandidates,
  plurkRef,
  plurkShareSummary,
  recentPlurkShares,
  registerPlurkShareCandidates,
  resolvePlurkCommentTarget,
} from "@/utils/plurkShare";

function makeComment(overrides: Partial<QZoneComment> & { id: string }): QZoneComment {
  return {
    authorId: "c1",
    username: "角色一",
    avatar: "a.png",
    content: "內容",
    timestamp: 1000,
    authorType: "ai",
    ...overrides,
  };
}

function makePost(overrides: Partial<QZonePost> & { id: string }): QZonePost {
  return {
    authorId: "c1",
    username: "角色一",
    type: "shuoshuo",
    content: "今天好累",
    timestamp: 1_700_000_000_000,
    comments: [],
    likes: [],
    visibility: "public",
    authorType: "ai",
    ...overrides,
  } as QZonePost;
}

function snapshot(overrides: Partial<PlurkShareSnapshot> = {}): PlurkShareSnapshot {
  return {
    ref: "abcde",
    postId: "post-1",
    sharedBy: "user",
    authorKind: "char",
    authorName: "角色一",
    audience: "all",
    text: "今天好累",
    imageCount: 0,
    postedAt: 1_700_000_000_000,
    responseCount: 0,
    recentResponses: [],
    ...overrides,
  };
}

describe("plurkRef", () => {
  it("同一 id 結果相同、長度 5、只含 base36", () => {
    const a = plurkRef("post-1");
    const b = plurkRef("post-1");
    expect(a).toBe(b);
    expect(a).toHaveLength(5);
    expect(a).toMatch(/^[0-9a-z]{5}$/);
  });

  it("不同 id 結果不同", () => {
    expect(plurkRef("post-1")).not.toBe(plurkRef("post-2"));
  });
});

describe("buildPlurkShareSnapshot", () => {
  it("角色噗", () => {
    const s = buildPlurkShareSnapshot(makePost({ id: "p1" }), {
      sharedBy: "user",
      resolveName: (id, fallback) => (id === "c1" ? "改名後的角色" : fallback || ""),
    });
    expect(s.authorKind).toBe("char");
    expect(s.authorCharacterId).toBe("c1");
    expect(s.authorName).toBe("改名後的角色");
    expect(s.ref).toBe(plurkRef("p1"));
    expect(s.postId).toBe("p1");
  });

  it("user 噗", () => {
    const s = buildPlurkShareSnapshot(
      makePost({ id: "p1", authorId: "u1", authorType: "user", username: "小明" }),
      { sharedBy: "user" }
    );
    expect(s.authorKind).toBe("user");
    expect(s.authorName).toBe("小明");
  });

  it("路人噗", () => {
    const s = buildPlurkShareSnapshot(
      makePost({
        id: "p1",
        authorId: "npc1",
        npc: { id: "npc1", name: "阿明", color: "#fff" },
        onSquare: true,
      }),
      { sharedBy: "user" }
    );
    expect(s.authorKind).toBe("npc");
    expect(s.authorName).toBe("阿明");
    expect(s.audience).toBe("square");
  });

  it("角色偷偷說", () => {
    const s = buildPlurkShareSnapshot(
      makePost({
        id: "p1",
        audience: "anon",
        anonOf: "c1",
        comments: [makeComment({ id: "cm1", authorId: "c2", username: "角色二" })],
      }),
      { sharedBy: "user" }
    );
    expect(s.authorKind).toBe("anon");
    expect(s.authorName.startsWith("偷偷說 #")).toBe(true);
    expect(s.anonOf).toBe("c1");
    expect(s.authorCharacterId).toBeUndefined();
    expect(s.recentResponses[0].name.startsWith("#")).toBe(true);
  });

  it("圖片：只有 https 的當封面", () => {
    const s = buildPlurkShareSnapshot(
      makePost({
        id: "p1",
        images: ["data:image/png;base64,xx", "https://a.b/c.png"],
      }),
      { sharedBy: "user" }
    );
    expect(s.imageCount).toBe(2);
    expect(s.imageUrl).toBe("https://a.b/c.png");
  });

  it("圖片：只有 data: 就沒有封面", () => {
    const s = buildPlurkShareSnapshot(
      makePost({ id: "p1", images: ["data:image/png;base64,xx"] }),
      { sharedBy: "user" }
    );
    expect(s.imageCount).toBe(1);
    expect(s.imageUrl).toBeUndefined();
  });

  it("12 則回應（1 則被刪）→ 11 則、最近 10 則", () => {
    const comments = Array.from({ length: 12 }, (_, i) =>
      makeComment({
        id: `cm${i}`,
        content: `第${i}則`,
        moderation: i === 0 ? { action: "delete", reason: "x", by: "阿杏", at: 0 } : undefined,
      })
    );
    const s = buildPlurkShareSnapshot(makePost({ id: "p1", comments }), { sharedBy: "user" });
    expect(s.responseCount).toBe(11);
    expect(s.recentResponses).toHaveLength(10);
    expect(s.recentResponses[9].text).toBe("第11則");
  });

  it("指定 commentId 帶出單則回應", () => {
    const s = buildPlurkShareSnapshot(
      makePost({
        id: "p1",
        comments: [makeComment({ id: "cm1", content: "這則好笑" })],
      }),
      { sharedBy: "user", commentId: "cm1" }
    );
    expect(s.comment).toBeDefined();
    expect(s.comment?.id).toBe("cm1");
    expect(s.comment?.text).toBe("這則好笑");
  });
});

describe("plurkShareSummary", () => {
  it("整則噗", () => {
    expect(plurkShareSummary(snapshot()).startsWith("[分享噗文] ")).toBe(true);
  });

  it("單則回應", () => {
    const s = snapshot({ comment: { id: "cm1", name: "#1234", text: "好笑" } });
    expect(plurkShareSummary(s).startsWith("[分享噗文回應] ")).toBe(true);
  });

  it("超過 30 字加刪節號", () => {
    const s = snapshot({ text: "一".repeat(40) });
    expect(plurkShareSummary(s)).toContain("…");
  });
});

describe("describePlurkShareForPrompt", () => {
  it("自己的偷偷說（非群聊）", () => {
    const s = snapshot({ authorKind: "anon", authorName: "偷偷說 #1234", anonOf: "c1", audience: "anon" });
    const text = describePlurkShareForPrompt(s, { userName: "小明", charId: "c1" });
    expect(text).toContain("其實是你發的");
  });

  it("別人的偷偷說不加那句", () => {
    const s = snapshot({ authorKind: "anon", authorName: "偷偷說 #1234", anonOf: "c2", audience: "anon" });
    const text = describePlurkShareForPrompt(s, { userName: "小明", charId: "c1" });
    expect(text).not.toContain("其實是你發的");
  });

  it("群聊的偷偷說寫出是誰發的", () => {
    const s = snapshot({ authorKind: "anon", authorName: "偷偷說 #1234", anonOf: "c1", audience: "anon" });
    const text = describePlurkShareForPrompt(s, {
      userName: "小明",
      charId: "c9",
      groupChat: true,
      memberNames: { c1: "小明" },
    });
    expect(text).toContain("其實是 小明 發的");
  });

  it("噗主是自己 / 是使用者", () => {
    const mine = describePlurkShareForPrompt(
      snapshot({ authorKind: "char", authorCharacterId: "c1", authorName: "角色一" }),
      { userName: "小明", charId: "c1" }
    );
    expect(mine).toContain("噗主：你自己");

    const user = describePlurkShareForPrompt(
      snapshot({ authorKind: "user", authorName: "小明" }),
      { userName: "小明", charId: "c1" }
    );
    expect(user).toContain("噗主：小明");
  });

  it("角色分享的噗用單行標記", () => {
    const text = describePlurkShareForPrompt(snapshot({ sharedBy: "char" }), {
      userName: "小明",
      charId: "c1",
    });
    expect(text.startsWith('<share-plurk ref="')).toBe(true);
    expect(text).toContain("[分享噗文：");
  });

  it("單則回應", () => {
    const text = describePlurkShareForPrompt(
      snapshot({ comment: { id: "cm1", name: "#1234", text: "好笑" } }),
      { userName: "小明", charId: "c1" }
    );
    expect(text).toContain("分享了噗浪上的一則回應");
    expect(text).toContain("原噗：");
    expect(text).toContain("回應：");
  });

  it("沒有回應就不寫回應段", () => {
    const text = describePlurkShareForPrompt(snapshot({ responseCount: 0 }), {
      userName: "小明",
      charId: "c1",
    });
    expect(text).not.toContain("回應（");
  });
});

describe("resolvePlurkCommentTarget", () => {
  const s1 = snapshot({ ref: "aaaaa", postId: "p1" });
  const s2 = snapshot({ ref: "bbbbb", postId: "p2" });
  const history = [{ plurkShare: s1 }, { plurkShare: s2 }];

  it("代號對得到", () => {
    expect(resolvePlurkCommentTarget("aaaaa", history)?.postId).toBe("p1");
  });

  it("代號對不到改用最新一張", () => {
    expect(resolvePlurkCommentTarget("zzzzz", history)?.postId).toBe("p2");
  });

  it("沒有卡片回 null", () => {
    expect(resolvePlurkCommentTarget("aaaaa", [])).toBeNull();
  });

  it("超過視窗的舊卡片看不到", () => {
    const long = [{ plurkShare: s1 }, ...Array.from({ length: 30 }, () => ({}))];
    expect(resolvePlurkCommentTarget("aaaaa", long)).toBeNull();
  });
});

describe("canCharComment", () => {
  it("自己的偷偷說不能留言", () => {
    const post = makePost({ id: "p1", audience: "anon", anonOf: "c1" });
    expect(canCharComment(post, "c1", { canView: true, squareBanned: false })).toBe(false);
  });

  it("看不到但是自己是噗主可以留言", () => {
    const post = makePost({ id: "p1", audience: "private", authorId: "c1" });
    expect(canCharComment(post, "c1", { canView: false, squareBanned: false })).toBe(true);
  });

  it("廣場被禁言不能留言", () => {
    const post = makePost({ id: "p1", onSquare: true });
    expect(canCharComment(post, "c1", { canView: true, squareBanned: true })).toBe(false);
  });

  it("沒有噗不能留言", () => {
    expect(canCharComment(undefined, "c1", { canView: true, squareBanned: false })).toBe(false);
  });
});

describe("pickShareCandidates", () => {
  const now = 1_700_000_000_000;
  const posts = [
    makePost({ id: "old", timestamp: now - 3000 }),
    makePost({ id: "new", timestamp: now - 1000 }),
    makePost({ id: "mid", timestamp: now - 2000 }),
    makePost({ id: "future", timestamp: now + 1000 }),
    makePost({ id: "hidden", timestamp: now - 500 }),
  ];
  const base = { canView: (p: QZonePost) => p.id !== "hidden", excludeRefs: new Set<string>(), now, limit: 10 };

  it("未來時間不列", () => {
    const ids = pickShareCandidates(posts, base).map((p) => p.id);
    expect(ids).not.toContain("future");
  });

  it("excludeRefs 不列", () => {
    const ids = pickShareCandidates(posts, { ...base, excludeRefs: new Set([plurkRef("new")]) }).map(
      (p) => p.id
    );
    expect(ids).not.toContain("new");
  });

  it("canView false 不列", () => {
    const ids = pickShareCandidates(posts, base).map((p) => p.id);
    expect(ids).not.toContain("hidden");
  });

  it("limit 0 回空", () => {
    expect(pickShareCandidates(posts, { ...base, limit: 0 })).toEqual([]);
  });

  it("照時間新到舊、取前 limit", () => {
    const ids = pickShareCandidates(posts, { ...base, limit: 2 }).map((p) => p.id);
    expect(ids).toEqual(["new", "mid"]);
  });
});

describe("buildPlurkShareGuide", () => {
  it("兩個都空回空字串", () => {
    expect(buildPlurkShareGuide({ commentable: [], candidates: [], charId: "c1" })).toBe("");
  });

  it("只有可留言", () => {
    const text = buildPlurkShareGuide({
      commentable: [snapshot({ ref: "aaaaa" }), snapshot({ ref: "aaaaa" })],
      candidates: [],
      charId: "c1",
    });
    expect(text).toContain("<plurk-comment");
    expect(text).not.toContain("<share-plurk");
  });

  it("只有候選噗，含自己的偷偷說標記", () => {
    const text = buildPlurkShareGuide({
      commentable: [],
      candidates: [
        snapshot({ ref: "aaaaa" }),
        snapshot({ ref: "bbbbb", authorKind: "anon", authorName: "偷偷說 #1234", anonOf: "c1" }),
      ],
      charId: "c1",
    });
    expect(text).toContain("最近的噗：");
    expect(text).toContain("ref=aaaaa");
    expect(text).toContain("（你偷偷說的）");
  });
});

describe("formatShareCandidateLine", () => {
  it("路人噗標廣場", () => {
    const line = formatShareCandidateLine(
      snapshot({ authorKind: "npc", authorName: "阿明", audience: "square" }),
      "c1"
    );
    expect(line).toContain("路人 阿明（廣場）");
  });
});

describe("候選噗登記表", () => {
  it("register 後用大小寫或 # 都查得到", () => {
    const s = snapshot({ ref: "abcde" });
    registerPlurkShareCandidates([s]);
    expect(lookupPlurkShareCandidate("abcde")?.ref).toBe("abcde");
    expect(lookupPlurkShareCandidate("#ABCDE")?.ref).toBe("abcde");
    expect(lookupPlurkShareCandidate("ABCDE")?.ref).toBe("abcde");
  });

  it("查不到回 undefined", () => {
    expect(lookupPlurkShareCandidate("zzzzz")).toBeUndefined();
  });
});

describe("recentPlurkShares", () => {
  it("新的在前、同卡去重", () => {
    const a = snapshot({ ref: "aaaaa", postId: "p1" });
    const b = snapshot({ ref: "bbbbb", postId: "p2" });
    const list = recentPlurkShares([{ plurkShare: a }, {}, { plurkShare: b }, { plurkShare: a }]);
    expect(list.map((s) => s.ref)).toEqual(["aaaaa", "bbbbb"]);
  });
});

describe("PLURK_SHARE_NOTE_REGEX", () => {
  it("把分享註記拿掉", () => {
    expect("好笑[分享噗文：小明「今天」]".replace(PLURK_SHARE_NOTE_REGEX, "")).toBe("好笑");
  });
});
