// What may be called "a complete and recoverable backup". It fails closed: any piece of evidence that is missing,
// unknown or not exactly as required counts against the backup. Nothing here trusts a single exit code.
import { parseEnv } from './replica-guard.mjs'

const SECRET_NAME = /(SECRET|PASS|TOKEN|KEY|CREDENTIAL|DATABASE_URL|DIRECT_URL)/

// 'redacted' = a backup made for a rehearsal (no secret value anywhere in the configuration copy).
// 'integral' = what real disaster recovery needs: the original secrets, which must be kept OUTSIDE any rehearsal replica.
export function classifyConfig(text) {
  const values = [...parseEnv(text)]
  if (!values.length) return 'empty'
  return values.some(([name, value]) => SECRET_NAME.test(name) && value !== '') ? 'integral' : 'redacted'
}

export function assessRecoverable(evidence = {}) {
  const reasons = []
  const need = (condition, reason) => { if (condition !== true) reasons.push(reason) }
  const { snapshot, credentials, repository, extraction, assessment, restore, comparison, objects } = evidence
  need(credentials?.ok, 'credentials were not accepted by the repository')
  need(repository?.ok, 'repository integrity check did not pass')
  need(snapshot?.found, 'no snapshot was found')
  need(snapshot?.coverage === 'complete-declared', `snapshot coverage is "${snapshot?.coverage ?? 'unknown'}", not complete`)
  need(snapshot?.pending === false, 'snapshot is pending or its state is unknown')
  need(extraction?.ok, 'extraction did not finish cleanly')
  need(assessment?.exitCode === 0, `assessment exit code is ${assessment?.exitCode ?? 'unknown'}`)
  need(assessment?.hashMismatches === 0, 'extracted files do not match the manifest hashes')
  need(assessment?.missingFiles === 0, 'files listed in the manifest are missing')
  need(restore?.ran, 'the database restore was not completed')
  need(restore?.unexpectedErrors === 0, 'database restore produced errors that are not in the expected baseline')
  need(comparison?.differences === 0, 'restored inventory differs from the source inventory')
  need(objects?.mismatches === 0 && objects?.unreadable === 0, 'Storage objects differ from the manifest')
  return { recoverable: reasons.length === 0, reasons }
}
