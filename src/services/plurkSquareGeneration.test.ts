import { describe, expect, it, vi } from "vitest";

vi.mock("@/services/plurkCast", () => ({ buildCastContext: vi.fn(), effectiveFriendIds: vi.fn() }));
vi.mock("@/stores/qzone", () => ({ useQzoneStore: vi.fn() }));
vi.mock("@/stores/characters", () => ({ useCharactersStore: vi.fn() }));
vi.mock("@/services/plurkAI", async () => {
  const actual = await vi.importActual<typeof import("./plurkAI")>("./plurkAI");
  return { ...actual, generatePlurkText: vi.fn(), hasPlurkApi: vi.fn() };
});
vi.mock("@/stores/settings", () => ({ useSettingsStore: vi.fn() }));
vi.mock("@/stores/notification", () => ({ useNotificationStore: vi.fn() }));

const { buildSquarePrompt, npcColorFor, npcIdFor, parseSquareResponse } = await import("./plurkSquareGeneration");

const now = new Date(2026, 9, 21, 20, 0).getTime();

describe("buildSquarePrompt", () => {
  it("寬鬆時不給摺疊、有角色時才有偷偷說段落、列出最近的噗", () => {
    const loose = buildSquarePrompt({ times: [now - 60_000, now + 30 * 60_000], strictness: "loose", characters: [], recentTexts: ["停車"], now });
    expect(loose).toContain("不要輸出 fold");
    expect(loose).not.toContain("可以偷偷說的角色");
    expect(loose).toContain("- 停車");
    expect(loose).toContain("請生成 2 則");
    expect(loose).toContain("1. 10/21 19:59");
    expect(loose).toContain("2. 10/21 20:30");
    const withChar = buildSquarePrompt({
      times: [now],
      strictness: "hard",
      characters: [{ id: "c1", name: "譚尧", personality: "嘴硬", description: "醫生" }],
      recentTexts: [],
      now,
    });
    expect(withChar).toContain("id: c1｜譚尧");
    expect(withChar).toContain("版主很嚴格");
  });

  it("偷偷說分頁：整批要偷偷說；平常偶爾混幾則", () => {
    const anon = buildSquarePrompt({ times: [now, now], strictness: "mid", characters: [], recentTexts: [], now, anon: true });
    expect(anon).toContain("請生成 2 則廣場上的「偷偷說」");
    expect(anon).toContain('每則都用 "kind": "anon"');
    const normal = buildSquarePrompt({ times: [now], strictness: "mid", characters: [], recentTexts: [], now });
    expect(normal).toContain("大約每 5 則可以有 1 則改用偷偷說");
  });
});

