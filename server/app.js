// @ts-check
// Forgeline web server: serves the built SPA, the public /data/*.json files
// and the /api routes.
import { createReadStream, existsSync, mkdirSync } from "node:fs";
import { stat } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import Fastify, { LogController } from "fastify";
import fastifyStatic from "@fastify/static";
import { APP_NAME } from "@forgeline/shared";
import { config } from "./config.js";

/** Files that may be served from DATA_DIR under /data/. */
export const DATA_FILES = Object.freeze(["static-data.json", "prices.json", "aggregates.json"]);

const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self'",
  "font-src 'self'",
  "img-src 'self'",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

const SECURITY_HEADERS = {
  "content-security-policy": CSP,
  "x-content-type-options": "nosniff",
  "referrer-policy": "no-referrer",
  "x-frame-options": "DENY",
};

/**
 * Builds the Fastify app without listening (used by tests and by main()).
 * @param {{ dataDir?: string, webDist?: string, logger?: boolean | object }} [options]
 */
export async function buildApp(options = {}) {
  const dataDir = options.dataDir ?? config.dataDir;
  const webDist = options.webDist ?? config.webDist;

  mkdirSync(dataDir, { recursive: true });

  const app = Fastify({
    logger: options.logger ?? { level: "info" },
    // No per-request logs (privacy, SPEC §1). Equivalent of the deprecated
    // top-level `disableRequestLogging: true` in Fastify >= 5.12.
    logController: new LogController({ disableRequestLogging: true }),
    trustProxy: true,
  });

  app.addHook("onSend", async (_request, reply, payload) => {
    reply.headers(SECURITY_HEADERS);
    return payload;
  });

  app.get("/api/health", async () => ({
    status: "ok",
    app: APP_NAME,
    dataFiles: Object.fromEntries(DATA_FILES.map((name) => [name, existsSync(path.join(dataDir, name))])),
  }));

  app.get("/data/*", async (request, reply) => {
    const name = /** @type {{ "*": string }} */ (request.params)["*"];
    if (!DATA_FILES.includes(name)) return notFound(reply);
    const file = path.join(dataDir, name);
    const info = await stat(file).catch(() => null);
    if (!info?.isFile()) return notFound(reply);
    return reply
      .header("content-type", "application/json; charset=utf-8")
      .header("content-length", info.size)
      .header("cache-control", "public, max-age=300")
      .send(createReadStream(file));
  });

  if (existsSync(webDist)) {
    await app.register(fastifyStatic, {
      root: webDist,
      wildcard: true,
      cacheControl: false,
      setHeaders(reply, filePath) {
        const rel = path.relative(webDist, filePath).split(path.sep).join("/");
        reply.header(
          "cache-control",
          rel.startsWith("assets/") ? "public, max-age=31536000, immutable" : "no-cache",
        );
      },
    });
  } else {
    app.log.warn(`web build not found at ${webDist}; run "npm run build" (API still works)`);
  }

  app.setNotFoundHandler((_request, reply) => notFound(reply));

  return app;
}

/** @param {import("fastify").FastifyReply} reply */
function notFound(reply) {
  return reply.code(404).header("cache-control", "no-store").send({ error: "not_found" });
}

async function main() {
  const app = await buildApp();

  let closing = false;
  /** @param {NodeJS.Signals} signal */
  const shutdown = async (signal) => {
    if (closing) return;
    closing = true;
    app.log.info(`${signal} received, shutting down`);
    try {
      await app.close();
      process.exit(0);
    } catch (err) {
      app.log.error(err);
      process.exit(1);
    }
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  await app.listen({ port: config.port, host: config.host });
}

const runDirectly = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (runDirectly) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
