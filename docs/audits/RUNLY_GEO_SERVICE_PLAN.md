# Servicio geográfico compartido: plan de migración (2026-11-25)

Estado: **preparado, no activo.** `country-state-city` sigue siendo la fuente de los formularios. No se eliminó la dependencia.

## Hechos verificados

- Único consumidor: `AddressFieldsSection` (vía `useGeoData` en `packages/ui/src/lib/geoData.js`), que a su vez usan los formularios de dirección de los módulos a través de `@runly/ui`. No hay otro consumo directo del paquete en `apps/` ni `packages/`.
- Paquete npm `country-state-city` 3.2.1: **GPL-3.0** (código). Datos: `dr5hn/countries-states-cities-database`.
- Upstream: licencia **ODbL-1.0** (SPDX reportado por la API de GitHub y texto `LICENSE`); exige atribución y que las bases derivadas se compartan bajo la misma licencia. Sus fuentes (OpenStreetMap, Wikidata, oficinas estadísticas) llevan avisos propios en `NOTICE-SOURCES.txt` del release.
- Versión elegida y fijada: release `v5.2.0-export.1`, asset `json-countries+states+cities.json.gz` (3.79 MB), sha256 `d748ee4f…479475d`. Acceso a red verificado (descarga y hash).
- 250 países; 156 166 ciudades; solo nombres y códigos ISO: **2.3 MB sin comprimir en total** (el paquete actual trae 8.7 MB con coordenadas). Mayor archivo por país: US 219 KB.

## Lo preparado (sin efecto en la app)

- `scripts/geo/build-geo-dataset.mjs`: descarga el asset fijado, verifica el sha256 y genera `packages/ui/src/geo-data/countries.json`, un `<ISO2>.json` por país y `NOTICE.md` con la atribución ODbL. Prueba: `scripts/geo/__tests__/build-geo-dataset.test.js`.
- `packages/ui/src/lib/geoDataset.js`: cargador con la misma API de lectura que usa el formulario (`Country`, `State`, `City`), carga selectiva (lista de países; un archivo por país al elegirlo; ciudades dentro del mismo archivo) y caché en memoria. Los archivos son trozos diferidos del bundle, así que funcionan sin red una vez cacheados por la PWA y en Tauri.

## Por qué no se conmuta todavía: la deriva de datos es real

Comparación del paquete (instantánea antigua) frente a upstream v5.2.0:

| | Paquete 3.2.1 | Faltan en upstream nuevo |
|---|---|---|
| Países | 250 | 0 (mismos ISO2) |
| Estados (código ISO) | 4 963 | **477** (MK 84 de 84, LV 80, AL 35, GB 31, VN 29, GR 26, GT 21, NP 19...) |
| Ciudades (nombre) | 142 656 | **52 565** (ES 6 414 de 6 692; GB 3 871 de 3 871; US 3 172 de 19 821; MX 364 de 9 136) |

Un domicilio guardado (país ISO2, código de estado, nombre de ciudad) puede dejar de coincidir con las opciones nuevas. México y Colombia, los más usados, mantienen sus 32 y 33 estados; cambian sobre todo nombres de ciudades. Conmutar sin migración degradaría la edición de direcciones existentes.

## Pasos para activar (decisión pendiente)

1. Generar `geo-data/` y revisar el tamaño del bundle (se espera < 3 MB repartidos en 251 trozos diferidos, frente a 8.7 MB).
2. Decidir el comportamiento con valores guardados que no estén en las opciones: mostrar el valor guardado como opción personalizada (recomendado, no destructivo) y no reescribir direcciones automáticamente.
3. Opcional: tabla de equivalencias de códigos de estado antiguos (solo los 477 cambiados) para los países con clientes reales.
4. Cambiar el import de `AddressFieldsSection` a `geoDataset.js` (pasar `country` al hook), probar en navegador los formularios de contactos, RH y website.
5. Retirar `country-state-city` de `packages/ui` y `apps/desktop` (cambia `pnpm-lock.yaml`; hacerlo en un cambio aparte sin otras sesiones tocando el lockfile) y borrar `geoData.js`.
6. Mantener el aviso ODbL en `THIRD_PARTY_NOTICES` y publicar `geo-data/NOTICE.md` con la app.

Pendiente de revisión jurídica: alcance exacto de la cláusula de «compartir igual» para los archivos por país derivados (se asume que basta publicarlos bajo ODbL con la atribución; la app que los consulta no queda cubierta).