describe("parseSquareResponse", () => {
  const raw = (posts: unknown[]) => "```json\n" + JSON.stringify({ posts }) + "\n```";
  const opts = { characterIds: new Set(["c1"]), strictness: "mid" as const };

  it("路人噗：名字、發語詞正規化、喜歡數限制、回應最多 3 則", () => {
    const [p] = parseSquareResponse(
      raw([
        {
          kind: "npc", name: "芒果媽", qualifier: "loves", content: "  寶寶睡著了  ", likes: 999,
          replies: [{ name: "a", content: "1" }, { name: "b", content: "" }, { name: "c", content: "3" }, { content: "4" }, { name: "e", content: "5" }],
        },
      ]),
      opts,
    );
    expect(p).toMatchObject({ kind: "npc", name: "芒果媽", qualifier: "愛", content: "寶寶睡著了", likes: 300 });
    expect(p.replies.map((r) => r.content)).toEqual(["1", "3", "4"]);
    expect(p.replies[2].name).toBe("路人");
  });

  it("偷偷說只收名單裡的角色、一批最多一則", () => {
    const list = parseSquareResponse(
      raw([
        { kind: "anon", characterId: "x", content: "不認得的" },
        { kind: "anon", characterId: "c1", content: "第一則" },
        { kind: "anon", characterId: "c1", content: "第二則" },
      ]),
      opts,
    );
    expect(list).toEqual([expect.objectContaining({ kind: "anon", characterId: "c1", name: "偷偷說", content: "第一則" })]);
  });

  it("沒給 characterId 的是路人的偷偷說，不限則數", () => {
    const list = parseSquareResponse(
      raw([
        { kind: "anon", content: "路人一" },
        { kind: "anon", content: "路人二" },
        { kind: "npc", name: "小魚", content: "一般噗" },
      ]),
      opts,
    );
    expect(list.map((p) => [p.kind, p.characterId, p.content])).toEqual([
      ["anon", undefined, "路人一"],
      ["anon", undefined, "路人二"],
      ["npc", undefined, "一般噗"],
    ]);
  });

  it("偷偷說分頁按的：整批都當偷偷說", () => {
    const list = parseSquareResponse(
      raw([
        { kind: "npc", name: "小魚", content: "模型忘了改" },
        { kind: "anon", characterId: "c1", content: "角色的" },
      ]),
      { ...opts, anon: true },
    );
    expect(list.map((p) => [p.kind, p.name, p.characterId])).toEqual([
      ["anon", "偷偷說", undefined],
      ["anon", "偷偷說", "c1"],
    ]);
  });

  it("摺疊：寬鬆全丟、普通最多一則、嚴格都留", () => {
    const posts = [
      { name: "a", content: "1", fold: "引戰" },
      { name: "b", content: "2", fold: "洗版" },
    ];
    expect(parseSquareResponse(raw(posts), { ...opts, strictness: "loose" }).map((p) => p.fold)).toEqual([undefined, undefined]);
    expect(parseSquareResponse(raw(posts), opts).map((p) => p.fold)).toEqual(["引戰", undefined]);
    expect(parseSquareResponse(raw(posts), { ...opts, strictness: "hard" }).map((p) => p.fold)).toEqual(["引戰", "洗版"]);
  });

  it("一批變大時，普通每 10 則最多摺 1 則", () => {
    const posts = Array.from({ length: 20 }, (_, i) => ({ name: `p${i}`, content: `${i}`, fold: i < 3 ? "引戰" : undefined }));
    expect(parseSquareResponse(raw(posts), opts).filter((p) => p.fold)).toHaveLength(2);
  });

  it("回覆被截斷時，前面完整的照樣收", () => {
    const cut = '{"posts": [{"name": "a", "content": "1"}, {"name": "b", "content": "2"}, {"name": "c", "conte';
    expect(parseSquareResponse(cut, opts).map((p) => p.content)).toEqual(["1", "2"]);
  });

  it("壞掉的輸出回傳空陣列", () => {
    expect(parseSquareResponse("沒有 JSON", opts)).toEqual([]);
    expect(parseSquareResponse("{壞掉", opts)).toEqual([]);
    expect(parseSquareResponse('{"posts": "x"}', opts)).toEqual([]);
  });
});

