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
const generationTaskTtlMs = Number(process.env.GENERATION_TASK_TTL_MS || 60 * 60 * 1000);
const generationTaskTimeoutMs = Number(process.env.GENERATION_TASK_TIMEOUT_MS || 5 * 60 * 1000);
const maxConcurrentGenerationTasks = Number(process.env.GENERATION_MAX_CONCURRENT || 3);
const generationTaskControllers = new Map();
// Cloudflare Web Push 端點：任務完成時轉發推送請求，讓使用者關閉瀏覽器後仍能收到通知。
// 預設指向既有的雲端推送 Worker；可用 CLOUD_PUSH_NOTIFY_URL 覆寫或停用（設為空字串）。
const cloudPushNotifyUrl =
  process.env.CLOUD_PUSH_NOTIFY_URL !== undefined
    ? process.env.CLOUD_PUSH_NOTIFY_URL
    : "https://push.aguacloud.uk/push/notify";

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
markStaleGenerationTasksAfterBoot();
cleanupExpiredGenerationTasks();
setInterval(cleanupExpiredGenerationTasks, Math.min(generationTaskTtlMs, 15 * 60 * 1000)).unref?.();

// INITIAL_USERS: 格式 "username1:password1,username2:password2"
// HF Spaces 重啟後資料會消失，此設定可讓伺服器自動補建帳號，免去手動重新註冊。
if (process.env.INITIAL_USERS) {
  let seeded = false;
  for (const entry of process.env.INITIAL_USERS.split(",")) {
    const colonIdx = entry.indexOf(":");
    if (colonIdx < 1) continue;
    const username = entry.slice(0, colonIdx).trim();
    const password = entry.slice(colonIdx + 1).trim();
    if (!username || !password) continue;
    const userKey = username.toLowerCase();
    if (!store.users.some((u) => u.usernameKey === userKey)) {
      const now = Date.now();
      const passwordSalt = randomBytes(16).toString("hex");
      const passwordHash = hashPassword(password, passwordSalt);
      store.users.push({
        id: randomId("usr"),
        username,
        usernameKey: userKey,
        passwordSalt,
        passwordHash,
        createdAt: now,
        updatedAt: now,
      });
      console.log(`[SelfHostedSyncServer] INITIAL_USERS: 已建立帳號 "${username}"`);
      seeded = true;
    }
  }
  if (seeded) saveStore();
}

const wsServer = new WebSocketServer({
  noServer: true,
  // 開啟 permessage-deflate：JSON manifest/envelope 重複欄位多，壓縮率約 70–90%。
  // 瀏覽器 WebSocket 自動協商此擴充，client 不需任何改動。
  perMessageDeflate: {
    zlibDeflateOptions: { level: 6 },
    threshold: 1024, // 小於 1KB 的訊息不壓縮，省 CPU
    clientNoContextTakeover: false,
    serverNoContextTakeover: false,
  },
});
const syncSocketClients = new Map();

