import { z } from 'zod';

export const policySchema = z.strictObject({
  profile: z.enum(['OFF', 'LIGHT', 'SMART', 'DEDICATED', 'CUSTOM']).default('OFF'),
  quality: z.enum(['fast', 'balanced', 'accurate']).default('balanced'),
  languages: z.array(z.string().regex(/^[a-z_]{2,16}$/)).min(1).max(4).default(['spa', 'eng']),
  searchEnabled: z.boolean().default(true),
  paused: z.boolean().default(false),
  historical: z.boolean().default(false),
  manualOcr: z.boolean().default(true),
  concurrency: z.number().int().min(1).max(4).default(1),
  maxFileBytes: z.number().int().min(1024).max(64 * 1024 * 1024).default(10 * 1024 * 1024),
  maxPages: z.number().int().min(1).max(200).default(50),
  maxPixels: z.number().int().min(100000).max(40000000).default(16000000),
  timeoutSeconds: z.number().int().min(10).max(900).default(120),
  retries: z.number().int().min(1).max(5).default(3),
  maxPending: z.number().int().min(1).max(1000).default(100),
});

export const DEFAULT_POLICY = policySchema.parse({});
export const ENGINE_VERSION = 'runly-local-1';

export function effectivePolicy(instance = {}, company = {}) {
  const global = policySchema.parse(instance);
  const local = policySchema.parse(company);
  const result = { ...local };
  for (const key of ['concurrency', 'maxFileBytes', 'maxPages', 'maxPixels', 'timeoutSeconds', 'retries', 'maxPending']) {
    result[key] = Math.min(local[key], global[key]);
  }
  if (global.profile === 'OFF') result.profile = 'OFF';
  if (global.profile === 'LIGHT' && result.profile !== 'OFF') result.profile = 'LIGHT';
  result.paused = global.paused || local.paused;
  result.searchEnabled = global.searchEnabled && local.searchEnabled;
  result.manualOcr = global.manualOcr && local.manualOcr;
  result.historical = global.historical && local.historical;
  result.languages = local.languages.filter(lang => global.languages.includes(lang));
  if (!result.languages.length) result.profile = 'OFF';
  if (result.profile === 'LIGHT') result.concurrency = 1;
  result.automaticOcr = ['SMART', 'DEDICATED', 'CUSTOM'].includes(result.profile);
  return result;
}

export function normalizeText(text) {
  return text.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

export function supportedFile(file) {
  return /^(image\/(jpeg|png|webp|tiff)|application\/(pdf|json|xml|vnd\.openxmlformats-officedocument\.(wordprocessingml\.document|spreadsheetml\.sheet|presentationml\.presentation))|text\/[a-z.+-]+|image\/svg\+xml)$/.test(file.mimeType);
}