describe("npcIdFor / npcColorFor", () => {
  it("同名同人、顏色固定", () => {
    expect(npcIdFor("小魚")).toBe(npcIdFor("小魚"));
    expect(npcIdFor("小魚")).not.toBe(npcIdFor("大魚"));
    expect(npcColorFor("小魚")).toMatch(/^#[0-9A-F]{6}$/i);
  });
});

describe("版務公告", () => {
  it("只收名單裡的角色、天數 1–3", async () => {
    const { parseSquareAnnounce } = await import("./plurkSquareGeneration");
    const ids = new Set(["c1"]);
    expect(parseSquareAnnounce('{"posts": [], "announce": {"characterId": "c1", "reason": "在多篇噗下爭吵", "days": 9}}', ids)).toEqual({
      characterId: "c1", reason: "在多篇噗下爭吵", days: 3,
    });
    expect(parseSquareAnnounce('{"posts": [], "announce": {"characterId": "x", "reason": "r"}}', ids)).toBeNull();
    expect(parseSquareAnnounce('{"posts": []}', ids)).toBeNull();
  });
  it("寬鬆或沒有角色時提示詞不給公告", () => {
    const c = [{ id: "c1", name: "陸晏", personality: "", description: "" }];
    expect(buildSquarePrompt({ times: [now], strictness: "loose", characters: c, recentTexts: [], now })).not.toContain("announce");
    expect(buildSquarePrompt({ times: [now], strictness: "mid", characters: [], recentTexts: [], now })).not.toContain("announce");
    expect(buildSquarePrompt({ times: [now], strictness: "mid", characters: c, recentTexts: [], now })).toContain("announce");
  });
});

describe("generateSquareBatch", () => {
  it("照排好的時間存：手動時三分之一馬上出現、其餘排到之後；摺疊和回應都在噗之後", async () => {
    const { generateSquareBatch } = await import("./plurkSquareGeneration");
    const { generatePlurkText, hasPlurkApi } = await import("@/services/plurkAI");
    const { useQzoneStore } = await import("@/stores/qzone");
    const added: Array<{ timestamp: number; moderation?: { at: number } }> = [];
    const comments: Array<{ postId: string; timestamp: number }> = [];
    vi.mocked(hasPlurkApi).mockReturnValue(true);
    vi.mocked(useQzoneStore).mockReturnValue({
      posts: [],
      settings: {},
      directorConfig: { squareBatch: 5, npcLevel: 3, strictness: "mid", roles: {} },
      addPost: vi.fn(async (data: object, opts: { timestamp: number }) => {
        added.push({ ...data, timestamp: opts.timestamp });
        return { id: `p${added.length}` };
      }),
      addComment: vi.fn(async (postId: string, _data: object, opts: { timestamp: number }) => {
        comments.push({ postId, timestamp: opts.timestamp });
      }),
    } as never);
    vi.mocked(generatePlurkText).mockResolvedValue(
      JSON.stringify({
        posts: [
          { name: "a", content: "1", replies: [{ name: "x", content: "r" }] },
          { name: "b", content: "2", fold: "引戰" },
          { name: "c", content: "3" },
          { name: "d", content: "4" },
          { name: "e", content: "5" },
          { name: "f", content: "多出來的" },
        ],
      }),
    );
    const random = vi.spyOn(Math, "random").mockReturnValue(0.9);
    const start = Date.now();
    const result = await generateSquareBatch();
    random.mockRestore();

    expect(result).toMatchObject({ success: true, added: 5, scheduled: 3 });
    expect(added.filter((p) => p.timestamp <= start)).toHaveLength(2);
    expect(added.filter((p) => p.timestamp > start)).toHaveLength(3);
    const folded = added.find((p) => p.moderation)!;
    expect(folded.moderation!.at).toBeGreaterThan(folded.timestamp);
    expect(comments[0].timestamp).toBeGreaterThan(added[0].timestamp);
  });

  it("偷偷說分頁按的：存成偷偷說，路人的只在廣場、角色的記下是誰", async () => {
    const { generateSquareBatch } = await import("./plurkSquareGeneration");
    const { generatePlurkText, hasPlurkApi } = await import("@/services/plurkAI");
    const { buildCastContext, effectiveFriendIds } = await import("@/services/plurkCast");
    const { useQzoneStore } = await import("@/stores/qzone");
    const { useCharactersStore } = await import("@/stores/characters");
    const added: Array<Record<string, unknown>> = [];
    vi.mocked(hasPlurkApi).mockReturnValue(true);
    vi.mocked(buildCastContext).mockResolvedValue({} as never);
    vi.mocked(effectiveFriendIds).mockReturnValue(["c1"]);
    vi.mocked(useCharactersStore).mockReturnValue({ characters: [{ id: "c1", nickname: "陸晏", data: {} }] } as never);
    vi.mocked(useQzoneStore).mockReturnValue({
      posts: [],
      settings: {},
      directorConfig: { squareBatch: 5, npcLevel: 3, strictness: "mid", roles: {} },
      addPost: vi.fn(async (data: Record<string, unknown>) => {
        added.push(data);
        return { id: `p${added.length}` };
      }),
      addComment: vi.fn(),
    } as never);
    vi.mocked(generatePlurkText).mockResolvedValue(
      JSON.stringify({ posts: [{ kind: "anon", content: "路人的" }, { kind: "anon", characterId: "c1", content: "角色的" }] }),
    );

    expect(await generateSquareBatch({ anon: true })).toMatchObject({ success: true, added: 2 });
    const calls = vi.mocked(generatePlurkText).mock.calls;
    expect(calls[calls.length - 1][0]).toContain("id: c1｜陸晏");
    expect(added.map((p) => [p.audience, p.onSquare, p.anonOf])).toEqual([
      ["anon", true, undefined],
      ["anon", undefined, "c1"],
    ]);
  });

  it("按停止：已經寫完的幾則照樣存；一則都沒寫完就安靜結束", async () => {
    const { generateSquareBatch } = await import("./plurkSquareGeneration");
    const { generatePlurkText, hasPlurkApi } = await import("@/services/plurkAI");
    const { useQzoneStore } = await import("@/stores/qzone");
    const addPost = vi.fn(async () => ({ id: "p" }));
    vi.mocked(hasPlurkApi).mockReturnValue(true);
    vi.mocked(useQzoneStore).mockReturnValue({
      posts: [],
      settings: {},
      directorConfig: { squareBatch: 10, npcLevel: 3, strictness: "mid", roles: {} },
      addPost,
      addComment: vi.fn(),
    } as never);
    const abort = (partial: string) => Object.assign(new Error("已停止生成"), { name: "AbortError", partial });
    const random = vi.spyOn(Math, "random").mockReturnValue(0.9);

    vi.mocked(generatePlurkText).mockRejectedValueOnce(abort('{"posts": [{"name": "a", "content": "1"}, {"name": "b", "content": "2"}, {"name": "c", "con'));
    expect(await generateSquareBatch()).toMatchObject({ success: true, added: 2 });
    expect(addPost).toHaveBeenCalledTimes(2);

    vi.mocked(generatePlurkText).mockRejectedValueOnce(abort(""));
    expect(await generateSquareBatch()).toEqual({ success: false, added: 0, scheduled: 0, aborted: true });
    random.mockRestore();
  });
});
