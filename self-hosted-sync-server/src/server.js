import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import http from "node:http";
import { WebSocketServer } from "ws";

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(__dirname, "..");
const dataDir = resolve(process.env.SYNC_DATA_DIR || join(rootDir, "data"));
const storePath = join(dataDir, "store.json");
const port = Number(process.env.PORT || 3004);
const accessTokenTtlSeconds = Number(process.env.SYNC_ACCESS_TOKEN_TTL_SECONDS || 3600);
const refreshTokenTtlSeconds = Number(process.env.SYNC_REFRESH_TOKEN_TTL_SECONDS || 60 * 60 * 24 * 30);
const adminPassword = process.env.ADMIN_PASSWORD || "admin";
const adminTokenTtlSeconds = Number(process.env.ADMIN_TOKEN_TTL_SECONDS || 60 * 60 * 8);
const adminHtmlPath = join(__dirname, "admin.html");

if (adminPassword === "admin") {
  console.warn(
    "[SelfHostedSyncServer] ADMIN_PASSWORD not set, defaulting to 'admin'. " +
      "Set ADMIN_PASSWORD env var for real deployments.",
  );
}

mkdirSync(dataDir, { recursive: true });

const store = loadStore();
if (!store.meta.tokenSecret) {
  store.meta.tokenSecret = process.env.SYNC_TOKEN_SECRET || randomBytes(32).toString("hex");
  saveStore();
}

const wsServer = new WebSocketServer({ noServer: true });
const syncSocketClients = new Map();

