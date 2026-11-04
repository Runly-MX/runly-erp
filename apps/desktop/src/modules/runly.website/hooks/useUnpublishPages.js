import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { newIdempotencyKey } from '../lib/websiteApi.js'
import { describeError } from '../lib/websiteErrors.js'
import { useWebsiteScope, websiteKeys } from './useWebsite.js'

// Activates a version identical to the live one minus these pages (deleted ones included); drafts stay as they are.
export function useUnpublishPages(siteId, { onDone } = {}) {
  const queryClient = useQueryClient()
  const { api, companyId } = useWebsiteScope()
  return useMutation({
    mutationFn: async (pageIds) => {
      const fresh = (await api.getSite(siteId)).data
      const created = (await api.prepareRelease(siteId, {
        kind: 'builder', baseReleaseId: fresh.activeReleaseId ?? null,
        expectedDraftRevision: String(fresh.draftRevision), expectedPublicationRevision: String(fresh.publicationRevision),
        changes: { publishPageIds: [], unpublishPageIds: pageIds, includeThemeAndMenus: false },
      }, newIdempotencyKey())).data
      let release = created
      for (let i = 0; release.state === 'preparing' && i < 60; i += 1) {
        await new Promise((resolve) => setTimeout(resolve, 1500))
        release = (await api.getRelease(siteId, created.id)).data
      }
      if (release.state !== 'ready') throw { code: release.failureCode ?? 'preparation_failed' }
      await api.activateRelease(siteId, { releaseId: release.id, manifestHash: release.manifestHash, expectedDraftRevision: String(release.draftRevision), expectedPublicationRevision: String(release.publicationRevision) }, newIdempotencyKey())
      return pageIds.length
    },
    onSuccess: (count) => {
      toast.success(count === 1 ? 'Página retirada del sitio público' : `${count} páginas retiradas del sitio público`)
      queryClient.invalidateQueries({ queryKey: websiteKeys.all(companyId) })
      onDone?.()
    },
    onError: (error) => { toast.error(describeError(error).message); onDone?.() },
  })
}
