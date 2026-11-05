import { useEffect, useRef, useState } from 'react'

const SOURCE = 'geo-items'
const POINT_ZOOM = 16

const toGeoJson = (points) => ({
  type: 'FeatureCollection',
  features: points.map((p) => ({
    type: 'Feature', id: p.id,
    geometry: { type: 'Point', coordinates: [p.longitude, p.latitude] },
    properties: { id: p.id, color: p.color ?? '#475569' },
  })),
})

function fitAll(map, points, animate) {
  if (!points.length) return
  if (points.length === 1) { map.jumpTo({ center: [points[0].longitude, points[0].latitude], zoom: POINT_ZOOM }); return }
  const lngs = points.map((p) => p.longitude), lats = points.map((p) => p.latitude)
  map.fitBounds([[Math.min(...lngs), Math.min(...lats)], [Math.max(...lngs), Math.max(...lats)]], { padding: 48, maxZoom: POINT_ZOOM, animate })
}

// Many points on a MapLibre map, clustered when they overlap.
// points: [{ id, latitude, longitude, color? }]. Clicking a point calls
// onSelect(id); clicking a cluster zooms into it. `maplibre-gl` loads lazily;
// `onError` fires only when the style itself can't load.
export function GeoItemsMap({ styleUrl, points, selectedId, onSelect, onError, className = 'h-[70vh]' }) {
  const containerRef = useRef(null)
  const mapRef = useRef(null)
  const selectRef = useRef(onSelect)
  selectRef.current = onSelect
  const pointsRef = useRef(points)
  pointsRef.current = points
  const [ready, setReady] = useState(false)

  useEffect(() => {
    if (!containerRef.current || !styleUrl) return undefined
    let cancelled = false
    let loaded = false
    const load = async () => {
      const [maplibregl] = await Promise.all([import('maplibre-gl'), import('maplibre-gl/dist/maplibre-gl.css')])
      if (cancelled) return
      const map = new maplibregl.Map({ container: containerRef.current, style: styleUrl, attributionControl: { compact: true }, center: [-99.13, 19.43], zoom: 3 })
      mapRef.current = map
      map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right')
      map.on('error', () => { if (!loaded) onError?.() })
      map.on('load', () => {
        loaded = true
        // Cluster counts use a font the style already ships, so no extra glyphs are fetched.
        const font = map.getStyle().layers.find((l) => l.layout?.['text-font'])?.layout['text-font']
        map.addSource(SOURCE, { type: 'geojson', data: toGeoJson(pointsRef.current), cluster: true, clusterRadius: 44, clusterMaxZoom: 15 })
        map.addLayer({ id: 'geo-clusters', type: 'circle', source: SOURCE, filter: ['has', 'point_count'],
          paint: { 'circle-color': '#334155', 'circle-opacity': 0.85, 'circle-stroke-width': 3, 'circle-stroke-color': '#ffffff',
            'circle-radius': ['step', ['get', 'point_count'], 16, 10, 20, 50, 26] } })
        if (font) {
          map.addLayer({ id: 'geo-cluster-count', type: 'symbol', source: SOURCE, filter: ['has', 'point_count'],
            layout: { 'text-field': ['get', 'point_count_abbreviated'], 'text-font': font, 'text-size': 13 },
            paint: { 'text-color': '#ffffff' } })
        }
        map.addLayer({ id: 'geo-points', type: 'circle', source: SOURCE, filter: ['!', ['has', 'point_count']],
          paint: { 'circle-color': ['get', 'color'], 'circle-radius': 8, 'circle-stroke-width': 2, 'circle-stroke-color': '#ffffff' } })
        map.addLayer({ id: 'geo-selected', type: 'circle', source: SOURCE, filter: ['==', ['get', 'id'], ''],
          paint: { 'circle-color': 'rgba(0,0,0,0)', 'circle-radius': 13, 'circle-stroke-width': 3, 'circle-stroke-color': ['get', 'color'] } })
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
        fitAll(map, pointsRef.current, false)
        setReady(true)
      })
    }
    load().catch(() => onError?.())
    return () => {
      cancelled = true
      mapRef.current?.remove()
      mapRef.current = null
      setReady(false)
    }
    // Points and selection are synced below; only the style recreates the map.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [styleUrl])

  useEffect(() => {
    if (!ready) return
    mapRef.current.getSource(SOURCE)?.setData(toGeoJson(points))
  }, [ready, points])

  useEffect(() => {
    if (!ready) return
    const map = mapRef.current
    map.setFilter('geo-selected', ['==', ['get', 'id'], selectedId ?? ''])
    const point = selectedId ? pointsRef.current.find((p) => p.id === selectedId) : null
    if (point) map.easeTo({ center: [point.longitude, point.latitude], zoom: Math.max(map.getZoom(), POINT_ZOOM) })
  }, [ready, selectedId])

  return <div ref={containerRef} className={`${className} w-full overflow-hidden rounded-lg border border-[hsl(var(--border))]`} />
}
