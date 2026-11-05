// MapLibre 6 loads its worker from a file next to its own module, which the
// Vite build does not emit; without the worker no vector tiles or GeoJSON
// layers render (only raster tiles and DOM markers). `?worker&url` makes Vite
// bundle the worker (with the shared chunk it imports) and gives its URL.
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'

export async function loadMaplibre() {
  const [maplibregl] = await Promise.all([import('maplibre-gl'), import('maplibre-gl/dist/maplibre-gl.css')])
  maplibregl.setWorkerUrl(workerUrl)
  return maplibregl
}
