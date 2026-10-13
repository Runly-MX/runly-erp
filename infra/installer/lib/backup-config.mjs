import crypto from "node:crypto";

// Encryption password for the restic repository. Generated once, the same
// way lib/transcriber-db.mjs generates TRANSCRIBER_DB_PASSWORD, and NEVER
// regenerated on re-runs — losing it makes every existing remote backup
// permanently unreadable (see docs/superpowers/specs/2026-09-26-backup-
// recovery-system-design.md, Edge case 5).
export function generateResticPassword(randomBytes = crypto.randomBytes) {
  return randomBytes(32).toString("base64url");
}

function clean(value) {
  return String(value ?? "").trim();
}

// Resolves and validates the BACKUP_* / RESTIC_PASSWORD env surface for both
// setup-local.mjs and setup-external.mjs. Pure function, mirrors the shape
// of resolveLiveKitConfig in lib/livekit-config.mjs: takes already-parsed
// values, returns a plain config object, or throws a descriptive Error.
//
// `local` deployment additionally requires supabaseMode === "selfhosted"
// when enabling backup: local-mode Storage backup mounts the
// supabase-storage-data Docker volume (see docker-compose.yml), which only
// exists in this Compose project under selfhosted mode — cli-dev runs
// Storage through a separate Supabase-CLI-managed stack entirely outside
// this project. See the design spec, Edge case 9.
export function resolveBackupConfig({
  deployment,
  supabaseMode,
  values = {},
  randomBytes = crypto.randomBytes,
}) {
  if (!["local", "external"].includes(deployment)) {
    throw new Error("deployment must be local or external.");
  }

  const mode = clean(values.mode || "disabled").toLowerCase();
  if (!["disabled", "enabled"].includes(mode)) {
    throw new Error(`BACKUP_MODE must be "disabled" or "enabled" (got "${mode}").`);
  }

  const scheduleCron = clean(values.scheduleCron) || "0 3 * * *";
  const retentionDaysRaw = clean(values.retentionDays) || "14";
  const retentionDays = Number(retentionDaysRaw);
  const coverageMode = clean(values.coverageMode) || 'complete';
  const maxAgeHours = Number(clean(values.maxAgeHours) || '36');
  const s3Endpoint = clean(values.s3Endpoint);
  const s3Bucket = clean(values.s3Bucket);
  const s3Region = clean(values.s3Region) || "us-east-1";
  const s3AccessKeyId = clean(values.s3AccessKeyId);
  const s3SecretAccessKey = clean(values.s3SecretAccessKey);
  let resticPassword = clean(values.resticPassword);
  const storageS3Endpoint = clean(values.storageS3Endpoint);
  const storageS3AccessKeyId = clean(values.storageS3AccessKeyId);
  const storageS3SecretAccessKey = clean(values.storageS3SecretAccessKey);
  const storageS3Region = clean(values.storageS3Region) || 'us-east-1';

  if (mode === "disabled") {
    return {
      mode,
      scheduleCron,
      retentionDays: Number.isInteger(retentionDays) && retentionDays > 0 ? retentionDays : 14,
      coverageMode: ['complete', 'database-only'].includes(coverageMode) ? coverageMode : 'complete',
      maxAgeHours: Number.isInteger(maxAgeHours) && maxAgeHours > 0 && maxAgeHours <= 999999 ? maxAgeHours : 36,
      s3Endpoint,
      s3Bucket,
      s3Region,
      s3AccessKeyId,
      s3SecretAccessKey,
      resticPassword,
      storageS3Endpoint,
      storageS3AccessKeyId,
      storageS3SecretAccessKey,
      storageS3Region,
      storageMountEnabled: false,
      resticPasswordGenerated: false,
    };
  }

  if (deployment === "local" && supabaseMode !== "selfhosted") {
    const error = new Error(
      "BACKUP_MODE=enabled requires RUNLY_SUPABASE_MODE=selfhosted in local mode "
      + "(cli-dev does not run Supabase Storage inside this Compose project). "
      + "See infra/installer/README.md, \"Migrar de cli-dev a selfhosted\".",
    );
    error.code = "BACKUP_REQUIRES_SELFHOSTED";
    throw error;
  }

  if (!Number.isInteger(retentionDays) || retentionDays < 1) {
    throw new Error(`BACKUP_RETENTION_DAYS must be a positive integer (got "${retentionDaysRaw}").`);
  }
  if (!['complete', 'database-only'].includes(coverageMode)) {
    throw new Error('BACKUP_COVERAGE_MODE must be complete or database-only.');
  }
  if (!Number.isInteger(maxAgeHours) || maxAgeHours < 1 || maxAgeHours > 999999) {
    throw new Error('BACKUP_MAX_AGE_HOURS must be a positive integer (up to 999999).');
  }
  if (!s3Endpoint || !s3Bucket || !s3AccessKeyId || !s3SecretAccessKey) {
    throw new Error(
      "BACKUP_MODE=enabled requires BACKUP_S3_ENDPOINT, BACKUP_S3_BUCKET, "
      + "BACKUP_S3_ACCESS_KEY_ID, and BACKUP_S3_SECRET_ACCESS_KEY.",
    );
  }
  if (deployment === 'external' && coverageMode === 'complete' &&
      (!storageS3Endpoint || !storageS3AccessKeyId || !storageS3SecretAccessKey)) {
    throw new Error('Complete external backup requires BACKUP_STORAGE_S3_*; choose database-only explicitly if full recovery is unavailable.');
  }

  const resticPasswordGenerated = !resticPassword;
  resticPassword ||= generateResticPassword(randomBytes);

  return {
    mode,
    scheduleCron,
    retentionDays,
    coverageMode,
    maxAgeHours,
    s3Endpoint,
    s3Bucket,
    s3Region,
    s3AccessKeyId,
    s3SecretAccessKey,
    resticPassword,
    storageS3Endpoint,
    storageS3AccessKeyId,
    storageS3SecretAccessKey,
    storageS3Region,
    storageMountEnabled: deployment === "local",
    resticPasswordGenerated,
  };
}

// Mirrors getLiveKitComposeProfiles in lib/livekit-config.mjs: returns the
// Compose profile(s) to pass to `docker compose --profile ...` for this
// deployment, or [] when backup is disabled.
export function getBackupComposeProfiles(config, deployment) {
  if (config.mode !== "enabled") return [];
  return [deployment === "local" ? "backup-local" : "backup-external"];
}
