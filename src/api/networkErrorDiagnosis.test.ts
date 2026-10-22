import { describe, expect, it } from "vitest";
import { buildNetworkDiagnosis, describeEndpoint, isNetworkErrorMessage } from "./networkErrorDiagnosis";

describe("isNetworkErrorMessage", () => {
  it("認得各瀏覽器的網路錯誤字樣", () => {
    expect(isNetworkErrorMessage("Load failed")).toBe(true);
    expect(isNetworkErrorMessage("Failed to fetch")).toBe(true);
    expect(isNetworkErrorMessage("NetworkError when attempting to fetch resource.")).toBe(true);
    expect(isNetworkErrorMessage("The network connection was lost.")).toBe(true);
    expect(isNetworkErrorMessage("The request timed out.")).toBe(true);
  });

  it("HTTP 錯誤不算網路錯誤", () => {
    expect(isNetworkErrorMessage("API error: 502 - Bad Gateway")).toBe(false);
  });
});

describe("describeEndpoint", () => {
  it("走代理時標出實際的 AI 服務主機", () => {
    expect(describeEndpoint("https://nai-proxy.aguacloud.uk/ai-proxy/api.example.com/v1/chat/completions"))
      .toBe("api.example.com（經代理 nai-proxy.aguacloud.uk）");
  });

  it("直連時只給主機", () => {
    expect(describeEndpoint("https://api.example.com/v1/chat/completions")).toBe("api.example.com");
  });
});

describe("buildNetworkDiagnosis", () => {
  const endpoint = "https://api.example.com/v1/chat/completions";

  it("沒收到回應就斷", () => {
    const text = buildNetworkDiagnosis({ endpoint, startedAt: Date.now(), retried: true });
    expect(text).toContain("還沒收到任何回應就斷了");
    expect(text).toContain("已自動重試一次");
  });

  it("串流中途斷開時列出收到多少", () => {
    const text = buildNetworkDiagnosis({ endpoint, startedAt: Date.now(), chunkCount: 12, totalBytes: 3400 });
    expect(text).toContain("串流中途斷開（已收到 12 段 / 3400 bytes");
  });

  it("沒有片段計數時用字數", () => {
    const text = buildNetworkDiagnosis({ endpoint, startedAt: Date.now(), receivedChars: 80 });
    expect(text).toContain("已收到 80 字");
  });
});
