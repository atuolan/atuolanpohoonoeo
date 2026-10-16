import { fileURLToPath, URL } from "node:url";
import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    globals: true,
    // git worktree 是其他分支的副本，不跟主目錄一起跑
    exclude: [...configDefaults.exclude, ".worktrees/**", ".claude/**"],
  },
});
