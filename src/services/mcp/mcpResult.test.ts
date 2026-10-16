import { describe, expect, it } from "vitest";
import { convertCallToolResult } from "./mcpResult";

describe("convertCallToolResult", () => {
  it("joins text blocks and keeps up to three images", () => {
    const result = convertCallToolResult({ content: [
      { type: "text", text: "第一行" },
      { type: "image", data: "A1", mimeType: "image/png" },
      { type: "text", text: "第二行" },
      { type: "image", data: "A2", mimeType: "image/png" },
      { type: "image", data: "A3", mimeType: "image/jpeg" },
      { type: "image", data: "A4", mimeType: "image/png" },
    ] });
    expect(result).toEqual({
      text: "第一行\n第二行\n（另有 1 張圖片未附上）",
      images: [{ mimeType: "image/png", data: "A1" }, { mimeType: "image/png", data: "A2" }, { mimeType: "image/jpeg", data: "A3" }],
      isError: false,
    });
  });

  it("describes resources, links and unsupported content", () => {
    const result = convertCallToolResult({ content: [
      { type: "resource", resource: { uri: "file:///a.txt", text: "檔案內容" } },
      { type: "resource", resource: { uri: "file:///b.bin", blob: "AAAA" } },
      { type: "resource_link", uri: "https://example.com/doc", name: "doc" },
      { type: "audio", data: "AAAA", mimeType: "audio/wav" },
    ] });
    expect(result.text).toBe("檔案內容\n[檔案] file:///b.bin\n[連結] https://example.com/doc\n[音訊內容，目前不支援]");
  });

  it("falls back to structured content and reports errors", () => {
    expect(convertCallToolResult({ content: [], structuredContent: { battery: 80 } }).text).toBe('{"battery":80}');
    expect(convertCallToolResult({ content: [{ type: "text", text: "壞掉了" }], isError: true })).toMatchObject({ text: "壞掉了", isError: true });
    expect(convertCallToolResult(undefined)).toEqual({ text: "", images: [], isError: false });
  });
});
