import { useState } from 'react'
import { cn } from '@runly/ui'
import { promoAsLesson, readHeroTheater, writeHeroTheater } from '../../lib/lmsShare.js'
import { LessonStage } from '../LessonContent.jsx'

const EASE = 'duration-300 ease-out motion-reduce:transition-none'

// Course page hero with a promo video (racoon-lms). Default: text on the left,
// a 16:9 player card on the right (phones: the player first). Theater (the player's own toggle, video
// only): the player spans the hero, centered; `text` moves below it and
// `aside` (stats, share) sits on its right. The mode is remembered per viewer.
// One grid with a fixed DOM order keeps the player mounted across modes.
// Watching the promo never records progress (preview player).
export function PromoHeroLayout({ promo, backgroundUrl = null, top = null, text, aside, containerClassName = 'max-w-7xl' }) {
  const [theaterPref, setTheaterPref] = useState(() => readHeroTheater())
  const isVideo = promo.kind === 'video'
  const theater = theaterPref && isVideo
  const lesson = promoAsLesson(promo)
  const change = (value) => { setTheaterPref(value); writeHeroTheater(value) }

  return (
    <section className="relative isolate overflow-hidden bg-zinc-950 text-white">
      <div className="absolute inset-0 -z-10" aria-hidden="true">
        {backgroundUrl || promo.poster ? (
          <img src={backgroundUrl || promo.poster} alt="" className="h-full w-full scale-110 object-cover opacity-50 blur-2xl" />
        ) : (
          <div className="h-full w-full bg-linear-to-br from-violet-700 via-purple-700 to-fuchsia-600" />
        )}
        <div className="absolute inset-0 bg-linear-to-t from-black/90 via-black/65 to-black/45" />
      </div>
      <div className={cn('mx-auto w-full px-4 pb-10 pt-4 sm:px-6 lg:px-8 lg:pb-14', containerClassName)}>
        {top}
        <div
          className={cn(
            'grid grid-cols-1 gap-6 transition-[grid-template-columns]', EASE,
            theater ? 'lg:grid-cols-[minmax(0,1fr)_minmax(0,320px)] lg:gap-x-10' : 'lg:grid-cols-[minmax(0,1fr)_minmax(0,46%)] lg:gap-x-10 lg:gap-y-5',
          )}
        >
          <div className={cn('min-w-0', theater ? 'order-first lg:col-span-2 lg:row-start-1' : 'order-first lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:self-center')}>
            <div className={cn('mx-auto w-full transition-[max-width]', EASE, theater ? 'max-w-[min(100%,calc((100dvh-14rem)*16/9))]' : 'max-w-full')}>
              <div className="overflow-hidden rounded-md border border-white/10 bg-black shadow-2xl">
                <LessonStage
                  payload={{ lesson, progress: { positionSeconds: 0 } }} preview
                  theater={theater} onTheaterChange={isVideo ? change : undefined}
                />
              </div>
            </div>
          </div>
          <div className={cn('order-1 min-w-0 space-y-4', theater ? 'lg:col-start-1 lg:row-start-2' : 'lg:col-start-1 lg:row-start-1 lg:self-end')}>{text}</div>
          <div className={cn('order-3 min-w-0', theater ? 'lg:col-start-2 lg:row-start-2' : 'lg:col-start-1 lg:row-start-2 lg:self-start')}>{aside}</div>
        </div>
      </div>
    </section>
  )
}