let activeTunnel = null;

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
          "POST /devices/self  (update own device model/customName)",
          "POST /generate  (start background AI generation)",
          "GET /generate?status=running,pending,done",
          "GET /generate/pending?chatId=...&lastMessageHash=...",
          "GET /generate/:taskId",
          "POST /generate/:taskId/abort",
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
      const onlineDeviceIds = getOnlineDeviceIdsForUser(auth.userId);
      const onlineSet = new Set(onlineDeviceIds);
      const { entityCounts, totalActiveItems, totalDeletedItems } =
        computeUserEntityCounts(auth.userId);
      return sendJson(res, 200, {
        ok: true,
        serverTime: Date.now(),
        userId: auth.userId,
        latestUpdateAt: syncMeta.latestUpdateAt,
        onlineDeviceIds,
        onlineCount: onlineDeviceIds.length,
        entityCounts,
        totalActiveItems,
        totalDeletedItems,
        devices: Object.entries(syncMeta.devices)
          .map(([deviceId, deviceMeta]) => ({
            deviceId,
            lastPushAt: deviceMeta.lastPushAt ?? null,
            lastSeenAt: deviceMeta.lastSeenAt ?? null,
            online: onlineSet.has(deviceId),
            model: deviceMeta.model ?? null,
            customName: deviceMeta.customName ?? null,
          }))
          .sort((a, b) => {
            if (a.online !== b.online) return a.online ? -1 : 1;
            return (b.lastPushAt || 0) - (a.lastPushAt || 0);
          }),
      });
    }

    if (req.method === "POST" && url.pathname === "/devices/self") {
      const auth = requireBearerAuth(req);
      const body = await readJsonBody(req);
      // model 由 client 自動偵測（User-Agent），customName 由使用者輸入
      const modelInput = "model" in body ? sanitizeDeviceInfoString(body.model, 120) : undefined;
      const customNameInput =
        "customName" in body ? sanitizeDeviceInfoString(body.customName, 60) : undefined;

      if (modelInput === undefined && "model" in body) {
        return sendError(res, 400, "model must be a string or null");
      }
      if (customNameInput === undefined && "customName" in body) {
        return sendError(res, 400, "customName must be a string or null");
      }

      const updates = {};
      if ("model" in body) updates.model = modelInput;
      if ("customName" in body) updates.customName = customNameInput;

      const deviceState = setDeviceInfo(auth.userId, auth.deviceId, updates);
      saveStore();

      // 廣播給同 user 的其他裝置，讓 UI 可即時更新
      broadcastDeviceInfoUpdate(auth.userId, auth.deviceId, deviceState);

      return sendJson(res, 200, {
        ok: true,
        device: {
          deviceId: auth.deviceId,
          model: deviceState.model ?? null,
          customName: deviceState.customName ?? null,
          lastPushAt: deviceState.lastPushAt ?? null,
          lastSeenAt: deviceState.lastSeenAt ?? null,
        },
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
      const limitRaw = url.searchParams.get("limit");
      const limit = limitRaw ? Math.min(Math.max(1, Number(limitRaw)), 1000) : 300;

      const sorted = store.entities
        .filter((item) => item.userId === auth.userId)
        .filter((item) => (typeof since === "number" ? item.updatedAt > since : true))
        .sort((a, b) => a.updatedAt - b.updatedAt);

      const hasMore = sorted.length > limit;
      const page = sorted.slice(0, limit);
      const nextSince = hasMore ? page[page.length - 1].updatedAt : null;
      const items = page.map(({ userId, receivedAt, deviceId, ...entity }) => entity);

      return sendJson(res, 200, {
        serverTime: Date.now(),
        items,
        hasMore,
        nextSince,
      });
    }

    if (req.method === "POST" && url.pathname === "/generate") {
      const auth = requireBearerAuth(req);
      const body = await readJsonBody(req);
      const deviceId = normalizeRequiredString(body.deviceId, "deviceId");
      if (deviceId !== auth.deviceId) {
        return sendError(res, 403, "Device mismatch");
      }

      const chatId = normalizeRequiredString(body.chatId, "chatId");
      const taskType = normalizeRequiredString(body.taskType, "taskType");
      const endpoint = normalizeRequiredString(body.endpoint, "endpoint").replace(/\/+$/, "");
      const model = normalizeRequiredString(body.model, "model");
      const messages = Array.isArray(body.messages) ? body.messages : null;
      if (!messages) return sendError(res, 400, "messages must be an array");

      const runningCount = countActiveGenerationTasks(auth.userId);
      if (runningCount >= maxConcurrentGenerationTasks) {
        return sendError(res, 429, "Too many active generation tasks");
      }

      const now = Date.now();
      const task = {
        taskId: randomId("bgtask"),
        userId: auth.userId,
        deviceId,
        chatId,
        taskType,
        status: "pending",
        content: "",
        error: null,
        lastMessageHash: typeof body.lastMessageHash === "string" ? body.lastMessageHash : null,
        // 雲端推送資訊：任務完成時用來呼叫 Cloudflare /push/notify，
        // 讓使用者即使關閉瀏覽器也能收到系統推送
        cloudPushUserId: typeof body.cloudPushUserId === "string" ? body.cloudPushUserId : null,
        cloudPushCharacterName:
          typeof body.cloudPushCharacterName === "string" ? body.cloudPushCharacterName : null,
        cloudPushCharacterId:
          typeof body.cloudPushCharacterId === "string" ? body.cloudPushCharacterId : null,
        createdAt: now,
        updatedAt: now,
        startedAt: null,
        finishedAt: null,
      };
      store.generationTasks.push(task);
      saveStore();

      const generationRequest = {
        endpoint,
        model,
        messages,
        params: body.params && typeof body.params === "object" ? body.params : {},
        apiKey: typeof body.apiKey === "string" ? body.apiKey : "",
      };
      console.log("[generation] task queued", {
        taskId: task.taskId,
        userId: auth.userId,
        deviceId,
        chatId,
        model,
        endpoint,
        messageCount: messages.length,
      });
      runGenerationTask(auth.userId, task.taskId, generationRequest).catch((error) => {
        console.error("[generation] task runner crashed", {
          taskId: task.taskId,
          error: error?.message || String(error),
        });
      });

      return sendJson(res, 202, {
        ok: true,
        taskId: task.taskId,
        serverTime: Date.now(),
      });
    }

    if (req.method === "GET" && url.pathname === "/generate/pending") {
      const auth = requireBearerAuth(req);
      const chatId = normalizeRequiredString(url.searchParams.get("chatId"), "chatId");
      const lastMessageHash = url.searchParams.get("lastMessageHash") || "";
      const candidates = store.generationTasks
        .filter((task) => task.userId === auth.userId && task.chatId === chatId)
        .filter((task) => ["pending", "running", "done", "error"].includes(task.status))
        .filter((task) => !lastMessageHash || !task.lastMessageHash || task.lastMessageHash === lastMessageHash)
        .sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0));
      const task = candidates[0] || null;
      return sendJson(res, 200, {
        serverTime: Date.now(),
        task: task ? toGenerationTaskView(task) : null,
      });
    }

    if (req.method === "GET" && url.pathname === "/generate") {
      const auth = requireBearerAuth(req);
      const statusRaw = url.searchParams.get("status") || "pending,running,done,error";
      const statuses = new Set(statusRaw.split(",").map((item) => item.trim()).filter(Boolean));
      const tasks = store.generationTasks
        .filter((task) => task.userId === auth.userId)
        .filter((task) => statuses.has(task.status))
        .sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0))
        .map(toGenerationTaskView);
      return sendJson(res, 200, {
        serverTime: Date.now(),
        tasks,
      });
    }

    if (req.method === "GET" && url.pathname.startsWith("/generate/")) {
      const auth = requireBearerAuth(req);
      const taskId = decodeURIComponent(url.pathname.slice("/generate/".length));
      const task = findGenerationTask(auth.userId, taskId);
      if (!task) return sendError(res, 404, "Generation task not found");
      return sendJson(res, 200, toGenerationTaskView(task));
    }

    if (
      req.method === "POST" &&
      url.pathname.startsWith("/generate/") &&
      url.pathname.endsWith("/abort")
    ) {
      const auth = requireBearerAuth(req);
      const taskId = decodeURIComponent(url.pathname.slice("/generate/".length, -"/abort".length));
      const task = findGenerationTask(auth.userId, taskId);
      if (!task) return sendError(res, 404, "Generation task not found");
      cancelGenerationTask(task, "canceled by client");
      return sendJson(res, 200, {
        ok: true,
        task: toGenerationTaskView(task),
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
          generationTaskCount: store.generationTasks.length,
          activeGenerationTaskCount: store.generationTasks.filter((task) => ["pending", "running"].includes(task.status)).length,
          createdAt: store.meta.createdAt,
          updatedAt: store.meta.updatedAt,
        },
        users,
        recentEntities,
        recentGenerationTasks: store.generationTasks
          .slice()
          .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
          .slice(0, 30)
          .map((task) => ({
            taskId: task.taskId,
            userId: task.userId,
            username: userById.get(task.userId)?.username || null,
            deviceId: task.deviceId,
            chatId: task.chatId,
            taskType: task.taskType,
            status: task.status,
            error: task.error || null,
            contentLength: String(task.content || "").length,
            createdAt: task.createdAt,
            updatedAt: task.updatedAt,
            startedAt: task.startedAt || null,
            finishedAt: task.finishedAt || null,
          })),
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

    if (req.method === "GET" && url.pathname === "/admin/api/tunnel") {
      requireAdminAuth(req);
      return sendJson(res, 200, {
        active: !!activeTunnel,
        url: activeTunnel?.url ?? null,
      });
    }

    if (req.method === "GET" && url.pathname === "/admin/api/tunnel/config") {
      requireAdminAuth(req);
      const token = store.meta.ngrokToken || null;
      return sendJson(res, 200, {
        hasToken: !!token,
        tokenPreview: token ? `${token.slice(0, 6)}...${token.slice(-4)}` : null,
      });
    }

    if (req.method === "POST" && url.pathname === "/admin/api/tunnel/config") {
      requireAdminAuth(req);
      const body = await readJsonBody(req);
      const ngrokToken = typeof body.ngrokToken === "string" ? body.ngrokToken.trim() : "";
      if (!ngrokToken) return sendError(res, 400, "ngrokToken is required");
      store.meta.ngrokToken = ngrokToken;
      saveStore();
      return sendJson(res, 200, {
        ok: true,
        hasToken: true,
        tokenPreview: `${ngrokToken.slice(0, 6)}...${ngrokToken.slice(-4)}`,
      });
    }

    if (req.method === "POST" && url.pathname === "/admin/api/tunnel/start") {
      requireAdminAuth(req);
      if (activeTunnel) {
        return sendJson(res, 200, { active: true, url: activeTunnel.url });
      }
      try {
        const ngrok = await import("@ngrok/ngrok");
        const authtoken = process.env.NGROK_AUTHTOKEN || store.meta.ngrokToken || "";
        if (!authtoken) {
          return sendError(res, 500, "請先在管理介面設定 ngrok Token");
        }
        const listener = await ngrok.forward({ addr: port, authtoken });
        const tunnelUrl = listener.url();
        activeTunnel = {
          url: tunnelUrl,
          close: () => listener.close(),
        };
        console.log(`[SelfHostedSyncServer] tunnel opened: ${tunnelUrl}`);
        return sendJson(res, 200, { active: true, url: tunnelUrl });
      } catch (err) {
        return sendError(res, 500, "無法啟動隧道: " + err.message);
      }
    }

    if (req.method === "POST" && url.pathname === "/admin/api/tunnel/stop") {
      requireAdminAuth(req);
      if (activeTunnel) {
        activeTunnel.close();
        activeTunnel = null;
        console.log("[SelfHostedSyncServer] tunnel closed");
      }
      return sendJson(res, 200, { active: false, url: null });
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
  const remote = `${req.socket.remoteAddress}:${req.socket.remotePort}`;
  try {
    const url = new URL(req.url || "/", `http://${req.headers.host || `127.0.0.1:${port}`}`);
    console.log("[ws-upgrade] 收到升級請求", {
      pathname: url.pathname,
      remote,
      host: req.headers.host,
      hasToken: !!url.searchParams.get("token"),
    });
    if (url.pathname !== "/sync/ws") {
      console.log("[ws-upgrade] 404：非 /sync/ws 路徑");
      socket.write("HTTP/1.1 404 Not Found\r\n\r\n");
      socket.destroy();
      return;
    }

    const token = url.searchParams.get("token") || "";
    if (!token) {
      console.log("[ws-upgrade] 401：缺少 token");
      socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
      socket.destroy();
      return;
    }

    let auth;
    try {
      auth = verifyToken(token);
    } catch (verifyError) {
      console.log("[ws-upgrade] 401：token 驗證失敗", {
        error: verifyError?.message || String(verifyError),
        tokenPrefix: token.slice(0, 24),
      });
      socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
      socket.destroy();
      return;
    }
    req.syncAuth = auth;
    console.log("[ws-upgrade] token 驗證通過，準備升級", {
      userId: auth.userId,
      deviceId: auth.deviceId,
    });

    wsServer.handleUpgrade(req, socket, head, (ws) => {
      console.log("[ws-upgrade] 升級成功，emitting connection", {
        userId: auth.userId,
        deviceId: auth.deviceId,
      });
      wsServer.emit("connection", ws, req);
    });
  } catch (error) {
    console.log("[ws-upgrade] 500：意外錯誤", {
      error: error?.message || String(error),
      stack: error?.stack,
    });
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

  ws.isAlive = true;
  ws.missedPongs = 0;
  ws.on("pong", () => { ws.isAlive = true; ws.missedPongs = 0; });

  syncSocketClients.set(ws, client);

  const readyOnlineDeviceIds = getOnlineDeviceIdsForUser(auth.userId);
  ws.send(
    JSON.stringify({
      type: "sync:ready",
      userId: auth.userId,
      deviceId: auth.deviceId,
      serverTime: Date.now(),
      onlineDeviceIds: readyOnlineDeviceIds,
      onlineCount: readyOnlineDeviceIds.length,
    }),
  );
  broadcastPresence(auth.userId);

  ws.on("message", (raw) => {
    try {
      const payload = JSON.parse(raw.toString("utf8"));
      if (payload?.type === "ping") {
        ws.send(JSON.stringify({ type: "pong", serverTime: Date.now() }));
        return;
      }
      if (typeof payload?.type === "string" && payload.type.startsWith("peer:")) {
        handlePeerMessage(ws, client, payload);
        return;
      }
    } catch {
      ws.send(JSON.stringify({ type: "error", message: "Invalid websocket payload" }));
    }
  });

  ws.on("close", () => {
    syncSocketClients.delete(ws);
    broadcastPresence(auth.userId);
  });

  ws.on("error", () => {
    syncSocketClients.delete(ws);
    broadcastPresence(auth.userId);
  });
});

// Server-side heartbeat：每 25 秒 ping 所有 client，防止 HF Spaces proxy 因閒置而斷線
const WS_HEARTBEAT_INTERVAL_MS = 25_000;
setInterval(() => {
  for (const [ws, client] of syncSocketClients.entries()) {
    if (!ws.isAlive) {
      ws.missedPongs = (ws.missedPongs || 0) + 1;
      if (ws.missedPongs >= 2) {
        console.log("[heartbeat] 連續無回應，終止連線", { userId: client.userId, deviceId: client.deviceId, missedPongs: ws.missedPongs });
        syncSocketClients.delete(ws);
        ws.terminate();
        broadcastPresence(client.userId);
        continue;
      }
      // 第一次沒回應先寬容，繼續 ping
      console.log("[heartbeat] 無回應，再等一輪", { userId: client.userId, missedPongs: ws.missedPongs });
    } else {
      ws.missedPongs = 0;
    }
    ws.isAlive = false;
    ws.ping();
  }
}, WS_HEARTBEAT_INTERVAL_MS);

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
      generationTasks: [],
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
  parsed.generationTasks ||= [];

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
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, ngrok-skip-browser-warning");
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
    model: null,
    customName: null,
  };
  const deviceState = userState.devices[deviceId];
  // Backfill optional fields for records created before this feature existed
  if (!("model" in deviceState)) deviceState.model = null;
  if (!("customName" in deviceState)) deviceState.customName = null;
  deviceState.lastSeenAt = lastSeenAt;
  return deviceState;
}

