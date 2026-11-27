# Comparativa antes / despues (conjunto comun)

Cada celda: CER medio / identificadores exactos / segundos por archivo / segundas pasadas. Solo archivos que ambas versiones procesan sin error; HEIC (8 archivos) no se puede comparar: la version anterior no los admite.

### OCR (imagenes y PDF escaneados), por modo

| Grupo | n | fast antes | fast despues | balanced antes | balanced despues | accurate antes | accurate despues |
|---|---|---|---|---|---|---|---|
| todos los tipos OCR | 104 | 0.203 / 0.732 / 0.66s / 0 | 0.203 / 0.732 / 0.68s / 0 | 0.116 / 0.830 / 1.22s / 13 | 0.099 / 0.866 / 1.27s / 25 | 0.105 / 0.786 / 1.46s / 37 | 0.094 / 0.804 / 1.51s / 46 |

### Por tipo

| Grupo | n | fast antes | fast despues | balanced antes | balanced despues | accurate antes | accurate despues |
|---|---|---|---|---|---|---|---|
| device-label | 32 | 0.275 / 0.594 / 0.45s / 0 | 0.275 / 0.594 / 0.47s / 0 | 0.169 / 0.781 / 0.78s / 4 | 0.169 / 0.781 / 0.83s / 9 | 0.160 / 0.688 / 1.14s / 17 | 0.159 / 0.688 / 1.20s / 21 |
| glare-shadow | 8 | 0.445 / 0.250 / 0.39s / 0 | 0.445 / 0.250 / 0.41s / 0 | 0.437 / 0.250 / 0.82s / 3 | 0.437 / 0.250 / 0.93s / 6 | 0.402 / 0.250 / 1.13s / 7 | 0.402 / 0.250 / 1.32s / 11 |
| invoice | 8 | 0.074 / 0.875 / 0.45s / 0 | 0.074 / 0.875 / 0.47s / 0 | 0.074 / 0.875 / 0.79s / 1 | 0.074 / 0.875 / 0.82s / 1 | 0.076 / 0.750 / 0.91s / 1 | 0.076 / 0.750 / 0.93s / 1 |
| no-text | 8 | - | - | - | - | - | - |
| office | 16 | 0.200 / 0.750 / 0.03s / 0 | 0.000 / 1.000 / 0.02s / 0 | 0.200 / 0.750 / 0.03s / 0 | 0.000 / 1.000 / 0.02s / 0 | 0.200 / 0.750 / 0.03s / 0 | 0.000 / 1.000 / 0.02s / 0 |
| pdf-digital | 8 | 0.000 / 1.000 / 0.12s / 0 | 0.000 / 1.000 / 0.14s / 0 | 0.000 / 1.000 / 0.13s / 0 | 0.000 / 1.000 / 0.18s / 0 | 0.000 / 1.000 / 0.15s / 0 | 0.000 / 1.000 / 0.21s / 0 |
| pdf-hybrid | 8 | 0.000 / 1.000 / 1.25s / 0 | 0.000 / 1.000 / 1.25s / 0 | 0.000 / 1.000 / 2.26s / 0 | 0.000 / 1.000 / 2.29s / 0 | 0.002 / 1.000 / 2.45s / 1 | 0.002 / 1.000 / 2.49s / 1 |
| pdf-rotated | 16 | 0.455 / 0.500 / 1.24s / 0 | 0.455 / 0.500 / 1.29s / 0 | 0.000 / 1.000 / 2.33s / 0 | 0.000 / 1.000 / 2.36s / 0 | 0.000 / 1.000 / 2.53s / 2 | 0.000 / 1.000 / 2.56s / 2 |
| pdf-scanned | 8 | 0.095 / 1.000 / 1.27s / 0 | 0.095 / 1.000 / 1.29s / 0 | 0.095 / 1.000 / 2.30s / 0 | 0.095 / 1.000 / 2.37s / 0 | 0.100 / 1.000 / 2.60s / 2 | 0.100 / 1.000 / 2.57s / 2 |
| perspective-label | 8 | 0.008 / 0.875 / 0.28s / 0 | 0.008 / 0.875 / 0.28s / 0 | 0.108 / 0.625 / 0.76s / 4 | 0.000 / 1.000 / 0.90s / 8 | 0.033 / 0.625 / 0.91s / 4 | 0.006 / 0.750 / 1.00s / 6 |
| screenshot | 8 | 0.000 / 1.000 / 0.40s / 0 | 0.000 / 1.000 / 0.42s / 0 | 0.000 / 1.000 / 0.64s / 0 | 0.000 / 1.000 / 0.66s / 0 | 0.000 / 1.000 / 0.81s / 1 | 0.000 / 1.000 / 0.81s / 1 |
| small-label | 8 | 0.000 / 1.000 / 0.29s / 0 | 0.000 / 1.000 / 0.30s / 0 | 0.120 / 0.875 / 0.47s / 1 | 0.000 / 1.000 / 0.49s / 1 | 0.110 / 0.875 / 0.60s / 2 | 0.000 / 1.000 / 0.58s / 1 |

### OCR por dificultad

| Grupo | n | fast antes | fast despues | balanced antes | balanced despues | accurate antes | accurate despues |
|---|---|---|---|---|---|---|---|
| clean | 24 | 0.002 / 0.958 / 0.69s / 0 | 0.002 / 0.958 / 0.71s / 0 | 0.002 / 0.958 / 1.19s / 0 | 0.002 / 0.958 / 1.23s / 1 | 0.007 / 0.917 / 1.40s / 5 | 0.007 / 0.917 / 1.42s / 5 |
| moderate | 34 | 0.254 / 0.762 / 1.01s / 0 | 0.254 / 0.762 / 1.05s / 0 | 0.040 / 0.952 / 1.86s / 1 | 0.040 / 0.952 / 1.90s / 1 | 0.043 / 0.881 / 2.07s / 6 | 0.043 / 0.881 / 2.09s / 6 |
| hard | 46 | 0.269 / 0.587 / 0.38s / 0 | 0.269 / 0.587 / 0.40s / 0 | 0.232 / 0.652 / 0.75s / 12 | 0.193 / 0.739 / 0.83s / 23 | 0.201 / 0.630 / 1.04s / 26 | 0.177 / 0.674 / 1.12s / 35 |

### Capacidades nuevas (sin comparacion posible)

- heic-photo / fast: n=8, CER 0.017, identificadores exactos 0.875, 0.45 s por archivo.
- heic-photo / balanced: n=8, CER 0.006, identificadores exactos 0.875, 0.75 s por archivo.
- heic-photo / accurate: n=8, CER 0.000, identificadores exactos 1.000, 0.98 s por archivo.
