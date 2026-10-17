import { useEffect, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { companyFetch } from '../../../lib/companyFetch.js'
import { runly } from '../../../lib/runly.js'
import { getApiUrl } from '../../../lib/runtimeConfig.js'
import { certErrorMessage, certificateFileName, toAbsoluteUrl, toBlob } from '../lib/lmsCert.js'
import { KEY, unwrap, useRead, useToken } from './useLmsData.js'

// Saves a Blob as a file and frees its object URL right after the click.
export function saveBlob(blob, fileName) {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = fileName
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

// GET an API path (or absolute API URL) with the session token, as a Blob.
async function fetchAuthorizedBlob(pathOrUrl, token) {
  const url = toAbsoluteUrl(unwrap(pathOrUrl), getApiUrl())
  return toBlob(await companyFetch(url, { headers: token ? { Authorization: `Bearer ${token}` } : {} }))
}

// Mutation that refreshes the given lms query families.
function useCertAction(fn, families, successMessage) {
  const token = useToken(), client = useQueryClient()
  return useMutation({
    mutationFn: async (vars) => unwrap(await fn(token, vars)),
    onSuccess: () => {
      families.forEach((family) => client.invalidateQueries({ queryKey: [KEY, family] }))
      if (successMessage) toast.success(successMessage)
    },
    onError: (error) => toast.error(certErrorMessage(error)),
  })
}

// ---- Templates (lms.course.manage) -----------------------------------------------
export const useCertificateTemplates = (options = {}) => useRead(
  ['cert-templates'], (t) => runly.lms.listCertificateTemplates(t), { staleTime: 30_000, retry: false, ...options },
)
export const useSaveCertificateTemplate = () => useCertAction(
  (t, { id, ...data }) => (id ? runly.lms.updateCertificateTemplate(id, data, t) : runly.lms.createCertificateTemplate(data, t)),
  ['cert-templates'], 'Plantilla guardada.',
)
export const useDisableCertificateTemplate = () => useCertAction(
  (t, id) => runly.lms.disableCertificateTemplate(id, t), ['cert-templates'], 'Plantilla desactivada.',
)
export const useEnableCertificateTemplate = () => useCertAction(
  (t, id) => runly.lms.updateCertificateTemplate(id, { enabled: true }, t), ['cert-templates'], 'Plantilla activada.',
)

// Live PDF preview of a saved template. `version` (e.g. updatedAt) re-renders it,
// debounced 1 s; the previous object URL is revoked on every change and unmount.
export function useTemplatePreview(templateId, version) {
  const token = useToken()
  const [state, setState] = useState({ url: null, loading: false, error: null })
  useEffect(() => {
    if (!templateId || !token) { setState({ url: null, loading: false, error: null }); return undefined }
    let cancelled = false, created = null
    setState((old) => ({ ...old, loading: true, error: null }))
    const timer = setTimeout(async () => {
      try {
        const blob = await fetchAuthorizedBlob(runly.lms.certificateTemplatePreviewUrl(templateId), token)
        if (cancelled) return
        created = URL.createObjectURL(blob)
        setState({ url: created, loading: false, error: null })
      } catch (error) {
        if (!cancelled) setState({ url: null, loading: false, error })
      }
    }, 1000)
    return () => {
      cancelled = true
      clearTimeout(timer)
      if (created) URL.revokeObjectURL(created)
    }
  }, [templateId, version, token])
  return state
}

// ---- Issued certificates (lms.enrollment.manage) ---------------------------------
export const useIssueCertificate = () => useCertAction((t, enrollmentId) => runly.lms.issueCertificate(enrollmentId, t), ['enrollments', 'my'], 'Certificado emitido.')
export const useRevokeCertificate = () => useCertAction(
  (t, { id, reason }) => runly.lms.revokeCertificate(id, reason, t), ['enrollments', 'my'], 'Certificado revocado.',
)

// ---- Learner ----------------------------------------------------------------------
// Under the "my" family so every progress save that refreshes "Mis cursos" also
// picks up an automatically issued certificate.
export const useMyCertificates = (options = {}) => useRead(['my', 'certificates'], (t) => runly.lms.listMyCertificates(t), { staleTime: 15_000, ...options })

// Downloads a certificate PDF. `own` uses the learner endpoint.
export function useDownloadCertificate({ own = false } = {}) {
  const token = useToken()
  return useMutation({
    mutationFn: async (certificate) => {
      const result = own ? await runly.lms.downloadMyCertificate(certificate.id, token) : await runly.lms.downloadCertificate(certificate.id, token)
      saveBlob(await toBlob(result), certificateFileName(certificate))
    },
    onError: (error) => toast.error(certErrorMessage(error, 'No se pudo descargar el certificado.')),
  })
}
