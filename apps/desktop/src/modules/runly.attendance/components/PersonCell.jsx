import { fullName } from '../lib/attendanceLabels.js'
import { PersonPhotoAvatar } from './PersonPhotoAvatar.jsx'

// Avatar + name + code, the standard person identity block of the attendance tables.
export function PersonCell({ person, size = 'sm' }) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <PersonPhotoAvatar person={person} name={fullName(person)} size={size} />
      <div className="min-w-0">
        <p className="truncate font-medium leading-tight">{fullName(person)}</p>
        <p className="text-xs tabular-nums text-[hsl(var(--muted-foreground))]">{person?.code}</p>
      </div>
    </div>
  )
}
