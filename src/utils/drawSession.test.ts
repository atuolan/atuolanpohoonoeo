import { describe, expect, it } from "vitest";
import type { DrawSession, DrawStep } from "@/types/drawSession";
import {
  collectDrawSessionImageRefs,
  describeDrawSessionForPrompt,
  findDraft,
  findPrevTurnDrawSession,
  finalizeDrawSession,
  isDrawSessionTool,
  listDrafts,
  maxAttempt,
  stepFromToolCall,
  summarizeStepResult,
  upsertDrawStep,
} from "./drawSession";

const draft = (attempt: number, extra: Partial<DrawStep> = {}): DrawStep => ({
  id: `c${attempt}`,
  kind: "draw",
  status: "success",
  at: attempt,
  title: "試畫",
  attempt,
  prompt: `1girl, try ${attempt}`,
  imageRef: `chatimg_${attempt}`,
  mimeType: "image/png",
  ...extra,
});

describe("drawSession", () => {
  it("routes only drawing-related tools into the card", () => {
    expect(isDrawSessionTool("generate_image")).toBe(true);
    expect(isDrawSessionTool("choose_image")).toBe(true);
    expect(isDrawSessionTool("view_chat_image")).toBe(true);
    expect(isDrawSessionTool("find_danbooru_artists")).toBe(true);
    expect(isDrawSessionTool("get_weather")).toBe(false);
  });

  it("builds readable steps from tool calls", () => {
    expect(stepFromToolCall({ id: "a", name: "find_danbooru_artists", arguments: { queries: ["hanfu, male focus", "sketch"] } }, 1))
      .toMatchObject({ id: "a", kind: "artists", status: "running", title: "找相似繪師：hanfu, male focus／sketch" });
    expect(stepFromToolCall({ id: "b", name: "view_chat_image", arguments: { style_ref: true } })?.title).toBe("看畫風參考圖");
    expect(stepFromToolCall({ id: "c", name: "view_chat_image", arguments: { draft: 2 } })?.title).toBe("看試畫 #2");
    expect(stepFromToolCall({ id: "d", name: "view_chat_image", arguments: { sender: "user" } })?.title).toBe("看你傳的圖（最新一張）");
    expect(stepFromToolCall({ id: "e", name: "generate_image", arguments: { prompt: " 1boy ", note: "先照參考圖" } }))
      .toMatchObject({ kind: "draw", prompt: "1boy", note: "先照參考圖" });
    expect(stepFromToolCall({ id: "f", name: "get_weather", arguments: {} })).toBeNull();
  });

  it("merges updates into the same step and ignores unknown partial steps", () => {
    let session: DrawSession = { id: "s", steps: [] };
    session = upsertDrawStep(session, { ...draft(1), status: "running", imageRef: undefined });
    session = upsertDrawStep(session, { id: "c1", status: "success", imageRef: "chatimg_1" });
    expect(session.steps).toHaveLength(1);
    expect(session.steps[0]).toMatchObject({ status: "success", imageRef: "chatimg_1", prompt: "1girl, try 1" });
    expect(upsertDrawStep(session, { id: "nope", status: "error" })).toBe(session);
  });

  it("lists only finished drafts in order and finds them by number", () => {
    const session: DrawSession = {
      id: "s",
      steps: [draft(4), draft(3), draft(5, { status: "error", imageRef: undefined }), { id: "x", kind: "artists", status: "success", at: 0, title: "找" }],
    };
    expect(listDrafts(session).map((d) => d.attempt)).toEqual([3, 4]);
    expect(findDraft(session, 4)?.id).toBe("c4");
    expect(findDraft(session, 5)).toBeUndefined();
    // 失敗的編號也算，避免下一輪重號
    expect(maxAttempt(session)).toBe(5);
    expect(maxAttempt(undefined)).toBe(0);
  });

  it("marks unfinished steps as cancelled when the reply ends", () => {
    const session: DrawSession = { id: "s", steps: [draft(1), { ...draft(2), status: "running" }] };
    expect(finalizeDrawSession(session).steps.map((s) => s.status)).toEqual(["success", "cancelled"]);
    const done: DrawSession = { id: "s", steps: [draft(1)] };
    expect(finalizeDrawSession(done)).toBe(done);
  });

  it("keeps lookup results short", () => {
    const lines = Array.from({ length: 10 }, (_, i) => `artist ${i}`).join("\n");
    expect(summarizeStepResult("artists", lines)?.split("\n")).toHaveLength(7);
    expect(summarizeStepResult("draw", "anything")).toBeUndefined();
    expect(summarizeStepResult("tags", "  ")).toBeUndefined();
  });

  it("finds the previous turn's session but not older ones", () => {
    const session: DrawSession = { id: "s", steps: [draft(1)] };
    const prev = [
      { role: "user" },
      { role: "ai", drawSession: session },
      { role: "ai" },
      { role: "user" },
    ];
    expect(findPrevTurnDrawSession(prev)).toBe(session);
    expect(findPrevTurnDrawSession([...prev, { role: "ai" }, { role: "user" }])).toBeUndefined();
    expect(findPrevTurnDrawSession([{ role: "ai", drawSession: { id: "e", steps: [] } }, { role: "user" }])).toBeUndefined();
  });

  it("summarizes drafts for the next turn", () => {
    const session: DrawSession = {
      id: "s",
      steps: [draft(1, { note: "先照參考圖" }), draft(2, { negativePrompt: "lowres" })],
      chosenAttempt: 1,
      pickedByUser: true,
    };
    const text = describeDrawSessionForPrompt(session, "小明");
    expect(text).toContain("#1（貼進聊天的是這張）");
    expect(text).toContain("你當時的說明：先照參考圖");
    expect(text).toContain("負面提示詞：lowres");
    expect(text).toContain("小明 自己把貼進聊天的圖換成了 #1");
    expect(text).toContain("view_chat_image 的 draft");
  });

  it("collects draft image refs for cleanup", () => {
    expect(collectDrawSessionImageRefs([{ drawSession: { id: "s", steps: [draft(1), draft(2)] } }, {}])).toEqual([
      "chatimg_1",
      "chatimg_2",
    ]);
  });
});
