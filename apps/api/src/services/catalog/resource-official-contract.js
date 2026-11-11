// Detached institutional evidence v1. Resource feed v1 stays byte-compatible.
// A proof is meaningful only alongside a verified, available resource release.
export const OFFICIAL_RESOURCE_DOMAIN = 'runly.catalog.resources.official.v1\n';
export const officialResourceText = (statement) => OFFICIAL_RESOURCE_DOMAIN + JSON.stringify(canonical(statement));
const canonical = (v) => Array.isArray(v) ? v.map(canonical) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, canonical(v[k])])) : v;
const HEX = /^[a-f0-9]{64}$/;
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const KEYS = ['schemaVersion','issuer','channel','authorityId','organizationId','publisherId','publisher','grantedBySha256','reviewerSha256','requesterSha256','reviewId','draftRevision','fileId','evidenceSha256','validatorId','resourceKey','type','version','releaseId','sha256','decidedAt'];
const exact = (v, keys) => v && typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length === keys.length && keys.every((k) => Object.hasOwn(v,k));

export function validOfficialResourceStatement(s) {
  return !!(exact(s,KEYS) && s.schemaVersion === 1 && s.issuer === 'runly' && s.channel === 'institutional'
    && ['studio_template','website_template'].includes(s.type) && new RegExp('^'+(s.type==='studio_template'?'studio':'website')+'\\.[a-z][a-z0-9-]{1,46}[a-z0-9]$').test(s.resourceKey) && !s.resourceKey.includes('--')
    && /^\d{1,9}\.\d{1,9}\.\d{1,9}$/.test(s.version) && /^[a-z][a-z0-9-]{2,38}[a-z0-9]$/.test(s.publisher)
    && ['authorityId','organizationId','publisherId','reviewId','fileId','releaseId'].every((k) => UUID.test(s[k]))
    && ['sha256','evidenceSha256','validatorId','grantedBySha256','reviewerSha256','requesterSha256'].every((k) => HEX.test(s[k])) && Number.isSafeInteger(s.draftRevision) && s.draftRevision > 0
    && typeof s.decidedAt === 'string' && Number.isFinite(Date.parse(s.decidedAt)) && new Date(s.decidedAt).toISOString() === s.decidedAt);
}
export function validOfficialResourceProof(proof) {
  return !!(exact(proof,['statement','keyId','signature']) && validOfficialResourceStatement(proof.statement)
    && HEX.test(proof.keyId) && typeof proof.signature === 'string' && /^[A-Za-z0-9+/]{86}==$/.test(proof.signature));
}
export function officialResourceMatches(proof, entry) {
  const s = proof?.statement;
  return validOfficialResourceProof(proof) && (!entry.keyId || proof.keyId === entry.keyId) && ['resourceKey','type','version','releaseId','sha256'].every((k) => s[k] === entry[k])
    && s.publisher === (typeof entry.publisher === 'string' ? entry.publisher : entry.publisher?.handle)
    && (!entry.provenance?.evidenceSha256 || s.evidenceSha256 === entry.provenance.evidenceSha256)
    && (!entry.provenance?.validatorId || s.validatorId === entry.provenance.validatorId);
}
