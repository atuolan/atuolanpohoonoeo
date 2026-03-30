/**
 * ResponseParser Pixabay 屬性測試
 * 使用 fast-check 驗證多 Pic 標籤拆分解析的正確性屬性
 *
 * 注意：ResponseParser 在實際 AI 回應中，每個 <pic> 標籤通常包在獨立的 <msg> 區塊中。
 * 本測試使用 <msg> 包裝每個 <pic> 標籤，以符合實際使用情境。
 */

import { parseAIResponse } from "@/services/ResponseParser";
import fc from "fast-check";
import { describe, expect, it } from "vitest";

/**
 * 將字串中的 XML/HTML 特殊字元替換為安全字元
 * 避免破壞 <pic prompt="...">...</pic> 的標籤語法
 */
function sanitizeForXmlAttr(s: string): string {
  return s
    .replace(/"/g, "x")
    .replace(/'/g, "x")
    .replace(/</g, "x")
    .replace(/>/g, "x")
    .replace(/&/g, "x");
}

/**
 * 產生安全的非空白字串 arbitrary
 * 生成後替換 XML 特殊字元，並確保 .trim() 後仍有內容
 */
const safeNonBlankString = (minLength = 1, maxLength = 30) =>
  fc
    .string({ minLength, maxLength })
    .map(sanitizeForXmlAttr)
    .filter((s) => s.trim().length > 0);

describe("ResponseParser Pixabay 屬性測試", () => {
  /**
   * Property 8: 多 Pic 標籤拆分解析
   * **Validates: Requirements 3.5, 3.6**
   *
   * 對於任意包含 N 個 <pic> 標籤（N ≥ 1）的 AI 回應，
   * 每個 <pic> 標籤包在獨立的 <msg> 區塊中（實際 AI 回應格式），
   * parseAIResponse() 應產生至少 N 個帶有 isAiImage: true 的 ParsedMessage，
   * 且圖片訊息的順序與原始字串中 <pic> 標籤的出現順序一致。
   */
  // Feature: pixabay-image-search, Property 8: 多 Pic 標籤拆分解析
  it("Property 8: 多 Pic 標籤拆分解析 — 至少 N 個 isAiImage 訊息且順序一致", () => {
    fc.assert(
      fc.property(
        // N：pic 標籤數量（1 ~ 5）
        fc.integer({ min: 1, max: 5 }),
        // prompt 屬性（排除 XML 特殊字元）
        fc.array(safeNonBlankString(1, 30), { minLength: 5, maxLength: 5 }),
        // 標籤內描述文字（排除 XML 特殊字元，.trim() 後需有內容）
        fc.array(safeNonBlankString(1, 30), { minLength: 5, maxLength: 5 }),
        (n, prompts, descs) => {
          // 建立測試字串：每個 <pic> 包在獨立的 <msg> 區塊中
          // 格式：<msg><pic prompt="p1">d1</pic></msg><msg><pic prompt="p2">d2</pic></msg>...
          let testString = "";
          for (let i = 0; i < n; i++) {
            testString += `<msg><pic prompt="${prompts[i]}">${descs[i]}</pic></msg>`;
          }

          const result = parseAIResponse(testString);
          const imageMessages = result.messages.filter(
            (m) => m.isAiImage === true,
          );

          // 應至少有 N 個 isAiImage 訊息
          expect(imageMessages.length).toBeGreaterThanOrEqual(n);

          // 圖片訊息的 imageDescription 應與對應的描述文字一致（順序相同）
          for (let i = 0; i < n; i++) {
            expect(imageMessages[i].imageDescription).toBe(descs[i].trim());
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * 確定性測試：驗證具體輸入的解析結果
   * 輸入包含兩個 pic 標籤（各自在 <msg> 區塊中），驗證解析後的訊息數量與內容
   */
  it("確定性測試：兩個 pic 標籤應產生兩個 isAiImage 訊息且內容正確", () => {
    const input =
      '<msg><pic prompt="a cat">一隻貓</pic></msg><msg><pic prompt="a dog">一隻狗</pic></msg>';
    const result = parseAIResponse(input);
    const imageMessages = result.messages.filter((m) => m.isAiImage === true);

    // 至少有 2 個圖片訊息
    expect(imageMessages.length).toBeGreaterThanOrEqual(2);

    // 第一個圖片訊息
    expect(imageMessages[0].imagePrompt).toBe("a cat");
    expect(imageMessages[0].imageDescription).toBe("一隻貓");

    // 第二個圖片訊息
    expect(imageMessages[1].imagePrompt).toBe("a dog");
    expect(imageMessages[1].imageDescription).toBe("一隻狗");
  });
});
