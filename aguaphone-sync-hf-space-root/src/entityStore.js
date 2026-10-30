// 同步資料（entities）改存 SQLite：每次只寫有變動的那幾筆，不再整包重寫 store.json。
// 用 Node 內建的 node:sqlite（Node ≥ 22.13 不需旗標），不用額外裝原生套件。
import { DatabaseSync } from "node:sqlite";

// 這兩個欄位只給伺服器自己看，回給裝置時拿掉
function toClientEntity(data) {
  const { receivedAt, deviceId, ...entity } = JSON.parse(data);
  return entity;
}

export function openEntityStore(dbPath) {
  const db = new DatabaseSync(dbPath);
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous = NORMAL;
    CREATE TABLE IF NOT EXISTS entities (
      user_id     TEXT    NOT NULL,
      entity_type TEXT    NOT NULL,
      entity_id   TEXT    NOT NULL,
      updated_at  INTEGER NOT NULL,
      deleted_at  INTEGER,
      data        TEXT    NOT NULL,
      PRIMARY KEY (user_id, entity_type, entity_id)
    ) WITHOUT ROWID;
    CREATE INDEX IF NOT EXISTS idx_entities_user_updated ON entities (user_id, updated_at);
    CREATE INDEX IF NOT EXISTS idx_entities_updated ON entities (updated_at);
  `);

  // 以後寫的為準：updatedAt 比較新（或一樣）才覆蓋
  const upsertStmt = db.prepare(`
    INSERT INTO entities (user_id, entity_type, entity_id, updated_at, deleted_at, data)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT (user_id, entity_type, entity_id) DO UPDATE SET
      updated_at = excluded.updated_at,
      deleted_at = excluded.deleted_at,
      data = excluded.data
    WHERE excluded.updated_at >= entities.updated_at
  `);
  const pullBoundaryStmt = db.prepare(
    "SELECT updated_at FROM entities WHERE user_id = ? AND updated_at > ? ORDER BY updated_at LIMIT 1 OFFSET ?",
  );
  const pullRangeStmt = db.prepare(
    "SELECT data FROM entities WHERE user_id = ? AND updated_at > ? AND updated_at <= ? ORDER BY updated_at",
  );
  const pullRestStmt = db.prepare(
    "SELECT data FROM entities WHERE user_id = ? AND updated_at > ? ORDER BY updated_at",
  );
  const hasNewerStmt = db.prepare("SELECT 1 AS x FROM entities WHERE user_id = ? AND updated_at > ? LIMIT 1");
  const refsStmt = db.prepare(
    "SELECT entity_type, entity_id, updated_at, deleted_at FROM entities WHERE user_id = ?",
  );
  const getStmt = db.prepare(
    "SELECT data FROM entities WHERE user_id = ? AND entity_type = ? AND entity_id = ?",
  );
  const deleteUserStmt = db.prepare("DELETE FROM entities WHERE user_id = ?");
  const countsByTypeStmt = db.prepare(
    "SELECT entity_type, deleted_at IS NOT NULL AS deleted, COUNT(*) AS n FROM entities WHERE user_id = ? GROUP BY entity_type, deleted",
  );
  const countsByUserStmt = db.prepare("SELECT user_id, COUNT(*) AS n FROM entities GROUP BY user_id");
  const countAllStmt = db.prepare("SELECT COUNT(*) AS n FROM entities");
  const recentStmt = db.prepare(
    "SELECT user_id, data FROM entities ORDER BY updated_at DESC LIMIT ?",
  );

  function upsert(userId, entity) {
    const { userId: _ignored, ...rest } = entity;
    const deletedAt = rest.deletedAt === null || rest.deletedAt === undefined ? null : Number(rest.deletedAt);
    upsertStmt.run(
      userId,
      rest.entityType,
      rest.entityId,
      Number(rest.updatedAt) || 0,
      deletedAt,
      JSON.stringify(rest),
    );
  }

  function transaction(fn) {
    db.exec("BEGIN");
    try {
      const result = fn();
      db.exec("COMMIT");
      return result;
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  }

  return {
    upsert,
    transaction,

    /**
     * 照 updatedAt 由舊到新，大約 limit 筆一頁。
     * 同一個 updatedAt 的資料一定整批放進同一頁，不然下一頁用 updated_at > since 會漏掉。
     */
    pull(userId, since, limit) {
      const from = typeof since === "number" ? since : Number.MIN_SAFE_INTEGER;
      const boundary = pullBoundaryStmt.get(userId, from, limit - 1);
      const rows = boundary
        ? pullRangeStmt.all(userId, from, boundary.updated_at)
        : pullRestStmt.all(userId, from);
      const hasMore = !!boundary && !!hasNewerStmt.get(userId, boundary.updated_at);
      return {
        items: rows.map((row) => toClientEntity(row.data)),
        hasMore,
        nextSince: hasMore ? boundary.updated_at : null,
      };
    },

    /** peer manifest／hash 用的清單（不含 payload） */
    listRefs(userId, typeFilter = null) {
      const refs = [];
      for (const row of refsStmt.all(userId)) {
        if (typeFilter && !typeFilter.has(row.entity_type)) continue;
        refs.push({
          entityType: row.entity_type,
          entityId: row.entity_id,
          updatedAt: Number(row.updated_at) || 0,
          deletedAt: row.deleted_at ?? null,
        });
      }
      return refs;
    },

    get(userId, entityType, entityId) {
      const row = getStmt.get(userId, entityType, entityId);
      return row ? toClientEntity(row.data) : null;
    },

    deleteUser(userId) {
      deleteUserStmt.run(userId);
    },

    countsForUser(userId) {
      const entityCounts = {};
      let totalActiveItems = 0;
      let totalDeletedItems = 0;
      for (const row of countsByTypeStmt.all(userId)) {
        if (row.deleted) {
          totalDeletedItems += row.n;
          continue;
        }
        totalActiveItems += row.n;
        entityCounts[row.entity_type] = (entityCounts[row.entity_type] || 0) + row.n;
      }
      return { entityCounts, totalActiveItems, totalDeletedItems };
    },

    countsByUser() {
      return new Map(countsByUserStmt.all().map((row) => [row.user_id, row.n]));
    },

    countAll() {
      return countAllStmt.get().n;
    },

    /** 管理介面用：保留 userId、receivedAt、deviceId */
    recent(limit) {
      return recentStmt.all(limit).map((row) => ({ userId: row.user_id, ...JSON.parse(row.data) }));
    },

    adminList({ userId, entityType, limit, offset }) {
      const where = [];
      const params = [];
      if (userId) {
        where.push("user_id = ?");
        params.push(userId);
      }
      if (entityType) {
        where.push("entity_type = ?");
        params.push(entityType);
      }
      const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
      const total = db.prepare(`SELECT COUNT(*) AS n FROM entities ${whereSql}`).get(...params).n;
      const items = db
        .prepare(`SELECT user_id, data FROM entities ${whereSql} ORDER BY updated_at DESC LIMIT ? OFFSET ?`)
        .all(...params, limit, offset)
        .map((row) => ({ userId: row.user_id, ...JSON.parse(row.data) }));
      return { total, items };
    },

    /** 舊版 store.json 的 entities 陣列一次搬進來 */
    importLegacy(entities) {
      let imported = 0;
      transaction(() => {
        for (const entity of entities) {
          if (!entity?.userId || !entity.entityType || !entity.entityId) continue;
          upsert(entity.userId, entity);
          imported += 1;
        }
      });
      return imported;
    },
  };
}
