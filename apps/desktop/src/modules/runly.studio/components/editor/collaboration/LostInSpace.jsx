import { HeroParticles } from '../../home/HeroParticles.jsx'
import { LostAstronaut } from './LostAstronaut.jsx'

// Full-screen "lost in space" layout shared by the Studio screens that cannot
// show a design (access lost, design not found): the animated astronaut inside
// the same frosted hero card as the Studio home. `children` holds the actions.
export function LostInSpace({ badge, title, description, children, role = 'alert' }) {
  return (
    <div role={role} className="h-full overflow-y-auto">
      <div className="flex min-h-full items-center justify-center p-4 sm:p-6">
        <section aria-labelledby="studio-lost-title" className="relative w-full max-w-3xl overflow-hidden rounded-3xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-4 py-8 sm:px-10 sm:py-10">
          <HeroParticles className="pointer-events-none absolute inset-0 h-full w-full" />
          <div className="relative mx-auto flex max-w-xl flex-col items-center text-center">
            <div className="w-full max-w-sm overflow-hidden rounded-3xl bg-gradient-to-b from-[#150c33] via-[#22124d] to-[#101a45] ring-1 ring-white/10 shadow-[0_24px_60px_-24px_rgb(124_58_237/0.6)]">
              <LostAstronaut className="block h-auto w-full" />
            </div>
            <span className="mt-6 inline-flex items-center gap-1.5 rounded-full border border-fuchsia-500/25 bg-fuchsia-500/10 px-3 py-1 text-xs font-semibold text-fuchsia-700 dark:text-fuchsia-300">{badge}</span>
            <h1 id="studio-lost-title" className="mt-3 text-balance text-2xl font-bold tracking-tight text-[hsl(var(--foreground))] sm:text-4xl">{title}</h1>
            <p className="mt-3 max-w-md text-pretty text-sm text-[hsl(var(--muted-foreground))] sm:text-base">{description}</p>
            {children}
          </div>
        </section>
      </div>
    </div>
  )
}

// Gradient word used inside the titles, like the Studio home hero.
export const LostAccent = ({ children }) => <span className="bg-gradient-to-r from-fuchsia-500 via-violet-500 to-sky-500 bg-clip-text text-transparent">{children}</span>