const server = http.createServer(async (req, res) => {
  try {
    addCorsHeaders(res);

    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    const url = new URL(req.url || "/", `http://${req.headers.host || `127.0.0.1:${port}`}`);

    if (req.method === "GET" && url.pathname === "/") {
      return sendJson(res, 200, {
        ok: true,
        service: "aguaphone-self-hosted-sync-server",
        serverTime: Date.now(),
        version: "0.1.0",
        endpoints: [
          "GET /health",
          "POST /auth/register",
          "POST /auth/login",
          "POST /auth/refresh",
          "GET /sync/status",
          "GET /sync/meta",
          "POST /sync/push",
          "GET /sync/pull?since=...",
          "GET /admin  (admin UI)",
          "POST /admin/login",
          "GET /admin/api/overview",
          "GET /admin/api/entities?limit=100&offset=0&userId=...&entityType=...",
        ],
      });
    }

    if (req.method === "GET" && url.pathname === "/health") {
      return sendJson(res, 200, {
        ok: true,
        serverTime: Date.now(),
        version: "0.1.0",
      });
    }

    if (req.method === "POST" && url.pathname === "/auth/register") {
      const body = await readJsonBody(req);
      const username = normalizeRequiredString(body.username, "username");
      const password = normalizeRequiredString(body.password, "password");
      const deviceId = normalizeRequiredString(body.deviceId, "deviceId");
      const userKey = username.toLowerCase();

      if (store.users.some((user) => user.usernameKey === userKey)) {
        return sendError(res, 409, "Username already exists");
      }

      const now = Date.now();
      const userId = randomId("usr");
      const passwordSalt = randomBytes(16).toString("hex");
      const passwordHash = hashPassword(password, passwordSalt);

      store.users.push({
        id: userId,
        username,
        usernameKey: userKey,
        passwordSalt,
        passwordHash,
        createdAt: now,
        updatedAt: now,
      });

      const auth = issueAuthSession({ userId, deviceId, username });
      saveStore();
      return sendJson(res, 200, auth);
    }

    if (req.method === "POST" && url.pathname === "/auth/login") {
      const body = await readJsonBody(req);
      const username = normalizeRequiredString(body.username, "username");
      const password = normalizeRequiredString(body.password, "password");
      const deviceId = normalizeRequiredString(body.deviceId, "deviceId");
      const userKey = username.toLowerCase();
      const user = store.users.find((item) => item.usernameKey === userKey);

      if (!user || !verifyPassword(password, user.passwordSalt, user.passwordHash)) {
        return sendError(res, 401, "Invalid username or password");
      }

      user.updatedAt = Date.now();
      const auth = issueAuthSession({ userId: user.id, deviceId, username: user.username });
      saveStore();
      return sendJson(res, 200, auth);
    }

    if (req.method === "POST" && url.pathname === "/auth/refresh") {
      const body = await readJsonBody(req);
      const refreshToken = normalizeRequiredString(body.refreshToken, "refreshToken");
      const deviceId = normalizeRequiredString(body.deviceId, "deviceId");
      const refreshRecord = store.refreshTokens.find((item) => item.token === refreshToken);

      if (!refreshRecord || refreshRecord.expiresAt < Date.now()) {
        return sendError(res, 401, "Refresh token is invalid or expired");
      }
      if (refreshRecord.deviceId !== deviceId) {
        return sendError(res, 401, "Refresh token device mismatch");
      }

      const user = store.users.find((item) => item.id === refreshRecord.userId);
      if (!user) {
        return sendError(res, 401, "Refresh token user not found");
      }

      store.refreshTokens = store.refreshTokens.filter((item) => item.token !== refreshToken);
      const auth = issueAuthSession({ userId: user.id, deviceId, username: user.username });
      saveStore();
      return sendJson(res, 200, auth);
    }

    if (req.method === "GET" && url.pathname === "/sync/status") {
      const auth = requireBearerAuth(req);
      return sendJson(res, 200, {
        ok: true,
        serverTime: Date.now(),
        apiVersion: "0.1.0",
        userId: auth.userId,
      });
    }

    if (req.method === "GET" && url.pathname === "/sync/meta") {
      const auth = requireBearerAuth(req);
      const syncMeta = getSyncMetaForUser(auth.userId);
      return sendJson(res, 200, {
        ok: true,
        serverTime: Date.now(),
        userId: auth.userId,
        latestUpdateAt: syncMeta.latestUpdateAt,
        devices: Object.entries(syncMeta.devices)
          .map(([deviceId, deviceMeta]) => ({
            deviceId,
            lastPushAt: deviceMeta.lastPushAt ?? null,
            lastSeenAt: deviceMeta.lastSeenAt ?? null,
          }))
          .sort((a, b) => (b.lastPushAt || 0) - (a.lastPushAt || 0)),
      });
    }

    if (req.method === "POST" && url.pathname === "/sync/push") {
      const auth = requireBearerAuth(req);
      const body = await readJsonBody(req);
      const deviceId = normalizeRequiredString(body.deviceId, "deviceId");
      if (deviceId !== auth.deviceId) {
        return sendError(res, 403, "Device mismatch");
      }
      const items = Array.isArray(body.items) ? body.items : null;
      if (!items) {
        return sendError(res, 400, "items must be an array");
      }

      const serverTime = Date.now();
      let accepted = 0;
      const rejected = [];

      for (const item of items) {
        const validationError = validateSyncEnvelope(item);
        if (validationError) {
          rejected.push({
            entityType: item?.entityType || "unknown",
            entityId: item?.entityId || "unknown",
            reason: validationError,
          });
          continue;
        }

        upsertEntity({
          userId: auth.userId,
          entity: {
            ...item,
            updatedAt: Number(item.updatedAt),
            deletedAt: item.deletedAt === null ? null : Number(item.deletedAt),
            schemaVersion: Number(item.schemaVersion),
            payload: item.payload ?? null,
            receivedAt: serverTime,
            deviceId,
          },
        });
        accepted += 1;
      }

      if (accepted > 0) {
        markUserSyncUpdated(auth.userId, auth.deviceId, serverTime);
      }

      saveStore();
      notifySyncUpdate({
        userId: auth.userId,
        sourceDeviceId: auth.deviceId,
        serverTime,
        latestUpdateAt: accepted > 0 ? serverTime : getSyncMetaForUser(auth.userId).latestUpdateAt,
        accepted,
      });
      return sendJson(res, 200, {
        ok: true,
        serverTime,
        accepted,
        rejected: rejected.length ? rejected : undefined,
      });
    }

    if (req.method === "GET" && url.pathname === "/sync/pull") {
      const auth = requireBearerAuth(req);
      const sinceRaw = url.searchParams.get("since");
      const since = sinceRaw ? Number(sinceRaw) : undefined;
      if (sinceRaw && !Number.isFinite(since)) {
        return sendError(res, 400, "since must be a number");
      }

      const items = store.entities
        .filter((item) => item.userId === auth.userId)
        .filter((item) => (typeof since === "number" ? item.updatedAt > since : true))
        .sort((a, b) => a.updatedAt - b.updatedAt)
        .map(({ userId, receivedAt, deviceId, ...entity }) => entity);

      return sendJson(res, 200, {
        serverTime: Date.now(),
        items,
      });
    }

    if (req.method === "GET" && (url.pathname === "/admin" || url.pathname === "/admin/")) {
      return sendHtmlFile(res, adminHtmlPath);
    }

    if (req.method === "POST" && url.pathname === "/admin/login") {
      const body = await readJsonBody(req);
      const password = normalizeRequiredString(body.password, "password");
      if (!timingSafeStringEqual(password, adminPassword)) {
        return sendError(res, 401, "Invalid admin password");
      }
      const now = Date.now();
      const adminToken = signToken({
        type: "admin",
        sub: "admin",
        exp: now + adminTokenTtlSeconds * 1000,
      });
      return sendJson(res, 200, {
        adminToken,
        expiresIn: adminTokenTtlSeconds,
      });
    }

    if (req.method === "POST" && url.pathname === "/admin/api/users") {
      requireAdminAuth(req);
      const body = await readJsonBody(req);
      const username = normalizeRequiredString(body.username, "username");
      const password = normalizeRequiredString(body.password, "password");
      const userKey = username.toLowerCase();
      if (store.users.some((u) => u.usernameKey === userKey)) {
        return sendError(res, 409, "Username already exists");
      }
      const now = Date.now();
      const passwordSalt = randomBytes(16).toString("hex");
      const passwordHash = hashPassword(password, passwordSalt);
      const user = {
        id: randomId("usr"),
        username,
        usernameKey: userKey,
        passwordSalt,
        passwordHash,
        createdAt: now,
        updatedAt: now,
      };
      store.users.push(user);
      saveStore();
      return sendJson(res, 200, {
        ok: true,
        user: {
          id: user.id,
          username: user.username,
          createdAt: user.createdAt,
          updatedAt: user.updatedAt,
        },
      });
    }

    if (
      req.method === "POST" &&
      url.pathname.startsWith("/admin/api/users/") &&
      url.pathname.endsWith("/password")
    ) {
      requireAdminAuth(req);
      const userId = url.pathname.slice(
        "/admin/api/users/".length,
        -"/password".length,
      );
      const user = store.users.find((u) => u.id === userId);
      if (!user) return sendError(res, 404, "User not found");
      const body = await readJsonBody(req);
      const password = normalizeRequiredString(body.password, "password");
      user.passwordSalt = randomBytes(16).toString("hex");
      user.passwordHash = hashPassword(password, user.passwordSalt);
      user.updatedAt = Date.now();
      store.refreshTokens = store.refreshTokens.filter(
        (t) => t.userId !== userId,
      );
      saveStore();
      return sendJson(res, 200, { ok: true });
    }

    if (
      req.method === "DELETE" &&
      url.pathname.startsWith("/admin/api/users/")
    ) {
      requireAdminAuth(req);
      const userId = url.pathname.slice("/admin/api/users/".length);
      const idx = store.users.findIndex((u) => u.id === userId);
      if (idx === -1) return sendError(res, 404, "User not found");
      store.users.splice(idx, 1);
      store.refreshTokens = store.refreshTokens.filter(
        (t) => t.userId !== userId,
      );
      store.entities = store.entities.filter((e) => e.userId !== userId);
      saveStore();
      return sendJson(res, 200, { ok: true });
    }

    if (req.method === "GET" && url.pathname === "/admin/api/overview") {
      requireAdminAuth(req);
      const now = Date.now();
      const activeRefreshTokens = store.refreshTokens.filter(
        (item) => item.expiresAt > now,
      );
      const userById = new Map(store.users.map((u) => [u.id, u]));

      const users = store.users
        .slice()
        .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
        .map((u) => ({
          id: u.id,
          username: u.username,
          createdAt: u.createdAt,
          updatedAt: u.updatedAt,
          refreshTokenCount: activeRefreshTokens.filter((t) => t.userId === u.id).length,
          entityCount: store.entities.filter((e) => e.userId === u.id).length,
        }));

      const recentEntities = store.entities
        .slice()
        .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
        .slice(0, 30)
        .map((e) => ({
          entityType: e.entityType,
          entityId: e.entityId,
          userId: e.userId,
          username: userById.get(e.userId)?.username || null,
          deviceId: e.deviceId || null,
          updatedAt: e.updatedAt,
          deletedAt: e.deletedAt ?? null,
        }));

      return sendJson(res, 200, {
        stats: {
          userCount: store.users.length,
          entityCount: store.entities.length,
          refreshTokenCount: activeRefreshTokens.length,
          createdAt: store.meta.createdAt,
          updatedAt: store.meta.updatedAt,
        },
        users,
        recentEntities,
      });
    }

    if (req.method === "GET" && url.pathname === "/admin/api/entities") {
      requireAdminAuth(req);
      const userId = url.searchParams.get("userId") || "";
      const entityType = url.searchParams.get("entityType") || "";
      const limitRaw = Number(url.searchParams.get("limit") || 100);
      const offsetRaw = Number(url.searchParams.get("offset") || 0);
      const limit = Math.min(500, Math.max(1, Number.isFinite(limitRaw) ? limitRaw : 100));
      const offset = Math.max(0, Number.isFinite(offsetRaw) ? offsetRaw : 0);
      const userById = new Map(store.users.map((u) => [u.id, u]));

      const filtered = store.entities
        .filter((entity) => (userId ? entity.userId === userId : true))
        .filter((entity) => (entityType ? entity.entityType === entityType : true))
        .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));

      const items = filtered.slice(offset, offset + limit).map((entity) => ({
        userId: entity.userId,
        username: userById.get(entity.userId)?.username || null,
        entityType: entity.entityType,
        entityId: entity.entityId,
        schemaVersion: entity.schemaVersion,
        updatedAt: entity.updatedAt,
        deletedAt: entity.deletedAt ?? null,
        createdAt: entity.createdAt ?? null,
        receivedAt: entity.receivedAt ?? null,
        deviceId: entity.deviceId ?? null,
        payload: entity.payload ?? null,
      }));

      return sendJson(res, 200, {
        total: filtered.length,
        limit,
        offset,
        items,
      });
    }

    if (
      req.method === "GET" &&
      (url.pathname === "/admin/entities" || url.pathname === "/api/admin/entities")
    ) {
      requireAdminAuth(req);
      const userId = url.searchParams.get("userId") || "";
      const entityType = url.searchParams.get("entityType") || "";
      const limitRaw = Number(url.searchParams.get("limit") || 100);
      const offsetRaw = Number(url.searchParams.get("offset") || 0);
      const limit = Math.min(500, Math.max(1, Number.isFinite(limitRaw) ? limitRaw : 100));
      const offset = Math.max(0, Number.isFinite(offsetRaw) ? offsetRaw : 0);
      const userById = new Map(store.users.map((u) => [u.id, u]));

      const filtered = store.entities
        .filter((entity) => (userId ? entity.userId === userId : true))
        .filter((entity) => (entityType ? entity.entityType === entityType : true))
        .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));

      const items = filtered.slice(offset, offset + limit).map((entity) => ({
        userId: entity.userId,
        username: userById.get(entity.userId)?.username || null,
        entityType: entity.entityType,
        entityId: entity.entityId,
        schemaVersion: entity.schemaVersion,
        updatedAt: entity.updatedAt,
        deletedAt: entity.deletedAt ?? null,
        createdAt: entity.createdAt ?? null,
        receivedAt: entity.receivedAt ?? null,
        deviceId: entity.deviceId ?? null,
        payload: entity.payload ?? null,
      }));

      return sendJson(res, 200, {
        total: filtered.length,
        limit,
        offset,
        items,
      });
    }

    return sendError(res, 404, "Not found");
  } catch (error) {
    console.error("[SelfHostedSyncServer] Request failed:", error);
    return sendError(
      res,
      error?.statusCode || 500,
      error instanceof Error ? error.message : "Internal server error",
    );
  }
});

