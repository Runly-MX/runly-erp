import { bootstrapDesktopRuntime } from './lib/desktopRuntime.js'
import { initializeNativeHost, native } from './native/index.js'

try {
  await initializeNativeHost()

  const runtimeState = await bootstrapDesktopRuntime().catch(() => ({
    initialServerUrl: null,
    requiresServerSetup: true,
    bootstrapError: 'No se pudo conectar. Verifica la URL e intenta de nuevo.',
  }))

  // Remote hosts recover locally when the web configuration is unavailable.
  if (native.isRemoteHost() && runtimeState.requiresServerSetup) throw new Error('NATIVE_WEB_CONFIGURATION_UNAVAILABLE')

  const { renderApp } = await import('./app/AppEntry.jsx')

  renderApp(runtimeState)
} catch (error) {
  const { renderBootFailure } = await import('./app/BootFailure.jsx')
  renderBootFailure(error)
}
