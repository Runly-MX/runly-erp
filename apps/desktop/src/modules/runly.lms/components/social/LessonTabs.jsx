import { ChipTabPanel, ChipTabs } from '@runly/ui'
import { BookText, FolderOpen, Megaphone, MessagesSquare } from 'lucide-react'
import { useAnnouncements, useComments } from '../../hooks/useLmsSocial.js'
import { LessonResourcesList } from '../LessonResourcesList.jsx'
import { AnnouncementsList } from './AnnouncementsList.jsx'
import { DiscussionPanel } from './DiscussionPanel.jsx'

// Tabs under the lesson: Descripción (notes, or the lesson itself for text,
// documents, quizzes and assignments — kept mounted so a quiz keeps its state),
// Recursos (downloadable files), Preguntas (discussion) and Anuncios.
// `tab` lives in the URL (?tab=) so notification links land on the right one.
export function LessonTabs({ courseId, lessonId, tab, onTabChange, resources, announcementCount, readOnly = false, children }) {
  const comments = useComments(lessonId)
  const announcements = useAnnouncements(courseId)
  const questionCount = comments.data?.length ?? 0
  const announcementTotal = announcements.data?.length ?? announcementCount ?? 0
  const resourceCount = resources?.length ?? 0

  const tabs = [
    { value: 'descripcion', label: 'Descripción', icon: BookText },
    { value: 'recursos', label: 'Recursos', icon: FolderOpen, badge: resourceCount || null },
    { value: 'preguntas', label: 'Preguntas', icon: MessagesSquare, badge: questionCount || null },
    { value: 'anuncios', label: 'Anuncios', icon: Megaphone, badge: announcementTotal || null },
  ]

  return (
    <div className="flex w-full flex-col gap-5">
      <ChipTabs tabs={tabs} value={tab} onChange={onTabChange} tone="violet" ariaLabel="Secciones de la lección" showDescription={false} />
      <div hidden={tab !== 'descripcion'}>{children}</div>
      <ChipTabPanel value="recursos" active={tab === 'recursos'}>
        <LessonResourcesList resources={resources} />
      </ChipTabPanel>
      <ChipTabPanel value="preguntas" active={tab === 'preguntas'}>
        <DiscussionPanel lessonId={lessonId} query={comments} readOnly={readOnly} />
      </ChipTabPanel>
      <ChipTabPanel value="anuncios" active={tab === 'anuncios'}>
        <AnnouncementsList query={announcements} />
      </ChipTabPanel>
    </div>
  )
}