server.on("error", (error) => {
  if (error && typeof error === "object" && "code" in error) {
    if (error.code === "EADDRINUSE") {
      console.error(
        `[SelfHostedSyncServer] Port ${port} is already in use. ` +
          `Try: $env:PORT=${port + 1}; node src/server.js`,
      );
      process.exit(1);
    }
  }

  console.error("[SelfHostedSyncServer] Failed to start:", error);
  process.exit(1);
});

server.on("upgrade", (req, socket, head) => {
  try {
    const url = new URL(req.url || "/", `http://${req.headers.host || `127.0.0.1:${port}`}`);
    if (url.pathname !== "/sync/ws") {
      socket.write("HTTP/1.1 404 Not Found\r\n\r\n");
      socket.destroy();
      return;
    }

    const token = url.searchParams.get("token") || "";
    if (!token) {
      socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
      socket.destroy();
      return;
    }

    const auth = verifyToken(token);
    req.syncAuth = auth;

    wsServer.handleUpgrade(req, socket, head, (ws) => {
      wsServer.emit("connection", ws, req);
    });
  } catch (error) {
    socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
    socket.destroy();
  }
});

wsServer.on("connection", (ws, req) => {
  const auth = req.syncAuth;
  if (!auth?.userId || !auth?.deviceId) {
    ws.close(1008, "Missing auth context");
    return;
  }

  const client = {
    ws,
    userId: auth.userId,
    deviceId: auth.deviceId,
  };

  syncSocketClients.set(ws, client);

  ws.send(
    JSON.stringify({
      type: "sync:ready",
      userId: auth.userId,
      deviceId: auth.deviceId,
      serverTime: Date.now(),
    }),
  );

  ws.on("message", (raw) => {
    try {
      const payload = JSON.parse(raw.toString("utf8"));
      if (payload?.type === "ping") {
        ws.send(JSON.stringify({ type: "pong", serverTime: Date.now() }));
      }
    } catch {
      ws.send(JSON.stringify({ type: "error", message: "Invalid websocket payload" }));
    }
  });

  ws.on("close", () => {
    syncSocketClients.delete(ws);
  });

  ws.on("error", () => {
    syncSocketClients.delete(ws);
  });
});

