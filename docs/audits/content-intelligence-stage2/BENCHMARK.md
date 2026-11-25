# Carga sobre el ERP aislado

18 escenarios, 24 muestras por endpoint después de seis rondas de calentamiento.
Auth/Storage/PostgreSQL reales; datos sintéticos. Se consultaron Archivos, búsqueda
OCR, inventario, dashboard de Compras, sesiones POS y perfil de usuario, en paralelo.
Cada escenario tiene 144 solicitudes medidas. ERP sin población empresarial real:
Inventario/Compras/POS no representan una operación comercial cargada. Login y
subida se ejercitan en E2E/preparación; no tienen percentiles medidos en esta tabla.
Navegación y Realtime no están medidos como carga. Vite/navegador fuera del presupuesto.

Nueve contenedores con límites duros suman 2/4/8 CPU y 4096/8192/16384 MiB,
respectivamente. No es una VM/VPS ni un host dedicado; otros trabajos comparten
la máquina. Por cada 2 CPU: API .5, DB .25, worker .25, Kong .5, Storage .25,
Auth .1 y REST/Realtime/imgproxy .05 cada uno. RAM: API 768, DB 1280, worker 512,
Storage 384, Kong 512, Realtime 256, Auth/REST/imgproxy 128 cada uno.
Concurrencia OCR uno. OFF/ausente e instalado inactivo usan la misma población de cada ronda.
El corpus crece entre escenarios: no es una comparación de capacidad certificada.

La tabla muestra Archivos; el JSON conserva p50/p95/p99 de los seis endpoints,
Docker stats, conexiones, tamaño DB e índices. Stats es una muestra, no un pico.
Throughput incluye pausas de 150 ms y captura de stats; no es capacidad máxima.

| CPU/GB presupuesto | Escenario | p50 ms | p95 ms | p99 ms | Cambio p95 vs OFF | Errores HTTP | req/s |
|---|---|---:|---:|---:|---:|---:|---:|
| 2/4 | absent | 27.8 | 32.7 | 34.1 | 0.0% | 0 | 19.2 |
| 2/4 | idle | 24.6 | 74.8 | 140.9 | 128.8% | 0 | 21.0 |
| 2/4 | new | 25.3 | 35.0 | 36.6 | 7.0% | 0 | 20.0 |
| 2/4 | historical | 23.0 | 26.1 | 26.5 | -20.2% | 0 | 20.6 |
| 2/4 | accurate | 23.9 | 28.2 | 82.4 | -13.7% | 0 | 21.0 |
| 2/4 | pressure | 23.5 | 38.4 | 68.5 | 17.6% | 0 | 20.2 |
| 4/8 | absent | 23.1 | 31.9 | 52.5 | 0.0% | 0 | 20.4 |
| 4/8 | idle | 23.5 | 27.8 | 30.7 | -13.0% | 0 | 20.6 |
| 4/8 | new | 23.6 | 27.8 | 32.7 | -13.1% | 0 | 20.1 |
| 4/8 | historical | 23.9 | 34.1 | 37.5 | 6.9% | 0 | 19.9 |
| 4/8 | accurate | 21.9 | 29.7 | 36.5 | -7.1% | 0 | 20.8 |
| 4/8 | pressure | 23.9 | 31.7 | 33.7 | -0.7% | 0 | 19.5 |
| 8/16 | absent | 22.9 | 28.4 | 48.1 | 0.0% | 0 | 20.5 |
| 8/16 | idle | 23.5 | 34.3 | 34.3 | 20.6% | 0 | 20.3 |
| 8/16 | new | 25.4 | 49.1 | 62.0 | 72.9% | 0 | 19.7 |
| 8/16 | historical | 22.3 | 28.5 | 39.8 | 0.2% | 0 | 21.0 |
| 8/16 | accurate | 22.2 | 24.4 | 24.9 | -14.1% | 0 | 20.1 |
| 8/16 | pressure | 22.0 | 31.4 | 53.3 | 10.3% | 0 | 20.2 |

No se certifica degradación p95 menor al 10%: hay escenarios que la superan y
una muestra pequeña/host compartido no permite garantizarla. Las ventanas fuera
de horario y concurrencia uno son mitigaciones disponibles; hace falta una carga
representativa y repetida antes de staging.

Se conserva como fallo metodológico una ronda anterior sin calentamiento uniforme
y otra con solo 128 MiB para Storage, que provocó reinicio e invalidó esa comparación.
Se corrigió la asignación del laboratorio; no se cambió una instalación operativa.

## Ronda A/B intercalada (2026-11-25, reemplaza la lectura de la tabla anterior)

La tabla anterior (24 muestras por endpoint, una pasada, escenarios en serie) no
sustenta un p95. `scripts/content-intelligence-erp-ab.mjs` rota los seis escenarios
dentro de cada una de 8 repeticiones, mide 30 rondas por bloque tras 4 de calentamiento
y junta 1,440 muestras por escenario (seis endpoints). Mismo laboratorio sintético y
mismos límites de contenedor; host compartido. Intervalo: bootstrap 95% del cociente
p95(escenario)/p95(absent). Datos: `erp-ab-4x8.json`, `erp-ab-2x4.json`.

| Presupuesto | Escenario | p50 ms | p95 ms | p99 ms | p95 vs absent | IC95 | Errores |
|---|---|---:|---:|---:|---:|---|---:|
| 4/8 | absent | 17.5 | 59.3 | 92.4 | 1.000 | - | 0 |
| 4/8 | idle | 17.7 | 62.3 | 98.2 | 1.051 | 0.97-1.15 | 0 |
| 4/8 | new | 18.4 | 61.2 | 85.9 | 1.032 | 0.96-1.12 | 0 |
| 4/8 | historical | 17.4 | 59.0 | 90.3 | 0.994 | 0.92-1.08 | 0 |
| 4/8 | accurate | 18.4 | 64.7 | 105.9 | 1.092 | 1.02-1.20 | 0 |
| 4/8 | pressure | 18.5 | 66.9 | 105.9 | 1.128 | 1.04-1.25 | 0 |
| 2/4 | absent | 15.0 | 52.8 | 138.1 | 1.000 | - | 0 |
| 2/4 | idle | 15.0 | 66.8 | 151.1 | 1.266 | 0.82-1.81 | 0 |
| 2/4 | new | 15.1 | 53.0 | 105.4 | 1.005 | 0.70-1.16 | 0 |
| 2/4 | historical | 15.3 | 54.0 | 112.0 | 1.023 | 0.71-1.23 | 0 |
| 2/4 | accurate | 15.3 | 54.1 | 108.3 | 1.026 | 0.72-1.24 | 0 |
| 2/4 | pressure | 15.5 | 57.9 | 127.0 | 1.098 | 0.77-1.34 | 0 |

Lectura honesta: en archivos nuevos e histórico las estimaciones puntuales quedan
dentro del 10% (4/8: +3.2% y -0.6%; 2/4: +0.5% y +2.3%), pero el piso de ruido del
laboratorio es mayor que el presupuesto: "idle" (un worker que no hace nada) marca
+26.6% en 2/4 con IC 0.82-1.81, y 4/8 alta precisión/presión tienen el IC inferior
por encima de 1.0 (+9.2% y +12.8%). Por tanto el objetivo p95 <10% **no queda
demostrado**; no se afinaron umbrales del governor sobre esta evidencia porque la
variación entre idle y absent impide atribuir causa. Para certificarlo hace falta un
host dedicado (sin otros trabajos), poblaciones reales de Inventario/Compras/POS y
más repeticiones. Sin errores HTTP ni timeouts en 17,280 solicitudes medidas.