function sanitizeDeviceInfoString(value, maxLength) {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string") return undefined; // undefined = invalid
  const trimmed = value.trim();
  if (trimmed.length === 0) return null;
  if (trimmed.length > maxLength) return trimmed.slice(0, maxLength);
  return trimmed;
}

function setDeviceInfo(userId, deviceId, { model, customName }) {
  const deviceState = touchSyncDevice(userId, deviceId);
  if (model !== undefined) deviceState.model = model;
  if (customName !== undefined) deviceState.customName = customName;
  return deviceState;
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

function computeUserEntityCounts(userId) {
  const entityCounts = {};
  let totalActiveItems = 0;
  let totalDeletedItems = 0;
  for (const item of store.entities) {
    if (item.userId !== userId) continue;
    if (item.deletedAt !== null && item.deletedAt !== undefined) {
      totalDeletedItems += 1;
      continue;
    }
    totalActiveItems += 1;
    entityCounts[item.entityType] = (entityCounts[item.entityType] || 0) + 1;
  }
  return { entityCounts, totalActiveItems, totalDeletedItems };
}

// ===== Peer-to-peer sync message handling =====

const SERVER_PEER_ID = "@server";
const PEER_FETCH_BATCH_LIMIT = 100;

function sendPeerError(ws, requestId, reason, detail) {
  if (ws.readyState !== ws.OPEN) return;
  ws.send(
    JSON.stringify({
      type: "peer:error",
      requestId: requestId ?? null,
      reason,
      detail: detail ?? null,
    }),
  );
}

function handlePeerMessage(ws, client, payload) {
  const targetDeviceId = payload.targetDeviceId;
  console.log("[peer] 收到訊息", {
    type: payload.type,
    requestId: payload.requestId ?? null,
    from: client.deviceId,
    target: targetDeviceId ?? null,
    userId: client.userId,
  });

  if (typeof targetDeviceId !== "string" || !targetDeviceId) {
    console.log("[peer] 拒絕：缺少 targetDeviceId");
    sendPeerError(ws, payload.requestId, "missing-target");
    return;
  }

  if (targetDeviceId === SERVER_PEER_ID) {
    console.log("[peer] 轉交 @server 虛擬 peer 處理", { type: payload.type });
    handleServerPeerRequest(ws, client, payload);
    return;
  }

  // 中繼給同 userId 的目標裝置
  let delivered = false;
  const onlineDevices = [];
  for (const [ws2, c] of syncSocketClients.entries()) {
    if (c.userId !== client.userId) continue;
    onlineDevices.push({ deviceId: c.deviceId, state: ws2.readyState });
    if (
      c.deviceId === targetDeviceId &&
      ws2.readyState === ws2.OPEN
    ) {
      ws2.send(
        JSON.stringify({
          ...payload,
          sourceDeviceId: client.deviceId, // 伺服器權威填入，防偽造
        }),
      );
      delivered = true;
      console.log("[peer] 已中繼給目標裝置", {
        type: payload.type,
        requestId: payload.requestId,
        target: targetDeviceId,
      });
      break;
    }
  }

  if (!delivered) {
    console.log("[peer] 目標裝置離線或不存在", {
      target: targetDeviceId,
      onlineDevicesForUser: onlineDevices,
    });
    sendPeerError(ws, payload.requestId, "peer-offline", { targetDeviceId });
  }
}

function handleServerPeerRequest(ws, client, payload) {
  switch (payload.type) {
    case "peer:hash-request":
      return handleServerHashRequest(ws, client, payload);
    case "peer:manifest-request":
      return handleServerManifestRequest(ws, client, payload);
    case "peer:fetch-request":
      return handleServerFetchRequest(ws, client, payload);
    case "peer:apply-request":
      return handleServerApplyRequest(ws, client, payload);
    default:
      sendPeerError(ws, payload.requestId, "unsupported-peer-type-for-server", {
        type: payload.type,
      });
  }
}

// ==== peer hash: 與 client 的 src/services/peerHash.ts 保持完全相同的算法 ====
const PEER_HASH_FNV_OFFSET = 0xcbf29ce484222325n;
const PEER_HASH_FNV_PRIME = 0x100000001b3n;
const PEER_HASH_FNV_MASK = 0xffffffffffffffffn;

function peerFnv1a64Hex(input) {
  let h = PEER_HASH_FNV_OFFSET;
  for (let i = 0; i < input.length; i++) {
    h = (h ^ BigInt(input.charCodeAt(i))) & PEER_HASH_FNV_MASK;
    h = (h * PEER_HASH_FNV_PRIME) & PEER_HASH_FNV_MASK;
  }
  return h.toString(16).padStart(16, "0");
}

function peerComputeBucketHashes(entries) {
  const grouped = new Map();
  for (const e of entries) {
    let list = grouped.get(e.entityType);
    if (!list) {
      list = [];
      grouped.set(e.entityType, list);
    }
    list.push(e);
  }
  const buckets = [];
  for (const [entityType, list] of grouped) {
    list.sort((a, b) => (a.entityId < b.entityId ? -1 : a.entityId > b.entityId ? 1 : 0));
    const combined = list
      .map((e) => `${e.entityId}|${e.updatedAt}|${e.deletedAt ?? 0}\n`)
      .join("");
    buckets.push({
      entityType,
      count: list.length,
      hash: peerFnv1a64Hex(combined),
    });
  }
  buckets.sort((a, b) => (a.entityType < b.entityType ? -1 : a.entityType > b.entityType ? 1 : 0));
  const rootInput = buckets
    .map((b) => `${b.entityType}|${b.count}|${b.hash}\n`)
    .join("");
  return {
    buckets,
    rootHash: peerFnv1a64Hex(rootInput),
    totalCount: entries.length,
  };
}

function handleServerHashRequest(ws, client, payload) {
  const entries = [];
  for (const item of store.entities) {
    if (item.userId !== client.userId) continue;
    entries.push({
      entityType: item.entityType,
      entityId: item.entityId,
      updatedAt: Number(item.updatedAt) || 0,
      deletedAt: item.deletedAt ?? null,
    });
  }
  const { buckets, rootHash, totalCount } = peerComputeBucketHashes(entries);
  console.log("[peer@server] 回覆 hash", {
    requestId: payload.requestId,
    userId: client.userId,
    bucketCount: buckets.length,
    totalCount,
    rootHash,
  });
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
}

function handleServerManifestRequest(ws, client, payload) {
  const filterArr = Array.isArray(payload.entityTypes) ? payload.entityTypes : null;
  const filter = filterArr && filterArr.length > 0 ? new Set(filterArr) : null;
  const entries = [];
  for (const item of store.entities) {
    if (item.userId !== client.userId) continue;
    if (filter && !filter.has(item.entityType)) continue;
    entries.push({
      entityType: item.entityType,
      entityId: item.entityId,
      updatedAt: Number(item.updatedAt) || 0,
      deletedAt: item.deletedAt ?? null,
    });
  }
  console.log("[peer@server] 回覆 manifest", {
    requestId: payload.requestId,
    userId: client.userId,
    entryCount: entries.length,
    entityTypes: filter ? Array.from(filter) : "ALL",
  });
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
}

function handleServerFetchRequest(ws, client, payload) {
  const refs = Array.isArray(payload.entityRefs) ? payload.entityRefs : [];
  const refKey = (r) => `${r.entityType}::${r.entityId}`;
  const wanted = new Set(refs.map(refKey));
  const startIndex = Number(payload.cursor) > 0 ? Number(payload.cursor) : 0;

  const envelopes = [];
  let matched = 0;
  let lastScannedIndex = startIndex;

  for (let i = startIndex; i < store.entities.length; i++) {
    lastScannedIndex = i;
    const item = store.entities[i];
    if (item.userId !== client.userId) continue;
    const key = refKey(item);
    if (!wanted.has(key)) continue;
    envelopes.push({
      entityType: item.entityType,
      entityId: item.entityId,
      schemaVersion: item.schemaVersion ?? 1,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
      deletedAt: item.deletedAt ?? null,
      payload: item.payload,
    });
    matched += 1;
    if (envelopes.length >= PEER_FETCH_BATCH_LIMIT) break;
  }

  const hasMore =
    lastScannedIndex < store.entities.length - 1 && matched < wanted.size;

  ws.send(
    JSON.stringify({
      type: "peer:fetch-response",
      requestId: payload.requestId,
      sourceDeviceId: SERVER_PEER_ID,
      envelopes,
      hasMore,
      nextCursor: hasMore ? lastScannedIndex + 1 : null,
    }),
  );
}

function handleServerApplyRequest(ws, client, payload) {
  const envelopes = Array.isArray(payload.envelopes) ? payload.envelopes : [];
  let applied = 0;
  const rejected = [];

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

    const before = findEntityIndex(client.userId, envelope.entityType, envelope.entityId);
    upsertEntity({
      userId: client.userId,
      entity: {
        entityType: envelope.entityType,
        entityId: envelope.entityId,
        schemaVersion: envelope.schemaVersion ?? 1,
        createdAt: envelope.createdAt,
        updatedAt: envelope.updatedAt,
        deletedAt: envelope.deletedAt ?? null,
        payload: envelope.payload,
      },
    });
    // upsertEntity 不回傳結果，簡單檢查：若 updatedAt 被接受就算 applied
    const after = findEntityIndex(client.userId, envelope.entityType, envelope.entityId);
    if (after !== -1) {
      applied += 1;
    } else {
      rejected.push({
        entityType: envelope.entityType,
        entityId: envelope.entityId,
        reason: "upsert-failed",
      });
    }
    // 避免 linter 警告
    void before;
  }

  if (applied > 0) {
    markUserSyncUpdated(client.userId, client.deviceId, Date.now());
    saveStore();
  }

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

function findEntityIndex(userId, entityType, entityId) {
  for (let i = 0; i < store.entities.length; i++) {
    const item = store.entities[i];
    if (
      item.userId === userId &&
      item.entityType === entityType &&
      item.entityId === entityId
    ) {
      return i;
    }
  }
  return -1;
}

function notifySyncUpdate({ userId, sourceDeviceId, serverTime, latestUpdateAt, accepted }) {
  if (!accepted) {
    return;
  }

  const onlineDeviceIds = getOnlineDeviceIdsForUser(userId);
  const message = JSON.stringify({
    type: "sync:update",
    userId,
    sourceDeviceId,
    serverTime,
    latestUpdateAt: latestUpdateAt ?? null,
    accepted,
    onlineDeviceIds,
    onlineCount: onlineDeviceIds.length,
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

function getOnlineDeviceIdsForUser(userId) {
  const ids = new Set();
  for (const client of syncSocketClients.values()) {
    if (client.userId === userId && client.ws.readyState === client.ws.OPEN) {
      ids.add(client.deviceId);
    }
  }
  return Array.from(ids);
}

function broadcastDeviceInfoUpdate(userId, deviceId, deviceState) {
  const message = JSON.stringify({
    type: "device:info",
    userId,
    deviceId,
    serverTime: Date.now(),
    device: {
      deviceId,
      model: deviceState.model ?? null,
      customName: deviceState.customName ?? null,
      lastPushAt: deviceState.lastPushAt ?? null,
      lastSeenAt: deviceState.lastSeenAt ?? null,
    },
  });
  for (const [ws, client] of syncSocketClients.entries()) {
    if (client.userId !== userId) continue;
    if (ws.readyState !== ws.OPEN) {
      syncSocketClients.delete(ws);
      continue;
    }
    ws.send(message);
  }
}

function broadcastPresence(userId) {
  const onlineDeviceIds = getOnlineDeviceIdsForUser(userId);
  const message = JSON.stringify({
    type: "presence:update",
    userId,
    serverTime: Date.now(),
    onlineDeviceIds,
    onlineCount: onlineDeviceIds.length,
  });

  for (const [ws, client] of syncSocketClients.entries()) {
    if (client.userId !== userId) continue;
    if (ws.readyState !== ws.OPEN) {
      syncSocketClients.delete(ws);
      continue;
    }
    ws.send(message);
  }
}

function findGenerationTask(userId, taskId) {
  return store.generationTasks.find((task) => task.userId === userId && task.taskId === taskId) || null;
}

function toGenerationTaskView(task) {
  return {
    taskId: task.taskId,
    deviceId: task.deviceId,
    chatId: task.chatId,
    taskType: task.taskType,
    status: task.status,
    content: task.content || "",
    error: task.error || undefined,
    lastMessageHash: task.lastMessageHash || undefined,
    createdAt: task.createdAt,
    updatedAt: task.updatedAt,
    startedAt: task.startedAt || undefined,
    finishedAt: task.finishedAt || undefined,
  };
}

function countActiveGenerationTasks(userId) {
  return store.generationTasks.filter(
    (task) => task.userId === userId && ["pending", "running"].includes(task.status),
  ).length;
}

function updateGenerationTask(task, patch) {
  Object.assign(task, patch, { updatedAt: Date.now() });
  saveStore();
}

function markStaleGenerationTasksAfterBoot() {
  let changed = false;
  const now = Date.now();
  store.generationTasks ||= [];
  for (const task of store.generationTasks) {
    if (task.status === "pending" || task.status === "running") {
      Object.assign(task, {
        status: "error",
        error: "server restarted before generation completed",
        updatedAt: now,
        finishedAt: now,
      });
      changed = true;
    }
  }
  if (changed) saveStore();
}

function cleanupExpiredGenerationTasks() {
  store.generationTasks ||= [];
  const now = Date.now();
  const before = store.generationTasks.length;
  store.generationTasks = store.generationTasks.filter((task) => {
    if (!["done", "error", "canceled"].includes(task.status)) return true;
    const finishedAt = Number(task.finishedAt || task.updatedAt || task.createdAt || 0);
    return now - finishedAt < generationTaskTtlMs;
  });
  if (store.generationTasks.length !== before) saveStore();
}

function cancelGenerationTask(task, reason) {
  const controller = generationTaskControllers.get(task.taskId);
  if (controller) {
    controller.abort();
    generationTaskControllers.delete(task.taskId);
  }
  if (["done", "error", "canceled"].includes(task.status)) return;
  updateGenerationTask(task, {
    status: "canceled",
    error: reason,
    finishedAt: Date.now(),
  });
}

async function runGenerationTask(userId, taskId, generationRequest) {
  const task = findGenerationTask(userId, taskId);
  if (!task || task.status !== "pending") return;

  const controller = new AbortController();
  generationTaskControllers.set(taskId, controller);
  const timer = setTimeout(() => controller.abort(), generationTaskTimeoutMs);
  updateGenerationTask(task, {
    status: "running",
    startedAt: Date.now(),
  });

  const startedAt = Date.now();
  console.log("[generation] task started", {
    taskId,
    userId,
    endpoint: generationRequest.endpoint,
    model: generationRequest.model,
    messageCount: Array.isArray(generationRequest.messages) ? generationRequest.messages.length : 0,
  });

  try {
    const headers = { "Content-Type": "application/json" };
    if (generationRequest.apiKey) headers.Authorization = `Bearer ${generationRequest.apiKey}`;
    const response = await fetch(`${generationRequest.endpoint}/chat/completions`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        ...(generationRequest.params || {}),
        model: generationRequest.model,
        messages: generationRequest.messages,
        stream: false,
      }),
      signal: controller.signal,
    });
    const text = await response.text();
    console.log("[generation] upstream response", {
      taskId,
      status: response.status,
      ok: response.ok,
      durationMs: Date.now() - startedAt,
      responseBytes: text.length,
    });
    if (!response.ok) {
      throw new Error(`AI API ${response.status}: ${text.slice(0, 1000)}`);
    }
    let data;
    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      throw new Error("AI API returned invalid JSON");
    }
    const content = data?.choices?.[0]?.message?.content ?? data?.choices?.[0]?.text ?? "";
    const finalContent = typeof content === "string" ? content : String(content ?? "");
    updateGenerationTask(task, {
      status: "done",
      content: finalContent,
      error: null,
      finishedAt: Date.now(),
    });
    console.log("[generation] task done", {
      taskId,
      durationMs: Date.now() - startedAt,
      contentLength: finalContent.length,
    });
    // 任務完成後主動發送離線推送（不阻塞、不影響任務狀態）
    sendCloudPushNotification(task, finalContent).catch((error) => {
      console.warn("[generation] cloud push notify failed", {
        taskId,
        error: error?.message || String(error),
      });
    });
  } catch (error) {
    if (task.status === "canceled") return;
    const errorText = error instanceof Error ? error.message : String(error);
    updateGenerationTask(task, {
      status: controller.signal.aborted ? "error" : "error",
      error: errorText,
      finishedAt: Date.now(),
    });
    console.error("[generation] task error", {
      taskId,
      durationMs: Date.now() - startedAt,
      aborted: controller.signal.aborted,
      error: errorText,
    });
  } finally {
    clearTimeout(timer);
    generationTaskControllers.delete(taskId);
  }
}