server.listen(port, "0.0.0.0", () => {
  console.log(`[SelfHostedSyncServer] listening on http://127.0.0.1:${port}`);
  console.log(`[SelfHostedSyncServer] admin UI:  http://127.0.0.1:${port}/admin`);
  console.log(`[SelfHostedSyncServer] websocket: http://127.0.0.1:${port}/sync/ws?token=...`);
});

function sendHtmlFile(res, filePath) {
  try {
    const html = readFileSync(filePath, "utf8");
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(html);
  } catch (error) {
    console.error("[SelfHostedSyncServer] Failed to read HTML file:", error);
    sendError(res, 500, "Failed to load admin UI");
  }
}

function timingSafeStringEqual(a, b) {
  const bufA = Buffer.from(String(a));
  const bufB = Buffer.from(String(b));
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

function requireAdminAuth(req) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) {
    throw createHttpError(401, "Missing admin bearer token");
  }
  const token = header.slice("Bearer ".length);
  const [encoded, signature] = token.split(".");
  if (!encoded || !signature) {
    throw createHttpError(401, "Malformed admin token");
  }
  const expected = createHmac("sha256", store.meta.tokenSecret)
    .update(encoded)
    .digest("base64url");
  const providedBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (
    providedBuffer.length !== expectedBuffer.length ||
    !timingSafeEqual(providedBuffer, expectedBuffer)
  ) {
    throw createHttpError(401, "Invalid admin token signature");
  }
  let payload;
  try {
    payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
  } catch {
    throw createHttpError(401, "Invalid admin token payload");
  }
  if (!payload || payload.type !== "admin") {
    throw createHttpError(401, "Invalid admin token payload");
  }
  if (!payload.exp || payload.exp < Date.now()) {
    throw createHttpError(401, "Admin token expired");
  }
  return payload;
}

