import { Button } from '@runly/ui'
import { Download, Loader2, PartyPopper } from 'lucide-react'
import { useMyCourses } from '../../hooks/useLmsData.js'
import { useDownloadCertificate } from '../../hooks/useLmsCerts.js'

// Find the certificate id of a course in the "Mis cursos" payload.
function findCertificateId(my, courseId) {
  const items = [...(my?.completed ?? []), ...(my?.active ?? [])]
  const item = items.find((entry) => entry.course?.id === courseId)
  return item?.certificateId ?? item?.enrollment?.certificateId ?? null
}

// Player banner once the course is completed, with the certificate download.
export function CompletionBanner({ courseId }) {
  const my = useMyCourses()
  const download = useDownloadCertificate({ own: true })
  const certificateId = findCertificateId(my.data, courseId)
  return (
    <div className="mb-5 flex flex-col gap-3 rounded-md border border-emerald-600/30 bg-emerald-600/10 p-4 sm:flex-row sm:items-center">
      <PartyPopper className="h-5 w-5 shrink-0 text-emerald-700 dark:text-emerald-400" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <p className="font-medium leading-tight">Completaste este curso</p>
        <p className="text-sm text-[hsl(var(--muted-foreground))]">
          {certificateId ? 'Tu certificado está listo.' : 'Puedes repasar las lecciones cuando quieras.'}
        </p>
      </div>
      {certificateId ? (
        <Button className="rounded-md" disabled={download.isPending} onClick={() => download.mutate({ id: certificateId })}>
          {download.isPending ? <Loader2 className="animate-spin motion-reduce:animate-none" /> : <Download />}
          Descargar certificado
        </Button>
      ) : null}
    </div>
  )
}
