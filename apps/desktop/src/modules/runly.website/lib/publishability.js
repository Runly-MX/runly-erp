// INFORMATIVE client-side scan of a draft document. It is never authoritative:
// the backend decides on prepare/activate (`form_scope_unresolved`,
// `dynamic_binding_unavailable`). It only lets the UI warn early and point at
// the block. It is replaced by the structured preflight (contract C-3) when
// that exists. It never edits, hides or removes anything.

export const BLOCKING_BLOCKS = {
  ContactFormBlock: { code: 'form_scope_unresolved', kind: 'form', refProp: 'formId' },
  BookingFormBlock: { code: 'dynamic_binding_unavailable', kind: 'calendar', refProp: 'calendarId' },
}

export function analyzeDocument(document) {
  const issues = []
  const blocks = document && typeof document === 'object' ? document.blocks : null
  if (!blocks || typeof blocks !== 'object') return issues
  for (const [id, block] of Object.entries(blocks)) {
    const rule = block && BLOCKING_BLOCKS[block.type]
    if (!rule) continue
    const resourceId = block.props?.[rule.refProp] || null
    issues.push({
      source: 'local',
      severity: 'blocking',
      code: rule.code,
      blockId: block.id ?? id,
      blockType: block.type,
      resource: { kind: rule.kind, id: resourceId },
      hasReference: Boolean(resourceId),
    })
  }
  return issues
}

// Blocks without a reference render nothing useful but do not block publishing
// by themselves; only a configured reference triggers the backend gate.
export function blockingIssues(issues) {
  return issues.filter((issue) => issue.severity === 'blocking' && issue.hasReference)
}
