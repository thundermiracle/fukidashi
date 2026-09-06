export {
  type RemoteSnapshot,
  type SyncBackend,
  SyncConflictError,
  SyncSignedOutError,
} from "./backend";
export {
  type CodecKeys,
  createSyncCodec,
  type DecodedPayload,
  decryptEnvelope,
  deriveSyncKey,
  ENVELOPE_VERSION,
  type Envelope,
  encryptPayload,
  isEnvelope,
  jsonCodec,
  type PayloadCodec,
  PBKDF2_ITERATIONS,
  randomSalt,
  readEnvelope,
  readEnvelopeIfAny,
  SyncPassphraseError,
} from "./codec";
export {
  isSyncConfigKey,
  loadSyncConfig,
  SYNC_CONFIG_KEY,
  type SyncConfig,
  saveSyncConfig,
  watchSyncConfig,
} from "./config";
export { loadSyncBackend, storedKeyCodec } from "./configured";
export {
  createDriveApi,
  type DriveApi,
  DriveApiError,
  type DriveFile,
  MAX_UPLOAD_BYTES,
  PayloadTooLargeError,
} from "./drive/api";
export {
  type BearerSource,
  createDriveBearerSource,
  DRIVE_TOKEN_KEY,
  DriveAuthError,
  type DriveAuthOptions,
  type DriveToken,
  driveAuthOptions,
  isTokenFresh,
  loadDriveToken,
  renewDriveToken,
  saveDriveToken,
  signInToDrive,
  signOutOfDrive,
} from "./drive/auth";
export { createDriveBackend, DRIVE_FILE_NAME, readDriveCopy } from "./drive/backend";
export { connectDrive, disconnectDrive } from "./drive/connection";
export { removeSyncPassphrase, setSyncPassphrase } from "./drive/passphrase";
export { type SyncResult, syncOnce } from "./engine";
export {
  isSyncKeyKey,
  loadSyncKey,
  SYNC_KEY_KEY,
  type SyncKey,
  saveSyncKey,
  watchSyncKey,
} from "./key";
export {
  type BackendFactory,
  SYNC_ALARM,
  SYNC_PERIOD_MINUTES,
  type SyncController,
  startSync,
} from "./scheduler";
export {
  DEFAULT_SYNC_STATUS,
  loadSyncStatus,
  type SyncState,
  type SyncStatus,
  saveSyncStatus,
  watchSyncStatus,
} from "./status";
export {
  applySyncPages,
  buildSyncPayload,
  collectSyncPages,
  exportFileName,
  importSyncPayload,
  serializeSyncPayload,
} from "./storage";
