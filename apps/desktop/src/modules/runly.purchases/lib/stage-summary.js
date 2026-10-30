// One-line reading of a document's stage map (states from the API's
// buildStageMap: done | current | blocked | skipped | pending).
//   tone: the state whose color the line takes.
//   caseStatus: status of the document's case, when it has one.
// "Proceso completo" needs the last stage (Cierre) done or the case closed;
// "Proceso cancelado" only when the case was cancelled. Anything else without
// a stage in progress just says so: nothing is "stopped" by default.
export function stageSummary(stages = [], labelOf = (s) => s.label ?? s.type, { caseStatus = null } = {}) {
  const total = stages.length
  const count = (state) => stages.filter((s) => s.state === state).length
  const position = (index) => `Etapa ${index + 1} de ${total}: ${labelOf(stages[index])}`

  if (caseStatus === 'CANCELLED') {
    return { text: `Proceso cancelado · ${count('done')} de ${total} etapas completadas`, tone: 'skipped' }
  }
  const active = stages.findIndex((s) => s.state === 'current' || s.state === 'blocked')
  if (active >= 0) {
    const blocked = stages[active].state === 'blocked'
    return { text: blocked ? `${position(active)} · bloqueada` : position(active), tone: stages[active].state }
  }
  // No stage in progress but some still ahead: name the next one, not "complete".
  const next = stages.findIndex((s) => s.state === 'pending')
  if (next >= 0) return { text: `${position(next)} · pendiente`, tone: 'pending' }

  const done = count('done'), skipped = count('skipped')
  const detail = `${done} de ${total} etapas completadas${skipped ? `, ${skipped} no ${skipped === 1 ? 'aplica' : 'aplican'}` : ''}`
  if (caseStatus === 'CLOSED' || (total && stages[total - 1].state === 'done')) return { text: `Proceso completo · ${detail}`, tone: 'done' }
  return { text: `Sin etapa en curso · ${detail}`, tone: done ? 'done' : 'skipped' }
}

// From which width the stages fit as labelled columns (below it: summary
// plus disclosure). Static class names so Tailwind generates them.
export function columnsBreakpoint(count) {
  if (count <= 5) return 'sm'
  if (count <= 6) return 'md'
  return 'lg'
}
