import { useState } from 'react'
import { Button } from '@runly/ui'
import { BookOpen, Building2, Clock, Loader2, LogIn } from 'lucide-react'
import { toast } from 'sonner'
import { HeroBadges, ShareLinkButton } from '../components/course-page/CourseHero.jsx'
import { CoverHeroLayout, HeroSummary } from '../components/course-page/CoverHeroLayout.jsx'
import { PromoHeroLayout } from '../components/course-page/PromoHeroLayout.jsx'
import { useJoinSharedCourse } from '../hooks/useLmsShare.js'
import { lessonCountLabel } from '../lib/lmsExperience.js'
import { formatMinutes } from '../lib/lmsLabels.js'
import { validateIntakeForm } from '../lib/lmsIntake.js'
import { GuestIntakeFields } from './GuestIntakeFields.jsx'
import { SharedCourseInviteForm } from './SharedCourseInviteForm.jsx'
import { JOIN_FORM_CLASS, PUBLIC_PAGE_CLASS, keepFieldVisible } from './keyboardSafeFocus.js'

const MUTED = 'text-[hsl(var(--muted-foreground))]'

function Company({ company }) {
  return (
    <p className="flex items-center gap-2 text-sm text-white/85">
      {company?.logoUrl
        ? <img src={company.logoUrl} alt="" className="h-7 w-7 rounded-md bg-white object-contain p-0.5" />
        : <Building2 className="h-4 w-4" aria-hidden="true" />}
      <span className="font-medium">{company?.name || 'Curso compartido'}</span>
    </p>
  )
}

function Stats({ course }) {
  const minutes = formatMinutes(course.estimatedMinutes)
  return (
    <ul className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-white/85">
      <li className="inline-flex items-center gap-1.5"><BookOpen className="h-4 w-4" aria-hidden="true" />{lessonCountLabel(course.lessonCount)}</li>
      {minutes ? <li className="inline-flex items-center gap-1.5"><Clock className="h-4 w-4" aria-hidden="true" />{minutes}</li> : null}
    </ul>
  )
}

function Text({ data }) {
  return (
    <>
      <Company company={data.company} />
      <HeroBadges level={data.course.level} />
      <h1 className="text-3xl font-bold leading-tight tracking-tight drop-shadow-sm sm:text-4xl">{data.course.title}</h1>
      <HeroSummary text={data.course.summary} />
    </>
  )
}

// Stats and share: a row on phones and tablets, a column next to the media card on desktop.
function HeroAside({ course }) {
  return <div className="flex flex-wrap items-center gap-x-5 gap-y-3 lg:flex-col lg:items-start"><Stats course={course} /><ShareLinkButton /></div>
}

// Hero: text on the left and a 16:9 media card on the right (phones: the card
// first). The card is the promo video when the link shares it, else the cover.
function Hero({ data }) {
  const props = { text: <Text data={data} />, aside: <HeroAside course={data.course} />, containerClassName: 'max-w-5xl pt-6 lg:pt-12' }
  return data.promo
    ? <PromoHeroLayout promo={data.promo} backgroundUrl={data.course.coverUrl} {...props} />
    : <CoverHeroLayout coverUrl={data.course.coverUrl} coverAlt={`Portada del curso ${data.course.title}`} {...props} />
}

// Open link: name plus the course intake fields.
function OpenJoinForm({ shareToken, fields, disabled, onJoined }) {
  const join = useJoinSharedCourse(shareToken)
  const [values, setValues] = useState({ name: '', answers: {} })
  const [errors, setErrors] = useState({})

  async function submit(event) {
    event.preventDefault()
    const result = validateIntakeForm(values, fields)
    setErrors(result.errors)
    if (Object.keys(result.errors).length) return
    try {
      const joined = await join.mutateAsync({ data: result.values })
      onJoined(joined.guestToken)
    } catch (error) {
      toast.error(error?.status === 429 ? 'Demasiados intentos. Espera un momento.' : error.message || 'No se pudo entrar al curso.')
    }
  }

  return (
    <form onSubmit={submit} onFocus={keepFieldVisible} className={JOIN_FORM_CLASS} noValidate>
      <div>
        <h2 className="text-base font-semibold">Entrar al curso</h2>
        <p className={`text-sm ${MUTED}`}>No necesitas cuenta. Tu avance se guarda en este navegador.</p>
      </div>
      <GuestIntakeFields fields={fields} values={values} errors={errors} onChange={setValues} disabled={join.isPending} />
      <Button type="submit" className="w-full max-sm:h-11" disabled={join.isPending || disabled}>
        {join.isPending ? <Loader2 className="animate-spin motion-reduce:animate-none" /> : <LogIn />}Entrar
      </Button>
    </form>
  )
}

// Join screen of a shared course: hero (promo video or cover), shared outline
// and the entry form (open: name + intake fields; invite-only: access code).
// `linkToken` is the personal invite link (?i=). `onJoined(guestToken)` stores the token.
export function SharedCourseJoin({ shareToken, data, linkToken = null, onJoined }) {
  const lessons = (data?.sections ?? []).flatMap((section) => section.lessons ?? [])
  const fields = data?.settings?.intakeFields ?? []
  const invite = data?.settings?.accessMode === 'invite'
  if (!data?.course) return null
  return (
    <div className={PUBLIC_PAGE_CLASS}>
      <Hero data={data} />
      <main className="mx-auto grid w-full max-w-5xl gap-8 px-4 pt-6 pb-[max(2rem,env(safe-area-inset-bottom))] sm:px-6 sm:pt-8 lg:grid-cols-[minmax(0,1fr)_340px]">
        <section className="min-w-0 space-y-3">
          <h2 className="text-lg font-semibold tracking-tight">Contenido compartido</h2>
          {data.sections.map((section) => (
            <div key={section.id} className="rounded-md border border-[hsl(var(--border))]">
              <p className="bg-[hsl(var(--muted)/0.5)] px-4 py-2.5 text-sm font-semibold">{section.title}</p>
              <ul className="divide-y divide-[hsl(var(--border)/0.6)]">
                {section.lessons.map((lesson, index) => (
                  <li key={`${section.id}-${index}`} className="flex items-center gap-3 px-4 py-2 text-sm">
                    <span className="min-w-0 flex-1 truncate">{lesson.title}</span>
                    {lesson.durationSeconds ? <span className={`shrink-0 text-xs tabular-nums ${MUTED}`}>{Math.max(1, Math.round(lesson.durationSeconds / 60))} min</span> : null}
                  </li>
                ))}
              </ul>
            </div>
          ))}
          {!lessons.length ? <p className={`text-sm ${MUTED}`}>Este enlace todavía no comparte lecciones.</p> : null}
        </section>
        {/* Phones: the entry form right after the hero, before the outline. */}
        <aside className="max-lg:order-first">
          <div className="rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-4 lg:sticky lg:top-6">
            {invite
              ? <SharedCourseInviteForm shareToken={shareToken} linkToken={linkToken} fields={fields} disabled={!lessons.length} onJoined={onJoined} />
              : <OpenJoinForm shareToken={shareToken} fields={fields} disabled={!lessons.length} onJoined={onJoined} />}
          </div>
        </aside>
      </main>
    </div>
  )
}
