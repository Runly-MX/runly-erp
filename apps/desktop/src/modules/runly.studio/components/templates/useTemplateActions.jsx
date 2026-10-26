import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { ConfirmDialog } from '@runly/ui'
import { Archive, Building2, FilePenLine, PenLine, Wand2 } from 'lucide-react'
import { toast } from 'sonner'
import { runly } from '../../../../lib/runly.js'
import { TemplateFormDialog } from './TemplateFormDialog.jsx'
import { templateErrorMessage } from './template-access.js'

const unwrap = response => response?.data ?? response

// Per-template actions, gated only by the row flags the API returns
// (canEdit / canDelete / canPublish). Runly templates never get them.
export function useTemplateActions({ token, scopeKey, categories, onUse, onEditContent }) {
  const queryClient = useQueryClient()
  const [editing, setEditing] = useState(null), [publishing, setPublishing] = useState(null), [retiring, setRetiring] = useState(null)
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['studio', ...scopeKey, 'templates'] })
  // Revision kept locally so a 409 → "Cargar versión actual" → save works without closing the dialog.
  async function reloadRevision(template, set) {
    const fresh = unwrap(await runly.studio.templateDetail(template.id, token))
    set(current => current && { ...current, revision: fresh.revision })
  }
  async function confirmPublish() {
    try { await runly.studio.publishTemplate(publishing.id, publishing.revision, token); toast.success(`«${publishing.name}» ya está disponible para tu empresa`); refresh(); setPublishing(null) }
    catch (error) {
      if (error.status === 409) { await reloadRevision(publishing, setPublishing).catch(() => {}); toast.error(templateErrorMessage(error)) }
      else toast.error(templateErrorMessage(error))
    }
  }
  async function confirmRetire() {
    try { await runly.studio.retireTemplate(retiring.id, retiring.revision, token); toast.success(`«${retiring.name}» se retiró del catálogo`); refresh(); setRetiring(null) }
    catch (error) {
      if (error.status === 409) await reloadRevision(retiring, setRetiring).catch(() => {})
      toast.error(templateErrorMessage(error))
    }
  }
  const items = template => template.scope === 'runly' ? [] : [
    template.canEdit ? { label: 'Editar nombre y categoría', icon: PenLine, onClick: () => setEditing(template) } : null,
    template.canEdit && onEditContent ? { label: 'Editar contenido', icon: FilePenLine, onClick: () => onEditContent(template) } : null,
    template.canPublish && template.scope === 'personal' ? { label: 'Compartir con la empresa', icon: Building2, onClick: () => setPublishing(template) } : null,
    template.canDelete ? { label: 'Retirar plantilla', icon: Archive, onClick: () => setRetiring(template), variant: 'destructive' } : null,
  ].filter(Boolean)
  const useItem = template => onUse ? { label: 'Usar plantilla', icon: Wand2, onClick: () => onUse(template) } : null
  const dialogs = (
    <>
      <TemplateFormDialog open={Boolean(editing)} onOpenChange={open => { if (!open) setEditing(null) }} mode="edit" template={editing} categories={categories}
        onReloadRevision={() => reloadRevision(editing, setEditing)}
        onSubmit={async ({ name, category, description }) => {
          await runly.studio.updateTemplate(editing.id, { revision: editing.revision, name, category, description }, token)
          toast.success('Plantilla actualizada'); refresh()
        }} />
      <ConfirmDialog open={Boolean(publishing)} onOpenChange={open => { if (!open) setPublishing(null) }} icon={Building2}
        title="Compartir con la empresa"
        description={publishing ? `«${publishing.name}» pasará a «De mi empresa»: las personas de tu empresa con acceso a Studio podrán usarla para crear sus propios diseños. Las imágenes que son tuyas se comparten solo dentro de la empresa y ningún archivo se vuelve público. Dejará de aparecer en «Mis plantillas».` : ''}
        confirmLabel="Compartir" tone="primary" onConfirm={confirmPublish} />
      <ConfirmDialog open={Boolean(retiring)} onOpenChange={open => { if (!open) setRetiring(null) }} icon={Archive}
        title="Retirar plantilla"
        description={retiring ? `«${retiring.name}» dejará de aparecer en el catálogo y no se podrá usar para nuevos diseños. Los diseños ya creados con ella no cambian.` : ''}
        confirmLabel="Retirar" onConfirm={confirmRetire} />
    </>
  )
  return { items, useItem, dialogs }
}
