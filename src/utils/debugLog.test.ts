import { beforeEach, describe, expect, it } from "vitest";
import {
  beginDebugRequest,
  clearDebugLogs,
  clearDebugRequests,
  composeDebugReport,
  describeDebugRequest,
  formatDebugArgs,
  getDebugLogs,
  getDebugRequests,
  onDebugLog,
  pushDebugLog,
  redactSecrets,
  setDebugLogVerbose,
} from "./debugLog";
import { endpointHost } from "./debugReportSections";

beforeEach(() => {
  clearDebugLogs();
  clearDebugRequests();
  setDebugLogVerbose(false);
});

describe("金鑰遮蔽", () => {
  it("常見的金鑰寫法都蓋掉", () => {
    expect(redactSecrets("key sk-abcdefghijklmnop123 done")).toBe("key sk-*** done");
    expect(redactSecrets("Authorization: Bearer abc.def-ghi_123456")).not.toContain("abc.def");
    expect(redactSecrets("https://x.com/v1?key=AIzaSyA1234567890abcdefgh&alt=sse")).toBe(
      "https://x.com/v1?key=***&alt=sse",
    );
    expect(redactSecrets('{"apiKey":"my-secret-value-123","model":"gpt"}')).toBe('{"apiKey":"***","model":"gpt"}');
    expect(redactSecrets('{"x-api-key":"abcdef123456"}')).toBe('{"x-api-key":"***"}');
  });

  it("一般文字不動", () => {
    const text = "[getAPIForTask] 任務=chat, 模型=gemini-2.5-pro";
    expect(redactSecrets(text)).toBe(text);
    expect(redactSecrets("token 用量 1200")).toBe("token 用量 1200");
  });
});

describe("console 參數轉文字", () => {
  it("Error 留名稱和訊息", () => {
    expect(formatDebugArgs(["失敗", new TypeError("Load failed")], false)).toBe("失敗 TypeError: Load failed");
  });

  it("有 message 欄位的物件不會只剩 message", () => {
    const text = formatDebugArgs([{ message: "壞了", status: 502 }]);
    expect(text).toContain("壞了");
    expect(text).toContain("502");
  });

  it("簡短模式不展開大物件", () => {
    const big = { messages: Array.from({ length: 200 }, (_, i) => ({ role: "user", content: "內容".repeat(500) + i })) };
    const text = formatDebugArgs(["請求", big], false);
    expect(text.length).toBeLessThan(700);
    expect(text).toContain("messages");
  });

  it("太長會截短並寫明原本多長", () => {
    const text = formatDebugArgs(["x".repeat(20000)]);
    expect(text.length).toBeLessThan(6100);
    expect(text).toContain("共 20000 字");
  });

  it("循環參照不會丟錯", () => {
    const a: Record<string, unknown> = { name: "a" };
    a.self = a;
    expect(() => formatDebugArgs([a])).not.toThrow();
  });
});

describe("日誌", () => {
  it("沒開視窗時一般訊息只留預覽，警告照樣完整", () => {
    const payload = { list: Array.from({ length: 50 }, (_, i) => `項目${i}`) };
    pushDebugLog("log", ["資料", payload]);
    pushDebugLog("warn", ["資料", payload]);
    const [quiet, warn] = getDebugLogs();
    expect(quiet.text).not.toContain("項目49");
    expect(warn.text).toContain("項目49");
  });

  it("只留最近 500 則", () => {
    for (let i = 0; i < 520; i++) pushDebugLog("log", [`第 ${i} 則`]);
    const logs = getDebugLogs();
    expect(logs.length).toBe(500);
    expect(logs[0].text).toBe("第 20 則");
  });

  it("新紀錄會通知畫面，取消後不再通知", () => {
    const seen: string[] = [];
    const off = onDebugLog((entry) => seen.push(entry.text));
    pushDebugLog("info", ["一"]);
    off();
    pushDebugLog("info", ["二"]);
    expect(seen).toEqual(["一"]);
  });
});

