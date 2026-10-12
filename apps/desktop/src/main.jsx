import { bootstrapDesktopRuntime } from './lib/desktopRuntime.js'
import { initializeNativeHost, native } from './native/index.js'

await initializeNativeHost()

const runtimeState = await bootstrapDesktopRuntime().catch(() => ({
  initialServerUrl: null,
  requiresServerSetup: true,
  bootstrapError: 'No se pudo conectar. Verifica la URL e intenta de nuevo.',
}))

// Mobile has no server picker. The native watchdog restores the bundled recovery page.
if (native.isRemoteHost() && runtimeState.requiresServerSetup) throw new Error('NATIVE_WEB_CONFIGURATION_UNAVAILABLE')

const { renderApp } = await import('./app/AppEntry.jsx')

renderApp(runtimeState)
