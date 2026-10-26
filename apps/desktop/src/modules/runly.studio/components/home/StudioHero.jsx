import { ChipTabs, SearchInput, cn } from '@runly/ui'
import { PenTool } from 'lucide-react'
import { FORMAT_CATEGORIES } from '../../lib/formats.js'
import { HeroParticles } from './HeroParticles.jsx'

// Frosted glass over the animated backdrop in light mode (dark keeps the
// shared glass tokens, which are already translucent there).
const GLASS_INPUT = '[&_input]:border-white/80 [&_input]:bg-white/45 [&_input]:shadow-[0_8px_30px_-12px_rgb(124_58_237/0.35)] [&_input]:backdrop-blur-md dark:[&_input]:border-[hsl(var(--input))] dark:[&_input]:bg-[var(--glass-bg)] dark:[&_input]:shadow-none'
const GLASS_TABS = '[&_[role=tablist]]:border-white/80 [&_[role=tablist]]:bg-white/40 [&_[role=tablist]]:shadow-[0_8px_30px_-14px_rgb(124_58_237/0.35)] [&_[role=tablist]]:backdrop-blur-md dark:[&_[role=tablist]]:border-[hsl(var(--border))] dark:[&_[role=tablist]]:bg-[hsl(var(--muted))]/60 dark:[&_[role=tablist]]:shadow-none'

export function StudioHero({ query, onQuery, category, onCategory }) {
  return (
    <section aria-labelledby="studio-hero-title" className="relative overflow-hidden rounded-3xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-4 py-8 sm:px-10 sm:py-12">
      <HeroParticles className="pointer-events-none absolute inset-0 h-full w-full" />
      <div className="relative mx-auto flex max-w-3xl flex-col items-center text-center">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-fuchsia-500/25 bg-fuchsia-500/10 px-3 py-1 text-xs font-semibold text-fuchsia-700 dark:text-fuchsia-300">
          <PenTool className="h-3.5 w-3.5" aria-hidden />Studio
        </span>
        <h1 id="studio-hero-title" className="mt-4 text-balance text-3xl font-bold tracking-tight text-[hsl(var(--foreground))] sm:text-5xl">
          ¿Qué vas a <span className="bg-gradient-to-r from-fuchsia-500 via-violet-500 to-sky-500 bg-clip-text text-transparent">diseñar</span> hoy?
        </h1>
        <p className="mt-3 max-w-xl text-pretty text-sm text-[hsl(var(--muted-foreground))] sm:text-base">
          Publicaciones, flyers, presentaciones y piezas de marca con las imágenes que ya tienes en Runly.
        </p>
        <SearchInput
          value={query} onChange={event => onQuery(event.target.value)} onClear={() => onQuery('')}
          placeholder="Buscar en tus diseños" aria-label="Buscar en tus diseños" maxLength={80}
          className={cn('mt-6 w-full max-w-xl', GLASS_INPUT)}
        />
      </div>
      <div className={cn('relative mx-auto mt-6 max-w-4xl', GLASS_TABS)}>
        <ChipTabs tabs={FORMAT_CATEGORIES} value={category} onChange={onCategory} tone="brand" ariaLabel="Tipos de formato" showDescription={false} />
      </div>
    </section>
  )
}
