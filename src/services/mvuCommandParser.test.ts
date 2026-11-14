import { describe, expect, it } from "vitest";

import { extractMvuCommands, parseJsonPatchContent, splitTopLevelArgs } from "./mvuCommandParser";
import { parseAffinityUpdateTags } from "./ResponseParser";

describe("MVU 指令解析", () => {
  it("字串裡的逗號和括號不會把參數切錯", () => {
    expect(splitTopLevelArgs(`'悠纪.心情', '開心(偷笑)，有點害羞', [1, 2]`)).toEqual([
      `'悠纪.心情'`,
      `'開心(偷笑)，有點害羞'`,
      "[1, 2]",
    ]);
  });

  it("三參數 _.set 取最後一個當新值，並帶出 //原因", () => {
    const [cmd] = extractMvuCommands(`_.set('悠纪.好感度', 66, 74);//被誇獎了`);
    expect(cmd.name).toBe("set");
    expect(cmd.args).toEqual(["悠纪.好感度", 66, 74]);
    expect(cmd.reason).toBe("被誇獎了");
  });

  it("_.assign 是插入、_.delete 是刪除（跟原版 MVU 一樣）", () => {
    const cmds = extractMvuCommands(`
      _.assign('背包', '蘋果');
      _.insert('背包', 0, {名稱: '鑰匙', 數量: 1});
      _.delete('任務.送信');
      _.remove('背包', '蘋果');
    `);
    expect(cmds.map((c) => c.name)).toEqual(["insert", "insert", "remove", "remove"]);
    expect(cmds[1].args).toEqual(["背包", 0, { 名稱: "鑰匙", 數量: 1 }]);
    expect(cmds[3].args).toEqual(["背包", "蘋果"]);
  });

  it("JSON Patch 可以包在程式碼框裡，也接受 YAML", () => {
    expect(
      parseJsonPatchContent('```json\n[{"op":"replace","path":"/a/b","value":1}]\n```'),
    ).toEqual([{ op: "replace", path: "/a/b", value: 1, from: undefined }]);
    expect(parseJsonPatchContent("- op: delta\n  path: /a/b\n  value: -2")).toEqual([
      { op: "delta", path: "/a/b", value: -2, from: undefined },
    ]);
  });
});

describe("parseAffinityUpdateTags", () => {
  it("<UpdateVariable> 裡的 _.set（MVU 標準寫法）會被讀到，<Analysis> 不會", () => {
    const updates = parseAffinityUpdateTags(`正文
<UpdateVariable>
<Analysis>悠纪.好感度: Y，因為 _.set 被說明到</Analysis>
_.set('悠纪.好感度', 66, 74);//被誇獎
_.set('悠纪.已告白', false, true);
_.add('悠纪.信任', 3);
</UpdateVariable>`);
    expect(updates).toEqual([
      { metric: "悠纪.好感度", change: 0, reason: "被誇獎", isAbsolute: true, absoluteValue: 74 },
      { metric: "悠纪.已告白", change: 0, reason: "MVU _.set", isAbsolute: true, rawValue: true },
      { metric: "悠纪.信任", change: 3, reason: "MVU _.add" },
    ]);
  });

  it("輸出被截斷、沒有 </UpdateVariable> 也照樣讀", () => {
    const updates = parseAffinityUpdateTags(`<UpdateVariable>\n_.set('a.b', 1, 2);`);
    expect(updates).toHaveLength(1);
    expect(updates[0].absoluteValue).toBe(2);
  });

  it("JSON Patch 的 add 到 /- 是插入陣列，add 到一般鍵等同設值，布林和物件不會被丟掉", () => {
    const updates = parseAffinityUpdateTags(`<UpdateVariable><JSONPatch>[
      {"op":"add","path":"/主角/物品/-","value":"地圖"},
      {"op":"add","path":"/悠纪/好感度","value":80},
      {"op":"replace","path":"/悠纪/已告白","value":true},
      {"op":"replace","path":"/NPC/新角色","value":{"好感度":10}},
      {"op":"remove","path":"/主角/物品/0"}
    ]</JSONPatch></UpdateVariable>`);
    expect(updates[0]).toMatchObject({ metric: "主角.物品", operation: "insert", insertIndex: "-", rawValue: "地圖" });
    expect(updates[1]).toMatchObject({ metric: "悠纪.好感度", isAbsolute: true, absoluteValue: 80 });
    expect(updates[2]).toMatchObject({ metric: "悠纪.已告白", isAbsolute: true, rawValue: true });
    expect(updates[3]).toMatchObject({ metric: "NPC.新角色", rawValue: { 好感度: 10 } });
    expect(updates[4]).toMatchObject({ metric: "主角.物品.0", operation: "remove" });
  });

  it("<affinity-update> 照舊", () => {
    expect(parseAffinityUpdateTags(`<affinity-update 好感度="+3" reason="道謝"/>`)).toEqual([
      { metric: "好感度", change: 3, reason: "道謝" },
    ]);
  });
});
