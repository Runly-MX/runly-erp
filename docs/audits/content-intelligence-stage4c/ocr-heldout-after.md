# OCR corpus standard (seed 20270105, 160 files, synthetic=True)

| Modo | Archivos | Errores | CER | WER | Ids exactos | Recall busqueda | Precision busqueda | s medio | s p95 | RSS max MiB | 2das pasadas |
|---|---|---|---|---|---|---|---|---|---|---|---|
| fast | 152 | 0 | 0.139 | 0.183 | 0.824 | 0.812 | 0.726 | 0.50 | 1.31 | 126 | 0 |
| balanced | 152 | 0 | 0.068 | 0.145 | 0.909 | 0.900 | 0.720 | 0.92 | 2.39 | 137 | 25 |
| accurate | 152 | 0 | 0.064 | 0.153 | 0.875 | 0.863 | 0.719 | 1.10 | 2.59 | 137 | 48 |

## Por tipo

| Grupo | Modo | Archivos | Errores | CER | Ids exactos | s medio | 2das pasadas |
|---|---|---|---|---|---|---|---|
| device-label | fast | 32 | 0 | 0.275 | 0.594 | 0.47 | 0 |
| device-label | balanced | 32 | 0 | 0.169 | 0.781 | 0.83 | 9 |
| device-label | accurate | 32 | 0 | 0.159 | 0.688 | 1.20 | 21 |
| glare-shadow | fast | 8 | 0 | 0.445 | 0.250 | 0.41 | 0 |
| glare-shadow | balanced | 8 | 0 | 0.437 | 0.250 | 0.93 | 6 |
| glare-shadow | accurate | 8 | 0 | 0.402 | 0.250 | 1.32 | 11 |
| heic-photo | fast | 8 | 0 | 0.017 | 0.875 | 0.45 | 0 |
| heic-photo | balanced | 8 | 0 | 0.006 | 0.875 | 0.75 | 0 |
| heic-photo | accurate | 8 | 0 | 0.000 | 1.000 | 0.98 | 2 |
| invoice | fast | 8 | 0 | 0.074 | 0.875 | 0.47 | 0 |
| invoice | balanced | 8 | 0 | 0.074 | 0.875 | 0.82 | 1 |
| invoice | accurate | 8 | 0 | 0.076 | 0.750 | 0.93 | 1 |
| office | fast | 32 | 0 | 0.000 | 1.000 | 0.03 | 0 |
| office | balanced | 32 | 0 | 0.000 | 1.000 | 0.02 | 0 |
| office | accurate | 32 | 0 | 0.000 | 1.000 | 0.02 | 0 |
| pdf-digital | fast | 8 | 0 | 0.000 | 1.000 | 0.14 | 0 |
| pdf-digital | balanced | 8 | 0 | 0.000 | 1.000 | 0.18 | 0 |
| pdf-digital | accurate | 8 | 0 | 0.000 | 1.000 | 0.21 | 0 |
| pdf-hybrid | fast | 8 | 0 | 0.000 | 1.000 | 1.25 | 0 |
| pdf-hybrid | balanced | 8 | 0 | 0.000 | 1.000 | 2.29 | 0 |
| pdf-hybrid | accurate | 8 | 0 | 0.002 | 1.000 | 2.49 | 1 |
| pdf-rotated | fast | 16 | 0 | 0.455 | 0.500 | 1.29 | 0 |
| pdf-rotated | balanced | 16 | 0 | 0.000 | 1.000 | 2.36 | 0 |
| pdf-rotated | accurate | 16 | 0 | 0.000 | 1.000 | 2.56 | 2 |
| pdf-scanned | fast | 8 | 0 | 0.095 | 1.000 | 1.29 | 0 |
| pdf-scanned | balanced | 8 | 0 | 0.095 | 1.000 | 2.37 | 0 |
| pdf-scanned | accurate | 8 | 0 | 0.100 | 1.000 | 2.57 | 2 |
| perspective-label | fast | 8 | 0 | 0.008 | 0.875 | 0.28 | 0 |
| perspective-label | balanced | 8 | 0 | 0.000 | 1.000 | 0.90 | 8 |
| perspective-label | accurate | 8 | 0 | 0.006 | 0.750 | 1.00 | 6 |
| screenshot | fast | 8 | 0 | 0.000 | 1.000 | 0.42 | 0 |
| screenshot | balanced | 8 | 0 | 0.000 | 1.000 | 0.66 | 0 |
| screenshot | accurate | 8 | 0 | 0.000 | 1.000 | 0.81 | 1 |
| small-label | fast | 8 | 0 | 0.000 | 1.000 | 0.30 | 0 |
| small-label | balanced | 8 | 0 | 0.000 | 1.000 | 0.49 | 1 |
| small-label | accurate | 8 | 0 | 0.000 | 1.000 | 0.58 | 1 |

## Por dificultad

| Grupo | Modo | Archivos | Errores | CER | Ids exactos | s medio | 2das pasadas |
|---|---|---|---|---|---|---|---|
| clean | fast | 68 | 0 | 0.001 | 0.988 | 0.30 | 0 |
| clean | balanced | 68 | 0 | 0.001 | 0.988 | 0.51 | 1 |
| clean | accurate | 68 | 0 | 0.003 | 0.976 | 0.58 | 5 |
| hard | fast | 46 | 0 | 0.269 | 0.587 | 0.40 | 0 |
| hard | balanced | 46 | 0 | 0.193 | 0.739 | 0.83 | 23 |
| hard | accurate | 46 | 0 | 0.177 | 0.674 | 1.12 | 35 |
| moderate | fast | 38 | 0 | 0.230 | 0.761 | 0.99 | 0 |
| moderate | balanced | 38 | 0 | 0.036 | 0.935 | 1.78 | 1 |
| moderate | accurate | 38 | 0 | 0.039 | 0.891 | 1.99 | 8 |