/**
 * 任務完成時，轉發一則 Web Push 通知到 Cloudflare 雲端推送 Worker。
 * Worker 會用儲存的 push subscription + VAPID 私鑰實際發出系統推送，
 * 因此使用者即使已關閉瀏覽器（前端輪詢已停止）也能收到通知。
 *
 * 此呼叫為盡力而為（best-effort）：任何失敗都只記 log，不影響任務本身狀態。
 */
async function sendCloudPushNotification(task, content) {
  if (!cloudPushNotifyUrl) return; // 已停用
  if (!task?.cloudPushUserId) return; // 前端未提供推送 userId（例如未啟用雲端推送）
  const trimmed = (content || "").trim();
  if (!trimmed) return; // 空內容不推送

  const payload = {
    characterName: task.cloudPushCharacterName || "角色",
    characterId: task.cloudPushCharacterId || undefined,
    chatId: task.chatId || undefined,
    content: trimmed.slice(0, 200),
  };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  try {
    const res = await fetch(cloudPushNotifyUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        // Cloudflare Worker 用 X-User-Id 定位該使用者的 push subscription DO
        "X-User-Id": task.cloudPushUserId,
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      console.warn("[generation] cloud push notify non-OK", {
        taskId: task.taskId,
        status: res.status,
        body: text.slice(0, 200),
      });
    } else {
      console.log("[generation] cloud push notify sent", { taskId: task.taskId });
    }
  } finally {
    clearTimeout(timer);
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
