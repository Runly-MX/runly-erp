import { useEffect, useRef, useState } from 'react'
import { hasGeoPoint } from '../../lib/geo-point.js'
import { getIconNode } from '@runly/ui'
import { loadMaplibre } from './load-maplibre.js'
import { iconKey, pinSvg } from './pin-image.js'

function pinElement(pin) {
  const img = document.createElement('img')
  img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(pinSvg({ color: pin.color, iconNode: getIconNode(iconKey(pin.icon)) }))}`
  img.width = 40
  img.height = 50
  img.alt = ''
  return img
}

const POINT_ZOOM = 16

// Small MapLibre map with one marker. With `onPick`, clicking the map or
// dragging the marker moves the point. `maplibre-gl` loads lazily so it never
// enters the main bundle; on a tile/style error it calls `onError` so the
// caller can fall back to coordinates and an external link.
// pin (optional): { color, icon } draws the item type's custom pin instead of the default marker.
export function GeoPointMap({ styleUrl, latitude, longitude, onPick, onError, pin = null, className = 'h-56' }) {
  const pinRef = useRef(pin)
  pinRef.current = pin
  const containerRef = useRef(null)
  const mapRef = useRef(null)
  const markerRef = useRef(null)
  const libRef = useRef(null)
  const pickRef = useRef(onPick)
  pickRef.current = onPick
  const [ready, setReady] = useState(false)
  const located = hasGeoPoint(latitude, longitude)

  useEffect(() => {
    if (!containerRef.current || !styleUrl) return undefined
    let cancelled = false
    const load = async () => {
      const maplibregl = await loadMaplibre()
      if (cancelled) return
      libRef.current = maplibregl
      const map = new maplibregl.Map({
        container: containerRef.current,
        style: styleUrl,
        attributionControl: { compact: true },
        center: located ? [Number(longitude), Number(latitude)] : [-99.13, 19.43],
        zoom: located ? POINT_ZOOM : 3,
        cooperativeGestures: true,
      })
      map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right')
      map.on('error', () => onError?.())
      map.on('click', (event) => pickRef.current?.(event.lngLat.lat, event.lngLat.lng))
      mapRef.current = map
      setReady(true)
    }
    load().catch(() => onError?.())
    return () => {
      cancelled = true
      markerRef.current?.remove()
      markerRef.current = null
      mapRef.current?.remove()
      mapRef.current = null
      setReady(false)
    }
    // The point is synced below; only the style recreates the map.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [styleUrl])

  useEffect(() => {
    const map = mapRef.current, lib = libRef.current
    if (!ready || !map || !lib) return
    if (!located) { markerRef.current?.remove(); markerRef.current = null; return }
    const lngLat = [Number(longitude), Number(latitude)]
    if (!markerRef.current) {
      markerRef.current = new lib.Marker({ draggable: Boolean(pickRef.current), ...(pinRef.current ? { element: pinElement(pinRef.current), anchor: 'bottom' } : {}) }).setLngLat(lngLat).addTo(map)
      markerRef.current.on('dragend', () => {
        const { lat, lng } = markerRef.current.getLngLat()
        pickRef.current?.(lat, lng)
      })
    } else {
      markerRef.current.setLngLat(lngLat)
    }
    map.easeTo({ center: lngLat, zoom: Math.max(map.getZoom(), POINT_ZOOM) })
  }, [ready, located, latitude, longitude])

  return <div ref={containerRef} className={`${className} w-full overflow-hidden rounded-lg border border-[hsl(var(--border))]`} />
}
