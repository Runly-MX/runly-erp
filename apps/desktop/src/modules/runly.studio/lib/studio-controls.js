import { FabricObject, ActiveSelection } from 'fabric'

// Selection handles in Studio identity, a little stronger than Fabric's
// defaults (thin light-blue border, small hollow squares). The canvas is CSS
// scaled, so sizes are divided by the displayed zoom to keep them constant on
// screen: ~11 px handles, 1.5 px border, 28 px touch targets at any zoom.
const ACCENT = '#d946ef'
const style = zoom => ({
  borderColor: ACCENT, borderScaleFactor: 1.5 / zoom, borderOpacityWhenMoving: 0.55,
  cornerColor: '#ffffff', cornerStrokeColor: ACCENT, transparentCorners: false, cornerStyle: 'circle',
  cornerSize: 11 / zoom, touchCornerSize: 28 / zoom,
})

export const controlStyle = zoom => style(Number.isFinite(zoom) && zoom > 0 ? zoom : 1)

export function styleControls(canvas, zoom = 1) {
  const z = Number.isFinite(zoom) && zoom > 0 ? zoom : 1, values = style(z)
  Object.assign(FabricObject.ownDefaults, values)
  if (ActiveSelection.ownDefaults) Object.assign(ActiveSelection.ownDefaults, values)
  for (const object of canvas.getObjects()) object.set(values)
  canvas.getActiveObject()?.set(values)
  Object.assign(canvas, { selectionColor: 'rgba(217, 70, 239, 0.08)', selectionBorderColor: ACCENT, selectionLineWidth: 1 / z })
  canvas.requestRenderAll()
  return values
}
