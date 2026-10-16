import { describe, expect, it } from "vitest";
import { buildForwardHeaders, checkTarget, isOriginAllowed, isPrivateHost, parseAllowedOrigins } from "./guard";

describe("isPrivateHost", () => {
  it.each(["localhost", "app.localhost", "printer.local", "db.internal", "127.0.0.1", "10.0.0.8", "172.16.4.1", "172.31.255.255", "192.168.1.5", "169.254.169.254", "100.64.0.1", "0.0.0.0", "[::1]", "::1", "fd00::1", "fe80::1", "::ffff:127.0.0.1"])("blocks %s", (host) => {
    expect(isPrivateHost(host)).toBe(true);
  });
  it.each(["example.com", "8.8.8.8", "172.32.0.1", "100.128.0.1", "2606:4700::1111"])("allows %s", (host) => {
    expect(isPrivateHost(host)).toBe(false);
  });
});

describe("checkTarget", () => {
  it("accepts public http and https urls", () => {
    const result = checkTarget("https://mcp.example.com/mcp?x=1");
    expect(result.ok && result.url.href).toBe("https://mcp.example.com/mcp?x=1");
    expect(checkTarget("http://mcp.example.com/sse").ok).toBe(true);
  });
  it("rejects missing, malformed and non-http targets", () => {
    for (const raw of [null, "", "not a url", "ftp://x.example.com/", "javascript:alert(1)"]) {
      expect(checkTarget(raw)).toEqual({ ok: false, code: "bad_target" });
    }
  });
  it("blocks private hosts, including numeric spellings", () => {
    expect(checkTarget("http://192.168.1.5:3000/mcp")).toEqual({ ok: false, code: "private_address" });
    expect(checkTarget("http://2130706433/mcp")).toEqual({ ok: false, code: "private_address" });
  });
  it("allows private hosts only when asked (dev proxy)", () => {
    expect(checkTarget("http://localhost:3001/mcp", { allowPrivate: true }).ok).toBe(true);
  });
});

describe("isOriginAllowed", () => {
  const allowed = parseAllowedOrigins(" https://aguaphone.aguacloud.uk , https://*.pages.dev ");
  it("matches exact and wildcard origins only", () => {
    expect(isOriginAllowed("https://aguaphone.aguacloud.uk", allowed)).toBe(true);
    expect(isOriginAllowed("https://preview.pages.dev", allowed)).toBe(true);
    expect(isOriginAllowed("https://pages.dev.evil.com", allowed)).toBe(false);
    expect(isOriginAllowed("http://preview.pages.dev", allowed)).toBe(false);
    expect(isOriginAllowed(null, allowed)).toBe(false);
  });
});

describe("buildForwardHeaders", () => {
  it("drops browser, cookie and hop-by-hop headers but keeps auth and MCP headers", () => {
    const headers = buildForwardHeaders(new Headers({
      Authorization: "Bearer x", "Mcp-Session-Id": "s", "X-Api-Key": "k", Cookie: "c", Origin: "o",
      "CF-Connecting-IP": "1.1.1.1", "X-Forwarded-For": "2.2.2.2", "Sec-Fetch-Mode": "cors",
    }));
    expect([...headers.keys()].sort()).toEqual(["authorization", "mcp-session-id", "x-api-key"]);
  });
});