function loadStore() {
  if (!existsSync(storePath)) {
    const initial = {
      meta: {
        schemaVersion: 1,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        tokenSecret: process.env.SYNC_TOKEN_SECRET || "",
        syncUsers: {},
      },
      users: [],
      refreshTokens: [],
      entities: [],
    };
    writeFileSync(storePath, JSON.stringify(initial, null, 2), "utf8");
    return initial;
  }

  const raw = readFileSync(storePath, "utf8");
  const parsed = JSON.parse(raw);
  parsed.meta ||= {};
  parsed.meta.syncUsers ||= {};
  parsed.users ||= [];
  parsed.refreshTokens ||= [];
  parsed.entities ||= [];

  const originalEntityCount = parsed.entities.length;
  parsed.entities = parsed.entities.filter((entity) => entity?.entityType !== "idb_store_snapshot");
  if (parsed.entities.length !== originalEntityCount) {
    parsed.meta.updatedAt = Date.now();
    writeFileSync(storePath, JSON.stringify(parsed, null, 2), "utf8");
  }

  return parsed;
}

function saveStore() {
  store.meta.updatedAt = Date.now();
  writeFileSync(storePath, JSON.stringify(store, null, 2), "utf8");
}

function addCorsHeaders(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
}

function sendJson(res, status, payload) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(payload));
}

