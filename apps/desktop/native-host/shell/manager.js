export const invoke = (command, args) => globalThis.window.__TAURI_INTERNALS__.invoke(command, args)

export function connectionError(error) {
  const code = String(error)
  if (code.includes('INVALID_ORIGIN')) return 'Ingresa una URL HTTPS sin rutas ni credenciales, por ejemplo https://runly.example.com.'
  if (code.includes('MISSING_NATIVE_FRAME_POLICY')) return 'La instancia necesita habilitar la protección para la app Android. Contacta al administrador.'
  if (code.includes('INSTANCE_LIMIT')) return 'Puedes guardar hasta 20 instancias. Olvida alguna antes de agregar otra.'
  if (code.includes('NETWORK')) return 'No se pudo conectar. Revisa la URL, la conexión y el certificado del servidor.'
  if (code.includes('HTTP_')) return 'El servidor no devolvió la aplicación Runly. Revisa la URL o contacta al administrador.'
  return 'No se pudo completar la operación. Intenta de nuevo.'
}

export function createInstanceManager(call = invoke) {
  let snapshot = { phase: 'loading', busy: false, registry: { instances: [], activeOrigin: null }, info: null, pending: null, error: '', diagnostic: '' }
  const listeners = new Set()
  const update = (values) => { snapshot = { ...snapshot, ...values }; listeners.forEach((listener) => listener()) }
  const refresh = async () => update({ registry: await call('host_servers') })
  async function perform(operation) {
    if (snapshot.busy) return
    update({ busy: true, error: '', diagnostic: '' })
    try { await operation() }
    catch (error) { update({ phase: 'manager', error: connectionError(error), diagnostic: String(error) }) }
    finally { update({ busy: false }) }
  }
  const manager = {
    getSnapshot: () => snapshot,
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener) },
    async initialize(hash) {
      await perform(async () => {
        update({ info: await call('host_info') })
        await refresh()
        update({ phase: 'manager' })
        if (hash === '#failed') { update({ error: 'No se pudo abrir la instancia. Puedes reintentar o elegir otra.' }); return }
        if (!hash && snapshot.registry.activeOrigin) await connect(null)
      })
    },
    connect(origin, name) { return perform(() => connect(origin, name)) },
    confirm() { return perform(async () => { await call('host_confirm_origin'); update({ phase: 'connecting', pending: null }) }) },
    cancel() { return perform(async () => { await call('host_cancel_origin'); update({ phase: 'manager', pending: null }) }) },
    remove(origin) { return perform(async () => { await call('host_remove_server', { origin }); await refresh(); update({ phase: 'manager' }) }) },
    reset() { return perform(async () => { await call('host_forget_origin'); await refresh(); update({ phase: 'manager', pending: null }) }) },
  }
  async function connect(origin, name) {
    update({ phase: 'connecting', pending: null })
    const result = await call('host_connect', { origin, name: name || null })
    if (result?.status === 'pending_confirmation') update({ phase: 'confirm', pending: result.origin })
  }
  return manager
}
