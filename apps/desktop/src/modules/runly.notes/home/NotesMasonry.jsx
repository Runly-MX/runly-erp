// CSS-columns masonry: cards keep their natural height and flow top to bottom.
export function NotesMasonry({ notes, renderCard }) {
  return (
    <div className="columns-1 gap-3 sm:columns-2 lg:columns-3 xl:columns-4 2xl:columns-5">
      {notes.map((note) => (
        <div key={note.id} className="mb-3 break-inside-avoid">
          {renderCard(note)}
        </div>
      ))}
    </div>
  )
}

export function SectionLabel({ children }) {
  return (
    <p className="mb-2 mt-1 px-0.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
      {children}
    </p>
  )
}
