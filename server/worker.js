// @ts-check
// Daily worker: refreshes data from UEX (Task 3). For now it only logs.
import cron from "node-cron";
import { APP_NAME } from "@forgeline/shared";
import { config } from "./config.js";

/** @param {string} message */
function log(message) {
  console.log(`${new Date().toISOString()} [${APP_NAME} worker] ${message}`);
}

async function dailyJob() {
  log("daily job: not implemented yet (Task 3)");
}

if (!cron.validate(config.workerCron)) {
  log(`invalid WORKER_CRON "${config.workerCron}"`);
  process.exit(1);
}

log(`worker started, schedule ${config.workerCron} (${config.tz})`);

const task = cron.schedule(config.workerCron, dailyJob, { timezone: config.tz });
await dailyJob();

/** @param {NodeJS.Signals} signal */
function shutdown(signal) {
  log(`${signal} received, stopping`);
  task.stop();
  process.exit(0);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
