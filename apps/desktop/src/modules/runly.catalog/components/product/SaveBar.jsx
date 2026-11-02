// apps/desktop/src/modules/runly.catalog/components/product/SaveBar.jsx
import { Button } from '@runly/ui'

// Sticky footer of a product form: visible state of unsaved changes plus the
// save action, so the main action never scrolls away.
export default function SaveBar({ dirty, saving, onDiscard, label = 'Guardar cambios' }) {
  return (
    <div className="sticky bottom-0 z-10 -mx-4 -mb-6 flex flex-wrap items-center justify-end gap-3 border-t border-[hsl(var(--border))] bg-[hsl(var(--background))] px-4 py-3 md:-mx-6 md:px-6">
      <span className="mr-auto text-sm text-[hsl(var(--muted-foreground))]" aria-live="polite">
        {saving ? 'Guardando...' : dirty ? 'Tienes cambios sin guardar.' : 'Todo guardado.'}
      </span>
      {dirty && !saving && (
        <Button type="button" variant="outline" size="lg" onClick={onDiscard}>Descartar</Button>
      )}
      <Button type="submit" size="lg" loading={saving} disabled={!dirty || saving}>{label}</Button>
    </div>
  )
}
