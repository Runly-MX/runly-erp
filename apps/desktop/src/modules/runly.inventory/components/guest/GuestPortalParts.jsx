import { useState } from 'react'
import { Button, EmptyState, ErrorState, TextField } from '@runly/ui'
import { Building2, KeyRound, LinkIcon, LogOut, ShieldCheck } from 'lucide-react'
import { guestErrorMessage } from '../../lib/guest-session.js'

export const muted = 'text-[hsl(var(--muted-foreground))]'

// Sticky brand bar: company, guest name and "Salir". Used on every portal state.
export function GuestBrandBar({ companyName, guestName, onLogout, loading = false }) {
  return (
    <header className="sticky top-0 z-30 border-b border-[hsl(var(--border))] bg-[hsl(var(--card))]">
      <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-3 md:px-8">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-[hsl(var(--muted))]">
          <Building2 className={`h-4 w-4 ${muted}`} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{loading ? 'Cargando...' : (companyName || 'Inventario')}</p>
          {guestName ? <p className={`truncate text-xs ${muted}`}>{guestName}</p> : <p className={`text-xs ${muted}`}>Portal de proveedores</p>}
        </div>
        {onLogout ? (
          <Button type="button" variant="ghost" size="sm" onClick={onLogout}>
            <LogOut className="mr-1.5 h-4 w-4" />Salir
          </Button>
        ) : (
          <span className={`flex shrink-0 items-center gap-1 text-xs ${muted}`}><ShieldCheck className="h-3.5 w-3.5" />Enlace seguro</span>
        )}
      </div>
    </header>
  )
}

// Full-page message for dead links, ended sessions and loaded-out guests.
export function GuestErrorPage({ error }) {
  const loggedOut = error?.code === 'LOGGED_OUT'
  const title = loggedOut ? 'Cerraste tu sesión'
    : error?.code === 'SESSION_INVALID' ? 'Tu sesión terminó'
      : error?.code === 'INVALID_LINK' ? 'Enlace no válido'
        : error?.code === 'INVITE_LOCKED' ? 'Acceso bloqueado temporalmente'
          : 'No se pudo abrir el portal'
  const description = loggedOut ? 'Para volver a entrar, abre de nuevo el enlace de tu correo.' : guestErrorMessage(error)
  return (
    <div className="min-h-dvh">
      <GuestBrandBar />
      <div className="mx-auto max-w-md px-4 py-16">
        {loggedOut
          ? <EmptyState icon={LinkIcon} title={title} description={description} />
          : <ErrorState title={title} description={description} showReport={false} />}
      </div>
    </div>
  )
}

// Asks for the access code when the invitation requires one.
export function GuestCodeForm({ busy, error, onSubmit }) {
  const [code, setCode] = useState('')
  return (
    <div className="min-h-dvh">
      <GuestBrandBar />
      <form
        className="mx-auto flex max-w-sm flex-col gap-4 px-4 py-14"
        onSubmit={(e) => { e.preventDefault(); if (code.trim()) onSubmit(code.trim()) }}
      >
        <span className="flex h-14 w-14 items-center justify-center self-center rounded-full bg-[hsl(var(--muted))]">
          <KeyRound className={`h-6 w-6 ${muted}`} />
        </span>
        <div className="text-center">
          <h1 className="text-xl font-semibold tracking-tight">Código de acceso</h1>
          <p className={`mt-1 text-sm ${muted}`}>Ingresa el código que te compartieron junto con la invitación.</p>
        </div>
        <TextField
          label="Código" value={code} autoFocus autoComplete="one-time-code" inputMode="text"
          error={error ? guestErrorMessage(error) : undefined}
          onChange={(e) => setCode(e.target.value)}
        />
        <Button type="submit" disabled={busy || !code.trim()}>{busy ? 'Verificando...' : 'Entrar'}</Button>
      </form>
    </div>
  )
}
