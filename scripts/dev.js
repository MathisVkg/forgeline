// @ts-check
// Runs the Vite dev server and the Fastify server (node --watch) together.
// Ctrl+C (or either process exiting) stops both.
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const webDir = path.join(root, "web");
const viteBin = path.join(path.dirname(createRequire(path.join(webDir, "package.json")).resolve("vite/package.json")), "bin", "vite.js");

/** @type {{ name: string, args: string[], cwd: string }[]} */
const tasks = [
  { name: "server", args: ["--watch", "app.js"], cwd: path.join(root, "server") },
  { name: "web", args: [viteBin], cwd: webDir },
];

/** @type {import("node:child_process").ChildProcess[]} */
const children = [];
let stopping = false;

for (const task of tasks) {
  const child = spawn(process.execPath, task.args, { cwd: task.cwd, stdio: "inherit" });
  child.on("exit", (code) => {
    if (!stopping) {
      console.log(`[dev] ${task.name} exited (${code ?? "signal"}), stopping the rest`);
      stop(code ?? 1);
    }
  });
  children.push(child);
}

/** @param {number} code */
function stop(code) {
  if (stopping) return;
  stopping = true;
  for (const child of children) {
    if (child.exitCode !== null || child.pid === undefined) continue;
    if (process.platform === "win32") {
      // Kill the whole tree (node --watch spawns a child) on Windows.
      spawn("taskkill", ["/pid", String(child.pid), "/t", "/f"], { stdio: "ignore" });
    } else {
      child.kill("SIGTERM");
    }
  }
  setTimeout(() => process.exit(code), 500);
}

process.on("SIGINT", () => stop(0));
process.on("SIGTERM", () => stop(0));
