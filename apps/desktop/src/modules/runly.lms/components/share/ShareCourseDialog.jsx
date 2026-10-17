import { useState } from 'react'
import {
  Alert, AlertDescription, Button, CheckboxField, ConfirmDialog, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader,
  DialogTitle, ErrorState, Input, RadioGroupField, Skeleton, SwitchField,
} from '@runly/ui'
import { Check, Copy, ExternalLink, Link2, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'
import { useCourseShare, useRotateCourseShare, useUpdateCourseShare } from '../../hooks/useLmsShare.js'
import { SCOPE_OPTIONS, absoluteShareUrl } from '../../lib/lmsShare.js'

const CAN = ['Ver los videos, textos, enlaces y documentos compartidos', 'Guardar su avance en este navegador']
const CANNOT = ['Preguntas, reseñas, anuncios ni recursos descargables', 'Tareas', 'Exámenes ni certificado, salvo que los permitas abajo']

function Rules() {
  return (
    <div className="grid gap-3 rounded-md bg-[hsl(var(--muted)/0.6)] p-3 text-sm sm:grid-cols-2">
      <div>
        <p className="mb-1 font-medium">Los invitados pueden</p>
        <ul className="list-disc space-y-0.5 pl-4 text-[hsl(var(--muted-foreground))]">{CAN.map((item) => <li key={item}>{item}</li>)}</ul>
      </div>
      <div>
        <p className="mb-1 font-medium">No tienen</p>
        <ul className="list-disc space-y-0.5 pl-4 text-[hsl(var(--muted-foreground))]">{CANNOT.map((item) => <li key={item}>{item}</li>)}</ul>
      </div>
    </div>
  )
}

// "Compartir" dialog of the course editor: public link for people without a
// Runly account. They type their name (email optional) and see the shared
// lessons in a reduced player.
export function ShareCourseDialog({ open, onOpenChange, courseId, readOnly = false }) {
  const share = useCourseShare(courseId, { enabled: open })
  const update = useUpdateCourseShare(), rotate = useRotateCourseShare()
  const [confirmRotate, setConfirmRotate] = useState(false)
  const [copied, setCopied] = useState(false)
  const data = share.data
  const settings = data?.settings ?? { scope: 'all', allowQuizzes: false }
  const url = absoluteShareUrl(data)
  const busy = update.isPending || rotate.isPending || readOnly

  const save = (patch) => update.mutate({ courseId, ...patch })

  async function copy() {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch { toast.error('No se pudo copiar. Selecciona el enlace y cópialo a mano.') }
  }

  async function doRotate() {
    try {
      await rotate.mutateAsync({ courseId })
      setConfirmRotate(false)
    } catch { /* toast shown by the mutation */ }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent scrollable size="lg" className="gap-0 p-0 md:p-0 md:pt-0!">
        <DialogHeader icon={Link2} className="mb-0 shrink-0 px-5 pt-4 pb-3">
          <DialogTitle>Compartir curso</DialogTitle>
          <DialogDescription>Un enlace público para personas sin cuenta en Runly. Solo escriben su nombre (el correo es opcional).</DialogDescription>
        </DialogHeader>
        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-4">
          {share.isLoading ? <div className="space-y-3"><Skeleton className="h-10 rounded-md" /><Skeleton className="h-28 rounded-md" /></div> : null}
          {share.isError ? <ErrorState title="No se pudo cargar el enlace" description={share.error?.message} onRetry={() => share.refetch()} /> : null}
          {data ? (
            <>
              <SwitchField
                label="Enlace público activo" description="Desactívalo para que el enlace deje de funcionar al instante."
                checked={data.enabled} onChange={(enabled) => save({ enabled })} disabled={busy}
              />
              {data.enabled && !data.published ? (
                <Alert><AlertDescription>El curso no está publicado: el enlace funcionará cuando lo publiques.</AlertDescription></Alert>
              ) : null}
              <RadioGroupField
                label="Qué se comparte" name="lms-share-scope" options={SCOPE_OPTIONS} value={settings.scope}
                onChange={(scope) => { if (!busy) save({ scope }) }}
                hint="Marca lecciones como vista previa en el editor de cada lección, o marca secciones completas como gratis."
              />
              <CheckboxField
                label="Permitir exámenes" hint="Los invitados presentan los exámenes compartidos. Las respuestas abiertas llegan a Revisión con su nombre."
                checked={settings.allowQuizzes} disabled={busy} onChange={(event) => save({ allowQuizzes: event.target.checked })}
              />
              <CheckboxField
                label="Emitir certificado al completar (requiere plantilla)"
                hint={data.hasCertificateTemplate
                  ? 'Al completar las lecciones compartidas, el invitado descarga su certificado con el nombre que escribió.'
                  : 'Este curso no tiene plantilla de certificado. Elígela en Configuración para que los invitados lo reciban.'}
                checked={settings.issueCertificates === true} disabled={busy} onChange={(event) => save({ issueCertificates: event.target.checked })}
              />
              {data.enabled && url ? (
                <div className="space-y-2">
                  <p className="text-sm font-medium">Enlace</p>
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <Input readOnly value={url} onFocus={(event) => event.target.select()} aria-label="Enlace para compartir" className="font-mono text-xs" />
                    <div className="flex shrink-0 gap-2">
                      <Button variant="outline" onClick={copy}>{copied ? <Check /> : <Copy />}{copied ? 'Copiado' : 'Copiar'}</Button>
                      <Button variant="outline" size="icon" asChild aria-label="Abrir enlace">
                        <a href={url} target="_blank" rel="noopener noreferrer"><ExternalLink /></a>
                      </Button>
                    </div>
                  </div>
                </div>
              ) : null}
              <Rules />
            </>
          ) : null}
        </div>
        <DialogFooter className="mt-0 shrink-0 px-5 py-3">
          {data?.path ? (
            <Button variant="outline" onClick={() => setConfirmRotate(true)} disabled={busy} className="sm:mr-auto"><RefreshCw />Generar nuevo enlace</Button>
          ) : null}
          <Button onClick={() => onOpenChange(false)}>Listo</Button>
        </DialogFooter>
      </DialogContent>
      <ConfirmDialog
        open={confirmRotate} onOpenChange={setConfirmRotate}
        icon={RefreshCw} tone="warning"
        title="Generar nuevo enlace"
        description="El enlace actual dejará de funcionar de inmediato y los invitados que lo usan perderán el acceso. Su avance se conserva en Alumnos."
        confirmLabel="Generar enlace"
        loading={rotate.isPending}
        onConfirm={doRotate}
      />
    </Dialog>
  )
}
