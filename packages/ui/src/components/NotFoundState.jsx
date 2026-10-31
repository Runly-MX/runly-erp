import { isValidElement } from 'react'
import { ArrowLeft, Home, SearchX } from 'lucide-react'
import { cn } from '../lib/utils.js'
import { Button } from './Button.jsx'

// "No encontrado": a record, a screen or a module that is not there. It is not an
// error (nothing broke), so it never uses the destructive colors of ErrorState:
// a calm composition in the brand color, a large "404" behind, what was looked for
// and the way back. Fills the screen area it is given and scales down to phones.
//
// `back` / `home` accept { label, onClick } or a ready-made element; `detail` is a
// short technical mention (a key, a folio) shown in a monospace chip.
function Action({ action, variant, icon: Icon }) {
  if (!action) return null
  if (isValidElement(action)) return action
  return (
    <Button variant={variant} onClick={action.onClick} className="h-10 w-full gap-2 sm:w-auto">
      <Icon className="h-4 w-4" />
      {action.label}
    </Button>
  )
}

export function NotFoundState({
  icon: Icon = SearchX,
  title = 'No encontramos lo que buscas',
  description = 'Puede que se haya eliminado, que el enlace esté incompleto o que pertenezca a otra empresa.',
  detail,
  back,
  home,
  code = '404',
  className,
  children,
}) {
  return (
    <section
      aria-labelledby="runly-not-found-title"
      className={cn('relative isolate flex min-h-[min(70dvh,40rem)] w-full items-center justify-center overflow-hidden px-4 py-12 sm:px-6', className)}
    >
      {/* Dotted field that fades towards the edges. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10 opacity-60 [background-image:radial-gradient(hsl(var(--muted-foreground)/0.22)_1px,transparent_1px)] [background-size:22px_22px] [mask-image:radial-gradient(ellipse_at_center,black_20%,transparent_70%)]"
      />
      {/* Soft brand glow behind the composition. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute left-1/2 top-1/2 -z-10 h-[28rem] w-[28rem] -translate-x-1/2 -translate-y-1/2 rounded-full bg-(--brand-primary) opacity-[0.08] blur-3xl"
      />

      <div className="flex w-full max-w-lg flex-col items-center text-center">
        <div className="relative flex items-center justify-center">
          {/* The big code, outlined and faded, sits behind the icon. */}
          <span
            aria-hidden="true"
            className="select-none bg-gradient-to-b from-[hsl(var(--foreground)/0.14)] to-transparent bg-clip-text text-[clamp(6.5rem,26vw,11rem)] font-black leading-none tracking-tighter text-transparent"
          >
            {code}
          </span>
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="relative">
              {/* Two rings, the outer one with a dot travelling around it. */}
              <span aria-hidden="true" className="absolute -inset-5 rounded-full border border-(--brand-primary)/20" />
              <span aria-hidden="true" className="absolute -inset-10 rounded-full border border-dashed border-(--brand-primary)/15 motion-safe:animate-[spin_18s_linear_infinite]">
                <span className="absolute -top-1 left-1/2 h-2 w-2 -translate-x-1/2 rounded-full bg-(--brand-primary) shadow-[0_0_12px_var(--brand-primary)]" />
              </span>
              <div className="relative flex h-16 w-16 items-center justify-center rounded-2xl border border-(--brand-primary)/30 bg-[hsl(var(--background))] shadow-[0_10px_40px_-12px_var(--brand-primary)] sm:h-20 sm:w-20">
                <Icon className="h-8 w-8 text-(--brand-primary) sm:h-9 sm:w-9" strokeWidth={1.75} />
              </div>
            </div>
          </div>
        </div>

        <div className="mt-6 space-y-2 sm:mt-8">
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-(--brand-primary)">No encontrado</p>
          <h2 id="runly-not-found-title" className="text-balance text-xl font-semibold text-[hsl(var(--foreground))] sm:text-2xl">{title}</h2>
          {description && <p className="mx-auto max-w-md text-pretty text-sm leading-relaxed text-[hsl(var(--muted-foreground))]">{description}</p>}
          {detail && (
            <p className="pt-1">
              <code className="inline-block max-w-full truncate rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--muted))]/60 px-2 py-0.5 font-mono text-xs text-[hsl(var(--muted-foreground))]">{detail}</code>
            </p>
          )}
        </div>

        {(back || home) && (
          <div className="mt-7 flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:justify-center">
            <Action action={back} variant="default" icon={ArrowLeft} />
            <Action action={home} variant={back ? 'outline' : 'default'} icon={Home} />
          </div>
        )}
        {children}
      </div>
    </section>
  )
}
