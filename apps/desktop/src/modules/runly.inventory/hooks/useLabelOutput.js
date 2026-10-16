import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { useRegisterLabelPrints, useRenderLabels } from './useInventoryLabels.js'
import { useBluetoothPrinting } from './useBluetoothPrinting.js'
import { toRenderItems, totalLabels } from '../lib/label-queue.js'
import { createBrowserEnv, labelFilename, labelTransports, preparePrintPlan, resolvePrintPlan, runPrintPlan } from '../lib/label-transports.js'

// Print / download for the queue: render on the API, hand the file to the
// printer transport, and only then log the print (POST /inventory/labels/prints).
// PNG downloads are a single-label preview, so they are not logged.
// sheet: letter grid ({ columns, rows, gapMm, marginMm, guides }) applied to PDF only.
// onLogged(rows) runs after the print was registered (to refresh label stats).
export function useLabelOutput({ rows, templateId, layout, printer, sheet = null, onLogged }) {
  const render = useRenderLabels()
  const register = useRegisterLabelPrints()
  const [busy, setBusy] = useState(null)
  const bluetooth = useBluetoothPrinting()
  const plan = useMemo(() => resolvePrintPlan(printer, labelTransports, { bluetooth }), [printer, bluetooth])

  async function logPrint(printed) {
    try {
      const res = await register.mutateAsync({ items: toRenderItems(rows), templateId: templateId ?? undefined, printerId: printed ? printer?.id : undefined })
      onLogged?.(rows)
      return res
    } catch (err) {
      toast.warning('Las etiquetas se generaron, pero no se registró la impresión', { description: err?.message })
      return null
    }
  }

  async function renderBlob(format) {
    return render.mutateAsync({
      items: toRenderItems(rows),
      templateId: templateId ?? undefined,
      layout: layout ?? undefined,
      printerId: printer?.id ?? undefined,
      format,
      ...(sheet && format === 'pdf' ? { sheet } : {}),
    })
  }

  async function print() {
    if (!rows.length || !plan.available) return
    setBusy('print')
    const env = { ...createBrowserEnv(), bluetooth }
    // Opened before the await so the browser does not block the new tab.
    const handle = preparePrintPlan(plan, labelTransports, env)
    try {
      const blob = await renderBlob(plan.format)
      const out = await runPrintPlan(plan, { blob, printer, handle }, labelTransports, env)
      // Logged only after the printer (or the browser) accepted the file.
      if (!out.ok) throw new Error(out.message ?? 'No se pudo enviar a la impresora')
      await logPrint(true)
      const title = out.mode === 'open' ? 'Etiquetas listas para imprimir' : out.mode === 'bluetooth' ? 'Etiquetas enviadas a la impresora' : 'Archivo de etiquetas descargado'
      toast.success(title, {
        description: `${totalLabels(rows)} ${totalLabels(rows) === 1 ? 'etiqueta' : 'etiquetas'}${out.mode === 'open' ? ' · imprime desde la pestaña nueva' : ''}`,
      })
    } catch (err) {
      env.close(handle)
      toast.error(err?.message ?? 'No se pudieron generar las etiquetas')
    } finally {
      setBusy(null)
    }
  }

  async function download(format) {
    if (!rows.length) return
    setBusy(format)
    try {
      const blob = await renderBlob(format)
      createBrowserEnv().download(blob, labelFilename(format))
      if (format !== 'png') await logPrint(false)
      toast.success(format === 'png' ? 'Vista previa descargada' : 'Etiquetas descargadas')
    } catch (err) {
      toast.error(err?.message ?? 'No se pudieron generar las etiquetas')
    } finally {
      setBusy(null)
    }
  }

  return { plan, print, download, busy }
}
