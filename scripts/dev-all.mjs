#!/usr/bin/env node
// Starts the self-hosted sync backend and the Aguaphone Vite dev server together.
// Zero-dependency; prefixes logs per process and forwards Ctrl+C to both.

import { spawn } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..");
const backendDir = resolve(repoRoot, "self-hosted-sync-server");

const nodeCmd = process.execPath;

const procs = [
  {
    name: "backend",
    color: "\x1b[36m", // cyan
    command: nodeCmd,
    args: ["src/server.js"],
    cwd: backendDir,
    env: { ...process.env, PORT: process.env.PORT || "3004" },
  },
  {
    name: "frontend",
    color: "\x1b[35m", // magenta
    command: nodeCmd,
    args: ["node_modules/vite/bin/vite.js"],
    cwd: repoRoot,
    env: { ...process.env },
  },
];

const RESET = "\x1b[0m";
const children = [];
let shuttingDown = false;

function prefixStream(stream, name, color) {
  let buffer = "";
  stream.setEncoding("utf8");
  stream.on("data", (chunk) => {
    buffer += chunk;
    let idx;
    while ((idx = buffer.indexOf("\n")) !== -1) {
      const line = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 1);
      process.stdout.write(`${color}[${name}]${RESET} ${line}\n`);
    }
  });
  stream.on("end", () => {
    if (buffer.length) {
      process.stdout.write(`${color}[${name}]${RESET} ${buffer}\n`);
      buffer = "";
    }
  });
}

for (const def of procs) {
  const child = spawn(def.command, def.args, {
    cwd: def.cwd,
    env: def.env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  prefixStream(child.stdout, def.name, def.color);
  prefixStream(child.stderr, def.name, def.color);
  child.on("exit", (code, signal) => {
    process.stdout.write(
      `${def.color}[${def.name}]${RESET} exited (code=${code}, signal=${signal})\n`,
    );
    if (!shuttingDown) {
      shutdown(code ?? 1);
    }
  });
  children.push({ def, child });
}

function shutdown(exitCode) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const { child } of children) {
    if (child.exitCode === null && child.signalCode === null) {
      try {
        child.kill("SIGINT");
      } catch {
        // ignore
      }
    }
  }
  setTimeout(() => process.exit(exitCode), 500);
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));

process.stdout.write(
  `\x1b[36m[backend]\x1b[0m  http://127.0.0.1:${procs[0].env.PORT}\n` +
    `\x1b[36m[backend]\x1b[0m  admin UI: http://127.0.0.1:${procs[0].env.PORT}/admin\n` +
    `\x1b[35m[frontend]\x1b[0m starting vite...\n`,
);
