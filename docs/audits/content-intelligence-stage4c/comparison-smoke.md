# Comparativa antes / despues (conjunto comun)

Cada celda: CER medio / identificadores exactos / segundos por archivo / segundas pasadas. Solo archivos que ambas versiones procesan sin error; HEIC (1 archivos) no se puede comparar: la version anterior no los admite.

### OCR (imagenes y PDF escaneados), por modo

| Grupo | n | fast antes | fast despues | balanced antes | balanced despues | accurate antes | accurate despues |
|---|---|---|---|---|---|---|---|
| todos los tipos OCR | 12 | 0.154 / 0.846 / 0.69s / 0 | 0.154 / 0.846 / 0.69s / 0 | 0.058 / 0.923 / 1.31s / 1 | 0.058 / 0.923 / 1.32s / 2 | 0.062 / 0.846 / 1.51s / 3 | 0.060 / 0.923 / 1.55s / 5 |

### Por tipo

| Grupo | n | fast antes | fast despues | balanced antes | balanced despues | accurate antes | accurate despues |
|---|---|---|---|---|---|---|---|
| device-label | 3 | 0.000 / 1.000 / 0.54s / 0 | 0.000 / 1.000 / 0.56s / 0 | 0.000 / 1.000 / 0.91s / 0 | 0.000 / 1.000 / 0.96s / 0 | 0.007 / 0.667 / 1.39s / 2 | 0.000 / 1.000 / 1.55s / 3 |
| glare-shadow | 1 | 1.000 / 0.000 / 0.37s / 0 | 1.000 / 0.000 / 0.33s / 0 | 0.696 / 0.000 / 1.02s / 1 | 0.696 / 0.000 / 1.29s / 2 | 0.717 / 0.000 / 1.20s / 1 | 0.717 / 0.000 / 1.58s / 2 |
| invoice | 1 | 0.000 / 1.000 / 0.30s / 0 | 0.000 / 1.000 / 0.30s / 0 | 0.000 / 1.000 / 0.52s / 0 | 0.000 / 1.000 / 0.48s / 0 | 0.000 / 1.000 / 0.69s / 0 | 0.000 / 1.000 / 0.68s / 0 |
| no-text | 1 | - | - | - | - | - | - |
| office | 2 | 0.200 / 0.750 / 0.02s / 0 | 0.000 / 1.000 / 0.01s / 0 | 0.200 / 0.750 / 0.01s / 0 | 0.000 / 1.000 / 0.02s / 0 | 0.200 / 0.750 / 0.01s / 0 | 0.000 / 1.000 / 0.02s / 0 |
| pdf-digital | 1 | 0.000 / 1.000 / 0.07s / 0 | 0.000 / 1.000 / 0.07s / 0 | 0.000 / 1.000 / 0.11s / 0 | 0.000 / 1.000 / 0.07s / 0 | 0.000 / 1.000 / 0.12s / 0 | 0.000 / 1.000 / 0.13s / 0 |
| pdf-hybrid | 1 | 0.000 / 1.000 / 1.24s / 0 | 0.000 / 1.000 / 1.31s / 0 | 0.000 / 1.000 / 2.40s / 0 | 0.000 / 1.000 / 2.32s / 0 | 0.000 / 1.000 / 2.51s / 0 | 0.000 / 1.000 / 2.38s / 0 |
| pdf-rotated | 2 | 0.424 / 0.500 / 1.27s / 0 | 0.424 / 0.500 / 1.22s / 0 | 0.000 / 1.000 / 2.45s / 0 | 0.000 / 1.000 / 2.36s / 0 | 0.000 / 1.000 / 2.51s / 0 | 0.000 / 1.000 / 2.44s / 0 |
| pdf-scanned | 1 | 0.000 / 1.000 / 1.19s / 0 | 0.000 / 1.000 / 1.19s / 0 | 0.000 / 1.000 / 2.44s / 0 | 0.000 / 1.000 / 2.38s / 0 | 0.000 / 1.000 / 2.53s / 0 | 0.000 / 1.000 / 2.45s / 0 |
| perspective-label | 1 | 0.000 / 1.000 / 0.27s / 0 | 0.000 / 1.000 / 0.32s / 0 | 0.000 / 1.000 / 0.70s / 0 | 0.000 / 1.000 / 0.70s / 0 | 0.000 / 1.000 / 0.74s / 0 | 0.000 / 1.000 / 0.73s / 0 |
| screenshot | 1 | 0.000 / 1.000 / 0.41s / 0 | 0.000 / 1.000 / 0.39s / 0 | 0.000 / 1.000 / 0.63s / 0 | 0.000 / 1.000 / 0.64s / 0 | 0.000 / 1.000 / 0.73s / 0 | 0.000 / 1.000 / 0.76s / 0 |
| small-label | 1 | 0.000 / 1.000 / 0.28s / 0 | 0.000 / 1.000 / 0.29s / 0 | 0.000 / 1.000 / 0.40s / 0 | 0.000 / 1.000 / 0.36s / 0 | 0.000 / 1.000 / 0.47s / 0 | 0.000 / 1.000 / 0.46s / 0 |

### OCR por dificultad

| Grupo | n | fast antes | fast despues | balanced antes | balanced despues | accurate antes | accurate despues |
|---|---|---|---|---|---|---|---|
| clean | 3 | 0.000 / 1.000 / 0.70s / 0 | 0.000 / 1.000 / 0.73s / 0 | 0.000 / 1.000 / 1.22s / 0 | 0.000 / 1.000 / 1.28s / 0 | 0.000 / 1.000 / 1.34s / 0 | 0.000 / 1.000 / 1.32s / 0 |
| moderate | 4 | 0.212 / 0.800 / 1.01s / 0 | 0.212 / 0.800 / 0.98s / 0 | 0.000 / 1.000 / 1.96s / 0 | 0.000 / 1.000 / 1.90s / 0 | 0.000 / 1.000 / 2.06s / 0 | 0.000 / 1.000 / 2.00s / 0 |
| hard | 5 | 0.200 / 0.800 / 0.42s / 0 | 0.200 / 0.800 / 0.42s / 0 | 0.139 / 0.800 / 0.84s / 1 | 0.139 / 0.800 / 0.87s / 2 | 0.148 / 0.600 / 1.16s / 3 | 0.143 / 0.800 / 1.32s / 5 |

### Capacidades nuevas (sin comparacion posible)

- heic-photo / fast: n=1, CER 0.000, identificadores exactos 1.000, 0.44 s por archivo.
- heic-photo / balanced: n=1, CER 0.000, identificadores exactos 1.000, 0.73 s por archivo.
- heic-photo / accurate: n=1, CER 0.000, identificadores exactos 1.000, 0.78 s por archivo.
