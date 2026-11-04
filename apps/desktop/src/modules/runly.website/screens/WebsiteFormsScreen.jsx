import { companyFetch } from '../../../lib/companyFetch.js'
import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Code2, Eye, FileText, Inbox, ListChecks, Plus, Settings2 } from 'lucide-react'
import { useAuth } from '../../../auth/AuthProvider.jsx'
import { getApiUrl } from '../../../lib/runtimeConfig.js'
import {
  Button, EmptyState, ConfirmDialog, ChipTabs, ChipTabPanel,
  LoadingState, ErrorState,
} from '@runly/ui'
import { toast } from 'sonner'
import FormFieldBuilder from '../../../components/forms/FormFieldBuilder.jsx'
import FormSubmissionsPanel from '../../../components/forms/FormSubmissionsPanel.jsx'
import FormSettingsPanel from '../../../components/forms/FormSettingsPanel.jsx'
import FormPreview from '../../../components/forms/FormPreview.jsx'
import FormApiPanel from '../../../components/forms/FormApiPanel.jsx'
import { FormPublishability } from '../components/FormPublishability.jsx'
import { SiteSectionHeader } from '../components/SiteSectionHeader.jsx'
import { FormsList } from '../components/FormsList.jsx'
import { FormsDetailHeader } from '../components/FormsDetailHeader.jsx'
import { FormsNewDialog } from '../components/FormsNewDialog.jsx'

