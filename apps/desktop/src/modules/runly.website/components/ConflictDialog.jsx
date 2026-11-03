import { useState } from 'react'
import { Button, ConfirmDialog, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@runly/ui'
import { AlertTriangle, Copy, RefreshCw, Replace } from 'lucide-react'

// HTTP 409 revision_conflict (design 6.5). Nothing is overwritten by default:
// the safe exit (save as a new page) is first, replacing the saved version
// needs an explicit second confirmation. The user's local edits stay in memory
// and in the per-tab backup until one option completes.
export function ConflictDialog({ open, onKeepEditing, onSaveAsCopy, onDiscard, onOverwrite, busy, error }) {
  const [confirmOverwrite, setConfirmOverwrite] = useState(false)
  return (
    <>
      <Dialog open={open} onOpenChange={(next) => { if (!next && !busy) onKeepEditing() }}>
        <DialogContent size="lg">
          <DialogHeader icon={AlertTriangle} tone="warning">
            <DialogTitle>Esta página cambió mientras la editabas</DialogTitle>
            <DialogDescription>Otra persona, u otra pestaña, guardó una versión más reciente. Tus cambios siguen aquí y no se sobrescribió nada.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Button className="w-full justify-start" onClick={onSaveAsCopy} disabled={busy}>
              <Copy className="h-4 w-4" /> Guardar mi versión como una página nueva
            </Button>
            <Button className="w-full justify-start" variant="outline" onClick={onDiscard} disabled={busy}>
              <RefreshCw className="h-4 w-4" /> Descartar mis cambios y cargar la versión guardada
            </Button>
            <Button className="w-full justify-start" variant="outline" onClick={() => setConfirmOverwrite(true)} disabled={busy}>
              <Replace className="h-4 w-4" /> Reemplazar la versión guardada con la mía
            </Button>
            {error && <p role="alert" className="text-sm text-[hsl(var(--destructive))]">{error}</p>}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={onKeepEditing} disabled={busy}>Seguir editando</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <ConfirmDialog
        open={confirmOverwrite}
        onOpenChange={setConfirmOverwrite}
        tone="warning"
        title="Reemplazar la versión guardada"
        description="Se perderán los cambios que la otra persona guardó en esta página. Esta acción no se puede deshacer."
        confirmLabel="Reemplazar con la mía"
        loading={busy}
        onConfirm={async () => { await onOverwrite(); setConfirmOverwrite(false) }}
      />
    </>
  )
}
