import { useEffect, useRef } from 'react'
import { ChipTabPanel, ChipTabs } from '@runly/ui'
import { BookOpenText, Megaphone, MessagesSquare } from 'lucide-react'
import { useAnnouncements, useComments } from '../../hooks/useLmsSocial.js'
import { AnnouncementsList } from './AnnouncementsList.jsx'
import { DiscussionPanel } from './DiscussionPanel.jsx'

// Player tabs: Contenido (the lesson, kept mounted so a video keeps its
// position), Preguntas (lesson discussion) and Anuncios (course announcements).
// `tab` lives in the URL (?tab=) so notification links land on the right one.
export function LessonTabs({ courseId, lessonId, tab, onTabChange, announcementCount, readOnly = false, children }) {
  const contentRef = useRef(null)
  const comments = useComments(lessonId)
  const announcements = useAnnouncements(courseId)
  const questionCount = comments.data?.length ?? 0
  const announcementTotal = announcements.data?.length ?? announcementCount ?? 0

  // Leaving the lesson pauses its video instead of letting it play hidden.
  useEffect(() => {
    if (tab === 'contenido') return
    contentRef.current?.querySelectorAll('video, audio').forEach((media) => { try { media.pause() } catch { /* ignore */ } })
  }, [tab])

  const tabs = [
    { value: 'contenido', label: 'Contenido', icon: BookOpenText },
    { value: 'preguntas', label: 'Preguntas', icon: MessagesSquare, badge: questionCount || null },
    { value: 'anuncios', label: 'Anuncios', icon: Megaphone, badge: announcementTotal || null },
  ]

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-5">
      <ChipTabs tabs={tabs} value={tab} onChange={onTabChange} tone="violet" ariaLabel="Secciones de la lección" showDescription={false} />
      <div ref={contentRef} hidden={tab !== 'contenido'}>{children}</div>
      <ChipTabPanel value="preguntas" active={tab === 'preguntas'}>
        <DiscussionPanel lessonId={lessonId} query={comments} readOnly={readOnly} />
      </ChipTabPanel>
      <ChipTabPanel value="anuncios" active={tab === 'anuncios'}>
        <AnnouncementsList query={announcements} />
      </ChipTabPanel>
    </div>
  )
}
