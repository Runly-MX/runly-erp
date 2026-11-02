// apps/desktop/src/modules/runly.catalog/components/product/SaveBar.jsx
import { UnsavedChangesBar } from '@runly/ui'

// Floating "unsaved changes" bar of a product form. It only exists while there
// is something to save, sits after the last field in the flow (so it never
// covers one) and sticks to the bottom while scrolling. Saving submits the
// enclosing <form>.
export default function SaveBar({ dirty, saving, onDiscard, label = 'Guardar cambios' }) {
  if (!dirty && !saving) return null
  return (
    <UnsavedChangesBar
      message="Tienes cambios sin guardar"
      saving={saving}
      saveLabel={label}
      onDiscard={onDiscard}
      onSave={(event) => event.currentTarget.closest('form')?.requestSubmit()}
    />
  )
}
