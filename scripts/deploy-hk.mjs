#!/usr/bin/env node
/**
 * 部署到香港 VPS（大陸直連入口 https://aguaphone.aguacloud.uk）
 *
 * 流程：build → 打包 dist → scp 上傳 → 伺服器端解壓並替換（舊版自動備份）
 *
 * 用法：
 *   npm run deploy:hk              # build 後部署
 *   npm run deploy:hk -- --skip-build   # 直接用現有 dist/ 部署
 *
 * 前置條件：已設定 SSH 金鑰登入（ssh root@154.37.215.36 不需密碼）
 */
import { execFileSync, execSync } from "node:child_process";
import { existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const HOST = "root@154.37.215.36";
const WWW = "/var/www/aguaphone";
const ROOT = fileURLToPath(new URL("..", import.meta.url));
const DIST = join(ROOT, "dist");

const skipBuild = process.argv.includes("--skip-build");

function run(cmd, args, opts = {}) {
  console.log(`\x1b[36m$ ${cmd} ${args.join(" ")}\x1b[0m`);
  execFileSync(cmd, args, { stdio: "inherit", ...opts });
}

/**
 * Windows 內建的 tar.exe 打包大目錄會當掉，有 Git 附的 tar 就優先用。
 * Git 版的 tar 會呼叫同目錄下的 gzip，所以要把該目錄補進 PATH。
 */
const GIT_USR_BIN = "C:\\Program Files\\Git\\usr\\bin";
function tarCommand() {
  const gitTar = join(GIT_USR_BIN, "tar.exe");
  if (process.platform !== "win32" || !existsSync(gitTar)) {
    return { cmd: "tar", env: process.env };
  }
  return {
    cmd: gitTar,
    env: { ...process.env, PATH: `${GIT_USR_BIN};${process.env.PATH}` },
  };
}

// 1. build
if (skipBuild) {
  console.log("跳過 build，使用現有 dist/");
} else {
  console.log("\n[1/4] build（與 Cloudflare Pages 相同的 build:fast）");
  execSync("npm run build:fast", { cwd: ROOT, stdio: "inherit" });
}
if (!existsSync(join(DIST, "index.html"))) {
  console.error("找不到 dist/index.html，請先成功 build");
  process.exit(1);
}

// 2. 打包（desktop.ini 是 Windows 產生的垃圾檔，排除）
// 注意：tar / scp 一律走「相對路徑」。帶磁碟代號的絕對路徑會讓
// Windows 內建 tar.exe 當掉，也會被 GNU tar / scp 誤判成遠端主機（C: → host "C"）
console.log("\n[2/4] 打包 dist");
const TARBALL = "dist-deploy.tgz"; // 位於專案根目錄
const tar = tarCommand();
run(tar.cmd, ["--exclude=desktop.ini", "-czf", `../${TARBALL}`, "."], {
  cwd: DIST,
  env: tar.env,
});

// 3. 上傳
console.log("\n[3/4] 上傳到香港機");
run("scp", ["-o", "BatchMode=yes", TARBALL, `${HOST}:/tmp/aguaphone-dist.tgz`], {
  cwd: ROOT,
});

// 4. 伺服器端替換（舊版備份為 dist.bak-時間戳，只保留最近 3 份）
console.log("\n[4/4] 替換線上版本");
const remote = [
  "set -e",
  "TS=$(date +%Y%m%d-%H%M%S)",
  `rm -rf ${WWW}/dist.new && mkdir -p ${WWW}/dist.new`,
  `tar -C ${WWW}/dist.new -xzf /tmp/aguaphone-dist.tgz`,
  `test -f ${WWW}/dist.new/index.html`,
  `mv ${WWW}/dist ${WWW}/dist.bak-$TS`,
  `mv ${WWW}/dist.new ${WWW}/dist`,
  `chmod -R a+rX ${WWW}/dist`,
  "rm -f /tmp/aguaphone-dist.tgz",
  `ls -1dt ${WWW}/dist.bak-* 2>/dev/null | tail -n +4 | xargs -r rm -rf`,
  `echo "完成，舊版備份：${WWW}/dist.bak-$TS"`,
].join(" && ");
run("ssh", ["-o", "BatchMode=yes", HOST, remote]);

rmSync(join(ROOT, TARBALL), { force: true });
console.log("\n\x1b[32m部署完成 → https://aguaphone.aguacloud.uk\x1b[0m");
console.log("提醒：Service Worker 可能讓舊用戶看到快取版本，請他們重新整理兩次。");
