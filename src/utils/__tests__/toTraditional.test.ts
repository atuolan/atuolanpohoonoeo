import { afterEach, describe, expect, it, vi } from "vitest";
import {
  __setConverterLoaderForTest,
  shouldConvertToTraditional,
  toTraditional,
} from "@/utils/toTraditional";

afterEach(() => {
  __setConverterLoaderForTest(null);
  vi.restoreAllMocks();
});

describe("toTraditional", () => {
  it("詞組級轉換：干嘛→幹嘛，喂、吃不變", async () => {
    expect(await toTraditional("喂，你在干嘛？我刚下班，要不要一起去吃火锅？")).toBe(
      "喂，你在幹嘛？我剛下班，要不要一起去吃火鍋？",
    );
    expect(await toTraditional("我的头发后来")).toBe("我的頭髮後來");
  });

  it("含假名或沒有漢字時不轉", async () => {
    expect(shouldConvertToTraditional("時間、大丈夫ですか")).toBe(false);
    expect(await toTraditional("时间、大丈夫ですか")).toBe("时间、大丈夫ですか");
    expect(await toTraditional("Hello")).toBe("Hello");
    expect(await toTraditional("")).toBe("");
  });

  it("載入失敗時回傳原文，下次會再試", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const loader = vi
      .fn()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce((text: string) => `T:${text}`);
    __setConverterLoaderForTest(loader);
    expect(await toTraditional("我刚下班")).toBe("我刚下班");
    expect(await toTraditional("我刚下班")).toBe("T:我刚下班");
    expect(loader).toHaveBeenCalledTimes(2);
  });
});
