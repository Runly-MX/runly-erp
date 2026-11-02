import { Alert, AlertDescription, AlertTitle } from '@runly/ui'
import { AlertTriangle } from 'lucide-react'
import { describeCode } from '../lib/websiteErrors.js'

// Forms can be created and configured, but the backend closes publishing of
// pages that reference one until FormScope exists (`form_scope_unresolved`,
// S3/S4 closure). Shown on the forms screen so the cause is visible before the
// user hits it in the publish sheet. Nothing is hidden or removed.
// Replaced by per-form `publishability` when contract C-4 exists.
export function FormsPublishNotice() {
  const info = describeCode('form_scope_unresolved')
  return (
    <Alert variant="warning" role="note">
      <AlertTriangle className="h-4 w-4" aria-hidden="true" />
      <div>
        <AlertTitle>Los formularios todavía no se pueden publicar en el sitio</AlertTitle>
        <AlertDescription>
          {info.message} Puedes crear y configurar formularios e insertarlos en tus páginas: el borrador es privado. Si una página con un formulario se incluye al publicar, el servidor la rechazará sin cambiar tu sitio público; podrás quitar el bloque o excluir esa página de la publicación.
        </AlertDescription>
      </div>
    </Alert>
  )
}