describe("AI 請求紀錄", () => {
  const info = { endpoint: "https://api.example.com/v1/chat/completions", model: "gemini-2.5-pro", stream: true, messageCount: 42 };

  it("有內容算成功，不留診斷", () => {
    beginDebugRequest(info).finish({ content: "你好", rawFinishReason: "stop", diagnostics: { a: 1 } });
    const [record] = getDebugRequests();
    expect(record.status).toBe("ok");
    expect(record.contentLength).toBe(2);
    expect(record.diagnostics).toBeUndefined();
    expect(record.host).toBe("api.example.com");
  });

  it("沒內容算空回覆，留下結束原因和診斷", () => {
    beginDebugRequest(info).finish({ content: "  ", rawFinishReason: "content_filter", diagnostics: { chunkCount: 3 } });
    const [record] = getDebugRequests();
    expect(record.status).toBe("empty");
    expect(record.finishReason).toBe("content_filter");
    expect(record.diagnostics).toContain("chunkCount");
    expect(describeDebugRequest(record)).toContain("空回覆");
  });

  it("只呼叫工具、沒有文字也算成功", () => {
    beginDebugRequest(info).finish({ content: "", toolCallCount: 1 });
    expect(getDebugRequests()[0].status).toBe("ok");
  });

  it("失敗留錯誤訊息，金鑰蓋掉", () => {
    beginDebugRequest(info).fail(new Error("401 Incorrect API key provided: sk-abcdefgh12345678"));
    const [record] = getDebugRequests();
    expect(record.status).toBe("error");
    expect(record.error).toContain("401");
    expect(record.error).not.toContain("abcdefgh12345678");
  });

  it("已經有結果之後再中止不會蓋掉", () => {
    const track = beginDebugRequest(info);
    track.finish({ content: "好" });
    track.abort();
    expect(getDebugRequests()[0].status).toBe("ok");
  });

  it("經本站代理的請求顯示真正的主機", () => {
    beginDebugRequest({ ...info, endpoint: "https://phone.example/ai-proxy/api.upstream.com/v1/chat/completions" }).abort();
    const [record] = getDebugRequests();
    expect(record.host).toBe("api.upstream.com");
    expect(record.viaProxy).toBe(true);
    expect(record.status).toBe("aborted");
  });

  it("只留最近 30 筆", () => {
    for (let i = 0; i < 35; i++) beginDebugRequest({ ...info, model: `m${i}` }).abort();
    expect(getDebugRequests().length).toBe(30);
    expect(getDebugRequests()[0].model).toBe("m5");
  });
});

describe("診斷報告", () => {
  it("環境、請求、警告錯誤都在，請求新的在前", () => {
    beginDebugRequest({ endpoint: "https://a.example/v1", model: "舊的", stream: false, messageCount: 3 }).finish({ content: "ok" });
    beginDebugRequest({ endpoint: "https://a.example/v1", model: "新的", stream: true, messageCount: 5 }).finish({
      content: "",
      rawFinishReason: "content_filter",
    });
    pushDebugLog("log", ["一般訊息"]);
    pushDebugLog("error", ["出錯了"]);

    const report = composeDebugReport({
      now: new Date(2026, 10, 12, 1, 30).getTime(),
      sections: [{ title: "環境", lines: ["網頁版本：abc"] }],
      requests: getDebugRequests(),
      logs: getDebugLogs(),
    });

    expect(report).toContain("診斷報告 2026/11/12 01:30:00");
    expect(report).toContain("網頁版本：abc");
    expect(report.indexOf("新的")).toBeLessThan(report.indexOf("舊的"));
    expect(report).toContain("結束原因 content_filter");
    expect(report).toContain("✗ 出錯了");
    expect(report).toContain("一般訊息");
  });

  it("沒有請求時寫明", () => {
    const report = composeDebugReport({ now: Date.now(), sections: [], requests: [], logs: [] });
    expect(report).toContain("還沒有送過請求");
  });
});

describe("端點只留主機", () => {
  it("路徑和參數裡的金鑰不會帶出來", () => {
    expect(endpointHost("https://api.example.com/v1/chat/completions?key=secret")).toBe("api.example.com");
    expect(endpointHost("")).toBe("（沒填）");
    expect(endpointHost("不是網址")).toBe("（網址格式不對）");
  });
});
