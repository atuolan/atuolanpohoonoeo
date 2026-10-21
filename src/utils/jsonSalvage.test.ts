import { describe, expect, it } from "vitest";
import { salvageArrayItems } from "./jsonSalvage";

describe("salvageArrayItems", () => {
  it("完整 JSON 取出全部物件", () => {
    const raw = '{"posts":[{"a":1},{"a":2}]}';
    expect(salvageArrayItems(raw, "posts")).toEqual([{ a: 1 }, { a: 2 }]);
  });

  it("前後有 ```json 標記與說明文字也能找到", () => {
    const raw = ["好的，這是你要的結果：", "```json", '{"posts":[{"a":1},{"a":2}]}', "```", "希望有幫助。"].join("\n");
    expect(salvageArrayItems(raw, "posts")).toEqual([{ a: 1 }, { a: 2 }]);
  });

  it("截斷在第三個物件中間時，只回傳前面完整的兩個", () => {
    const raw = '{"posts":[{"a":1},{"a":2},{"a":"沒寫完';
    expect(salvageArrayItems(raw, "posts")).toEqual([{ a: 1 }, { a: 2 }]);
  });

  it("字串內含大括號與跳脫引號不會影響切段", () => {
    const raw = '{"posts":[{"t":"笑死 {哈} \\"引號\\""},{"t":"b"}]}';
    const items = salvageArrayItems(raw, "posts");
    expect(items).toHaveLength(2);
    expect(items[0]).toEqual({ t: '笑死 {哈} "引號"' });
    expect(items[1]).toEqual({ t: "b" });
  });

  it("巢狀物件與陣列內容完整保留", () => {
    const raw = '{"posts":[{"r":[{"n":"x"}],"o":{"k":1}}]}';
    expect(salvageArrayItems(raw, "posts")).toEqual([{ r: [{ n: "x" }], o: { k: 1 } }]);
  });

  it("中間壞掉的物件會被略過，後面的照樣回傳", () => {
    const raw = '{"posts":[{"a":1},{"a":,},{"a":3}]}';
    expect(salvageArrayItems(raw, "posts")).toEqual([{ a: 1 }, { a: 3 }]);
  });

  it("找不到 key 或 key 後面不是陣列時回傳空陣列", () => {
    expect(salvageArrayItems('{"other":[{"a":1}]}', "posts")).toEqual([]);
    expect(salvageArrayItems('{"posts":{"a":1}}', "posts")).toEqual([]);
    expect(salvageArrayItems("", "posts")).toEqual([]);
  });
});
