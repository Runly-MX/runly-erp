import { useEffect, useRef, useState } from 'react'
import { getIconNode } from '@runly/ui'
import { loadMaplibre } from './load-maplibre.js'
import { iconKey, loadPinImage, pinColor } from './pin-image.js'

const SOURCE = 'geo-items'
const POINT_ZOOM = 16
const EMPTY = { type: 'FeatureCollection', features: [] }

const pinId = (pin) => `pin:${pinColor(pin?.color)}:${iconKey(pin?.icon)}`

const toGeoJson = (points) => ({
  type: 'FeatureCollection',
  features: points.map((p) => ({
    type: 'Feature', id: p.id,
    geometry: { type: 'Point', coordinates: [p.longitude, p.latitude] },
    properties: { id: p.id, pin: pinId(p.pin) },
  })),
})

function fitAll(map, points) {
  if (!points.length) return
  if (points.length === 1) { map.jumpTo({ center: [points[0].longitude, points[0].latitude], zoom: POINT_ZOOM }); return }
  const lngs = points.map((p) => p.longitude), lats = points.map((p) => p.latitude)
  map.fitBounds([[Math.min(...lngs), Math.min(...lats)], [Math.max(...lngs), Math.max(...lats)]], { padding: 56, maxZoom: POINT_ZOOM, animate: false })
}

// Registers one pin image per (color, icon) pair that the map doesn't have yet.
async function ensurePins(map, points) {
  const missing = new Map()
  for (const p of points) {
    const id = pinId(p.pin)
    if (!map.hasImage(id) && !missing.has(id)) missing.set(id, p.pin)
  }
  await Promise.all([...missing].map(async ([id, pin]) => {
    const img = await loadPinImage({ color: pin?.color, iconNode: getIconNode(iconKey(pin?.icon)) }).catch(() => null)
    if (img && !map.hasImage(id)) map.addImage(id, img, { pixelRatio: 2 })
  }))
}

// Many points on a MapLibre map, clustered when they overlap. Each point is a
// custom pin: points: [{ id, latitude, longitude, pin: { color, icon } }]
// (icon = lucide name from the icon picker). Clicking a pin calls
// onSelect(id); clicking a cluster zooms into it. `onError` fires only when
// the style itself can't load.
export function GeoItemsMap({ styleUrl, points, selectedId, onSelect, onError, fitKey = '', className = 'h-[70vh]' }) {
  const containerRef = useRef(null)
  const mapRef = useRef(null)
  const selectRef = useRef(onSelect)
  selectRef.current = onSelect
  const fittedRef = useRef(false)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    if (!containerRef.current || !styleUrl) return undefined
    let cancelled = false
    let loaded = false
    const load = async () => {
      const maplibregl = await loadMaplibre()
      if (cancelled) return
      const map = new maplibregl.Map({ container: containerRef.current, style: styleUrl, attributionControl: { compact: true }, center: [-99.13, 19.43], zoom: 3 })
      mapRef.current = map
      map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right')
      map.on('error', () => { if (!loaded) onError?.() })
      map.on('load', () => {
        loaded = true
        // Cluster counts use a font the style already ships, so no extra glyphs are fetched.
        const font = map.getStyle().layers.find((l) => l.layout?.['text-font'])?.layout['text-font']
        map.addSource(SOURCE, { type: 'geojson', data: EMPTY, cluster: true, clusterRadius: 44, clusterMaxZoom: 15 })
        map.addLayer({ id: 'geo-clusters', type: 'circle', source: SOURCE, filter: ['has', 'point_count'],
          paint: { 'circle-color': '#334155', 'circle-opacity': 0.88, 'circle-stroke-width': 3, 'circle-stroke-color': '#ffffff',
            'circle-radius': ['step', ['get', 'point_count'], 16, 10, 20, 50, 26] } })
        if (font) {
          map.addLayer({ id: 'geo-cluster-count', type: 'symbol', source: SOURCE, filter: ['has', 'point_count'],
            layout: { 'text-field': ['get', 'point_count_abbreviated'], 'text-font': font, 'text-size': 13 },
            paint: { 'text-color': '#ffffff' } })
        }
        map.addLayer({ id: 'geo-points', type: 'symbol', source: SOURCE, filter: ['!', ['has', 'point_count']],
          layout: { 'icon-image': ['get', 'pin'], 'icon-anchor': 'bottom', 'icon-allow-overlap': true, 'icon-ignore-placement': true, 'icon-size': 1 } })
        map.on('click', 'geo-clusters', async (event) => {
          const feature = event.features?.[0]
          if (!feature) return
          const zoom = await map.getSource(SOURCE).getClusterExpansionZoom(feature.properties.cluster_id)
          map.easeTo({ center: feature.geometry.coordinates, zoom })
        })
        map.on('click', 'geo-points', (event) => { const id = event.features?.[0]?.properties?.id; if (id) selectRef.current?.(id) })
        for (const layer of ['geo-clusters', 'geo-points']) {
          map.on('mouseenter', layer, () => { map.getCanvas().style.cursor = 'pointer' })
          map.on('mouseleave', layer, () => { map.getCanvas().style.cursor = '' })
        }
        setReady(true)
      })
    }
    load().catch(() => onError?.())
    return () => {
      cancelled = true
      fittedRef.current = false
      mapRef.current?.remove()
      mapRef.current = null
      setReady(false)
    }
    // Points and selection are synced below; only the style recreates the map.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [styleUrl])

  // A new fitKey (e.g. other filters) frames the next set of points again.
  useEffect(() => { fittedRef.current = false }, [fitKey])

  useEffect(() => {
    if (!ready) return undefined
    let stale = false
    const map = mapRef.current
    ensurePins(map, points).then(() => {
      if (stale || !mapRef.current) return
      map.getSource(SOURCE)?.setData(toGeoJson(points))
      if (!fittedRef.current && points.length) { fitAll(map, points); fittedRef.current = true }
    })
    return () => { stale = true }
  }, [ready, points])

  useEffect(() => {
    if (!ready) return
    const map = mapRef.current
    map.setLayoutProperty('geo-points', 'icon-size', ['case', ['==', ['get', 'id'], selectedId ?? ''], 1.35, 1])
    const point = selectedId ? points.find((p) => p.id === selectedId) : null
    if (point) map.easeTo({ center: [point.longitude, point.latitude], zoom: Math.max(map.getZoom(), POINT_ZOOM) })
    // Only a new selection moves the camera, not a refreshed list.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, selectedId])

  return <div ref={containerRef} className={`${className} w-full overflow-hidden rounded-lg border border-[hsl(var(--border))]`} />
}
