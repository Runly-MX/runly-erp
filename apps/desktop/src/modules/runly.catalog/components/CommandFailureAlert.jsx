// apps/desktop/src/modules/runly.catalog/components/CommandFailureAlert.jsx
import { Alert, AlertDescription, AlertTitle, Button } from '@runly/ui'
import { CircleAlert, Lock, RefreshCw, WifiOff } from 'lucide-react'

const TITLES = {
  lost: 'Respuesta perdida',
  forbidden: 'Sin permiso',
  conflict: 'Otro cambio llegó primero',
  stock: 'Existencias insuficientes',
  config: 'Falta configuración',
  notFound: 'Ya no existe',
  validation: 'No se pudo guardar',
}

// Inline result of a failed command, with the one action that makes sense:
// a lost response retries the same attempt; the rest ask for a correction.
export default function CommandFailureAlert({ failure, onRetry, retrying = false, className }) {
  if (!failure) return null
  const Icon = failure.kind === 'lost' ? WifiOff : failure.kind === 'forbidden' ? Lock : CircleAlert
  return (
    <Alert variant={failure.kind === 'lost' ? 'warning' : 'destructive'} className={className}>
      <Icon className="h-4 w-4" aria-hidden="true" />
      <AlertTitle>{TITLES[failure.kind] ?? TITLES.validation}</AlertTitle>
      <AlertDescription>
        <p>{failure.message}</p>
        {failure.kind === 'lost' && onRetry && (
          <Button type="button" variant="outline" size="sm" className="mt-2 h-9" onClick={onRetry} disabled={retrying}>
            <RefreshCw className="h-4 w-4" aria-hidden="true" />
            {retrying ? 'Reintentando...' : 'Reintentar'}
          </Button>
        )}
      </AlertDescription>
    </Alert>
  )
}
