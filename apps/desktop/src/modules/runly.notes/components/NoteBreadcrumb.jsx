import { ChevronRight } from 'lucide-react'
import { NoteIcon } from '../noteIcons.jsx'

function Crumb({ icon, title, onClick, current = false, className = '' }) {
  const label = title || 'Sin titulo'
  const content = (
    <>
      {icon ? <NoteIcon name={icon} size={13} className="shrink-0 text-amber-500" /> : null}
      <span className="truncate">{label}</span>
    </>
  )
  if (current || !onClick) {
    return <span className={`flex min-w-0 items-center gap-1.5 ${current ? 'text-foreground' : ''} ${className}`} aria-current={current ? 'page' : undefined}>{content}</span>
  }
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex min-w-0 items-center gap-1.5 rounded-md px-1 py-0.5 transition-colors hover:bg-muted hover:text-foreground ${className}`}
    >
      {content}
    </button>
  )
}

// "Parent > Child > Current" for a sub-page. Ancestors come from the note
// detail (root first, only the ones the user can open). Renders nothing for a
// root note unless the current title is requested. On narrow screens only the
// closest ancestor is shown; the rest collapse into an ellipsis.
export function NoteBreadcrumb({ note, ancestors, onOpenNote, showCurrent = true }) {
  if (!note || !ancestors?.length) return null
  const lastIndex = ancestors.length - 1

  return (
    <nav aria-label="Ruta de la nota" className="flex min-w-0 flex-1 items-center gap-0.5 text-xs text-muted-foreground">
      {ancestors.length > 1 && <span className="px-1 sm:hidden" aria-hidden="true">...</span>}
      {ancestors.map((ancestor, index) => (
        <span key={ancestor.id} className={`flex min-w-0 items-center gap-0.5 ${index === lastIndex ? '' : 'hidden sm:flex'}`}>
          <Crumb icon={ancestor.icon} title={ancestor.title} onClick={() => onOpenNote?.(ancestor.id)} />
          <ChevronRight size={12} className="shrink-0" aria-hidden="true" />
        </span>
      ))}
      {showCurrent && <Crumb icon={note.icon} title={note.title} current />}
    </nav>
  )
}
