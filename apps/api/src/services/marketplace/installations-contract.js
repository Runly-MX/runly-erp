// /installations/v1 contract (INSTALLATIONS_CHANNEL_CONTRACT_V1). Dependency-free so an ERP installation can
// vendor a byte-identical copy (E4). Authentication is the registry's: see ./registry.js (signingString, HEADERS).
export const INSTALLATIONS_BASE = '/installations/v1';
export const INSTALLATION_CAPABILITIES = Object.freeze(['registry:names', 'marketplace:download', 'marketplace:receipt']);
export const RECEIPT_LIMITS = Object.freeze({ maxBytes: 16 * 1024, maxComponents: 50, futureSkewMs: 300_000 });
export const RECEIPT_STATES = Object.freeze(['applied', 'partial', 'skipped', 'blocked', 'failed', 'compensated', 'needs_attention']);
export const COMPONENT_STATES = Object.freeze(RECEIPT_STATES.filter((state) => state !== 'partial'));

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const HEX64 = /^[a-f0-9]{64}$/;
const ERROR_CODE = /^[a-z0-9_]{1,64}$/;
const ISO_MS = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const RECEIPT_KEYS = ['components', 'finishedAt', 'kind', 'schemaVersion', 'solutionReleaseId', 'startedAt', 'state'];
const COMPONENT_KEYS = ['errorCode', 'releaseId', 'sha256', 'state'];
const plain = (value) => value !== null && typeof value === 'object' && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
const exactKeys = (value, keys) => plain(value) && Object.keys(value).sort().join() === keys.join();
const instant = (value) => typeof value === 'string' && ISO_MS.test(value) && new Date(value).toISOString() === value;

// Closed schema (contract section 5, A-7). Returns null when valid, otherwise a short reason for logs/tests.
// Release existence, sha256 and Solution membership are checked by the Hub against its published releases.
export function receiptProblem(receipt, { now = Date.now(), maxSkewMs = RECEIPT_LIMITS.futureSkewMs } = {}) {
  if (!exactKeys(receipt, RECEIPT_KEYS)) return 'keys';
  if (receipt.schemaVersion !== 1) return 'schemaVersion';
  if (!['component', 'solution'].includes(receipt.kind)) return 'kind';
  if (!RECEIPT_STATES.includes(receipt.state)) return 'state';
  if (receipt.kind === 'component' ? receipt.solutionReleaseId !== null : !UUID_V4.test(receipt.solutionReleaseId ?? '')) return 'solutionReleaseId';
  if (!Array.isArray(receipt.components)) return 'components';
  const count = receipt.components.length;
  if (receipt.kind === 'component' ? count !== 1 : count > RECEIPT_LIMITS.maxComponents) return 'componentCount';
  const seen = new Set();
  for (const component of receipt.components) {
    if (!exactKeys(component, COMPONENT_KEYS)) return 'componentKeys';
    if (!UUID_V4.test(component.releaseId ?? '') || seen.has(component.releaseId)) return 'componentReleaseId';
    seen.add(component.releaseId);
    if (!HEX64.test(component.sha256 ?? '')) return 'componentSha256';
    if (!COMPONENT_STATES.includes(component.state)) return 'componentState';
    if (component.errorCode !== null && !(typeof component.errorCode === 'string' && ERROR_CODE.test(component.errorCode))) return 'componentErrorCode';
  }
  if (receipt.kind === 'component' && receipt.state !== receipt.components[0].state) return 'state';
  if (!instant(receipt.startedAt) || !instant(receipt.finishedAt)) return 'timestamps';
  if (Date.parse(receipt.finishedAt) < Date.parse(receipt.startedAt) || Date.parse(receipt.finishedAt) > now + maxSkewMs) return 'timestamps';
  return null;
}

// Canonical form for idempotency: same content means same bytes regardless of key or component order.
export function canonicalReceipt(receipt) {
  const component = (c) => ({ releaseId: c.releaseId, sha256: c.sha256, state: c.state, errorCode: c.errorCode });
  const components = receipt.components.map(component).sort((a, b) => (a.releaseId < b.releaseId ? -1 : a.releaseId > b.releaseId ? 1 : 0));
  return JSON.stringify({ schemaVersion: receipt.schemaVersion, kind: receipt.kind, solutionReleaseId: receipt.solutionReleaseId, state: receipt.state, components, startedAt: receipt.startedAt, finishedAt: receipt.finishedAt });
}
