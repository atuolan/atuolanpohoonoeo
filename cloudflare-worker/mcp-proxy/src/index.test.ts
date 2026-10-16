import { afterEach, describe, expect, it, vi } from "vitest";
import worker from "./index";

const env = { ALLOWED_ORIGINS: "https://aguaphone.aguacloud.uk,http://localhost:5173" };
const origin = "https://aguaphone.aguacloud.uk";
const target = encodeURIComponent("https://mcp.example.com/mcp");

afterEach(() => vi.unstubAllGlobals());

describe("mcp-proxy worker", () => {
  it("answers preflight with the requested headers", async () => {
    const response = await worker.fetch(new Request(`https://proxy.test/?target=${target}`, { method: "OPTIONS", headers: { Origin: origin, "Access-Control-Request-Headers": "authorization, x-api-key" } }), env);
    expect(response.status).toBe(204);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe(origin);
    expect(response.headers.get("Access-Control-Allow-Headers")).toBe("authorization, x-api-key");
    expect(response.headers.get("Access-Control-Expose-Headers")).toContain("Mcp-Session-Id");
  });

  it("rejects unknown origins and private targets", async () => {
    const foreign = await worker.fetch(new Request(`https://proxy.test/?target=${target}`, { method: "POST", headers: { Origin: "https://evil.example.com" } }), env);
    expect(foreign.status).toBe(403);
    const local = await worker.fetch(new Request(`https://proxy.test/?target=${encodeURIComponent("http://192.168.1.5:3000/mcp")}`, { method: "POST", headers: { Origin: origin } }), env);
    expect(local.status).toBe(400);
    expect(local.headers.get("X-Mcp-Proxy-Error")).toBe("private_address");
    expect(local.headers.get("Access-Control-Allow-Origin")).toBe(origin);
  });

  it("forwards the request and exposes the session header", async () => {
    const fetchMock = vi.fn(async (_url: string, init: RequestInit) => {
      const headers = new Headers(init.headers);
      expect(headers.get("authorization")).toBe("Bearer abc");
      expect(headers.get("cookie")).toBeNull();
      expect(new TextDecoder().decode(init.body as ArrayBuffer)).toBe('{"jsonrpc":"2.0"}');
      return new Response("{}", { status: 200, headers: { "Content-Type": "application/json", "Mcp-Session-Id": "s1", "Set-Cookie": "a=b" } });
    });
    vi.stubGlobal("fetch", fetchMock);
    const response = await worker.fetch(new Request(`https://proxy.test/?target=${target}`, { method: "POST", headers: { Origin: origin, Authorization: "Bearer abc", Cookie: "x=y", "Content-Type": "application/json" }, body: '{"jsonrpc":"2.0"}' }), env);
    expect(fetchMock.mock.calls[0][0]).toBe("https://mcp.example.com/mcp");
    expect(response.status).toBe(200);
    expect(response.headers.get("Mcp-Session-Id")).toBe("s1");
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe(origin);
    expect(response.headers.get("Set-Cookie")).toBeNull();
  });

  it("reports an unreachable upstream as 502", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("fetch failed"); }));
    const response = await worker.fetch(new Request(`https://proxy.test/?target=${target}`, { method: "GET", headers: { Origin: origin } }), env);
    expect(response.status).toBe(502);
    expect(response.headers.get("X-Mcp-Proxy-Error")).toBe("upstream_unreachable");
  });
});