function sendError(res, status, message) {
  sendJson(res, status, { error: message });
}

async function readJsonBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  const raw = Buffer.concat(chunks).toString("utf8");
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    throw createHttpError(400, "Invalid JSON body");
  }
}

function normalizeRequiredString(value, fieldName) {
  if (typeof value !== "string" || !value.trim()) {
    throw createHttpError(400, `${fieldName} is required`);
  }
  return value.trim();
}

function createHttpError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function randomId(prefix) {
  return `${prefix}_${randomBytes(12).toString("hex")}`;
}

function hashPassword(password, salt) {
  return scryptSync(password, salt, 64).toString("hex");
}

function verifyPassword(password, salt, expectedHash) {
  const actual = Buffer.from(hashPassword(password, salt), "hex");
  const expected = Buffer.from(expectedHash, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function issueAuthSession({ userId, deviceId, username }) {
  const now = Date.now();
  touchSyncDevice(userId, deviceId, now);
  const accessToken = signToken({
    type: "access",
    userId,
    deviceId,
    username,
    exp: now + accessTokenTtlSeconds * 1000,
  });
  const refreshToken = randomBytes(32).toString("hex");

  store.refreshTokens.push({
    token: refreshToken,
    userId,
    deviceId,
    createdAt: now,
    expiresAt: now + refreshTokenTtlSeconds * 1000,
  });

  return {
    accessToken,
    refreshToken,
    userId,
    expiresIn: accessTokenTtlSeconds,
  };
}

function signToken(payload) {
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = createHmac("sha256", store.meta.tokenSecret).update(encoded).digest("base64url");
  return `${encoded}.${signature}`;
}

function verifyToken(token) {
  const [encoded, signature] = token.split(".");
  if (!encoded || !signature) {
    throw createHttpError(401, "Malformed access token");
  }

  const expected = createHmac("sha256", store.meta.tokenSecret).update(encoded).digest("base64url");
  const providedBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (
    providedBuffer.length !== expectedBuffer.length ||
    !timingSafeEqual(providedBuffer, expectedBuffer)
  ) {
    throw createHttpError(401, "Invalid access token signature");
  }

  let payload;
  try {
    payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
  } catch {
    throw createHttpError(401, "Invalid access token payload");
  }

  if (!payload || payload.type !== "access" || !payload.userId || !payload.deviceId) {
    throw createHttpError(401, "Invalid access token payload");
  }
  if (!payload.exp || payload.exp < Date.now()) {
    throw createHttpError(401, "Access token expired");
  }

  return payload;
}

function requireBearerAuth(req) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) {
    throw createHttpError(401, "Missing bearer token");
  }
  return verifyToken(header.slice("Bearer ".length));
}

