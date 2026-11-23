// Host adapter for Atlas synced components (`syncedComponents` editor prop): one definition per site, shared by its pages.
// The server owns revisions: every save carries the site draft revision it was based on, so two editors cannot overwrite
// each other, and a definition still used by a page draft cannot be deleted (409 component_in_use).

const CONFLICT = 'El sitio cambió mientras editabas. Recarga el editor y vuelve a intentarlo.'

/**
 * @param {{ load: () => Promise<{ components: object, draftRevision: number }>, put: (body: object) => Promise<{ components: object, draftRevision: number }> }} transport
 * @param {(state: { definitions: object, revision: number }) => void} [onChange] notified after every successful load/save
 */
export function createSyncedComponents(transport, onChange = () => {}) {
  const state = { definitions: {}, revision: 0 }
  const adapter = {
    get definitions() { return state.definitions },
    get revision() { return state.revision },
    async refresh() {
      const loaded = await transport.load()
      state.definitions = loaded.components ?? {}
      state.revision = loaded.draftRevision ?? 0
      onChange({ definitions: state.definitions, revision: state.revision })
      return adapter
    },
    async save(next) {
      try {
        const saved = await transport.put({ components: next, expectedRevision: state.revision })
        state.definitions = saved.components ?? next
        state.revision = saved.draftRevision ?? state.revision + 1
        onChange({ definitions: state.definitions, revision: state.revision })
      } catch (error) {
        if (error?.code === 'revision_conflict' || error?.status === 409 && error?.code !== 'component_in_use') throw new Error(CONFLICT)
        if (error?.code === 'component_in_use') throw new Error('Ese componente sigue en uso en algunas páginas. Desvincúlalo allí antes de eliminarlo.')
        throw error
      }
    },
  }
  return adapter
}

/** Maps the Hono envelope `{ data }` of the components endpoints to the transport shape. */
export function websiteComponentsTransport({ apiFetch, token, siteId }) {
  const path = `/website/sites/${siteId}/components`
  return {
    load: async () => (await apiFetch(path, token)).data,
    put: async (body) => (await apiFetch(path, token, { method: 'PUT', headers: { 'Idempotency-Key': crypto.randomUUID() }, body: JSON.stringify(body) })).data,
  }
}

/** Atlas exports `ComponentRefBlock` from 0.9.3; before that the editor simply has no synced components. */
export const componentBlocksFrom = (atlas) => (atlas?.ComponentRefBlock ? [atlas.ComponentRefBlock] : [])