async function apiGet(path, token) {
  const res = await companyFetch(`${getApiUrl()}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

export default function WebsiteFormsScreen({ siteId: contextSiteId = null }) {
  const { session } = useAuth()
  const token = session?.access_token
  const queryClient = useQueryClient()

  const [searchParams, setSearchParams] = useSearchParams()
  const selectedFormId = searchParams.get('form')
  function setSelectedFormId(id) {
    setSearchParams(id ? { form: id } : {}, { replace: true })
  }
  const [activeTab, setActiveTab] = useState('campos')
  const [newFormOpen, setNewFormOpen]       = useState(false)
  const [deleteTarget, setDeleteTarget]     = useState(null)

  // ── Queries ────────────────────────────────────────────────────────────────
  const siteQuery = useQuery({
    queryKey: ['website-site', contextSiteId, token],
    queryFn: () => apiGet(contextSiteId ? `/website/sites/${contextSiteId}` : '/website/site', token),
    enabled: Boolean(token),
    staleTime: 60_000,
  })
  const siteId = siteQuery.data?.data?.id ?? null
  const turnstileConfigured = Boolean(
    siteQuery.data?.data?.turnstileSiteKey && siteQuery.data?.data?.turnstileSecretKeySet,
  )

  const formsQuery = useQuery({
    queryKey: ['website-forms', siteId, token],
    queryFn: () => apiGet(`/website/sites/${siteId}/forms`, token),
    enabled: Boolean(token) && Boolean(siteId),
    staleTime: 30_000,
  })
  const forms = formsQuery.data?.data ?? []
  const activeFormId = selectedFormId ?? forms[0]?.id ?? null

  const formDetailQuery = useQuery({
    queryKey: ['website-form-detail', activeFormId, token],
    queryFn: () => apiGet(`/website/forms/${activeFormId}`, token),
    enabled: Boolean(token) && Boolean(activeFormId),
    staleTime: 15_000,
  })
  const formDetail = formDetailQuery.data ?? null

  const { data: assigneesData } = useQuery({
    queryKey: ['website-form-assignees', token],
    queryFn: () => apiGet('/website/form-assignees', token),
    enabled: Boolean(token),
    staleTime: 60_000,
  })
  const assignees = assigneesData?.data ?? []

  // ── Delete mutation ────────────────────────────────────────────────────────
  const deleteMutation = useMutation({
    mutationFn: async (formId) => {
      const res = await companyFetch(`${getApiUrl()}/website/forms/${formId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) throw new Error('Error al eliminar')
    },
    onSuccess: () => {
      toast.success('Formulario eliminado')
      setSelectedFormId(null)
      setDeleteTarget(null)
      queryClient.invalidateQueries({ queryKey: ['website-forms', siteId] })
    },
    onError: () => { toast.error('Error al eliminar'); setDeleteTarget(null) },
  })

  // ── Guards ─────────────────────────────────────────────────────────────────
  if (siteQuery.isPending) return <LoadingState variant="page" />

  if (siteQuery.isError || formsQuery.isError) {
    return (
      <div className="p-4 md:p-6">
        <ErrorState
          title="No se pudieron cargar los formularios"
          message={(siteQuery.error ?? formsQuery.error)?.message}
          onRetry={() => { siteQuery.refetch(); formsQuery.refetch() }}
        />
      </div>
    )
  }

  const header = (
    <SiteSectionHeader
      icon={Inbox}
      tone="emerald"
      title="Formularios"
      description="Define campos, copia el ID y úsalo en tu sitio con DynamicForm."
      actions={siteId ? <Button onClick={() => setNewFormOpen(true)}><Plus className="mr-1.5 h-4 w-4" aria-hidden />Nuevo formulario</Button> : null}
    />
  )

  if (!siteId) {
    return (
      <div className="space-y-5 p-4 md:p-6">
        {header}
        <EmptyState icon={Inbox} title="Sitio web no configurado" description='Configura tu sitio primero en la sección "Sitio web".' />
      </div>
    )
  }

  const selectedForm = forms.find(f => f.id === activeFormId) ?? null
  const subCount = selectedForm?._count?.submissions ?? 0
  const refreshDetail = () => queryClient.invalidateQueries({ queryKey: ['website-form-detail', selectedForm.id] })
  const tabs = [
    { value: 'campos', label: 'Campos', icon: ListChecks },
    { value: 'preview', label: 'Vista previa', icon: Eye },
    { value: 'configuracion', label: 'Configuración', icon: Settings2 },
    { value: 'api', label: 'API', icon: Code2 },
    { value: 'envios', label: 'Envíos', icon: Inbox, badge: subCount > 0 ? subCount : null },
  ]

  return (
    <div className="space-y-5 p-4 md:p-6">
      {header}
      {selectedForm?.publishability && <FormPublishability form={selectedForm} siteId={siteId} />}

      {formsQuery.isPending ? (
        <LoadingState message="Cargando formularios..." />
      ) : forms.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="Todavía no tienes formularios"
          description="Crea un formulario de contacto, cotización o registro para recibir mensajes desde tu sitio público."
          action={{ label: 'Crear primer formulario', onClick: () => setNewFormOpen(true) }}
        />
      ) : (
        <div className="flex flex-col gap-5 md:flex-row md:items-start">
          <FormsList forms={forms} activeFormId={activeFormId} onSelect={(id) => { setSelectedFormId(id); setActiveTab('campos') }} />

          <div key={activeFormId} className="min-w-0 flex-1 space-y-4">
            {selectedForm ? (
              <>
                <FormsDetailHeader form={selectedForm} onDelete={() => setDeleteTarget(selectedForm)} />

                <ChipTabs tabs={tabs} value={activeTab} onChange={setActiveTab} tone="brand" ariaLabel="Secciones del formulario" showDescription={false} />

                <ChipTabPanel value="campos" active={activeTab === 'campos'}>
                  {formDetailQuery.isPending ? (
                    <LoadingState message="Cargando campos..." />
                  ) : (
                    <FormFieldBuilder
                      formId={selectedForm.id}
                      fields={formDetail?.fields ?? []}
                      wizardMode={formDetail?.wizardMode ?? false}
                      onRefresh={refreshDetail}
                    />
                  )}
                </ChipTabPanel>

                <ChipTabPanel value="preview" active={activeTab === 'preview'}>
                  {formDetailQuery.isPending ? <LoadingState message="Cargando vista previa..." /> : <FormPreview form={formDetail} />}
                </ChipTabPanel>

                <ChipTabPanel value="configuracion" active={activeTab === 'configuracion'}>
                  {formDetailQuery.isPending ? (
                    <LoadingState message="Cargando configuración..." />
                  ) : formDetailQuery.isError ? (
                    <ErrorState title="No se pudo cargar" message={formDetailQuery.error?.message} onRetry={() => formDetailQuery.refetch()} />
                  ) : (
                    <FormSettingsPanel
                      key={formDetail?.id}
                      form={formDetail}
                      token={token}
                      assignees={assignees}
                      turnstileConfigured={turnstileConfigured}
                      onSaved={() => {
                        formDetailQuery.refetch()
                        queryClient.invalidateQueries({ queryKey: ['website-forms', siteId] })
                      }}
                    />
                  )}
                </ChipTabPanel>

                <ChipTabPanel value="api" active={activeTab === 'api'}>
                  {formDetailQuery.isPending ? <LoadingState message="Cargando..." /> : <FormApiPanel form={formDetail} />}
                </ChipTabPanel>

                <ChipTabPanel value="envios" active={activeTab === 'envios'}>
                  <FormSubmissionsPanel formId={selectedForm.id} />
                </ChipTabPanel>
              </>
            ) : (
              <EmptyState icon={FileText} title="Selecciona un formulario" description="Elige uno de la lista para ver sus campos, envíos y configuración." />
            )}
          </div>
        </div>
      )}

      <FormsNewDialog
        open={newFormOpen}
        onOpenChange={setNewFormOpen}
        siteId={siteId}
        token={token}
        assignees={assignees}
        turnstileConfigured={turnstileConfigured}
        onCreated={(id) => { setSelectedFormId(id); setNewFormOpen(false) }}
      />

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onOpenChange={open => { if (!open) setDeleteTarget(null) }}
        title="Eliminar formulario"
        description={`Se eliminará permanentemente "${deleteTarget?.name}" con todos sus campos y envíos. Esta acción no se puede deshacer.`}
        confirmLabel="Eliminar"
        loading={deleteMutation.isPending}
        onConfirm={() => deleteMutation.mutate(deleteTarget?.id)}
      />
    </div>
  )
}
