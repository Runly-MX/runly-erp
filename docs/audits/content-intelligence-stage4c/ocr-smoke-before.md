# OCR corpus smoke (seed 20261126, 19 files, synthetic=True)

| Modo | Archivos | Errores | CER | WER | Ids exactos | Recall busqueda | Precision busqueda | s medio | s p95 | RSS max MiB | 2das pasadas |
|---|---|---|---|---|---|---|---|---|---|---|---|
| fast | 17 | 1 | 0.132 | 0.140 | 0.850 | 0.789 | 0.714 | 0.49 | 1.24 | 125 | 0 |
| balanced | 17 | 1 | 0.064 | 0.072 | 0.900 | 0.842 | 0.727 | 0.94 | 2.44 | 137 | 1 |
| accurate | 17 | 1 | 0.067 | 0.093 | 0.850 | 0.789 | 0.714 | 1.07 | 2.52 | 137 | 3 |

## Por tipo

| Grupo | Modo | Archivos | Errores | CER | Ids exactos | s medio | 2das pasadas |
|---|---|---|---|---|---|---|---|
| device-label | fast | 3 | 0 | 0.000 | 1.000 | 0.54 | 0 |
| device-label | balanced | 3 | 0 | 0.000 | 1.000 | 0.91 | 0 |
| device-label | accurate | 3 | 0 | 0.007 | 0.667 | 1.39 | 2 |
| glare-shadow | fast | 1 | 0 | 1.000 | 0.000 | 0.37 | 0 |
| glare-shadow | balanced | 1 | 0 | 0.696 | 0.000 | 1.02 | 1 |
| glare-shadow | accurate | 1 | 0 | 0.717 | 0.000 | 1.20 | 1 |
| heic-photo | fast | 0 | 1 | - | 0.000 | - | 0 |
| heic-photo | balanced | 0 | 1 | - | 0.000 | - | 0 |
| heic-photo | accurate | 0 | 1 | - | 0.000 | - | 0 |
| invoice | fast | 1 | 0 | 0.000 | 1.000 | 0.30 | 0 |
| invoice | balanced | 1 | 0 | 0.000 | 1.000 | 0.52 | 0 |
| invoice | accurate | 1 | 0 | 0.000 | 1.000 | 0.69 | 0 |
| office | fast | 4 | 0 | 0.100 | 0.833 | 0.02 | 0 |
| office | balanced | 4 | 0 | 0.100 | 0.833 | 0.01 | 0 |
| office | accurate | 4 | 0 | 0.100 | 0.833 | 0.01 | 0 |
| pdf-digital | fast | 1 | 0 | 0.000 | 1.000 | 0.07 | 0 |
| pdf-digital | balanced | 1 | 0 | 0.000 | 1.000 | 0.11 | 0 |
| pdf-digital | accurate | 1 | 0 | 0.000 | 1.000 | 0.12 | 0 |
| pdf-hybrid | fast | 1 | 0 | 0.000 | 1.000 | 1.24 | 0 |
| pdf-hybrid | balanced | 1 | 0 | 0.000 | 1.000 | 2.40 | 0 |
| pdf-hybrid | accurate | 1 | 0 | 0.000 | 1.000 | 2.51 | 0 |
| pdf-rotated | fast | 2 | 0 | 0.424 | 0.500 | 1.27 | 0 |
| pdf-rotated | balanced | 2 | 0 | 0.000 | 1.000 | 2.45 | 0 |
| pdf-rotated | accurate | 2 | 0 | 0.000 | 1.000 | 2.51 | 0 |
| pdf-scanned | fast | 1 | 0 | 0.000 | 1.000 | 1.19 | 0 |
| pdf-scanned | balanced | 1 | 0 | 0.000 | 1.000 | 2.44 | 0 |
| pdf-scanned | accurate | 1 | 0 | 0.000 | 1.000 | 2.53 | 0 |
| perspective-label | fast | 1 | 0 | 0.000 | 1.000 | 0.27 | 0 |
| perspective-label | balanced | 1 | 0 | 0.000 | 1.000 | 0.70 | 0 |
| perspective-label | accurate | 1 | 0 | 0.000 | 1.000 | 0.74 | 0 |
| screenshot | fast | 1 | 0 | 0.000 | 1.000 | 0.41 | 0 |
| screenshot | balanced | 1 | 0 | 0.000 | 1.000 | 0.63 | 0 |
| screenshot | accurate | 1 | 0 | 0.000 | 1.000 | 0.73 | 0 |
| small-label | fast | 1 | 0 | 0.000 | 1.000 | 0.28 | 0 |
| small-label | balanced | 1 | 0 | 0.000 | 1.000 | 0.40 | 0 |
| small-label | accurate | 1 | 0 | 0.000 | 1.000 | 0.47 | 0 |

## Por dificultad

| Grupo | Modo | Archivos | Errores | CER | Ids exactos | s medio | 2das pasadas |
|---|---|---|---|---|---|---|---|
| clean | fast | 8 | 1 | 0.050 | 0.900 | 0.28 | 0 |
| clean | balanced | 8 | 1 | 0.050 | 0.900 | 0.48 | 0 |
| clean | accurate | 8 | 1 | 0.050 | 0.900 | 0.53 | 0 |
| hard | fast | 5 | 0 | 0.200 | 0.800 | 0.42 | 0 |
| hard | balanced | 5 | 0 | 0.139 | 0.800 | 0.84 | 1 |
| hard | accurate | 5 | 0 | 0.148 | 0.600 | 1.16 | 3 |
| moderate | fast | 4 | 0 | 0.212 | 0.800 | 1.01 | 0 |
| moderate | balanced | 4 | 0 | 0.000 | 1.000 | 1.96 | 0 |
| moderate | accurate | 4 | 0 | 0.000 | 1.000 | 2.06 | 0 |
