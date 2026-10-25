import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useLocation, useNavigate } from 'react-router-dom'
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, ErrorState, LoadingState, TemplateManager, useOfficeActions,
} from '@runly/ui'
import { FileText } from 'lucide-react'
import { useAuth } from '../../../../auth/AuthProvider.jsx'
import { runly } from '../../../../lib/runly.js'
import { KEY } from '../../hooks/useLmsData.js'

const KIND = 'lms.certificate'

// Word, PowerPoint and PDF certificate templates, managed by the Documents hub
// (kind lms.certificate): upload, blank document, suggested tags, field mapping,
// sample preview and editing in the office editor. Closing refreshes the LMS
// template list, where every file template appears next to the built-in design.
export function CertificateFilesDialog({ open, onOpenChange }) {
  const navigate = useNavigate()
  const location = useLocation()
  const queryClient = useQueryClient()
  const office = useOfficeActions()
  const { session, userProfile } = useAuth()
  const token = session?.access_token
  const canManage = Boolean(userProfile?.isAdmin || userProfile?.permissions?.includes('lms.course.manage'))
  const kindsQuery = useQuery({
    queryKey: ['documents', 'kinds'],
    queryFn: () => runly.documents.listKinds(token),
    enabled: Boolean(token) && open,
    staleTime: 60_000,
  })
  const kind = (kindsQuery.data?.items ?? []).find((item) => item.key === KIND) ?? null

  const onEditDocument = office?.enabled && office?.canEdit
    ? (template) => {
        const fileId = template.version?.fileAssetId
        if (!fileId) return
        navigate(`/app/m/runly.files/files/${encodeURIComponent(fileId)}/edit`, {
          state: { officeReturnTo: `${location.pathname}${location.search}`, officeInvalidate: ['documents', KEY] },
        })
      }
    : undefined

  function handleOpenChange(next) {
    if (!next) queryClient.invalidateQueries({ queryKey: [KEY, 'cert-templates'] })
    onOpenChange(next)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent size="2xl">
        <DialogHeader icon={FileText}>
          <DialogTitle>Plantillas de archivo</DialogTitle>
          <DialogDescription>
            Sube el certificado de tu empresa en Word, PowerPoint o PDF. Las etiquetas se llenan al emitir cada certificado.
          </DialogDescription>
        </DialogHeader>
        <div className="min-h-0 flex-1 overflow-y-auto">
          {kindsQuery.isLoading ? (
            <LoadingState />
          ) : kindsQuery.isError || !kind ? (
            <ErrorState title="No se pudieron cargar las plantillas" onRetry={() => kindsQuery.refetch()} showReport={false} />
          ) : (
            <TemplateManager client={runly.documents} token={token} kind={kind} canManage={canManage} onEditDocument={onEditDocument} />
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
