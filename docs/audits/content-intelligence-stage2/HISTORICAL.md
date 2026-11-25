# Histórico mixto con Storage real

1,000 originales sintéticos se subieron con OCR OFF antes de activar el recorrido.
La admisión automática de nuevos estaba desactivada durante el lote, para comprobar
el descubrimiento histórico. PostgreSQL, API, Auth y Storage eran los del ERP aislado.

| Dato | Resultado |
|---|---:|
| Archivos registrados y finalizados `done` | 1,000 |
| Con OCR real | 585 |
| Extracción digital | 415 |
| Fallidos / parciales / cancelados | 0 / 0 / 0 |
| Máximo pendiente + procesando | 20 |
| Duración del procesamiento y recuperación | 753.154 s |
| Subida previa, separada | 43.734 s |
| Intentos | 1,005 |
| CPU reportada por intentos con métricas | 637.630 s |
| Mayor RSS reportado por proceso | 146,292,736 bytes |
| Resultados derivados, sin índices | 765,185 bytes |
| Originales | 16,344,847 bytes |
| Revisiones de originales cambiadas | 0 |

Distribución: 502 PNG de etiquetas/dispositivos sintéticos, 83 PDF escaneados,
83 PDF digitales, 83 DOCX, 83 XLSX, 83 PPTX y 83 TXT. Los paquetes Office son
mínimos reproducibles, no documentos complejos de usuarios. No son fotos de campo.
Los originales van de 33 a 58,612 bytes; no representan archivos grandes.
Las imágenes son 1400×700; el OCR de PDF produjo canvas de 2705×3500.

Cuatro workers, cada uno con 0.5 CPU/1 GiB, concurrencia global y empresarial
cuatro, calidad equilibrada y OMP un hilo. El resto del ERP estaba fuera de ese
presupuesto de workers; este ensayo no certifica un servidor completo 2/4.
RSS es por proceso, no el máximo simultáneo sumado de un contenedor. La CPU de
los cinco intentos interrumpidos no está totalmente contabilizada en esa suma.

Se ejecutaron pausa/reanudación del histórico y un reinicio después de 200
finalizados. Durante el mismo ensayo también se reemplazaron los cuatro workers
para aplicar la espera proporcional de CPU, conservando cola y checkpoints.
El tiempo incluye esa actualización, espera de leases y recuperación. No es una
comparación de velocidad pura entre versiones ni debe compararse directamente con
los 149.088 s de la primera etapa: aquel lote tenía 1,000 TXT y cero OCR.

No hubo registros omitidos al final. El muestreo de cinco segundos no observa
cada instante; el máximo de cola se apoya además en admisión transaccional y
pruebas de concurrencia. No se afirma haber probado días de funcionamiento.

[Serie temporal, intentos y verificación final](historical-mixed.json).
Generadores: `apps/content-worker/generate_test_files.py` y
`scripts/content-intelligence-historical-bench.mjs`. El script exige destinos
loopback, credenciales sintéticas y contenedores explícitos del laboratorio.
