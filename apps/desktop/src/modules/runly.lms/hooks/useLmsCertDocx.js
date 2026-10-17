// Word (.docx) certificate templates: list info (Office availability), upload,
// replace, suggested tags and file downloads.
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { runly } from '../../../lib/runly.js'
import { certErrorMessage, docxSuggestionFile, toBlob } from '../lib/lmsCert.js'
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

export const useUploadCertificateDocx = () => useTemplateFileMutation((t, { file, name }) => {
  const form = new FormData()
  form.append('file', file)
  if (name) form.append('name', name)
  return runly.lms.uploadCertificateDocxTemplate(form, t)
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

// Downloads the template's .docx, or the built-in example when no id is given.
export function useDownloadCertificateDocx() {
  const token = useToken()
  return useMutation({
    mutationFn: async ({ id, name } = {}) => {
      if (!id) {
        saveBlob(await toBlob(await runly.lms.downloadCertificateTemplateSample(token)), 'plantilla-certificado-ejemplo.docx')
        return
      }
      const res = unwrap(await runly.lms.getCertificateTemplateFileUrl(id, token))
      if (!res?.url) throw new Error('El archivo de la plantilla no está disponible.')
      const download = await fetch(res.url)
      if (!download.ok) throw new Error('No se pudo descargar la plantilla.')
      saveBlob(await download.blob(), res.fileName ?? `${name ?? 'plantilla'}.docx`)
    },
    onError: (error) => toast.error(certErrorMessage(error, 'No se pudo descargar la plantilla.')),
  })
}
