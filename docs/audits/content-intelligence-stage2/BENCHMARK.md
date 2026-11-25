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
