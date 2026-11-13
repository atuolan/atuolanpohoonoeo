import { describe, expect, it } from "vitest";
import type { QZonePost } from "@/types/qzone";
import { buildBatchCommentsPrompt } from "./AIService";

const fakePrompts = { plurkCommentPromptOrder: [], plurkCommentPrompts: [] } as never;
const post: QZonePost = {
  id: "p",
  authorId: "u",
  username: "mandala",
  type: "shuoshuo",
  timestamp: 0,
  comments: [],
  likes: [],
  visibility: "public",
  authorType: "user",
  content: "今天好累",
};
const chars = [{ id: "a", name: "譚尧", personality: "嘴硬", description: "醫生" }];
const base = {
  characters: chars,
  post,
  existingComments: [],
  minComments: 1,
  maxComments: 3,
  promptManagerStore: fakePrompts,
};

describe("buildBatchCommentsPrompt", () => {
  it("預設有路人段落", () => {
    expect(buildBatchCommentsPrompt(base)).toContain("# 隨機路人評論者");
  });
  it("allowPasserby false 時沒有路人", () => {
    const prompt = buildBatchCommentsPrompt({ ...base, allowPasserby: false });
    expect(prompt).not.toContain("隨機路人");
    expect(prompt).not.toContain("passerby");
    expect(prompt).toContain("不要加入路人");
  });
  it("只生一則＋語氣", () => {
    const prompt = buildBatchCommentsPrompt({
      ...base,
      allowPasserby: false,
      onlyCharacterId: "a",
      toneHint: "這次回得冷淡、簡短一點",
      replyContext: "這則是在回覆 沈既白：「下次記得買無糖的」",
    });
    expect(prompt).toContain("只輸出 1 則");
    expect(prompt).toContain("譚尧");
    expect(prompt).toContain("這次回得冷淡、簡短一點");
    expect(prompt).toContain("下次記得買無糖的");
  });
  it("輸出格式說明發語詞可省略", () => {
    expect(buildBatchCommentsPrompt(base)).toContain("qualifier");
  });
});

describe("buildBatchCommentsPrompt 版主", () => {
  it("沒給或寬鬆就沒有 removed；普通、嚴格有", () => {
    expect(buildBatchCommentsPrompt(base)).not.toContain("removed");
    expect(buildBatchCommentsPrompt({ ...base, moderation: { strictness: "loose" } })).not.toContain("removed");
    expect(buildBatchCommentsPrompt({ ...base, moderation: { strictness: "mid" } })).toContain("最多 1 則");
    expect(buildBatchCommentsPrompt({ ...base, moderation: { strictness: "hard" }, passerbyOnly: true })).toContain("removed");
  });
});

describe("buildBatchCommentsPrompt 版主判定", () => {
  it("有 verdictFor 才要求頂層 verdict，帶留言 id 與嚴格度", () => {
    expect(buildBatchCommentsPrompt(base)).not.toContain("verdict");
    const mid = buildBatchCommentsPrompt({ ...base, verdictFor: { commentId: "comment-9", strictness: "mid" } });
    expect(mid).toContain("comment-9");
    expect(mid).toContain('"verdict"');
    expect(mid).toContain("禁言最多 1 天");
    expect(buildBatchCommentsPrompt({ ...base, verdictFor: { commentId: "x", strictness: "hard" } })).toContain("1–3 天");
  });
});

describe("buildBatchCommentsPrompt 路人底線", () => {
  it("有路人就帶底線、不再用固定範例暱稱", () => {
    const prompt = buildBatchCommentsPrompt(base);
    expect(prompt).toContain("# 路人底線");
    expect(prompt).toContain("再買一個就好");
    expect(prompt).not.toContain("憑甚麼要做報告");
  });
  it("只有路人時也帶底線", () => {
    expect(buildBatchCommentsPrompt({ ...base, characters: [], passerbyOnly: true })).toContain("# 路人底線");
  });
  it("封鎖的暱稱寫進去", () => {
    expect(buildBatchCommentsPrompt({ ...base, blockedNames: ["我就愛看戲"] })).toContain("「我就愛看戲」");
  });
  it("使用者的噗：角色要護著發文人", () => {
    expect(buildBatchCommentsPrompt(base)).toContain("站在發文人這邊");
    expect(buildBatchCommentsPrompt({ ...base, post: { ...post, authorType: "ai" } })).not.toContain("站在發文人這邊");
  });
});

describe("buildBatchCommentsPrompt 生老病死", () => {
  it("有角色、只有路人、不加路人都帶這條", () => {
    expect(buildBatchCommentsPrompt(base)).toContain("生老病死不吐槽");
    expect(buildBatchCommentsPrompt({ ...base, characters: [], passerbyOnly: true })).toContain("生老病死不吐槽");
    expect(buildBatchCommentsPrompt({ ...base, allowPasserby: false })).toContain("生老病死不吐槽");
  });
});
