import { useCallback, useState } from 'react'
import { AdvancedFileViewer, PersonAvatar } from '@runly/ui'

// Avatar of an attendance person. The picture is inherited from the linked HR employee
// (`person.hr.avatarUrl` thumbnail, `person.hr.photoUrl` full size; lists that return flat rows
// carry `avatarUrl` / `photoUrl` on the person instead). With a full-size photo the
// avatar becomes a button that opens the shared image viewer; without one it is plain initials.
export function PersonPhotoAvatar({ person, name, size = 'md' }) {
  const [open, setOpen] = useState(false)
  const photoUrl = person?.hr?.photoUrl ?? person?.photoUrl ?? null
  const avatar = <PersonAvatar name={name} src={person?.hr?.avatarUrl ?? person?.avatarUrl ?? photoUrl} size={size} />
  const resolve = useCallback(async () => photoUrl, [photoUrl])
  if (!photoUrl) return avatar
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`Ver foto de ${name}`}
        title={`Ver foto de ${name}`}
        className="relative flex shrink-0 cursor-pointer items-center justify-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 max-sm:-m-1 max-sm:min-h-11 max-sm:min-w-11"
      >
        {avatar}
      </button>
      {open ? (
        <AdvancedFileViewer
          open={open}
          onOpenChange={setOpen}
          files={[{ id: person.id ?? person.personId ?? name, mimeType: 'image/jpeg', originalName: name, sizeBytes: 0 }]}
          activeIndex={0}
          onIndexChange={() => {}}
          onResolveSignedUrl={resolve}
        />
      ) : null}
    </>
  )
}
