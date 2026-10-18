// Pure helpers that turn the LMS file shapes (submission files, lesson
// resources, pending uploads, lesson documents, certificate templates) into
// items for the shared AdvancedFileViewer. Callers pass a common shape:
//   { key, name, mimeType?, sizeBytes?, url?, resolveUrl?, officeFileId? }
// `url` is a ready (signed or blob:) URL; `resolveUrl` fetches one on open;
// `officeFileId` is the FileAsset id Office may open (null: no Office).
import { fileKindOf } from '@runly/core/browser'

const EXT_MIME = {
  pdf: 'application/pdf', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp',
  mp4: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime', mp3: 'audio/mpeg', wav: 'audio/wav', m4a: 'audio/mp4', ogg: 'audio/ogg',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  txt: 'text/plain', csv: 'text/csv', zip: 'application/zip',
}

// Best mime type for a file: the stored one, else guessed from the extension
// (lesson documents and template downloads carry only a name).
export function guessMimeType(name, mimeType) {
  if (mimeType && mimeType !== 'application/octet-stream') return mimeType
  const ext = String(name ?? '').toLowerCase().split('.').pop()
  return EXT_MIME[ext] ?? mimeType ?? ''
}

export function viewerItem(input) {
  if (!input?.key) return null
  const originalName = String(input.name ?? '').trim() || 'Archivo'
  const mimeType = guessMimeType(originalName, input.mimeType)
  const kind = fileKindOf({ originalName, mimeType })
  const url = input.url || null
  return {
    id: String(input.key), originalName, mimeType,
    sizeBytes: Number(input.sizeBytes) || 0,
    thumbnailUrl: kind === 'image' && url ? url : null,
    url, resolveUrl: typeof input.resolveUrl === 'function' ? input.resolveUrl : null,
    officeFileId: input.officeFileId ?? null,
  }
}

// True when the item can be opened at all (it has, or can fetch, a URL).
export const isOpenable = (input) => Boolean(input?.key && (input.url || typeof input.resolveUrl === 'function'))

// Common shapes -------------------------------------------------------------
// Submission file { id, name, mimeType, sizeBytes, url }: Office opens it read-only.
export const submissionFileInput = (file) => ({ key: file?.id, name: file?.name, mimeType: file?.mimeType, sizeBytes: file?.sizeBytes, url: file?.url, officeFileId: file?.id ?? null })

// File attached to a draft submission { fileId, fileName, mimeType, sizeBytes,
// localUrl }: previewed from the browser's local copy (blob: URL), no Office yet.
export const pendingFileInput = (file) => ({ key: file?.fileId, name: file?.fileName, mimeType: file?.mimeType, sizeBytes: file?.sizeBytes, url: file?.localUrl })

// Lesson document { id, fileName, mediaUrl } (kind 'file').
export const lessonFileInput = (lesson) => ({ key: lesson?.fileId ?? lesson?.id, name: lesson?.fileName || 'Documento', url: lesson?.mediaUrl })

// Lesson resource { id, title, fileName, mimeType, sizeBytes, url }. Resources
// are generic company files, so Office (LMS-scoped) does not open them.
export const resourceInput = (resource) => ({ key: resource?.id, name: resource?.fileName || resource?.title, mimeType: resource?.mimeType, sizeBytes: resource?.sizeBytes, url: resource?.url })
