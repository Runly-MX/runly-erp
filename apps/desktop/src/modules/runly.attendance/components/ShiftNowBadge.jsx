import { ToneBadge } from './shared.jsx'

const STATES = {
  on_shift: { tone: 'emerald', text: (s) => (s.minutesLeft ? `En turno · faltan ${Math.floor(s.minutesLeft / 60)}:${String(s.minutesLeft % 60).padStart(2, '0')} h` : 'En turno') },
  before_shift: { tone: 'amber', text: (s) => `Turno a las ${s.start}` },
  after_shift: { tone: 'slate', text: () => 'Turno terminado' },
  rest_day: { tone: 'slate', text: () => 'Día de descanso' },
  no_shift: { tone: 'slate', text: () => 'Sin turno' },
}

// Where the person is relative to their shift right now, plus whether they are inside.
export function ShiftNowBadge({ person, showInside = true }) {
  const now = person?.shiftNow
  if (!now) return null
  const meta = STATES[now.state] ?? STATES.no_shift
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      <ToneBadge tone={meta.tone}>{meta.text(now)}</ToneBadge>
      {showInside && person.enabled !== false ? <ToneBadge tone={person.inside ? 'teal' : 'slate'}>{person.inside ? 'Dentro' : 'Fuera'}</ToneBadge> : null}
    </span>
  )
}