function ensureSyncUserState(userId) {
  store.meta.syncUsers ||= {};
  const syncUsers = store.meta.syncUsers;
  syncUsers[userId] ||= {
    latestUpdateAt: null,
    devices: {},
  };
  syncUsers[userId].devices ||= {};
  return syncUsers[userId];
}

function touchSyncDevice(userId, deviceId, lastSeenAt = Date.now()) {
  const userState = ensureSyncUserState(userId);
  userState.devices[deviceId] ||= {
    lastPushAt: null,
    lastSeenAt: null,
  };
  userState.devices[deviceId].lastSeenAt = lastSeenAt;
  return userState.devices[deviceId];
}

function markUserSyncUpdated(userId, deviceId, timestamp) {
  const userState = ensureSyncUserState(userId);
  const deviceState = touchSyncDevice(userId, deviceId, timestamp);
  userState.latestUpdateAt = timestamp;
  deviceState.lastPushAt = timestamp;
  deviceState.lastSeenAt = timestamp;
}

function getSyncMetaForUser(userId) {
  return ensureSyncUserState(userId);
}

function notifySyncUpdate({ userId, sourceDeviceId, serverTime, latestUpdateAt, accepted }) {
  if (!accepted) {
    return;
  }

  const message = JSON.stringify({
    type: "sync:update",
    userId,
    sourceDeviceId,
    serverTime,
    latestUpdateAt: latestUpdateAt ?? null,
    accepted,
  });

  for (const [ws, client] of syncSocketClients.entries()) {
    if (client.userId !== userId) {
      continue;
    }
    if (client.deviceId === sourceDeviceId) {
      continue;
    }
    if (ws.readyState !== ws.OPEN) {
      syncSocketClients.delete(ws);
      continue;
    }
    ws.send(message);
  }
}

function validateSyncEnvelope(item) {
  if (!item || typeof item !== "object") return "Item must be an object";
  if (typeof item.entityType !== "string" || !item.entityType) return "entityType is required";
  if (typeof item.entityId !== "string" || !item.entityId) return "entityId is required";
  if (!Number.isFinite(Number(item.schemaVersion))) return "schemaVersion must be a number";
  if (!Number.isFinite(Number(item.updatedAt))) return "updatedAt must be a number";
  if (!(item.deletedAt === null || Number.isFinite(Number(item.deletedAt)))) {
    return "deletedAt must be null or a number";
  }
  return null;
}

function upsertEntity({ userId, entity }) {
  const existingIndex = store.entities.findIndex(
    (item) =>
      item.userId === userId &&
      item.entityType === entity.entityType &&
      item.entityId === entity.entityId,
  );

  if (existingIndex === -1) {
    store.entities.push({ userId, ...entity });
    return;
  }

  const existing = store.entities[existingIndex];
  if (Number(entity.updatedAt) >= Number(existing.updatedAt)) {
    store.entities[existingIndex] = { userId, ...entity };
  }
}
