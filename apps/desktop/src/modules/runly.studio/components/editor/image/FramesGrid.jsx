import { useId } from 'react'
import { cn } from '@runly/ui'
import { FRAME_GROUPS, maskPath } from '../../../lib/frame-shapes.js'

const BOX = 64

// Real shape of a frame: the mask clips the selected photo (or a Studio
// gradient), with the preset's border and a hint of its shadow.
export function FrameThumb({ preset, imageUrl, className }) {
  const id = useId().replace(/:/g, '')
  const scale = BOX / 400, radius = preset.radius * scale, border = Math.min(6, preset.border.width * scale * 1.6)
  const d = maskPath(preset.mask, BOX, BOX, radius)
  return (
    <svg viewBox={`-6 -6 ${BOX + 12} ${BOX + 12}`} aria-hidden className={cn('h-full w-full overflow-visible', className)}>
      <defs>
        <clipPath id={`clip-${id}`}><path d={d} /></clipPath>
        <linearGradient id={`fill-${id}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#d946ef" /><stop offset="1" stopColor="#7c3aed" />
        </linearGradient>
        {preset.shadow.blur ? <filter id={`shadow-${id}`} x="-30%" y="-30%" width="160%" height="160%"><feDropShadow dx="0" dy="2.5" stdDeviation="2.5" floodColor="#0f172a" floodOpacity="0.35" /></filter> : null}
      </defs>
      <g filter={preset.shadow.blur ? `url(#shadow-${id})` : undefined}>
        <g clipPath={`url(#clip-${id})`}>
          {imageUrl ? <image href={imageUrl} width={BOX} height={BOX} preserveAspectRatio="xMidYMid slice" />
            : <>
              <rect width={BOX} height={BOX} fill={`url(#fill-${id})`} />
              <path d={`M${BOX * 0.12} ${BOX * 0.86}L${BOX * 0.42} ${BOX * 0.5}L${BOX * 0.6} ${BOX * 0.68}L${BOX * 0.72} ${BOX * 0.56}L${BOX * 0.92} ${BOX * 0.86}Z`} fill="#ffffff" opacity="0.55" />
              <circle cx={BOX * 0.7} cy={BOX * 0.3} r={BOX * 0.08} fill="#ffffff" opacity="0.7" />
            </>}
        </g>
        {border ? <path d={d} fill="none" stroke={preset.border.color} strokeWidth={border} /> : null}
        {preset.border.color === '#ffffff' && border ? <path d={d} fill="none" stroke="#0f172a" strokeOpacity="0.12" strokeWidth="0.75" /> : null}
      </g>
    </svg>
  )
}

// Categorised frame picker. `activeKey` marks the frame in use.
// `nested`: rendered under a parent heading (lighter group labels).
export function FramesGrid({ activeKey, imageUrl, disabled, onPick, columns = 4, nested = false }) {
  return (
    <div className="space-y-4">
      {FRAME_GROUPS.map(group => (
        <section key={group.key} aria-label={group.label}>
          <p className={nested ? 'mb-1.5 text-xs font-medium text-[hsl(var(--muted-foreground))]' : 'mb-2 text-xs font-semibold uppercase tracking-wide text-[hsl(var(--muted-foreground))]'}>{group.label}</p>
          <div className={cn('grid gap-2', columns === 4 ? 'grid-cols-4' : 'grid-cols-3')}>
            {group.frames.map(preset => {
              const active = preset.key === activeKey
              return (
                <button key={preset.key} type="button" disabled={disabled} onClick={() => onPick(preset)} aria-pressed={active} title={preset.label} aria-label={`Marco ${preset.label.toLowerCase()}`}
                  className={cn('group flex flex-col items-center gap-1 rounded-xl p-1.5 text-[11px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))] disabled:pointer-events-none disabled:opacity-50',
                    active ? 'bg-fuchsia-500/12 text-fuchsia-700 dark:text-fuchsia-300' : 'text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--muted))] hover:text-[hsl(var(--foreground))]')}>
                  <span className="aspect-square w-full p-1 transition-transform duration-200 group-hover:scale-105 group-active:scale-95 motion-reduce:transition-none">
                    <FrameThumb preset={preset} imageUrl={imageUrl} />
                  </span>
                </button>
              )
            })}
          </div>
        </section>
      ))}
    </div>
  )
}
