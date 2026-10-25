import { useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ErrorState, LoadingState, TemplateManager, useOfficeActions } from '@runly/ui'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../../../../auth/AuthProvider.jsx'
import { runly } from '../../../../lib/runly.js'
import { CatalogPanel } from './CatalogPanel.jsx'

const KIND = 'inventory.custody'

// Company templates for custody records (resguardos), managed by the Documents
// hub: Word, Excel, PowerPoint or PDF forms with {{etiquetas}}, suggested tags,
// field mapping, default, sample preview and editing in the office editor.
export function TemplatesPanel() {
  const navigate = useNavigate()
  const location = useLocation()
  const queryClient = useQueryClient()
  const office = useOfficeActions()
  const { session, userProfile } = useAuth()
  const token = session?.access_token
  const canManage = Boolean(userProfile?.isAdmin || userProfile?.permissions?.includes('inventory.template.manage'))
  const kindsQuery = useQuery({
    queryKey: ['documents', 'kinds'],
    queryFn: () => runly.documents.listKinds(token),
    enabled: Boolean(token),
    staleTime: 60_000,
  })
  const kind = (kindsQuery.data?.items ?? []).find((item) => item.key === KIND) ?? null

  // The custody form lists templates through its own cache: refresh it on leave.
  useEffect(() => () => { queryClient.invalidateQueries({ queryKey: ['inventory', 'document-templates'] }) }, [queryClient])

  const onEditDocument = office?.enabled && office?.canEdit
    ? (template) => {
        const fileId = template.version?.fileAssetId
        if (!fileId) return
        navigate(`/app/m/runly.files/files/${encodeURIComponent(fileId)}/edit`, {
          state: { officeReturnTo: `${location.pathname}${location.search}`, officeInvalidate: ['documents'] },
        })
      }
    : undefined

  return (
    <CatalogPanel catalogKey="templates">
      {kindsQuery.isLoading ? (
        <LoadingState />
      ) : kindsQuery.isError || !kind ? (
        <ErrorState title="No se pudieron cargar las plantillas" onRetry={() => kindsQuery.refetch()} showReport={false} />
      ) : (
        <TemplateManager client={runly.documents} token={token} kind={kind} canManage={canManage} onEditDocument={onEditDocument} />
      )}
    </CatalogPanel>
  )
}
