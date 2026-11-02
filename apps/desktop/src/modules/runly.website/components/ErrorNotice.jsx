import { Alert, AlertDescription, AlertTitle, Button } from '@runly/ui'
import { AlertTriangle, Info, RefreshCw } from 'lucide-react'
import { describeError } from '../lib/websiteErrors.js'

// Renders any WebsiteApiError with the shared copy. `requestId` is tucked into
// a collapsed "support" detail (design 8.8).
export function ErrorNotice({ error, onRetry, className }) {
  if (!error) return null
  const info = describeError(error)
  const variant = info.tone === 'danger' ? 'destructive' : info.tone === 'info' ? 'default' : 'warning'
  const Icon = info.tone === 'info' ? Info : AlertTriangle
  return (
    <Alert variant={variant} className={className} role="alert">
      <Icon className="h-4 w-4" aria-hidden="true" />
      <div>
        <AlertTitle>{info.title}</AlertTitle>
        <AlertDescription>
          {info.message}
          {info.fields && (
            <ul className="mt-2 list-disc pl-5 text-xs">
              {Object.entries(info.fields).map(([name, message]) => (
                <li key={name}>{`${name}: ${Array.isArray(message) ? message.join(', ') : String(message)}`}</li>
              ))}
            </ul>
          )}
        </AlertDescription>
        {(onRetry && (info.retry || info.reload)) && (
          <Button variant="outline" size="sm" className="mt-3" onClick={onRetry}>
            <RefreshCw className="h-3.5 w-3.5" /> {info.reload ? 'Recargar' : 'Reintentar'}
          </Button>
        )}
        {info.requestId && (
          <details className="mt-2 text-xs opacity-80">
            <summary className="cursor-pointer">Información para soporte</summary>
            <span>Código de solicitud: {info.requestId}</span>
          </details>
        )}
      </div>
    </Alert>
  )
}
