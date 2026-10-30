import { Lock } from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '@runly/ui'

// Shown on lists and details whose capability is off in the company's
// workflow: the history stays visible, nothing new can be created or changed.
export function ReadOnlyNotice({ subject = 'Esta función' }) {
  return (
    <Alert variant="warning" role="status">
      <Lock className="h-4 w-4" />
      <AlertTitle>Solo lectura</AlertTitle>
      <AlertDescription>
        {subject} está desactivada en el flujo de compras. El historial sigue disponible, pero no se pueden crear ni modificar documentos.
      </AlertDescription>
    </Alert>
  )
}
