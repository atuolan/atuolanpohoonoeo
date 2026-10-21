import { describe, expect, it } from "vitest";
import { parseBatchCommentsResponse } from "./BatchCommentsParser";

describe("parseBatchCommentsResponse 發語詞", () => {
  it("認得的留下並正規化，不認得的丟掉", () => {
    const raw = JSON.stringify({
      comments: [
        { id: "c1", characterId: "a", characterName: "譚尧", content: "嗯", replyTo: null, qualifier: "thinks" },
        { id: "c2", characterId: "b", characterName: "沈", content: "好", replyTo: "c1", qualifier: "大喊" },
        { id: "c3", characterId: "c", characterName: "林", content: "哈", replyTo: null },
      ],
    });
    expect(parseBatchCommentsResponse(raw).map((c) => c.qualifier)).toEqual(["想", undefined, undefined]);
  });
});

describe("parseBatchCommentsResponse 版主刪除", () => {
  it("讀 removed，空字串不算", () => {
    const raw = JSON.stringify({
      comments: [
        { id: "c1", characterId: "passerby-1", characterName: "a", content: "滾", replyTo: null, removed: "人身攻擊" },
        { id: "c2", characterId: "passerby-2", characterName: "b", content: "好", replyTo: null, removed: " " },
      ],
    });
    expect(parseBatchCommentsResponse(raw).map((c) => c.removed)).toEqual(["人身攻擊", undefined]);
  });
});
