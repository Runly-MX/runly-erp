// Static isolation check for the environment files of a restored replica. It reports VARIABLE NAMES and a reason,
// never values: a value that reaches outside the replica could be a production endpoint or a real credential.
const LOOPBACK = /^(localhost|127\.\d+\.\d+\.\d+|::1|\[::1\]|host\.docker\.internal|host-gateway)$/i
// Compose service names resolve only inside the replica's own Docker network.
const INTERNAL_SERVICE = /^(supabase-[a-z]+|runly-[a-z-]+|livekit[a-z-]*|collabora|redis|egress|postgres|db|kong|studio|realtime|storage|auth|rest|meta|minio)$/i
const PRIVATE_IP = /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/
// Variables whose mere presence (non-empty) lets the replica act on the outside world.
const CREDENTIALS = /(^|_)(GROQ_API_KEY|TAVILY_API_KEY|GOOGLE_OAUTH_CLIENT_SECRET|GOOGLE_OAUTH_ENCRYPTION_KEY|GOOGLE_APPLICATION_CREDENTIALS|LIVEKIT_API_SECRET|RESTIC_PASSWORD|BACKUP_S3_SECRET_ACCESS_KEY|BACKUP_S3_ACCESS_KEY_ID|BACKUP_STORAGE_S3_SECRET_ACCESS_KEY|BACKUP_STORAGE_S3_ACCESS_KEY_ID|SMTP_PASS(WORD)?|STRIPE_[A-Z_]*KEY|FIREBASE_PROJECT_ID)$/
const MODES_THAT_MUST_BE_OFF = { BACKUP_MODE: 'disabled', LIVEKIT_MODE: 'disabled', RUNLY_FCM_ENABLED: 'false', RUNLY_OFFICE_ENABLED: 'false', TRANSCRIPTION_MODE: 'disabled', MIRAI_TTS_MODE: 'disabled', AI_LOCAL_ENABLED: 'false' }
const URL_NAME = /(URL|ENDPOINT|HOST|ORIGIN|DOMAIN|REDIRECT_URI)$/

export function parseEnv(text) {
  const values = new Map()
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const index = trimmed.indexOf('=')
    if (index > 0) values.set(trimmed.slice(0, index).trim(), trimmed.slice(index + 1).trim().replace(/^['"]|['"]$/g, ''))
  }
  return values
}

function hostOf(value) {
  try { return new URL(value.includes('://') ? value : `https://${value}`).hostname } catch { return null }
}

export function checkReplicaEnv(values) {
  const findings = []
  for (const [name, value] of values) {
    if (value === '') continue
    if (name in MODES_THAT_MUST_BE_OFF && value.toLowerCase() !== MODES_THAT_MUST_BE_OFF[name]) findings.push({ name, reason: `must be "${MODES_THAT_MUST_BE_OFF[name]}" in a replica` })
    else if (CREDENTIALS.test(name)) findings.push({ name, reason: 'real credential or external-service identifier present; leave it empty or use a test value' })
    else if (URL_NAME.test(name) || /^(postgres(ql)?|https?|wss?|s3):\/\//i.test(value)) {
      const host = hostOf(value)
      if (host && !LOOPBACK.test(host) && !INTERNAL_SERVICE.test(host) && !PRIVATE_IP.test(host) && !/\.(local|internal|test|invalid|example)$/i.test(host) && !/^[a-z0-9_-]+$/i.test(host)) findings.push({ name, reason: 'points to a host outside the replica' })
    }
  }
  return findings
}

// Variables to force in the replica's environment file (values are safe placeholders, not production data).
export const NEUTRALIZING_OVERRIDES = Object.freeze({
  ...MODES_THAT_MUST_BE_OFF, CHAT_MIRAI_WEB: 'false', GROQ_API_KEY: '', TAVILY_API_KEY: '', FIREBASE_PROJECT_ID: '', GOOGLE_APPLICATION_CREDENTIALS: '',
  GOOGLE_OAUTH_CLIENT_SECRET: '', BACKUP_S3_ENDPOINT: '', BACKUP_S3_ACCESS_KEY_ID: '', BACKUP_S3_SECRET_ACCESS_KEY: '', RESTIC_PASSWORD: '',
})
