import { describe, expect, it, vi } from "vitest";
import { createMcpFetch, toProxyUrl, type McpFetchState } from "./mcpFetch";

const PROXY = "https://proxy.test/";
const TARGET = "https://mcp.example.com/mcp";
const proxied = toProxyUrl(TARGET, PROXY);
const ok = (headers: Record<string, string> = {}) => new Response("{}", { status: 200, headers });

describe("createMcpFetch", () => {
  it("builds proxy urls with the target in the query string", () => {
    expect(proxied).toBe("https://proxy.test/?target=https%3A%2F%2Fmcp.example.com%2Fmcp");
    expect(toProxyUrl(TARGET, "/mcp-proxy")).toBe("/mcp-proxy?target=https%3A%2F%2Fmcp.example.com%2Fmcp");
  });

  it("keeps the direct route when it works", async () => {
    const fetchImpl = vi.fn(async (_url: string | URL, _init?: RequestInit) => ok());
    const state: McpFetchState = { route: "direct" };
    await createMcpFetch({ state, proxyBase: PROXY, fetchImpl })(TARGET, { method: "POST", body: "{}" });
    expect(fetchImpl.mock.calls[0][0]).toBe(TARGET);
    expect(state.route).toBe("direct");
  });

  it("switches to the proxy when direct throws and remembers it", async () => {
    const fetchImpl = vi.fn().mockRejectedValueOnce(new TypeError("Failed to fetch")).mockResolvedValueOnce(ok());
    const state: McpFetchState = { route: "direct" };
    const onRouteChange = vi.fn();
    await createMcpFetch({ state, proxyBase: PROXY, fetchImpl, onRouteChange })(TARGET, { method: "POST", body: "{}" });
    expect(fetchImpl.mock.calls[1][0]).toBe(proxied);
    expect(fetchImpl.mock.calls[1][1]).toMatchObject({ method: "POST", body: "{}" });
    expect(state.route).toBe("proxy");
    expect(onRouteChange).toHaveBeenCalledWith("proxy");
  });

  it("tries direct when the remembered proxy route throws", async () => {
    const fetchImpl = vi.fn().mockRejectedValueOnce(new TypeError("Failed to fetch")).mockResolvedValueOnce(ok());
    const state: McpFetchState = { route: "proxy" };
    await createMcpFetch({ state, proxyBase: PROXY, fetchImpl })(TARGET);
    expect(fetchImpl.mock.calls.map((call) => call[0])).toEqual([proxied, TARGET]);
    expect(state.route).toBe("direct");
  });

  it("tries direct when the proxy reports its own error, and keeps the proxy answer if direct fails too", async () => {
    const proxyError = new Response('{"code":"private_address"}', { status: 400, headers: { "X-Mcp-Proxy-Error": "private_address" } });
    const fetchImpl = vi.fn().mockResolvedValueOnce(proxyError).mockRejectedValueOnce(new TypeError("Mixed Content"));
    const state: McpFetchState = { route: "proxy" };
    const response = await createMcpFetch({ state, proxyBase: PROXY, fetchImpl })(TARGET);
    expect(response.status).toBe(400);
    expect(state.route).toBe("proxy");
    expect(state.proxyErrorCode).toBe("private_address");
  });

  it("does not remember the proxy when it only reports its own error", async () => {
    const fetchImpl = vi.fn()
      .mockRejectedValueOnce(new TypeError("Mixed Content"))
      .mockResolvedValueOnce(new Response("{}", { status: 400, headers: { "X-Mcp-Proxy-Error": "private_address" } }));
    const state: McpFetchState = { route: "direct" };
    const onRouteChange = vi.fn();
    const response = await createMcpFetch({ state, proxyBase: PROXY, fetchImpl, onRouteChange })(TARGET);
    expect(response.status).toBe(400);
    expect(state.route).toBe("direct");
    expect(onRouteChange).not.toHaveBeenCalled();
    expect(state.proxyErrorCode).toBe("private_address");
  });

  it("does not switch routes on HTTP errors and records auth challenges", async () => {
    const fetchImpl = vi.fn(async () => new Response("no", { status: 401, headers: { "WWW-Authenticate": 'Bearer resource_metadata="https://auth.example.com/.well-known/oauth-protected-resource"' } }));
    const state: McpFetchState = { route: "direct" };
    const response = await createMcpFetch({ state, proxyBase: PROXY, fetchImpl })(TARGET);
    expect(response.status).toBe(401);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(state.lastStatus).toBe(401);
    expect(state.lastWwwAuthenticate).toContain("resource_metadata");
  });

  it("rethrows aborts without retrying", async () => {
    const controller = new AbortController();
    controller.abort();
    const fetchImpl = vi.fn(async () => { throw new DOMException("aborted", "AbortError"); });
    await expect(createMcpFetch({ state: { route: "direct" }, proxyBase: PROXY, fetchImpl })(TARGET, { signal: controller.signal })).rejects.toThrow(/aborted/);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});
