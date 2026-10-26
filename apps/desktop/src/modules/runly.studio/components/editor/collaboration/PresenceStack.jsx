import { Users } from 'lucide-react'
import { PersonAvatar, Popover, PopoverContent, PopoverTrigger, Tooltip, TooltipContent, TooltipTrigger, cn } from '@runly/ui'
import { OBJECT_META } from '../LayersPanel.jsx'

const MAX_VISIBLE = 3

function Ring({ person, className }) {
  return <PersonAvatar name={person.name} src={person.avatarUrl} size="md" title={null} className={cn('h-8 w-8 ring-2 ring-offset-0', className)} style={{ '--tw-ring-color': person.color }} />
}

function describeActivity(person, objects) {
  const picked = person.sessions.map(session => objects.find(object => object.id === session.selectedId)).find(Boolean)
  return picked ? `Seleccionó ${OBJECT_META[picked.type]?.label?.toLowerCase() ?? 'un elemento'}` : 'En el diseño'
}

function Roster({ people, objects }) {
  return (
    <ul aria-label="Personas en este diseño" className="space-y-1">
      {people.map(person => (
        <li key={person.userId} className="flex items-center gap-2.5 rounded-md px-1.5 py-1">
          <Ring person={person} />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium">{person.name}</span>
            <span className="block truncate text-xs text-[hsl(var(--muted-foreground))]">{describeActivity(person, objects)}</span>
          </span>
        </li>
      ))}
    </ul>
  )
}

// Desktop: up to three avatars, each with its name on hover/focus, plus a list
// of everyone. `compact` (phone): one button with the list.
export function PresenceStack({ people, objects, compact = false }) {
  if (!people.length) return null
  const visible = compact ? [] : people.slice(0, MAX_VISIBLE), extra = people.length - visible.length
  const label = `${people.length} ${people.length === 1 ? 'persona' : 'personas'} en el diseño`
  return (
    <div role="group" aria-label={`${people.length} persona(s) editando`} className="flex items-center">
      <div className="flex -space-x-2">
        {visible.map(person => (
          <Tooltip key={person.userId}>
            <TooltipTrigger asChild>
              <span role="img" tabIndex={compact ? -1 : 0} aria-label={person.name}
                className="rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))] focus-visible:ring-offset-2"><Ring person={person} className="ring-offset-0" /></span>
            </TooltipTrigger>
            <TooltipContent side="bottom">{person.name}</TooltipContent>
          </Tooltip>
        ))}
      </div>
      <Popover>
        <PopoverTrigger asChild>
          <button type="button" aria-label={extra > 0 ? `${label}: ver lista, ${extra} más` : `${label}: ver lista`}
            className={cn('flex h-8 min-w-8 items-center justify-center gap-1 rounded-full px-1.5 text-[11px] font-semibold text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--muted))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]', compact ? 'h-10 min-w-10' : visible.length && 'ml-1')}>
            {extra > 0 && !compact ? `+${extra}` : <><Users className="h-4 w-4" aria-hidden />{compact ? people.length : null}</>}
          </button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-72 p-2">
          <p className="px-1.5 pb-1 text-xs font-semibold uppercase tracking-wide text-[hsl(var(--muted-foreground))]">{label}</p>
          <Roster people={people} objects={objects} />
        </PopoverContent>
      </Popover>
    </div>
  )
}
