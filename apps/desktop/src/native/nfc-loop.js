// Keeps the Android host's NFC reader armed and re-emits every tag as a
// `runly:nfc-card` window event ({ uid }, uppercase hex) for kiosk-style
// screens. The native read is one-shot with a 30 s timeout, so this loops.
import { native } from './index.js'

export const NFC_CARD_EVENT = 'runly:nfc-card'

export function startNativeNfcLoop({ onError = () => {} } = {}) {
  let stopped = false
  const run = async () => {
    while (!stopped) {
      try {
        const tag = await native.device.nfcRead()
        if (stopped) break
        if (tag?.id) globalThis.dispatchEvent(new CustomEvent(NFC_CARD_EVENT, { detail: { uid: String(tag.id).toUpperCase() } }))
      } catch (error) {
        const reason = String(error?.message ?? error)
        if (stopped || reason.includes('NFC_CANCELLED')) break
        if (!reason.includes('NFC_TIMEOUT')) {
          onError(reason)
          await new Promise((resolve) => setTimeout(resolve, 5000))
        }
      }
    }
  }
  if (native.isMobile()) run()
  return () => { stopped = true; native.device.nfcStop().catch(() => {}) }
}
