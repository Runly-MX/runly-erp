import { z } from 'zod';

export const policySchema = z.strictObject({
  profile: z.enum(['OFF', 'LIGHT', 'SMART', 'DEDICATED', 'CUSTOM']).default('OFF'),
  quality: z.enum(['fast', 'balanced', 'accurate']).default('balanced'),
  languages: z.array(z.string().regex(/^[a-z_]{2,16}$/)).min(1).max(4).default(['spa', 'eng']),
  searchEnabled: z.boolean().default(true),
  paused: z.boolean().default(false),
  historical: z.boolean().default(false),
  manualOcr: z.boolean().default(true),
  automaticProcessing: z.boolean().default(true),
  autoOcr: z.boolean().default(true),
  digitalExtraction: z.boolean().default(true),
  imageOcr: z.boolean().default(true),
  pdfOcr: z.boolean().default(true),
  allowedMimeTypes: z.array(z.string().regex(/^(image|text|application)\/[a-z0-9.+-]+$/)).max(30).default([]),
  memoryMiB: z.number().int().min(128).max(4096).default(512),
  threads: z.number().int().min(1).max(4).default(1),
  cpuBudgetPercent: z.number().int().min(10).max(100).default(80),
  dailyProcessingSeconds: z.number().int().min(60).max(86400).default(86400),
  retentionDays: z.number().int().min(1).max(3650).default(365),
  schedule: z.object({
    timeZone: z.string().max(80).refine(value => { try { new Intl.DateTimeFormat('en', { timeZone: value }); return true; } catch { return false; } }).default('America/Mexico_City'),
    windows: z.array(z.object({ days: z.array(z.number().int().min(0).max(6)).min(1).max(7),
      start: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/), end: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
    })).max(14).default([]),
  }).default({ timeZone: 'America/Mexico_City', windows: [] }),
  concurrency: z.number().int().min(1).max(4).default(1),
  maxFileBytes: z.number().int().min(1024).max(64 * 1024 * 1024).default(10 * 1024 * 1024),
  maxPages: z.number().int().min(1).max(200).default(50),
  maxPixels: z.number().int().min(100000).max(40000000).default(16000000),
  timeoutSeconds: z.number().int().min(10).max(900).default(120),
  retries: z.number().int().min(1).max(5).default(3),
  maxPending: z.number().int().min(1).max(1000).default(100),
});

export const DEFAULT_POLICY = policySchema.parse({});
export const ENGINE_VERSION = 'runly-local-2';

export function effectivePolicy(instance = {}, company = {}) {
  const global = policySchema.parse(instance);
  const local = policySchema.parse(company);
  const result = { ...local };
  for (const key of ['concurrency', 'maxFileBytes', 'maxPages', 'maxPixels', 'timeoutSeconds', 'retries', 'maxPending', 'memoryMiB', 'threads', 'cpuBudgetPercent', 'dailyProcessingSeconds', 'retentionDays']) {
    result[key] = Math.min(local[key], global[key]);
  }
  if (global.profile === 'OFF') result.profile = 'OFF';
  if (global.profile === 'LIGHT' && result.profile !== 'OFF') result.profile = 'LIGHT';
  result.paused = global.paused || local.paused;
  result.searchEnabled = global.searchEnabled && local.searchEnabled;
  result.manualOcr = global.manualOcr && local.manualOcr;
  for (const key of ['automaticProcessing', 'digitalExtraction', 'imageOcr', 'pdfOcr']) result[key] = global[key] && local[key];
  result.historical = global.historical && local.historical;
  const permittedLanguages = new Set(global.languages);
  result.languages = local.languages.filter(lang => permittedLanguages.has(lang));
  if (!result.languages.length) result.profile = 'OFF';
  if (result.profile === 'LIGHT') { result.concurrency = 1; result.threads = 1; }
  result.automaticOcr = global.autoOcr && local.autoOcr && ['SMART', 'DEDICATED', 'CUSTOM'].includes(result.profile);
  result.schedules = [global.schedule, local.schedule];
  result.allowedMimeTypes = global.allowedMimeTypes.length && local.allowedMimeTypes.length
    ? local.allowedMimeTypes.filter(type => global.allowedMimeTypes.includes(type))
    : global.allowedMimeTypes.length ? global.allowedMimeTypes : local.allowedMimeTypes;
  result.noAllowedTypes = Boolean(global.allowedMimeTypes.length && local.allowedMimeTypes.length && !result.allowedMimeTypes.length);
  return result;
}

export function withinSchedule(schedule, now = new Date()) {
  if (!schedule.windows.length) return true;
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: schedule.timeZone,
    weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(now).map(p => [p.type, p.value]));
  const day = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].indexOf(parts.weekday);
  const minute = Number(parts.hour) * 60 + Number(parts.minute);
  const minutes = value => Number(value.slice(0,2))*60+Number(value.slice(3));
  return schedule.windows.some(window => {
    const start=minutes(window.start),end=minutes(window.end);
    if (start===end) return window.days.includes(day);
    if (start<end) return window.days.includes(day) && minute>=start && minute<end;
    return (window.days.includes(day) && minute>=start) || (window.days.includes((day+6)%7) && minute<end);
  });
}

export function processingAllowed(policy, file, manual = false) {
  if (!supportedFile(file) || policy.noAllowedTypes || (policy.allowedMimeTypes.length && !policy.allowedMimeTypes.includes(file.mimeType))) return false;
  if (!manual && !policy.automaticProcessing) return false;
  const allowOcr = manual ? policy.manualOcr : policy.automaticOcr;
  if (file.mimeType.startsWith('image/') && file.mimeType !== 'image/svg+xml') return allowOcr && policy.imageOcr;
  if (file.mimeType === 'application/pdf') return policy.digitalExtraction || (allowOcr && policy.pdfOcr);
  return policy.digitalExtraction;
}

export function normalizeText(text) {
  return text.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

export function supportedFile(file) {
  return /^(image\/(jpeg|png|webp|tiff|heic|heif)|application\/(pdf|json|xml|vnd\.openxmlformats-officedocument\.(wordprocessingml\.document|spreadsheetml\.sheet|presentationml\.presentation))|text\/[a-z.+-]+|image\/svg\+xml)$/.test(file.mimeType);
}

// Single, mutually exclusive operator-facing state. Order matters: what the admin chose wins over infrastructure facts.
export function operationalState(effective, workers = [], now = new Date()) {
  if (effective.profile === 'OFF') return 'disabled';
  if (effective.paused) return 'paused-manual';
  if (!workers.length) return 'not-installed';
  const live = workers.find(w => w.connected && Number(w.capabilities?.protocol ?? 1) >= 2);
  if (!live) return 'disconnected';
  if (!withinSchedule(effective.schedule, now)) return 'outside-schedule';
  if (live.capabilities?.governor === 'paused') return 'paused-resources';
  return 'operational';
}
