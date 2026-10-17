import { useState } from 'react'
import { Badge, Button, PersonAvatar } from '@runly/ui'
import { ArrowLeft, BookOpen, Check, Clock, Share2, Star, Users } from 'lucide-react'
import { toast } from 'sonner'
import { LEVEL_LABELS, formatDuration, formatMinutes, formatRating, reviewCountLabel } from '../../lib/lmsLabels.js'
import { learnerCountLabel, lessonCountLabel } from '../../lib/lmsExperience.js'
import { CourseStatusBadge } from '../shared.jsx'
import { PromoHeroLayout } from './PromoHeroLayout.jsx'

// Copies a link (this page by default) to the clipboard.
export function ShareLinkButton({ url = null, className }) {
  const [copied, setCopied] = useState(false)
  async function copy() {
    try {
      await navigator.clipboard.writeText(url || window.location.href)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch { toast.error('No se pudo copiar el enlace.') }
  }
  return (
    <Button variant="outline" size="sm" onClick={copy} className={className ?? 'border-white/30 bg-white/10 text-white hover:bg-white/20 hover:text-white'}>
      {copied ? <Check /> : <Share2 />}{copied ? 'Enlace copiado' : 'Compartir'}
    </Button>
  )
}

export function HeroBadges({ category, level, children }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {category ? <span className="rounded-md border border-violet-300/40 bg-violet-500/20 px-2 py-0.5 text-xs font-semibold uppercase tracking-wide text-violet-100">{category}</span> : null}
      {level ? <span className="rounded-md border border-sky-300/40 bg-sky-500/20 px-2 py-0.5 text-xs font-semibold uppercase tracking-wide text-sky-100">{LEVEL_LABELS[level] ?? level}</span> : null}
      {children}
    </div>
  )
}

function HeroText({ data }) {
  const { course, instructor } = data
  return (
    <>
      <HeroBadges category={course.category} level={course.level}>
        {course.status !== 'published' ? <CourseStatusBadge status={course.status} /> : null}
        {data.enrollment?.status === 'completed' ? <Badge variant="success">Completado</Badge> : null}
      </HeroBadges>
      <h1 className="text-3xl font-bold leading-tight tracking-tight drop-shadow-sm sm:text-4xl">{course.title}</h1>
      {course.summary ? <p className="text-base text-white/85 sm:text-lg">{course.summary}</p> : null}
      {instructor ? (
        <p className="flex items-center gap-2 text-sm text-white/85">
          <PersonAvatar name={instructor.displayName} src={instructor.avatarUrl} size="sm" />
          Creado por <span className="font-semibold text-white">{instructor.displayName}</span>
        </p>
      ) : null}
    </>
  )
}

function HeroStats({ data, onRatingClick, column = false }) {
  const { course, counts, rating } = data
  const duration = counts.totalSeconds ? formatDuration(counts.totalSeconds) : formatMinutes(course.estimatedMinutes)
  const ratingText = formatRating(rating.avg)
  return (
    <ul className={column ? 'flex flex-col gap-2 text-sm text-white/85' : 'flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-white/85'}>
      <li>
        <button
          type="button" onClick={onRatingClick}
          className="-mx-1 inline-flex items-center gap-1.5 rounded-md px-1 py-0.5 font-medium text-amber-300 transition-colors hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-amber-300 motion-reduce:transition-none"
        >
          <Star className="h-4 w-4 fill-current" aria-hidden="true" />
          {ratingText ? <>{ratingText}<span className="font-normal text-white/70">({reviewCountLabel(rating.count)})</span></> : <span className="text-white/80">Sin reseñas</span>}
        </button>
      </li>
      <li className="inline-flex items-center gap-1.5"><BookOpen className="h-4 w-4" aria-hidden="true" />{lessonCountLabel(counts.lessons)}</li>
      {duration ? <li className="inline-flex items-center gap-1.5"><Clock className="h-4 w-4" aria-hidden="true" />{duration}</li> : null}
      <li className="inline-flex items-center gap-1.5"><Users className="h-4 w-4" aria-hidden="true" />{learnerCountLabel(counts.learners)}</li>
    </ul>
  )
}

// Landing hero (racoon-lms CourseDetailView). With a promo video: PromoHeroLayout
// (text + 16:9 player, or theater). Without one: the cover blurred behind a
// dark veil, with title, summary, level, rating, lessons, duration and learners.
export function CourseHero({ data, onBack, backLabel, onRatingClick }) {
  const { course } = data
  const back = (
    <Button variant="ghost" size="sm" onClick={onBack} className="-ml-2 mb-6 text-white/85 hover:bg-white/15 hover:text-white">
      <ArrowLeft />{backLabel}
    </Button>
  )
  if (data.promo) {
    return (
      <PromoHeroLayout
        promo={data.promo} backgroundUrl={course.heroUrl} top={back}
        text={<HeroText data={data} />}
        aside={(
          <div className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-center lg:flex-col lg:items-start">
            <HeroStats data={data} onRatingClick={onRatingClick} />
            <ShareLinkButton />
          </div>
        )}
      />
    )
  }
  return (
    <section className="relative isolate overflow-hidden bg-zinc-950 text-white">
      <div className="absolute inset-0 -z-10" aria-hidden="true">
        {course.heroUrl ? (
          <img src={course.heroUrl} alt="" className="h-full w-full scale-110 object-cover opacity-60 blur-xl" />
        ) : (
          <div className="h-full w-full bg-linear-to-br from-violet-700 via-purple-700 to-fuchsia-600" />
        )}
        <div className="absolute inset-0 bg-linear-to-t from-black/85 via-black/60 to-black/40" />
      </div>
      <div className="mx-auto w-full max-w-7xl px-4 pb-10 pt-4 sm:px-6 lg:px-8 lg:pb-14">
        {back}
        <div className="max-w-3xl space-y-4 lg:pr-[380px] lg:max-w-none xl:pr-[400px]">
          <HeroText data={data} />
          <HeroStats data={data} onRatingClick={onRatingClick} />
        </div>
      </div>
    </section>
  )
}
