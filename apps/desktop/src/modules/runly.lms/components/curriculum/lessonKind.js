import { ClipboardList, FileText, Link2, ListChecks, Video } from 'lucide-react'
import { KIND_LABELS, formatDuration } from '../../lib/lmsLabels.js'

export const KIND_ICONS = { video: Video, embed: Link2, text: FileText, file: FileText, quiz: ListChecks, assignment: ClipboardList }

export const lessonIcon = (kind) => KIND_ICONS[kind] ?? FileText

export const lessonMeta = (lesson) => [KIND_LABELS[lesson.kind], formatDuration(lesson.durationSeconds)].filter(Boolean).join(' · ')
