// Uploaded certificate templates (Word, PowerPoint, PDF): list info (Office
// availability), upload, replace, suggested tags and file downloads.
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { runly } from '../../../lib/runly.js'
import { certErrorMessage, docxSuggestionFile, isFileTemplate, toBlob } from '../lib/lmsCert.js'
import { saveBlob } from './useLmsCerts.js'
import { KEY, unwrap, useRead, useToken } from './useLmsData.js'

// { templates, officeAvailable, placeholders } in one request.
export const useCertificateTemplatesInfo = () => useRead(['cert-templates', 'info'], async (t) => {
  const res = await runly.lms.listCertificateTemplates(t)
  return { templates: res?.data ?? [], officeAvailable: Boolean(res?.officeAvailable), placeholders: res?.placeholders ?? null }
}, { staleTime: 30_000, retry: false })

function useTemplateFileMutation(fn) {
  const token = useToken(), client = useQueryClient()
  return useMutation({
    mutationFn: async (vars) => unwrap(await fn(token, vars)),
    onSuccess: () => client.invalidateQueries({ queryKey: [KEY, 'cert-templates'] }),
    onError: (error) => toast.error(certErrorMessage(error, 'No se pudo guardar la plantilla.')),
  })
}

// .docx, .pptx or .pdf (the API reads the format from the file name).
// autoTag false skips the automatic tags / field detection; the saved
// template comes back with autoTag / autoLayout (what was recognized).
export const useUploadCertificateTemplate = () => useTemplateFileMutation((t, { file, name, autoTag = true }) => {
  const form = new FormData()
  form.append('file', file)
  if (name) form.append('name', name)
  if (!autoTag) form.append('autoTag', 'false')
  return runly.lms.uploadCertificateTemplateFile(form, t)
})

export const useReplaceCertificateTemplateFile = () => useTemplateFileMutation((t, { id, file }) => {
  const form = new FormData()
  form.append('file', file)
  return runly.lms.replaceCertificateTemplateFile(id, form, t)
})

export function useSuggestCertificateTags() {
  const token = useToken()
  return useMutation({ mutationFn: async (id) => unwrap(await runly.lms.suggestCertificateTemplateTags(id, token)) })
}

// Saves a suggestion result ({ fileName, contentBase64 }) as a .docx.
export const saveSuggestion = (result) => {
  const file = docxSuggestionFile(result)
  saveBlob(file, file.name)
}

// Downloads the template's file, or the built-in example (format docx | pptx) when no id is given.
export function useDownloadCertificateDocx() {
  const token = useToken()
  return useMutation({
    mutationFn: async ({ id, name, format = 'docx' } = {}) => {
      if (!id) {
        const ext = format === 'pptx' ? 'pptx' : 'docx'
        saveBlob(await toBlob(await runly.lms.downloadCertificateTemplateSample(token, ext)), `plantilla-certificado-ejemplo.${ext}`)
        return
      }
      const res = unwrap(await runly.lms.getCertificateTemplateFileUrl(id, token))
      if (!res?.url) throw new Error('El archivo de la plantilla no está disponible.')
      const download = await fetch(res.url)
      if (!download.ok) throw new Error('No se pudo descargar la plantilla.')
      saveBlob(await download.blob(), res.fileName ?? `${name ?? 'plantilla'}.${format}`)
    },
    onError: (error) => toast.error(certErrorMessage(error, 'No se pudo descargar la plantilla.')),
  })
}

// Viewer input (lib/lmsFiles) for an uploaded template's file: the signed URL
// is fetched on open; Word/PowerPoint files also open in Office.
export function templateFileInput(template, token) {
  if (!template?.id || !isFileTemplate(template)) return null
  return {
    key: `template-${template.id}-${template.fileAssetId ?? ''}`,
    name: `${template.name || 'plantilla'}.${template.source}`,
    officeFileId: template.source === 'pdf' ? null : template.fileAssetId ?? null,
    resolveUrl: async () => unwrap(await runly.lms.getCertificateTemplateFileUrl(template.id, token))?.url ?? null,
  }
}
