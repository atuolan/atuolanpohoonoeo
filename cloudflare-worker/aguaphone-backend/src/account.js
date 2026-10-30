// 一個帳號一個 Durable Object：使用者資料、token、同步資料、裝置狀態、WebSocket 都在這裡。
// 對外回應的格式跟 HF／Docker 版同步伺服器一樣，App 不用分辨是哪一種後台。
import { DurableObject } from "cloudflare:workers";
import {
  API_VERSION,
  HttpError,
  base64UrlToBytes,
  bytesToBase64Url,
  decodeText,
  encodeText,
  errorJson,
  json,
  makeRefreshToken,
  normalizeRequiredString,
  randomHex,
  randomId,
  readJsonBody,
  usernameKey,
} from "./common.js";
import { peerComputeBucketHashes } from "./peerHash.js";

const ACCESS_TOKEN_TTL_SECONDS = 3600;
const REFRESH_TOKEN_TTL_SECONDS = 60 * 60 * 24 * 30;
// Workers 的 PBKDF2 最多 100000 次
const PBKDF2_ITERATIONS = 100000;
// Cloudflare SQLite 單列上限 2MB；中文一字 3 bytes，切 50 萬字一塊才保險
const CHUNK_CHARS = 500000;
const SERVER_PEER_ID = "@server";
const PEER_FETCH_BATCH_LIMIT = 100;
const WS_OPEN = 1;

