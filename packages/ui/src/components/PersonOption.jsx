import { Check } from 'lucide-react'
import { PersonAvatar } from './PersonAvatar.jsx'
import { cn } from '../lib/utils.js'

// One person in a user picker: photo (initials fallback), name, a secondary
// line (email by default) and an optional subtitle such as job title and
// department. `user` is { displayName | firstName/lastName, email, avatarUrl,
// subtitle }. Selection is a flat fill plus a check, never a ring. With
// `onSelect` the row is a button; without it, a plain row whose `trailing`
// slot can hold actions (e.g. a "Quitar" button in an access list).
export function personName(user) {
  return user?.displayName || [user?.firstName, user?.lastName].filter(Boolean).join(' ') || user?.email || 'Usuario'
}

export function PersonOption({ user, selected = false, onSelect, secondary, trailing = null, className, ...rest }) {
  const name = personName(user)
  const second = secondary === undefined ? user?.email : secondary
  const Tag = onSelect ? 'button' : 'div'
  return (
    <Tag
      {...(onSelect ? { type: 'button', onClick: () => onSelect(user), 'aria-pressed': selected } : {})}
      className={cn(
        'flex w-full items-center gap-3 rounded-md px-3 py-2 text-left transition-colors',
        onSelect && (selected ? 'bg-[hsl(var(--muted))]' : 'hover:bg-[hsl(var(--muted))]/60'),
        className,
      )}
      {...rest}
    >
      <span className="relative shrink-0">
        <PersonAvatar name={name} src={user?.avatarUrl ?? null} size="md" />
        {user?.online && (
          <span className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full bg-green-500 ring-2 ring-[hsl(var(--card))]" aria-label="En línea" />
        )}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{name}</span>
        {second && <span className="block truncate text-xs text-[hsl(var(--muted-foreground))]">{second}</span>}
        {user?.subtitle && <span className="block truncate text-xs text-[hsl(var(--muted-foreground))]">{user.subtitle}</span>}
      </span>
      {selected && <Check className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />}
      {trailing}
    </Tag>
  )
}

export default PersonOption
