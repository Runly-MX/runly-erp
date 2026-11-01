// apps/desktop/src/modules/runly.pos/retail/hooks/useReceiptPrinting.js
import { useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { runly } from '../../../../lib/runly.js'
import { useBluetoothPrinting } from '../../../runly.inventory/hooks/useBluetoothPrinting.js'
import { classifyPosError, createAttemptTracker } from '../lib/retailErrors.js'

// Hands the browser payload to the print dialog in a sandboxed frame.
// Returns true when the dialog was invoked; that is all the browser can tell.
function printHtml(html) {
  return new Promise((resolve) => {
    const frame = document.createElement('iframe')
    frame.setAttribute('sandbox', 'allow-modals allow-same-origin')
    frame.setAttribute('aria-hidden', 'true')
    frame.style.cssText = 'position:fixed;width:0;height:0;border:0;opacity:0;pointer-events:none'
    frame.srcdoc = html
    frame.onload = () => {
      try {
        frame.contentWindow.focus()
        frame.contentWindow.print()
        resolve(true)
      } catch {
        resolve(false)
      } finally {
        setTimeout(() => frame.remove(), 1000)
      }
    }
    document.body.appendChild(frame)
  })
}

// C7 print attempt: create the job (QUEUED), hand it to a transport, then
// report SUBMITTED or FAILED. SUBMITTED means "handed to the transport";
// there is no physical confirmation, so the UI never says "impreso".
export function useReceiptPrinting({ receiptId, token }) {
  const queryClient = useQueryClient()
  const bluetooth = useBluetoothPrinting()
  const [state, setState] = useState({ phase: 'idle', message: null })
  const jobTracker = useRef(createAttemptTracker('pos-print'))
  const resultTracker = useRef(createAttemptTracker('pos-print-result'))

  async function report(jobId, body) {
    const key = resultTracker.current.keyFor({ jobId, ...body })
    const dto = (await runly.commerce.finishPrintJob(jobId, body, token, { idempotencyKey: key })).data
    resultTracker.current.reset()
    return dto
  }

  async function print(transport, address) {
    setState({ phase: 'working', message: 'Preparando el comprobante...' })
    try {
      const body = { transport }
      const job = (await runly.commerce.createPrintJob(receiptId, body, token, { idempotencyKey: jobTracker.current.keyFor({ receiptId, ...body }) })).data
      jobTracker.current.reset()
      let sent
      if (transport === 'BROWSER') {
        const ok = await printHtml(job.payload.html)
        sent = ok ? { ok: true } : { ok: false, code: 'BROWSER_PRINT_UNAVAILABLE' }
      } else {
        sent = await bluetooth.print(address, runly.commerce.printDataBytes(job.payload))
      }
      const result = await report(job.jobId, sent.ok ? { status: 'SUBMITTED' } : { status: 'FAILED', errorCode: String(sent.code ?? 'UNKNOWN').replace(/[^A-Za-z0-9_.:-]/g, '_').slice(0, 120) })
      setState(result.status === 'SUBMITTED'
        ? { phase: 'submitted', message: transport === 'BROWSER' ? 'Enviado al diálogo de impresión. Revisa que haya salido el papel.' : 'Enviado a la impresora Bluetooth. Revisa que haya salido el papel.' }
        : { phase: 'failed', message: 'No se pudo imprimir. La venta sigue registrada; puedes reintentar o mostrar el comprobante en pantalla.' })
    } catch (error) {
      const info = classifyPosError(error)
      setState({ phase: 'failed', message: info.kind === 'lost' ? 'No recibimos la confirmación de la impresión. Vuelve a intentarlo; no se duplica la venta.' : info.message })
    } finally {
      queryClient.invalidateQueries({ queryKey: ['pos-retail-receipt', receiptId] })
    }
  }

  return { state, print, bluetooth }
}
