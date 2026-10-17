import { runly } from '../../../lib/runly.js'
import { SUBMISSION_MAX_MB } from './lmsEval.js'

const unwrap = (response) => response?.data ?? response

// presign -> direct PUT to Storage -> confirm. `presign(data, token)` and
// `confirm(fileId, token)` are the SDK pair of the endpoint family (lesson
// media or learner submissions). `onStage` receives 'uploading' | 'confirming'.
export async function directUpload(file, token, { presign, confirm, onStage, failMessage = 'No se pudo subir el archivo.' }) {
  const mimeType = file.type || 'application/octet-stream'
  const { fileId, uploadUrl } = unwrap(await presign({ fileName: file.name, mimeType, sizeBytes: file.size }, token))

  onStage?.('uploading')
  // Same request chat uses for its signed uploads (ArrayBuffer body: exact
  // Content-Length and no multi-part Blob issues on iOS Safari).
  const response = await fetch(uploadUrl, { method: 'PUT', headers: { 'Content-Type': mimeType }, body: await file.arrayBuffer() })
  if (!response.ok) throw new Error(failMessage)

  onStage?.('confirming')
  const confirmed = unwrap(await confirm(fileId, token))
  return { fileId: confirmed?.fileId ?? fileId, fileName: confirmed?.fileName ?? file.name }
}

// Learner assignment files (learners have no files.assets.create permission).
export async function uploadSubmissionFile(file, token, options = {}) {
  if (!file) throw new Error('Selecciona un archivo.')
  if (file.size > SUBMISSION_MAX_MB * 1024 * 1024) throw new Error(`«${file.name}» supera ${SUBMISSION_MAX_MB} MB.`)
  const result = await directUpload(file, token, {
    presign: (data, t) => runly.lms.presignUpload(data, t),
    confirm: (fileId, t) => runly.lms.confirmUpload(fileId, t),
    failMessage: `No se pudo subir «${file.name}».`,
    ...options,
  })
  return { ...result, mimeType: file.type, sizeBytes: file.size }
}
