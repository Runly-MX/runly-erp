import { useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import {
  Badge, Button, ConfirmDialog, Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, FileUploader, ProgressBar, cn, formatBytes,
} from '@runly/ui'
import { AlertCircle, CheckCircle2, Download, FileText, Loader2, RefreshCw, Replace, Trash2, X } from 'lucide-react'
import { toast } from 'sonner'
import { runly } from '../../../../lib/runly.js'
import { KEY, unwrap, useToken } from '../../hooks/useLmsData.js'
import { errorCode } from '../../hooks/useLmsEval.js'
import { REJECTED_CODES, RETRY_SAME_AUTH, acceptAttr, formatsLabel, precheckFile, putWithProgress, sha256Hex } from '../../lib/lmsSessionFiles.js'

const MUTED = 'text-xs text-[hsl(var(--muted-foreground))]'
const ROW = 'flex items-center gap-3 rounded-md border border-[hsl(var(--border))] px-3 py-2'
const STAGE_LABELS = { preparing: 'Preparando…', uploading: 'Subiendo', confirming: 'Verificando el archivo…' }
const time = (iso) => (iso ? new Date(iso).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' }) : '')

// Material of the activity: each download asks the server for a 2-minute URL.
export function MaterialList({ sessionId, resources, disabled }) {
  const token = useToken()
  const [busy, setBusy] = useState(null)
  if (!resources?.length) return null
  async function download(resource) {
    setBusy(resource.id)
    try {
      const { url } = unwrap(await runly.lms.downloadSessionResource(sessionId, resource.id, token))
      const link = Object.assign(document.createElement('a'), { href: url, rel: 'noopener' })
      document.body.appendChild(link); link.click(); link.remove()
    } catch (error) {
      toast.error(error.message || 'No se pudo descargar el material.')
    } finally { setBusy(null) }
  }
  return (
    <section className="space-y-2" aria-label="Material de la actividad">
      <p className="text-sm font-medium">Material para descargar</p>
      <ul className="space-y-2">
        {resources.map((resource) => (
          <li key={resource.id} className={ROW}>
            <FileText className="h-5 w-5 shrink-0 text-[hsl(var(--primary))]" aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{resource.title || resource.fileName}</p>
              <p className={MUTED}>{[resource.title ? resource.fileName : null, resource.sizeBytes ? formatBytes(resource.sizeBytes) : null].filter(Boolean).join(' · ')}</p>
            </div>
            <Button variant="outline" size="sm" className="min-h-11 sm:min-h-9" onClick={() => download(resource)} disabled={disabled || busy === resource.id}>
              {busy === resource.id ? <Loader2 className="animate-spin motion-reduce:animate-none" /> : <Download />}Descargar
            </Button>
          </li>
        ))}
      </ul>
    </section>
  )
}

// Delivered files: confirmed versions come from the server (they survive a
// reload); uploads in flight, failed or rejected live here until resolved.
export function DeliveryFiles({ sessionId, activity, disabled, onClosed }) {
  const token = useToken()
  const client = useQueryClient()
  const settings = activity.settings ?? {}
  const files = activity.files ?? []
  const [uploads, setUploads] = useState([]) // { key, name, size, status, progress, message, replaceFileId, retry }
  const jobs = useRef(new Map()) // key -> { file, auth, stored }
  const [replacing, setReplacing] = useState(null)
  const [removing, setRemoving] = useState(null)
  const [removePending, setRemovePending] = useState(false)
  const types = settings.acceptedTypes ?? []
  const busySlots = uploads.filter((item) => item.replaceFileId && ['preparing', 'uploading', 'confirming'].includes(item.status)).map((item) => item.replaceFileId)
  const newInFlight = uploads.filter((item) => !item.replaceFileId && item.status !== 'rejected').length
  const room = Math.max(0, (settings.maxFiles ?? 0) - files.length - newInFlight)

  const patch = (key, data) => setUploads((list) => list.map((item) => (item.key === key ? { ...item, ...data } : item)))
  const drop = (key) => { jobs.current.delete(key); setUploads((list) => list.filter((item) => item.key !== key)) }
  const setFiles = (fn) => client.setQueryData([KEY, 'session', sessionId], (old) => (old ? {
    ...old, activities: old.activities.map((item) => (item.id === activity.id ? { ...item, files: fn(item.files ?? []) } : item)),
  } : old))

  async function run(key) {
    const job = jobs.current.get(key)
    const { file } = job
    patch(key, { status: 'preparing', progress: 0, message: null, retry: false })
    try {
      const buffer = await file.arrayBuffer()
      if (!job.auth) {
        const sha256 = await sha256Hex(buffer)
        job.auth = unwrap(await runly.lms.presignSessionUpload(sessionId, {
          activityId: activity.id, fileName: file.name, sizeBytes: file.size, sha256, replaceFileId: job.replaceFileId ?? undefined,
        }, token))
      }
      if (!job.stored) {
        patch(key, { status: 'uploading' })
        await putWithProgress(job.auth.uploadUrl, buffer, file.type || 'application/octet-stream', (progress) => patch(key, { progress }))
        job.stored = true
      }
      patch(key, { status: 'confirming' })
      const version = unwrap(await runly.lms.confirmSessionUpload(sessionId, job.auth.fileId, token))
      setFiles((list) => [...list.filter((item) => item.slot !== version.slot), version].sort((a, b) => a.slot - b.slot))
      drop(key)
      toast.success(`«${file.name}» recibido.`)
    } catch (error) {
      const code = errorCode(error) ?? error.code
      if (['EXPIRED', 'SESSION_CLOSED'].includes(code)) {
        patch(key, { status: 'rejected', message: 'Se terminó el tiempo: este archivo no llegó a entregarse.' })
        onClosed()
        return
      }
      if (REJECTED_CODES.has(code)) { patch(key, { status: 'rejected', message: error.message }); return }
      // The same signed authorization is reused only while the object is not stored yet.
      if (!RETRY_SAME_AUTH.has(code)) { job.auth = null; job.stored = false }
      if (code === 'NOT_UPLOADED') job.stored = false
      patch(key, { status: 'error', message: error.message || 'No se pudo subir el archivo.', retry: true })
    }
  }

  function enqueue(list, replaceFileId = null) {
    const picked = [...(Array.isArray(list) ? list : [list])].filter(Boolean)
    const accepted = replaceFileId ? picked.slice(0, 1) : picked.slice(0, room)
    if (!replaceFileId && picked.length > accepted.length) toast.warning(`Solo caben ${room} ${room === 1 ? 'archivo más' : 'archivos más'}.`)
    for (const file of accepted) {
      const key = `${Date.now()}-${Math.random().toString(36).slice(2)}`
      const problem = precheckFile(file, settings)
      jobs.current.set(key, { file, auth: null, stored: false, replaceFileId })
      setUploads((current) => [...current, { key, name: file.name, size: file.size, status: problem ? 'rejected' : 'preparing', progress: 0, message: problem, replaceFileId }])
      if (!problem) run(key)
    }
  }

  async function confirmRemove() {
    setRemovePending(true)
    try {
      await runly.lms.removeSessionFile(sessionId, removing.fileId, token)
      setFiles((list) => list.filter((item) => item.fileId !== removing.fileId))
      setRemoving(null)
    } catch (error) {
      if (['EXPIRED', 'SESSION_CLOSED'].includes(errorCode(error))) onClosed()
      else toast.error(error.message || 'No se pudo quitar el archivo.')
    } finally { setRemovePending(false) }
  }

  const limits = `${types.length ? formatsLabel(types) : 'Cualquier formato común'} · hasta ${settings.maxFileMb ?? 50} MB por archivo · máximo ${settings.maxFiles} ${settings.maxFiles === 1 ? 'archivo' : 'archivos'}`
  return (
    <section className="space-y-2" aria-label="Archivos de la entrega">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm font-medium">Tus archivos <span className={MUTED}>({files.length} de {settings.maxFiles})</span></p>
        <p className={MUTED}>{limits}</p>
      </div>
      <ul className="space-y-2" aria-live="polite">
        {files.map((file) => {
          const busy = busySlots.includes(file.fileId)
          return (
            <li key={file.id} className={ROW} data-testid="delivery-file">
              <CheckCircle2 className="h-5 w-5 shrink-0 text-[hsl(var(--primary))]" aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{file.fileName}</p>
                <p className={MUTED}>
                  Recibido {time(file.confirmedAt)} · {formatBytes(file.sizeBytes)}{file.version > 1 ? ` · versión ${file.version}` : ''}
                </p>
              </div>
              {busy ? <Badge variant="outline">Reemplazando…</Badge> : null}
              {!disabled && !busy ? (
                <div className="flex shrink-0 gap-1">
                  <Button variant="ghost" size="icon" className="h-11 w-11 sm:h-9 sm:w-9" aria-label={`Reemplazar ${file.fileName}`} onClick={() => setReplacing(file)}><Replace /></Button>
                  <Button variant="ghost" size="icon" className="h-11 w-11 sm:h-9 sm:w-9" aria-label={`Quitar ${file.fileName}`} onClick={() => setRemoving(file)}><Trash2 /></Button>
                </div>
              ) : null}
            </li>
          )
        })}
        {uploads.map((item) => (
          <li key={item.key} className={cn(ROW, item.status === 'rejected' || item.status === 'error' ? 'border-[hsl(var(--destructive)/0.5)]' : null)} data-testid="delivery-upload" data-status={item.status}>
            {item.status === 'rejected' || item.status === 'error'
              ? <AlertCircle className="h-5 w-5 shrink-0 text-[hsl(var(--destructive))]" aria-hidden="true" />
              : <Loader2 className="h-5 w-5 shrink-0 animate-spin text-[hsl(var(--muted-foreground))] motion-reduce:animate-none" aria-hidden="true" />}
            <div className="min-w-0 flex-1 space-y-1">
              <p className="truncate text-sm font-medium">{item.name}{item.replaceFileId ? <span className={MUTED}> (reemplazo)</span> : null}</p>
              {item.status === 'uploading' ? <ProgressBar value={item.progress} aria-label={`Subiendo ${item.name}`} /> : null}
              <p className={cn('text-xs', item.message ? 'text-[hsl(var(--destructive))]' : 'text-[hsl(var(--muted-foreground))]')}>
                {item.message ?? (item.status === 'uploading' ? `${STAGE_LABELS.uploading} ${item.progress}% · ${formatBytes(item.size)}` : STAGE_LABELS[item.status])}
              </p>
            </div>
            {item.retry && !disabled ? <Button variant="outline" size="sm" className="min-h-11 sm:min-h-9" onClick={() => run(item.key)}><RefreshCw />Reintentar</Button> : null}
            {item.status === 'rejected' || item.status === 'error'
              ? <Button variant="ghost" size="icon" className="h-11 w-11 sm:h-9 sm:w-9" aria-label={`Descartar ${item.name}`} onClick={() => drop(item.key)}><X /></Button>
              : null}
          </li>
        ))}
      </ul>
      {!disabled && room > 0 ? (
        <FileUploader multiple={room > 1} value={null} onChange={(list) => enqueue(list)} accept={acceptAttr(types)} maxSizeMB={settings.maxFileMb ?? 50} hint="Arrastra tus archivos o selecciónalos. Se verifican al recibirlos." />
      ) : null}
      <Dialog open={Boolean(replacing)} onOpenChange={(open) => { if (!open) setReplacing(null) }}>
        <DialogContent size="md">
          <DialogHeader icon={Replace}>
            <DialogTitle>Reemplazar archivo</DialogTitle>
            <DialogDescription>
              El nuevo archivo sustituye a «{replacing?.fileName}» en tu entrega. La versión anterior queda en el historial y ya no se califica.
            </DialogDescription>
          </DialogHeader>
          <FileUploader value={null} onChange={(file) => { const target = replacing; setReplacing(null); enqueue(file, target.fileId) }} accept={acceptAttr(types)} maxSizeMB={settings.maxFileMb ?? 50} hint="Elige el archivo nuevo." />
        </DialogContent>
      </Dialog>
      <ConfirmDialog
        open={Boolean(removing)} onOpenChange={(open) => { if (!open) setRemoving(null) }} icon={Trash2} title="Quitar archivo"
        description={`«${removing?.fileName ?? ''}» dejará de formar parte de tu entrega.`} confirmLabel="Quitar" onConfirm={confirmRemove} loading={removePending}
      />
    </section>
  )
}
