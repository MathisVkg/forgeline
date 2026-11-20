// @ts-check
// Public API of the browser storage layer.
export { StorageUnavailableError, openDb, closeDb } from "./db.js";
export {
  HISTORY_DAYS,
  TITLE_MAX,
  MAX_LINES,
  STATUSES,
  EDITABLE_FIELDS,
  OrderValidationError,
  validateOrderInput,
  createOrderRecord,
  applyChanges,
  applyStatus,
  canTransition,
  isReady,
  progress,
  shouldPurge,
  sortOrders,
  snapshotFromEstimate,
  migrateOrder,
} from "./model.js";
export { OrderNotFoundError, listOrders, getOrder, saveNewOrder, updateOrder, setStatus, deleteOrder, purgeHistory } from "./orders.js";
export { DEFAULT_SETTINGS, getSettings, updateSettings } from "./settings.js";
export { ensurePersistence, storageInfo } from "./persist.js";
export { BACKUP_FORMAT, BACKUP_VERSION, MAX_BACKUP_BYTES, buildBackup, backupFileName, downloadBackup, parseBackup, mergeOrders, importBackup } from "./backup.js";
export { onOrdersChanged, notifyOrdersChanged } from "./sync.js";
