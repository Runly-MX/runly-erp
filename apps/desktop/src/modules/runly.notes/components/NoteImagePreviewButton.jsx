import { useState } from 'react'
import { Expand } from 'lucide-react'
import { AdvancedFileViewer, Button, ImageEditorDialog } from '@runly/ui'

const resolveImageUrl = (file) => file.url

// "Ver imagen" button + full-screen viewer. When `editable` and the host passes
// `onReplaceImage(editedFile)` (uploads the file and swaps the image), the
// viewer's own "Editar imagen" button opens the full ImageEditorDialog.
export function NoteImagePreviewButton({ src, alt, editable = false, onReplaceImage = null }) {
  const [open, setOpen] = useState(false)
  const [editorOpen, setEditorOpen] = useState(false)
  if (!src) return null
  const canEdit = editable && typeof onReplaceImage === 'function'
  const fileName = alt || 'Imagen de la nota'

  return (
    <span contentEditable={false} onClick={e => e.stopPropagation()} onPointerDown={e => e.stopPropagation()}>
      <Button
        type="button"
        variant="outline"
        size="icon"
        className="h-9 w-9 bg-background/95 shadow-sm"
        aria-label="Ver imagen"
        title="Ver imagen"
        data-html2canvas-ignore
        onMouseDown={e => e.preventDefault()}
        onClick={() => {
          if (document.activeElement?.isContentEditable) document.activeElement.blur()
          setOpen(true)
        }}
      >
        <Expand size={16} />
      </Button>
      {open && (
        <AdvancedFileViewer imageEditing={false}
          open
          onOpenChange={setOpen}
          files={[{ id: src, url: src, originalName: fileName, mimeType: 'image/png' }]}
          activeIndex={0}
          onIndexChange={() => {}}
          onResolveSignedUrl={resolveImageUrl}
          // The editor is a regular dialog (z-50), so the viewer closes when it
          // opens instead of stacking underneath it.
          onEditImage={canEdit ? () => { setOpen(false); setEditorOpen(true) } : null}
          zIndex={100}
        />
      )}
      {canEdit && editorOpen && (
        <ImageEditorDialog
          open
          onOpenChange={setEditorOpen}
          src={src}
          fileName={fileName}
          mimeType="image/png"
          title="Editar imagen"
          onReplace={async (edited) => {
            try {
              await onReplaceImage(edited)
              setEditorOpen(false)
            } catch {
              // The host reports the failure; keep the editor open for a retry.
            }
          }}
        />
      )}
    </span>
  )
}
