import { useEffect, useId, useState } from 'react'
import { Alert, AlertDescription, Button, CreatableComboboxField, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, SegmentedControl, TextField, TextareaField } from '@runly/ui'
import { AlertTriangle, Building2, LayoutTemplate, Loader2, RefreshCw, User } from 'lucide-react'
import { templateErrorMessage } from './template-access.js'

const DEFAULT_CATEGORIES = ['Redes sociales', 'Historias', 'Flyers', 'Carteles', 'Invitaciones', 'Presentaciones', 'Banners', 'Menús', 'Certificados', 'Tarjetas', 'Promociones']

// Save a design as a template (mode "create") or edit a template's metadata
// (mode "edit"). On a 409 the typed values stay; "Cargar versión actual"
// refreshes the revision so the user can save again.
export function TemplateFormDialog({ open, onOpenChange, mode = 'create', template, categories = [], canSaveCompany = false, onSubmit, onReloadRevision }) {
  const [values, setValues] = useState({ name: '', category: '', description: '', scope: 'personal' })
  const [busy, setBusy] = useState(false), [error, setError] = useState(null)
  const fieldId = useId()
  useEffect(() => {
    if (!open) return
    setError(null)
    setValues({ name: template?.name ?? '', category: template?.category ?? '', description: template?.description ?? '', scope: 'personal' })
  }, [open, template?.id, template?.name]) // eslint-disable-line react-hooks/exhaustive-deps
  const set = key => value => setValues(current => ({ ...current, [key]: value }))
  const options = [...new Set([...categories, ...DEFAULT_CATEGORIES, values.category].filter(Boolean))].map(value => ({ value, label: value }))
  async function submit() {
    setBusy(true); setError(null)
    try { await onSubmit({ name: values.name.trim(), category: values.category.trim(), description: values.description.trim(), scope: values.scope }); onOpenChange(false) }
    catch (failure) { setError(failure) } finally { setBusy(false) }
  }
  async function reload() {
    setBusy(true)
    try { await onReloadRevision(); setError(null) } catch (failure) { setError(failure) } finally { setBusy(false) }
  }
  const create = mode === 'create'
  return (
    <Dialog open={open} onOpenChange={value => { if (!busy) onOpenChange(value) }}>
      <DialogContent size="md">
        <DialogHeader icon={LayoutTemplate}>
          <DialogTitle>{create ? 'Guardar como plantilla' : 'Editar plantilla'}</DialogTitle>
          <DialogDescription>{create
            ? 'Se crea una copia independiente de este diseño en su estado actual. Cambiar el diseño después no modifica la plantilla.'
            : 'Cambia cómo se muestra en el catálogo. El contenido no se modifica.'}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <TextField id={`${fieldId}-name`} label="Nombre" required value={values.name} maxLength={160} onChange={event => set('name')(event.target.value)} />
          <CreatableComboboxField id={`${fieldId}-category`} label="Categoría" value={values.category} options={options} onChange={value => set('category')(value ?? '')} onCreate={set('category')}
            placeholder="Buscar o crear..." searchPlaceholder="Buscar..." />
          <TextareaField id={`${fieldId}-description`} label="Descripción" rows={3} maxLength={500} value={values.description} onChange={event => set('description')(event.target.value)}
            hint="Ayuda a tu equipo a saber cuándo usarla." />
          {create ? (
            <div className="space-y-2">
              <p className="text-sm font-medium">¿Quién podrá usarla?</p>
              <SegmentedControl ariaLabel="Alcance de la plantilla" value={values.scope} onChange={set('scope')}
                options={[{ value: 'personal', label: 'Solo yo' }, ...(canSaveCompany ? [{ value: 'company', label: 'Toda la empresa' }] : [])]} />
              <p className="flex gap-2 text-xs leading-relaxed text-[hsl(var(--muted-foreground))]">
                {values.scope === 'company'
                  ? <><Building2 className="mt-0.5 h-3.5 w-3.5 shrink-0" />Las personas de tu empresa con acceso a Studio podrán usarla para crear sus propios diseños. Las imágenes se comparten solo dentro de la empresa; ningún archivo se vuelve público.</>
                  : <><User className="mt-0.5 h-3.5 w-3.5 shrink-0" />Solo tú la verás en «Mis plantillas».{canSaveCompany ? '' : ' Para compartirla con la empresa se necesita permiso de publicación.'}</>}
              </p>
            </div>
          ) : null}
          {error ? (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription className="space-y-2">
                <p>{templateErrorMessage(error)}</p>
                {error.status === 409 && onReloadRevision ? <Button size="sm" variant="outline" disabled={busy} onClick={reload}><RefreshCw />Cargar versión actual</Button> : null}
              </AlertDescription>
            </Alert>
          ) : null}
        </div>
        <DialogFooter>
          <Button variant="outline" disabled={busy} onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button disabled={busy || !values.name.trim()} onClick={submit}>{busy ? <Loader2 className="animate-spin motion-reduce:animate-none" /> : null}{create ? 'Guardar plantilla' : 'Guardar cambios'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
