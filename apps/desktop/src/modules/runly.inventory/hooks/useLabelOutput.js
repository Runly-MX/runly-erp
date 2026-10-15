import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { useRegisterLabelPrints, useRenderLabels } from './useInventoryLabels.js'
import { toRenderItems, totalLabels } from '../lib/label-queue.js'
import { createBrowserEnv, labelFilename, labelTransports, preparePrintPlan, resolvePrintPlan, runPrintPlan } from '../lib/label-transports.js'

// Print / download for the queue: render on the API, hand the file to the
// printer transport, and only then log the print (POST /inventory/labels/prints).
// PNG downloads are a single-label preview, so they are not logged.
export function useLabelOutput({ rows, templateId, layout, printer }) {
  const render = useRenderLabels()
  const register = useRegisterLabelPrints()
  const [busy, setBusy] = useState(null)
  const plan = useMemo(() => resolvePrintPlan(printer, labelTransports), [printer])

  async function logPrint(printed) {
    try {
      const res = await register.mutateAsync({ items: toRenderItems(rows), templateId: templateId ?? undefined, printerId: printed ? printer?.id : undefined })
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
    })
  }

  async function print() {
    if (!rows.length || !plan.available) return
    setBusy('print')
    const env = createBrowserEnv()
    // Opened before the await so the browser does not block the new tab.
    const handle = preparePrintPlan(plan, labelTransports, env)
    try {
      const blob = await renderBlob(plan.format)
      const out = await runPrintPlan(plan, { blob, printer, handle }, labelTransports, env)
      if (!out.ok) throw new Error('No se pudo enviar a la impresora')
      await logPrint(true)
      toast.success(out.mode === 'open' ? 'Etiquetas listas para imprimir' : 'Archivo de etiquetas descargado', {
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
