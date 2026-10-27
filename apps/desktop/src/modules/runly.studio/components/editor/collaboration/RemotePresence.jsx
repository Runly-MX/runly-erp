import { cn } from '@runly/ui'
import { OBJECT_META } from '../LayersPanel.jsx'

// Collaborators drawn on the page from real presence data (cursor, selected
// object). Each person keeps their own colour; labels and borders are scaled by
// 1/zoom so they keep the same screen size at any zoom. Remote selections are
// only an indicator: they never lock or block the object.
function Cursor({ person, session, zoom }) {
  return (
    <span aria-label={`Cursor de ${person.name}`} role="img" data-document-x={session.x} data-document-y={session.y}
      className="absolute left-0 top-0 transition-[translate] duration-150 ease-linear motion-reduce:transition-none"
      style={{ translate: `${session.x}px ${session.y}px`, transform: `scale(${1 / zoom})`, transformOrigin: 'top left' }}>
      <svg width="18" height="20" viewBox="0 0 18 20" aria-hidden className="drop-shadow-sm">
        <path d="M1.5 1.2 16 8.6l-6.2 1.9-2.3 6.4Z" fill={person.color} stroke="#fff" strokeWidth="1.5" strokeLinejoin="round" />
      </svg>
      <span className="absolute left-4 top-4 max-w-[180px] truncate whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold leading-4 text-white shadow ring-1 ring-white/70" style={{ backgroundColor: person.color }}>{person.name}</span>
    </span>
  )
}

function SelectedObject({ object, people, zoom }) {
  const [lead] = people, label = people.map(person => person.name).join(', ')
  const inside = object.y * zoom < 24
  return (
    <span role="img" aria-label={`Selección de ${label}`} className="absolute rounded-[2px]"
      style={{ left: object.x, top: object.y, width: object.width * (object.scaleX ?? 1), height: object.height * (object.scaleY ?? 1),
        transform: `rotate(${object.rotation ?? 0}deg)`, transformOrigin: 'top left', boxShadow: `0 0 0 ${2 / zoom}px ${lead.color}`, backgroundColor: `${lead.color}14` }}>
      <span className={cn('absolute left-0 max-w-[200px] truncate whitespace-nowrap rounded px-1.5 py-0.5 text-[11px] font-semibold leading-4 text-white shadow', inside ? 'top-0' : 'bottom-full')}
        style={{ backgroundColor: lead.color, transform: `scale(${1 / zoom})`, transformOrigin: inside ? 'top left' : 'bottom left', marginBottom: inside ? 0 : 12 / zoom }}>
        {people.length > 1 ? `${lead.name} +${people.length - 1}` : lead.name} · {OBJECT_META[object.type]?.label ?? 'Elemento'}
      </span>
    </span>
  )
}

export function RemotePresence({ people, selections, objects, zoom }) {
  if (!people.length) return null
  return (
    <div className="pointer-events-none absolute inset-0 z-[17]">
      {objects.filter(object => selections.has(object.id)).map(object => <SelectedObject key={object.id} object={object} people={selections.get(object.id)} zoom={zoom} />)}
      {people.flatMap(person => person.sessions.filter(session => Number.isFinite(session.x) && Number.isFinite(session.y))
        .map(session => <Cursor key={session.sessionId} person={person} session={session} zoom={zoom} />))}
    </div>
  )
}
