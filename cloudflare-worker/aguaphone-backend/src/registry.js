// 記錄這個部署上有哪些帳號：第一個帳號註冊後預設關閉註冊
import { DurableObject } from "cloudflare:workers";

export class RegistryDO extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
    this.sql.exec("CREATE TABLE IF NOT EXISTS accounts (uk TEXT PRIMARY KEY, created_at INTEGER NOT NULL)");
  }

  /** @returns {"ok" | "exists" | "closed"} */
  claim(uk, allowMoreAccounts) {
    if (this.sql.exec("SELECT 1 FROM accounts WHERE uk = ?", uk).toArray().length > 0) return "exists";
    const count = this.sql.exec("SELECT COUNT(*) AS n FROM accounts").one().n;
    if (count > 0 && !allowMoreAccounts) return "closed";
    this.sql.exec("INSERT INTO accounts (uk, created_at) VALUES (?, ?)", uk, Date.now());
    return "ok";
  }

  release(uk) {
    this.sql.exec("DELETE FROM accounts WHERE uk = ?", uk);
  }
}
