import { useMemo, useState } from 'react'
import { Button } from '@runly/ui'
import { Check, KeyRound, Loader2, Lock, Send } from 'lucide-react'
import { toast } from 'sonner'

const NOUN = { serialNumber: 'serie', assetTag: 'N.º de activo' }

// After an import: rows whose serial / asset number already exists in a folder the user cannot open. Nothing about
// those items is shown; each row can be sent to the folder managers as values to review, or as an access request.
// `submit(body)` does the request (company user or supplier); `items` are the commit rows with status 'restricted'.
export function RestrictedImportPanel({ items, submit }) {
  const rows = useMemo(() => items.filter((i) => i.status === 'restricted' && i.proposal), [items])
  const [sent, setSent] = useState({}) // line -> 'change' | 'access_request'
  const [busy, setBusy] = useState(null) // line | 'all'
  if (!rows.length) return null
  const pending = rows.filter((r) => !sent[r.line])

  async function send(row, kind) {
    const { matchedField, matchedValue, changes } = row.proposal
    // A row with nothing describable to propose can still ask for access.
    const effective = kind === 'change' && Object.keys(changes).length === 0 ? 'access_request' : kind
    await submit({ kind: effective, matchedField, matchedValue, changes: effective === 'change' ? changes : {} })
    return effective
  }

  async function one(row, kind) {
    setBusy(row.line)
    try { const done = await send(row, kind); setSent((prev) => ({ ...prev, [row.line]: done })) }
    catch (err) { toast.error(err?.message ?? 'No se pudo enviar. Intenta de nuevo.') }
    finally { setBusy(null) }
  }

  async function all(kind) {
    setBusy('all')
    let failed = 0
    const done = {}
    for (const row of pending) {
      try { done[row.line] = await send(row, kind) } catch { failed += 1 }
    }
    setSent((prev) => ({ ...prev, ...done }))
    setBusy(null)
    if (failed) toast.warning(`${failed} ${failed === 1 ? 'fila no se pudo enviar' : 'filas no se pudieron enviar'}. Inténtalo de nuevo.`)
    else toast.success(kind === 'change' ? 'Enviamos tus datos a revisión' : 'Enviamos tus solicitudes de acceso')
  }

  return (
    <section aria-label="Filas sin acceso" className="space-y-3 rounded-2xl border border-amber-500/40 bg-amber-500/5 p-4">
      <div className="flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400"><Lock className="h-4 w-4" aria-hidden="true" /></span>
        <div className="min-w-0 space-y-1">
          <p className="text-sm font-semibold">{rows.length} {rows.length === 1 ? 'fila ya existe' : 'filas ya existen'} en carpetas sin acceso</p>
          <p className="text-xs text-[hsl(var(--muted-foreground))]">
            No se duplicaron ni se pueden abrir. Envía lo que traía tu archivo a quien administra esas carpetas para que decida qué aplicar, o solicita acceso.
          </p>
        </div>
      </div>

      {pending.length > 0 ? (
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button type="button" size="sm" className="pointer-coarse:min-h-11" disabled={busy !== null} onClick={() => all('change')}>
            {busy === 'all' ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Send className="mr-1.5 h-3.5 w-3.5" />}Enviar {pending.length === 1 ? 'la fila' : `las ${pending.length} filas`} a revisión
          </Button>
          <Button type="button" size="sm" variant="outline" className="pointer-coarse:min-h-11" disabled={busy !== null} onClick={() => all('access_request')}>
            <KeyRound className="mr-1.5 h-3.5 w-3.5" />Solicitar acceso a {pending.length === 1 ? 'la fila' : `las ${pending.length} filas`}
          </Button>
        </div>
      ) : (
        <p className="flex items-center gap-1.5 text-sm font-medium text-emerald-600 dark:text-emerald-400"><Check className="h-4 w-4" aria-hidden="true" />Todo enviado. Quien administra esas carpetas lo verá en Propuestas.</p>
      )}

      <ul className="max-h-56 space-y-1.5 overflow-y-auto overscroll-contain">
        {rows.map((row) => (
          <li key={row.line} className="flex flex-col gap-2 rounded-xl bg-[hsl(var(--background))]/70 p-2.5 sm:flex-row sm:items-center">
            <div className="min-w-0 flex-1">
              <p className="wrap-break-word text-sm font-medium">{row.name || 'Sin nombre'}</p>
              <p className="text-xs text-[hsl(var(--muted-foreground))]">Fila {row.line} · {NOUN[row.proposal.matchedField]} {row.proposal.matchedValue}</p>
            </div>
            {sent[row.line] ? (
              <span className="flex shrink-0 items-center gap-1 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                <Check className="h-3.5 w-3.5" aria-hidden="true" />{sent[row.line] === 'change' ? 'Enviado a revisión' : 'Acceso solicitado'}
              </span>
            ) : (
              <div className="flex shrink-0 gap-2">
                <Button type="button" size="sm" variant="outline" className="pointer-coarse:min-h-11" disabled={busy !== null} onClick={() => one(row, 'change')}>
                  {busy === row.line ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Send className="mr-1.5 h-3.5 w-3.5" />}Revisión
                </Button>
                <Button type="button" size="sm" variant="ghost" className="pointer-coarse:min-h-11" disabled={busy !== null} onClick={() => one(row, 'access_request')}>
                  <KeyRound className="mr-1.5 h-3.5 w-3.5" />Acceso
                </Button>
              </div>
            )}
          </li>
        ))}
      </ul>
    </section>
  )
}