export class AccountDO extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
    this.sql.exec(`
      CREATE TABLE IF NOT EXISTS meta (
        key   TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS refresh_tokens (
        token      TEXT PRIMARY KEY,
        device_id  TEXT    NOT NULL,
        created_at INTEGER NOT NULL,
        expires_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS entities (
        entity_type TEXT    NOT NULL,
        entity_id   TEXT    NOT NULL,
        updated_at  INTEGER NOT NULL,
        deleted_at  INTEGER,
        chunks      INTEGER NOT NULL DEFAULT 0,
        data        TEXT    NOT NULL,
        PRIMARY KEY (entity_type, entity_id)
      );
      CREATE INDEX IF NOT EXISTS idx_entities_updated ON entities (updated_at);
      CREATE TABLE IF NOT EXISTS entity_chunks (
        entity_type TEXT    NOT NULL,
        entity_id   TEXT    NOT NULL,
        idx         INTEGER NOT NULL,
        part        TEXT    NOT NULL,
        PRIMARY KEY (entity_type, entity_id, idx)
      );
    `);
    // App 送的 ping 直接回，不喚醒 DO
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('{"type":"ping"}', '{"type":"pong"}'));
  }

  // ───────────────────────── HTTP ─────────────────────────

  async fetch(request) {
    try {
      return await this.route(request);
    } catch (error) {
      if (error instanceof HttpError) return errorJson(error.statusCode, error.message);
      console.error("[account] unexpected error", error?.stack || error);
      return errorJson(500, "Internal server error");
    }
  }

  async route(request) {
    const url = new URL(request.url);
    const { pathname } = url;
    const method = request.method;

    if (pathname === "/sync/ws") return this.acceptSyncSocket(request, url);

    if (method === "POST" && pathname === "/auth/register") return this.register(await readJsonBody(request));
    if (method === "POST" && pathname === "/auth/login") return this.login(await readJsonBody(request));
    if (method === "POST" && pathname === "/auth/refresh") return this.refresh(await readJsonBody(request));

    const auth = await this.requireBearerAuth(request);

    if (method === "GET" && pathname === "/sync/status") {
      return json(200, { ok: true, serverTime: Date.now(), apiVersion: API_VERSION, userId: auth.userId });
    }
    if (method === "GET" && pathname === "/sync/meta") return this.syncMeta(auth);
    if (method === "POST" && pathname === "/devices/self") return this.updateDeviceSelf(auth, await readJsonBody(request));
    if (method === "POST" && pathname === "/sync/push") return this.push(auth, await readJsonBody(request));
    if (method === "GET" && pathname === "/sync/pull") return this.pull(url);
    if (pathname.startsWith("/generate")) {
      return errorJson(501, "Background generation is not available on this server yet");
    }
    return errorJson(404, "Not found");
  }

  // ───────────────────────── 帳號 ─────────────────────────

  async register(body) {
    const username = normalizeRequiredString(body.username, "username");
    const password = normalizeRequiredString(body.password, "password");
    const deviceId = normalizeRequiredString(body.deviceId, "deviceId");
    if (this.getMeta("user")) return errorJson(409, "Username already exists");

    const now = Date.now();
    const passwordSalt = randomHex(16);
    const user = {
      id: randomId("usr"),
      username,
      usernameKey: usernameKey(username),
      passwordSalt,
      passwordHash: await hashPassword(password, passwordSalt),
      createdAt: now,
      updatedAt: now,
    };
    this.setMeta("user", user);
    return json(200, await this.issueAuthSession(user, deviceId));
  }

  async login(body) {
    const password = normalizeRequiredString(body.password, "password");
    const deviceId = normalizeRequiredString(body.deviceId, "deviceId");
    normalizeRequiredString(body.username, "username");
    const user = this.getMeta("user");
    if (!user || !(await verifyPassword(password, user.passwordSalt, user.passwordHash))) {
      return errorJson(401, "Invalid username or password");
    }
    user.updatedAt = Date.now();
    this.setMeta("user", user);
    return json(200, await this.issueAuthSession(user, deviceId));
  }

  async refresh(body) {
    const refreshToken = normalizeRequiredString(body.refreshToken, "refreshToken");
    const deviceId = normalizeRequiredString(body.deviceId, "deviceId");
    const record = this.sql.exec("SELECT * FROM refresh_tokens WHERE token = ?", refreshToken).toArray()[0];
    if (!record || record.expires_at < Date.now()) {
      return errorJson(401, "Refresh token is invalid or expired");
    }
    if (record.device_id !== deviceId) return errorJson(401, "Refresh token device mismatch");
    const user = this.getMeta("user");
    if (!user) return errorJson(401, "Refresh token user not found");
    this.sql.exec("DELETE FROM refresh_tokens WHERE token = ?", refreshToken);
    return json(200, await this.issueAuthSession(user, deviceId));
  }

  async issueAuthSession(user, deviceId) {
    const now = Date.now();
    this.updateSyncState((state) => touchDevice(state, deviceId, now));
    const accessToken = await this.signToken({
      type: "access",
      userId: user.id,
      deviceId,
      username: user.username,
      uk: user.usernameKey,
      exp: now + ACCESS_TOKEN_TTL_SECONDS * 1000,
    });
    const refreshToken = makeRefreshToken(user.usernameKey);
    this.sql.exec("DELETE FROM refresh_tokens WHERE expires_at < ?", now);
    this.sql.exec(
      "INSERT INTO refresh_tokens (token, device_id, created_at, expires_at) VALUES (?, ?, ?, ?)",
      refreshToken,
      deviceId,
      now,
      now + REFRESH_TOKEN_TTL_SECONDS * 1000,
    );
    return { accessToken, refreshToken, userId: user.id, expiresIn: ACCESS_TOKEN_TTL_SECONDS };
  }

  async hmacKey() {
    if (!this.cachedHmacKey) {
      let secret = this.getMeta("tokenSecret");
      if (!secret) {
        secret = randomHex(32);
        this.setMeta("tokenSecret", secret);
      }
      this.cachedHmacKey = await crypto.subtle.importKey(
        "raw",
        new TextEncoder().encode(secret),
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["sign", "verify"],
      );
    }
    return this.cachedHmacKey;
  }

  async signToken(payload) {
    const encoded = encodeText(JSON.stringify(payload));
    const signature = await crypto.subtle.sign("HMAC", await this.hmacKey(), new TextEncoder().encode(encoded));
    return `${encoded}.${bytesToBase64Url(new Uint8Array(signature))}`;
  }

  async verifyToken(token) {
    const [encoded, signature] = String(token || "").split(".");
    if (!encoded || !signature) throw new HttpError(401, "Malformed access token");
    let valid = false;
    try {
      valid = await crypto.subtle.verify(
        "HMAC",
        await this.hmacKey(),
        base64UrlToBytes(signature),
        new TextEncoder().encode(encoded),
      );
    } catch {
      valid = false;
    }
    if (!valid) throw new HttpError(401, "Invalid access token signature");

    let payload;
    try {
      payload = JSON.parse(decodeText(encoded));
    } catch {
      throw new HttpError(401, "Invalid access token payload");
    }
    if (!payload || payload.type !== "access" || !payload.userId || !payload.deviceId) {
      throw new HttpError(401, "Invalid access token payload");
    }
    if (!payload.exp || payload.exp < Date.now()) throw new HttpError(401, "Access token expired");
    return payload;
  }

  async requireBearerAuth(request) {
    const header = request.headers.get("Authorization") || "";
    if (!header.startsWith("Bearer ")) throw new HttpError(401, "Missing bearer token");
    return this.verifyToken(header.slice("Bearer ".length));
  }

  // ───────────────────────── 同步 ─────────────────────────

  syncMeta(auth) {
    const state = this.getSyncState();
    const onlineDeviceIds = this.onlineDeviceIds();
    const onlineSet = new Set(onlineDeviceIds);
    return json(200, {
      ok: true,
      serverTime: Date.now(),
      userId: auth.userId,
      latestUpdateAt: state.latestUpdateAt,
      onlineDeviceIds,
      onlineCount: onlineDeviceIds.length,
      ...this.entityCounts(),
      devices: Object.entries(state.devices)
        .map(([deviceId, device]) => ({
          deviceId,
          lastPushAt: device.lastPushAt ?? null,
          lastSeenAt: device.lastSeenAt ?? null,
          online: onlineSet.has(deviceId),
          model: device.model ?? null,
          customName: device.customName ?? null,
        }))
        .sort((a, b) => {
          if (a.online !== b.online) return a.online ? -1 : 1;
          return (b.lastPushAt || 0) - (a.lastPushAt || 0);
        }),
    });
  }

  updateDeviceSelf(auth, body) {
    // model 由 client 自動偵測（User-Agent），customName 由使用者輸入
    const modelInput = "model" in body ? sanitizeDeviceInfoString(body.model, 120) : undefined;
    const customNameInput = "customName" in body ? sanitizeDeviceInfoString(body.customName, 60) : undefined;
    if (modelInput === undefined && "model" in body) return errorJson(400, "model must be a string or null");
    if (customNameInput === undefined && "customName" in body) {
      return errorJson(400, "customName must be a string or null");
    }

    let device;
    this.updateSyncState((state) => {
      device = touchDevice(state, auth.deviceId);
      if ("model" in body) device.model = modelInput;
      if ("customName" in body) device.customName = customNameInput;
    });
    const deviceInfo = {
      deviceId: auth.deviceId,
      model: device.model ?? null,
      customName: device.customName ?? null,
      lastPushAt: device.lastPushAt ?? null,
      lastSeenAt: device.lastSeenAt ?? null,
    };
    // 廣播給其他裝置，讓 UI 可即時更新
    this.broadcast({ type: "device:info", userId: auth.userId, deviceId: auth.deviceId, serverTime: Date.now(), device: deviceInfo });
    return json(200, { ok: true, device: deviceInfo });
  }

  push(auth, body) {
    const deviceId = normalizeRequiredString(body.deviceId, "deviceId");
    if (deviceId !== auth.deviceId) return errorJson(403, "Device mismatch");
    const items = Array.isArray(body.items) ? body.items : null;
    if (!items) return errorJson(400, "items must be an array");

    const serverTime = Date.now();
    let accepted = 0;
    const rejected = [];

    this.ctx.storage.transactionSync(() => {
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
        this.upsertEntity({
          ...item,
          updatedAt: Number(item.updatedAt),
          deletedAt: item.deletedAt === null ? null : Number(item.deletedAt),
          schemaVersion: Number(item.schemaVersion),
          payload: item.payload ?? null,
          receivedAt: serverTime,
          deviceId,
        });
        accepted += 1;
      }
    });

    if (accepted > 0) this.markSyncUpdated(auth.deviceId, serverTime);
    if (accepted > 0) {
      const onlineDeviceIds = this.onlineDeviceIds();
      this.broadcast(
        {
          type: "sync:update",
          userId: auth.userId,
          sourceDeviceId: auth.deviceId,
          serverTime,
          latestUpdateAt: serverTime,
          accepted,
          onlineDeviceIds,
          onlineCount: onlineDeviceIds.length,
        },
        auth.deviceId,
      );
    }
    return json(200, { ok: true, serverTime, accepted, rejected: rejected.length ? rejected : undefined });
  }

  pull(url) {
    const sinceRaw = url.searchParams.get("since");
    const since = sinceRaw ? Number(sinceRaw) : undefined;
    if (sinceRaw && !Number.isFinite(since)) return errorJson(400, "since must be a number");
    const limitRaw = url.searchParams.get("limit");
    const limit = limitRaw ? Math.min(Math.max(1, Number(limitRaw)), 1000) : 300;

    // 同一個 updatedAt 的資料一定整批放進同一頁，不然下一頁用 updated_at > since 會漏掉
    const from = typeof since === "number" ? since : Number.MIN_SAFE_INTEGER;
    const boundary = this.sql
      .exec("SELECT updated_at FROM entities WHERE updated_at > ? ORDER BY updated_at LIMIT 1 OFFSET ?", from, limit - 1)
      .toArray()[0];
    const rows = boundary
      ? this.sql
          .exec(
            "SELECT * FROM entities WHERE updated_at > ? AND updated_at <= ? ORDER BY updated_at",
            from,
            boundary.updated_at,
          )
          .toArray()
      : this.sql.exec("SELECT * FROM entities WHERE updated_at > ? ORDER BY updated_at", from).toArray();
    const hasMore =
      !!boundary &&
      this.sql.exec("SELECT 1 FROM entities WHERE updated_at > ? LIMIT 1", boundary.updated_at).toArray().length > 0;
    const items = rows.map((row) => toClientEntity(this.readEntityData(row)));
    const nextSince = hasMore ? boundary.updated_at : null;
    return json(200, { serverTime: Date.now(), items, hasMore, nextSince });
  }

  // ───────────────────────── 同步資料表 ─────────────────────────

  upsertEntity(entity) {
    const updatedAt = Number(entity.updatedAt) || 0;
    const existing = this.sql
      .exec("SELECT updated_at, chunks FROM entities WHERE entity_type = ? AND entity_id = ?", entity.entityType, entity.entityId)
      .toArray()[0];
    // 以後寫的為準：updatedAt 比較新（或一樣）才覆蓋
    if (existing && updatedAt < existing.updated_at) return;
    if (existing?.chunks) {
      this.sql.exec("DELETE FROM entity_chunks WHERE entity_type = ? AND entity_id = ?", entity.entityType, entity.entityId);
    }

    const text = JSON.stringify(entity);
    const parts = text.length > CHUNK_CHARS ? splitText(text, CHUNK_CHARS) : null;
    const deletedAt = entity.deletedAt === null || entity.deletedAt === undefined ? null : Number(entity.deletedAt);
    this.sql.exec(
      `INSERT OR REPLACE INTO entities (entity_type, entity_id, updated_at, deleted_at, chunks, data)
       VALUES (?, ?, ?, ?, ?, ?)`,
      entity.entityType,
      entity.entityId,
      updatedAt,
      deletedAt,
      parts ? parts.length : 0,
      parts ? "" : text,
    );
    if (parts) {
      parts.forEach((part, idx) => {
        this.sql.exec(
          "INSERT INTO entity_chunks (entity_type, entity_id, idx, part) VALUES (?, ?, ?, ?)",
          entity.entityType,
          entity.entityId,
          idx,
          part,
        );
      });
    }
  }

  readEntityData(row) {
    if (!row.chunks) return JSON.parse(row.data);
    const parts = this.sql
      .exec("SELECT part FROM entity_chunks WHERE entity_type = ? AND entity_id = ? ORDER BY idx", row.entity_type, row.entity_id)
      .toArray();
    return JSON.parse(parts.map((p) => p.part).join(""));
  }

  getEntity(entityType, entityId) {
    const row = this.sql
      .exec("SELECT * FROM entities WHERE entity_type = ? AND entity_id = ?", entityType, entityId)
      .toArray()[0];
    return row ? toClientEntity(this.readEntityData(row)) : null;
  }

  listRefs(typeFilter = null) {
    const refs = [];
    for (const row of this.sql.exec("SELECT entity_type, entity_id, updated_at, deleted_at FROM entities")) {
      if (typeFilter && !typeFilter.has(row.entity_type)) continue;
      refs.push({
        entityType: row.entity_type,
        entityId: row.entity_id,
        updatedAt: Number(row.updated_at) || 0,
        deletedAt: row.deleted_at ?? null,
      });
    }
    return refs;
  }

  entityCounts() {
    const entityCounts = {};
    let totalActiveItems = 0;
    let totalDeletedItems = 0;
    const rows = this.sql.exec(
      "SELECT entity_type, deleted_at IS NOT NULL AS deleted, COUNT(*) AS n FROM entities GROUP BY entity_type, deleted",
    );
    for (const row of rows) {
      if (row.deleted) {
        totalDeletedItems += row.n;
        continue;
      }
      totalActiveItems += row.n;
      entityCounts[row.entity_type] = (entityCounts[row.entity_type] || 0) + row.n;
    }
    return { entityCounts, totalActiveItems, totalDeletedItems };
  }

  // ───────────────────────── 裝置狀態 ─────────────────────────

  getMeta(key) {
    const row = this.sql.exec("SELECT value FROM meta WHERE key = ?", key).toArray()[0];
    return row ? JSON.parse(row.value) : null;
  }

  setMeta(key, value) {
    this.sql.exec("INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)", key, JSON.stringify(value));
  }

  getSyncState() {
    const state = this.getMeta("syncState") || {};
    state.latestUpdateAt ??= null;
    state.devices ||= {};
    return state;
  }

  updateSyncState(mutate) {
    const state = this.getSyncState();
    mutate(state);
    this.setMeta("syncState", state);
    return state;
  }

  markSyncUpdated(deviceId, timestamp) {
    this.updateSyncState((state) => {
      const device = touchDevice(state, deviceId, timestamp);
      state.latestUpdateAt = timestamp;
      device.lastPushAt = timestamp;
    });
  }

  // ───────────────────────── WebSocket ─────────────────────────

  async acceptSyncSocket(request, url) {
    if (request.headers.get("Upgrade") !== "websocket") {
      return new Response("Expected websocket", { status: 426 });
    }
    let auth;
    try {
      auth = await this.verifyToken(url.searchParams.get("token") || "");
    } catch {
      return new Response("Unauthorized", { status: 401 });
    }

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({ userId: auth.userId, deviceId: auth.deviceId });

    const onlineDeviceIds = this.onlineDeviceIds();
    server.send(
      JSON.stringify({
        type: "sync:ready",
        userId: auth.userId,
        deviceId: auth.deviceId,
        serverTime: Date.now(),
        onlineDeviceIds,
        onlineCount: onlineDeviceIds.length,
      }),
    );
    this.broadcastPresence(auth.userId);
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws, raw) {
    const client = ws.deserializeAttachment();
    try {
      const payload = JSON.parse(typeof raw === "string" ? raw : new TextDecoder().decode(raw));
      if (payload?.type === "ping") {
        ws.send(JSON.stringify({ type: "pong", serverTime: Date.now() }));
        return;
      }
      if (typeof payload?.type === "string" && payload.type.startsWith("peer:")) {
        this.handlePeerMessage(ws, client, payload);
      }
    } catch {
      ws.send(JSON.stringify({ type: "error", message: "Invalid websocket payload" }));
    }
  }

  async webSocketClose(ws, code, reason) {
    try {
      ws.close(code, reason);
    } catch {
      // 已經關了
    }
    const client = ws.deserializeAttachment();
    if (client?.userId) this.broadcastPresence(client.userId);
  }

  async webSocketError(ws) {
    const client = ws.deserializeAttachment();
    if (client?.userId) this.broadcastPresence(client.userId);
  }

  openSockets() {
    return this.ctx.getWebSockets().filter((ws) => ws.readyState === WS_OPEN);
  }

  onlineDeviceIds() {
    const ids = new Set();
    for (const ws of this.openSockets()) {
      const client = ws.deserializeAttachment();
      if (client?.deviceId) ids.add(client.deviceId);
    }
    return Array.from(ids);
  }

  broadcast(message, exceptDeviceId = null) {
    const text = JSON.stringify(message);
    for (const ws of this.openSockets()) {
      if (exceptDeviceId && ws.deserializeAttachment()?.deviceId === exceptDeviceId) continue;
      try {
        ws.send(text);
      } catch {
        // 連線剛好斷掉
      }
    }
  }

  broadcastPresence(userId) {
    const onlineDeviceIds = this.onlineDeviceIds();
    this.broadcast({
      type: "presence:update",
      userId,
      serverTime: Date.now(),
      onlineDeviceIds,
      onlineCount: onlineDeviceIds.length,
    });
  }

  // ───────────────────────── Peer ─────────────────────────

  handlePeerMessage(ws, client, payload) {
    const targetDeviceId = payload.targetDeviceId;
    if (typeof targetDeviceId !== "string" || !targetDeviceId) {
      sendPeerError(ws, payload.requestId, "missing-target");
      return;
    }
    if (targetDeviceId === SERVER_PEER_ID) {
      this.handleServerPeerRequest(ws, client, payload);
      return;
    }

    // 中繼給同帳號的目標裝置
    const target = this.openSockets().find((s) => s.deserializeAttachment()?.deviceId === targetDeviceId);
    if (!target) {
      sendPeerError(ws, payload.requestId, "peer-offline", { targetDeviceId });
      return;
    }
    // 伺服器權威填入 sourceDeviceId，防偽造
    target.send(JSON.stringify({ ...payload, sourceDeviceId: client.deviceId }));
  }

  handleServerPeerRequest(ws, client, payload) {
    switch (payload.type) {
      case "peer:hash-request": {
        const { buckets, rootHash, totalCount } = peerComputeBucketHashes(this.listRefs());
        ws.send(
          JSON.stringify({
            type: "peer:hash-response",
            requestId: payload.requestId,
            sourceDeviceId: SERVER_PEER_ID,
            buckets,
            rootHash,
            totalCount,
          }),
        );
        return;
      }
      case "peer:manifest-request": {
        const filterArr = Array.isArray(payload.entityTypes) ? payload.entityTypes : null;
        const filter = filterArr && filterArr.length > 0 ? new Set(filterArr) : null;
        const entries = this.listRefs(filter);
        ws.send(
          JSON.stringify({
            type: "peer:manifest-response",
            requestId: payload.requestId,
            sourceDeviceId: SERVER_PEER_ID,
            totalCount: entries.length,
            entries,
            ...(filter ? { entityTypes: Array.from(filter) } : {}),
          }),
        );
        return;
      }
      case "peer:fetch-request":
        this.handleServerFetchRequest(ws, payload);
        return;
      case "peer:apply-request":
        this.handleServerApplyRequest(ws, client, payload);
        return;
      default:
        sendPeerError(ws, payload.requestId, "unsupported-peer-type-for-server", { type: payload.type });
    }
  }

  handleServerFetchRequest(ws, payload) {
    const refs = Array.isArray(payload.entityRefs) ? payload.entityRefs : [];
    const seen = new Set();
    const envelopes = [];
    for (const ref of refs) {
      const key = `${ref?.entityType}::${ref?.entityId}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const item = this.getEntity(ref.entityType, ref.entityId);
      if (!item) continue;
      envelopes.push({
        entityType: item.entityType,
        entityId: item.entityId,
        schemaVersion: item.schemaVersion ?? 1,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
        deletedAt: item.deletedAt ?? null,
        payload: item.payload,
      });
    }

    // 跟裝置端回應一樣：同一個 requestId 連續送完所有批次，最後一批 hasMore=false
    let i = 0;
    do {
      const batch = envelopes.slice(i, i + PEER_FETCH_BATCH_LIMIT);
      i += PEER_FETCH_BATCH_LIMIT;
      const hasMore = i < envelopes.length;
      ws.send(
        JSON.stringify({
          type: "peer:fetch-response",
          requestId: payload.requestId,
          sourceDeviceId: SERVER_PEER_ID,
          envelopes: batch,
          hasMore,
          nextCursor: null,
        }),
      );
    } while (i < envelopes.length);
  }

  handleServerApplyRequest(ws, client, payload) {
    const envelopes = Array.isArray(payload.envelopes) ? payload.envelopes : [];
    let applied = 0;
    const rejected = [];

    this.ctx.storage.transactionSync(() => {
      for (const envelope of envelopes) {
        if (
          !envelope ||
          typeof envelope.entityType !== "string" ||
          typeof envelope.entityId !== "string" ||
          typeof envelope.updatedAt !== "number"
        ) {
          rejected.push({
            entityType: envelope?.entityType ?? "?",
            entityId: envelope?.entityId ?? "?",
            reason: "invalid-envelope",
          });
          continue;
        }
        this.upsertEntity({
          entityType: envelope.entityType,
          entityId: envelope.entityId,
          schemaVersion: envelope.schemaVersion ?? 1,
          createdAt: envelope.createdAt,
          updatedAt: envelope.updatedAt,
          deletedAt: envelope.deletedAt ?? null,
          payload: envelope.payload,
        });
        applied += 1;
      }
    });

    if (applied > 0) this.markSyncUpdated(client.deviceId, Date.now());
    ws.send(
      JSON.stringify({
        type: "peer:apply-response",
        requestId: payload.requestId,
        sourceDeviceId: SERVER_PEER_ID,
        applied,
        rejected,
        serverTime: Date.now(),
      }),
    );
  }
}

// ───────────────────────── 工具 ─────────────────────────

// 這兩個欄位只給伺服器自己看，回給裝置時拿掉
function toClientEntity({ receivedAt, deviceId, ...entity }) {
  return entity;
}

// 切塊時不能把 emoji 的一對 surrogate 切開，不然存進 SQLite 會變亂碼
function splitText(text, size) {
  const parts = [];
  let start = 0;
  while (start < text.length) {
    let end = Math.min(start + size, text.length);
    const last = text.charCodeAt(end - 1);
    if (end < text.length && last >= 0xd800 && last <= 0xdbff) end -= 1;
    parts.push(text.slice(start, end));
    start = end;
  }
  return parts;
}

function touchDevice(state, deviceId, lastSeenAt = Date.now()) {
  state.devices[deviceId] ||= { lastPushAt: null, lastSeenAt: null, model: null, customName: null };
  const device = state.devices[deviceId];
  device.lastSeenAt = lastSeenAt;
  return device;
}

function sanitizeDeviceInfoString(value, maxLength) {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string") return undefined; // undefined = invalid
  const trimmed = value.trim();
  if (trimmed.length === 0) return null;
  return trimmed.length > maxLength ? trimmed.slice(0, maxLength) : trimmed;
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

function sendPeerError(ws, requestId, reason, detail) {
  ws.send(JSON.stringify({ type: "peer:error", requestId: requestId ?? null, reason, detail: detail ?? null }));
}

async function hashPassword(password, salt) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt: new TextEncoder().encode(salt), iterations: PBKDF2_ITERATIONS },
    key,
    256,
  );
  return Array.from(new Uint8Array(bits), (b) => b.toString(16).padStart(2, "0")).join("");
}

async function verifyPassword(password, salt, expectedHash) {
  const actual = new TextEncoder().encode(await hashPassword(password, salt));
  const expected = new TextEncoder().encode(String(expectedHash));
  return actual.length === expected.length && crypto.subtle.timingSafeEqual(actual, expected);
}
