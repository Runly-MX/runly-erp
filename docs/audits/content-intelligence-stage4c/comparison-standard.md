# Comparativa antes / despues (conjunto comun)

Cada celda: CER medio / identificadores exactos / segundos por archivo / segundas pasadas. Solo archivos que ambas versiones procesan sin error; HEIC (8 archivos) no se puede comparar: la version anterior no los admite.

### OCR (imagenes y PDF escaneados), por modo

| Grupo | n | fast antes | fast despues | balanced antes | balanced despues | accurate antes | accurate despues |
|---|---|---|---|---|---|---|---|
| todos los tipos OCR | 104 | 0.207 / 0.696 / 0.68s / 0 | 0.207 / 0.696 / 0.69s / 0 | 0.128 / 0.795 / 1.28s / 15 | 0.099 / 0.830 / 1.29s / 24 | 0.122 / 0.839 / 1.54s / 33 | 0.095 / 0.875 / 1.56s / 40 |

### Por tipo

| Grupo | n | fast antes | fast despues | balanced antes | balanced despues | accurate antes | accurate despues |
|---|---|---|---|---|---|---|---|
| device-label | 32 | 0.175 / 0.594 / 0.47s / 0 | 0.175 / 0.594 / 0.48s / 0 | 0.146 / 0.656 / 0.87s / 5 | 0.116 / 0.688 / 0.87s / 6 | 0.132 / 0.812 / 1.31s / 11 | 0.104 / 0.844 / 1.32s / 11 |
| glare-shadow | 8 | 0.839 / 0.125 / 0.36s / 0 | 0.839 / 0.125 / 0.38s / 0 | 0.727 / 0.125 / 0.99s / 7 | 0.727 / 0.125 / 1.27s / 14 | 0.724 / 0.125 / 1.30s / 11 | 0.724 / 0.125 / 1.63s / 18 |
| invoice | 8 | 0.131 / 0.812 / 0.45s / 0 | 0.131 / 0.812 / 0.46s / 0 | 0.002 / 0.938 / 0.70s / 0 | 0.002 / 0.938 / 0.68s / 0 | 0.000 / 1.000 / 0.89s / 1 | 0.000 / 1.000 / 0.91s / 2 |
| no-text | 8 | - | - | - | - | - | - |
| office | 16 | 0.200 / 0.750 / 0.03s / 0 | 0.000 / 1.000 / 0.02s / 0 | 0.200 / 0.750 / 0.03s / 0 | 0.000 / 1.000 / 0.02s / 0 | 0.200 / 0.750 / 0.02s / 0 | 0.000 / 1.000 / 0.02s / 0 |
| pdf-digital | 8 | 0.000 / 1.000 / 0.13s / 0 | 0.000 / 1.000 / 0.12s / 0 | 0.000 / 1.000 / 0.13s / 0 | 0.000 / 1.000 / 0.12s / 0 | 0.000 / 1.000 / 0.10s / 0 | 0.000 / 1.000 / 0.09s / 0 |
| pdf-hybrid | 8 | 0.001 / 1.000 / 1.27s / 0 | 0.001 / 1.000 / 1.24s / 0 | 0.001 / 1.000 / 2.33s / 0 | 0.001 / 1.000 / 2.29s / 0 | 0.000 / 1.000 / 2.52s / 1 | 0.000 / 1.000 / 2.54s / 1 |
| pdf-rotated | 16 | 0.455 / 0.500 / 1.26s / 0 | 0.455 / 0.500 / 1.29s / 0 | 0.000 / 1.000 / 2.39s / 0 | 0.000 / 1.000 / 2.40s / 0 | 0.002 / 1.000 / 2.60s / 2 | 0.002 / 1.000 / 2.61s / 2 |
| pdf-scanned | 8 | 0.089 / 1.000 / 1.32s / 0 | 0.089 / 1.000 / 1.30s / 0 | 0.089 / 1.000 / 2.46s / 0 | 0.089 / 1.000 / 2.37s / 0 | 0.089 / 1.000 / 2.48s / 0 | 0.089 / 1.000 / 2.47s / 0 |
| perspective-label | 8 | 0.019 / 0.625 / 0.28s / 0 | 0.019 / 0.625 / 0.29s / 0 | 0.028 / 0.750 / 0.68s / 1 | 0.005 / 0.875 / 0.74s / 2 | 0.025 / 0.750 / 0.85s / 3 | 0.003 / 0.875 / 0.91s / 4 |
| screenshot | 8 | 0.000 / 1.000 / 0.42s / 0 | 0.000 / 1.000 / 0.42s / 0 | 0.000 / 1.000 / 0.72s / 0 | 0.000 / 1.000 / 0.65s / 0 | 0.000 / 1.000 / 0.79s / 0 | 0.000 / 1.000 / 0.76s / 0 |
| small-label | 8 | 0.000 / 1.000 / 0.29s / 0 | 0.000 / 1.000 / 0.30s / 0 | 0.237 / 0.750 / 0.48s / 2 | 0.000 / 1.000 / 0.50s / 2 | 0.220 / 0.625 / 0.69s / 4 | 0.003 / 0.875 / 0.61s / 2 |

### OCR por dificultad

| Grupo | n | fast antes | fast despues | balanced antes | balanced despues | accurate antes | accurate despues |
|---|---|---|---|---|---|---|---|
| clean | 26 | 0.001 / 0.964 / 0.68s / 0 | 0.001 / 0.964 / 0.68s / 0 | 0.001 / 0.964 / 1.20s / 0 | 0.001 / 0.964 / 1.17s / 0 | 0.001 / 0.964 / 1.34s / 2 | 0.001 / 0.964 / 1.34s / 2 |
| moderate | 33 | 0.275 / 0.692 / 1.06s / 0 | 0.275 / 0.692 / 1.07s / 0 | 0.023 / 0.949 / 1.96s / 0 | 0.023 / 0.949 / 1.94s / 0 | 0.023 / 0.974 / 2.13s / 4 | 0.023 / 0.974 / 2.13s / 5 |
| hard | 45 | 0.276 / 0.533 / 0.39s / 0 | 0.276 / 0.533 / 0.40s / 0 | 0.279 / 0.556 / 0.82s / 15 | 0.212 / 0.644 / 0.89s / 24 | 0.265 / 0.644 / 1.21s / 27 | 0.203 / 0.733 / 1.27s / 33 |

### Capacidades nuevas (sin comparacion posible)

- heic-photo / fast: n=8, CER 0.008, identificadores exactos 0.750, 0.46 s por archivo.
- heic-photo / balanced: n=8, CER 0.003, identificadores exactos 0.875, 0.78 s por archivo.
- heic-photo / accurate: n=8, CER 0.000, identificadores exactos 1.000, 0.87 s por archivo.
