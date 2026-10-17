import { useState } from 'react'
import {
  Button, ConfirmDialog, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, ErrorState, Skeleton,
  Tabs, TabsContent, TabsList, TabsTrigger,
} from '@runly/ui'
import { ClipboardList, Link2, MailPlus, RefreshCw } from 'lucide-react'
import { useCourseShare, useRotateCourseShare, useUpdateCourseShare } from '../../hooks/useLmsShare.js'
import { GuestInvitesPanel } from './GuestInvitesPanel.jsx'
import { IntakeFieldsEditor } from './IntakeFieldsEditor.jsx'
import { ShareLinkTab } from './ShareLinkTab.jsx'

// "Compartir" dialog of the course editor: public link for people without a
// Runly account. Tabs: Enlace (settings and access mode), Formulario (intake
// fields) and, for invite-only links, Invitaciones.
export function ShareCourseDialog({ open, onOpenChange, courseId, readOnly = false }) {
  const share = useCourseShare(courseId, { enabled: open })
  const update = useUpdateCourseShare(), rotate = useRotateCourseShare()
  const [confirmRotate, setConfirmRotate] = useState(false)
  const [tab, setTab] = useState('link')
  const data = share.data
  const invite = data?.settings?.accessMode === 'invite'
  const busy = update.isPending || rotate.isPending || readOnly
  const activeTab = tab === 'invites' && !invite ? 'link' : tab

  const save = (patch) => update.mutate({ courseId, ...patch })

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
          <DialogDescription>Un enlace para personas sin cuenta en Runly: abierto para cursos cortos o solo por invitación para cursos largos.</DialogDescription>
        </DialogHeader>
        {share.isLoading ? <div className="space-y-3 px-5 py-4"><Skeleton className="h-10 rounded-md" /><Skeleton className="h-28 rounded-md" /></div> : null}
        {share.isError ? <div className="px-5 py-4"><ErrorState title="No se pudo cargar el enlace" description={share.error?.message} onRetry={() => share.refetch()} /></div> : null}
        {data ? (
          <Tabs value={activeTab} onValueChange={setTab} className="flex min-h-0 flex-1 flex-col">
            <TabsList className={`mx-5 grid shrink-0 ${invite ? 'grid-cols-3' : 'grid-cols-2'}`}>
              <TabsTrigger value="link" className="gap-1.5"><Link2 className="h-4 w-4" />Enlace</TabsTrigger>
              <TabsTrigger value="form" className="gap-1.5"><ClipboardList className="h-4 w-4" />Formulario</TabsTrigger>
              {invite ? <TabsTrigger value="invites" className="gap-1.5"><MailPlus className="h-4 w-4" />Invitaciones</TabsTrigger> : null}
            </TabsList>
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4">
              <TabsContent value="link" className="mt-0"><ShareLinkTab data={data} busy={busy} onSave={save} /></TabsContent>
              <TabsContent value="form" className="mt-0">
                <IntakeFieldsEditor
                  key={JSON.stringify(data.settings.intakeFields)}
                  fields={data.settings.intakeFields} accessMode={data.settings.accessMode} disabled={busy} saving={update.isPending}
                  onSave={(intakeFields) => save({ intakeFields })}
                />
              </TabsContent>
              {invite ? (
                <TabsContent value="invites" className="mt-0">
                  <GuestInvitesPanel courseId={courseId} linkReady={Boolean(data.enabled && data.path)} disabled={readOnly} />
                </TabsContent>
              ) : null}
            </div>
          </Tabs>
        ) : null}
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
        description={invite
          ? 'El enlace actual y los enlaces personales de las invitaciones dejarán de funcionar de inmediato. Reenvía las invitaciones para que reciban el enlace nuevo. Su avance se conserva en Alumnos.'
          : 'El enlace actual dejará de funcionar de inmediato y los invitados que lo usan perderán el acceso. Su avance se conserva en Alumnos.'}
        confirmLabel="Generar enlace"
        loading={rotate.isPending}
        onConfirm={doRotate}
      />
    </Dialog>
  )
}
