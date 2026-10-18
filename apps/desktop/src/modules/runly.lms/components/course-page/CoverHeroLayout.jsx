import { useEffect, useRef, useState } from 'react'
import { cn } from '@runly/ui'

// Course summary in a hero: clamped to 4 lines on phones with "Ver más" when it
// overflows; full text from sm.
export function HeroSummary({ text, className }) {
  const ref = useRef(null)
  const [expanded, setExpanded] = useState(false)
  const [overflows, setOverflows] = useState(false)
  useEffect(() => {
    const node = ref.current
    if (!node || typeof ResizeObserver === 'undefined') return undefined
    const measure = () => setOverflows(node.scrollHeight > node.clientHeight + 1)
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(node)
    return () => observer.disconnect()
  }, [text])
  if (!text) return null
  return (
    <div>
      <p ref={ref} className={cn('text-base text-white/85 sm:text-lg', !expanded && 'max-sm:line-clamp-4', className)}>{text}</p>
      {overflows || expanded ? (
        <button
          type="button" onClick={() => setExpanded((value) => !value)}
          className="-mx-1 mt-1 min-h-11 rounded-md px-1 text-sm font-semibold text-white underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-white sm:hidden"
        >
          {expanded ? 'Ver menos' : 'Ver más'}
        </button>
      ) : null}
    </div>
  )
}

// Course hero without a promo video: text on the left and the cover as a clear
// 16:9 media card on the right (phones: the card first, full width), over a
// subtle blurred copy of the cover. Without a cover, text only (`textClassName`
// lets the course page keep room for its floating CTA card).
export function CoverHeroLayout({ coverUrl = null, coverAlt = '', top = null, text, aside, containerClassName = 'max-w-7xl', textClassName }) {
  return (
    <section className="relative isolate overflow-hidden bg-zinc-950 text-white">
      <div className="absolute inset-0 -z-10" aria-hidden="true">
        {coverUrl
          ? <img src={coverUrl} alt="" className="h-full w-full scale-110 object-cover opacity-35 blur-2xl" />
          : <div className="h-full w-full bg-linear-to-br from-violet-700 via-purple-700 to-fuchsia-600" />}
        <div className="absolute inset-0 bg-linear-to-t from-black/90 via-black/65 to-black/45" />
      </div>
      <div className={cn('mx-auto w-full px-4 pb-10 pt-4 sm:px-6 lg:px-8 lg:pb-14', containerClassName)}>
        {top}
        {coverUrl ? (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,46%)] lg:gap-x-10 lg:gap-y-5">
            <div className="order-first min-w-0 lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:self-center">
              <div className="overflow-hidden rounded-md border border-white/10 bg-black shadow-2xl">
                <img src={coverUrl} alt={coverAlt} className="aspect-video w-full object-cover" />
              </div>
            </div>
            <div className="min-w-0 space-y-4 lg:col-start-1 lg:row-start-1 lg:self-end">{text}</div>
            <div className="min-w-0 lg:col-start-1 lg:row-start-2 lg:self-start">{aside}</div>
          </div>
        ) : (
          <div className={cn('max-w-3xl space-y-4', textClassName)}>
            {text}
            {aside}
          </div>
        )}
      </div>
    </section>
  )
}
