# OCR corpus smoke (seed 20261126, 19 files, synthetic=True)

| Modo | Archivos | Errores | CER | WER | Ids exactos | Recall busqueda | Precision busqueda | s medio | s p95 | RSS max MiB | 2das pasadas |
|---|---|---|---|---|---|---|---|---|---|---|---|
| fast | 18 | 0 | 0.103 | 0.111 | 0.905 | 0.895 | 0.739 | 0.46 | 1.22 | 125 | 0 |
| balanced | 18 | 0 | 0.039 | 0.048 | 0.952 | 0.947 | 0.750 | 0.88 | 2.25 | 137 | 2 |
| accurate | 18 | 0 | 0.040 | 0.056 | 0.952 | 0.947 | 0.750 | 1.06 | 2.46 | 137 | 5 |

## Por tipo

| Grupo | Modo | Archivos | Errores | CER | Ids exactos | s medio | 2das pasadas |
|---|---|---|---|---|---|---|---|
| device-label | fast | 3 | 0 | 0.000 | 1.000 | 0.51 | 0 |
| device-label | balanced | 3 | 0 | 0.000 | 1.000 | 0.89 | 0 |
| device-label | accurate | 3 | 0 | 0.000 | 1.000 | 1.52 | 3 |
| glare-shadow | fast | 1 | 0 | 1.000 | 0.000 | 0.31 | 0 |
| glare-shadow | balanced | 1 | 0 | 0.696 | 0.000 | 1.33 | 2 |
| glare-shadow | accurate | 1 | 0 | 0.717 | 0.000 | 1.47 | 2 |
| heic-photo | fast | 1 | 0 | 0.000 | 1.000 | 0.41 | 0 |
| heic-photo | balanced | 1 | 0 | 0.000 | 1.000 | 0.63 | 0 |
| heic-photo | accurate | 1 | 0 | 0.000 | 1.000 | 0.73 | 0 |
| invoice | fast | 1 | 0 | 0.000 | 1.000 | 0.29 | 0 |
| invoice | balanced | 1 | 0 | 0.000 | 1.000 | 0.51 | 0 |
| invoice | accurate | 1 | 0 | 0.000 | 1.000 | 0.62 | 0 |
| office | fast | 4 | 0 | 0.000 | 1.000 | 0.01 | 0 |
| office | balanced | 4 | 0 | 0.000 | 1.000 | 0.01 | 0 |
| office | accurate | 4 | 0 | 0.000 | 1.000 | 0.01 | 0 |
| pdf-digital | fast | 1 | 0 | 0.000 | 1.000 | 0.03 | 0 |
| pdf-digital | balanced | 1 | 0 | 0.000 | 1.000 | 0.02 | 0 |
| pdf-digital | accurate | 1 | 0 | 0.000 | 1.000 | 0.02 | 0 |
| pdf-hybrid | fast | 1 | 0 | 0.000 | 1.000 | 1.12 | 0 |
| pdf-hybrid | balanced | 1 | 0 | 0.000 | 1.000 | 2.19 | 0 |
| pdf-hybrid | accurate | 1 | 0 | 0.000 | 1.000 | 2.25 | 0 |
| pdf-rotated | fast | 2 | 0 | 0.424 | 0.500 | 1.23 | 0 |
| pdf-rotated | balanced | 2 | 0 | 0.000 | 1.000 | 2.25 | 0 |
| pdf-rotated | accurate | 2 | 0 | 0.000 | 1.000 | 2.52 | 0 |
| pdf-scanned | fast | 1 | 0 | 0.000 | 1.000 | 1.21 | 0 |
| pdf-scanned | balanced | 1 | 0 | 0.000 | 1.000 | 2.31 | 0 |
| pdf-scanned | accurate | 1 | 0 | 0.000 | 1.000 | 2.44 | 0 |
| perspective-label | fast | 1 | 0 | 0.000 | 1.000 | 0.27 | 0 |
| perspective-label | balanced | 1 | 0 | 0.000 | 1.000 | 0.62 | 0 |
| perspective-label | accurate | 1 | 0 | 0.000 | 1.000 | 0.73 | 0 |
| screenshot | fast | 1 | 0 | 0.000 | 1.000 | 0.38 | 0 |
| screenshot | balanced | 1 | 0 | 0.000 | 1.000 | 0.63 | 0 |
| screenshot | accurate | 1 | 0 | 0.000 | 1.000 | 0.73 | 0 |
| small-label | fast | 1 | 0 | 0.000 | 1.000 | 0.28 | 0 |
| small-label | balanced | 1 | 0 | 0.000 | 1.000 | 0.34 | 0 |
| small-label | accurate | 1 | 0 | 0.000 | 1.000 | 0.50 | 0 |

## Por dificultad

| Grupo | Modo | Archivos | Errores | CER | Ids exactos | s medio | 2das pasadas |
|---|---|---|---|---|---|---|---|
| clean | fast | 9 | 0 | 0.000 | 1.000 | 0.27 | 0 |
| clean | balanced | 9 | 0 | 0.000 | 1.000 | 0.46 | 0 |
| clean | accurate | 9 | 0 | 0.000 | 1.000 | 0.50 | 0 |
| hard | fast | 5 | 0 | 0.200 | 0.800 | 0.39 | 0 |
| hard | balanced | 5 | 0 | 0.139 | 0.800 | 0.86 | 2 |
| hard | accurate | 5 | 0 | 0.143 | 0.800 | 1.30 | 5 |
| moderate | fast | 4 | 0 | 0.212 | 0.800 | 0.99 | 0 |
| moderate | balanced | 4 | 0 | 0.000 | 1.000 | 1.83 | 0 |
| moderate | accurate | 4 | 0 | 0.000 | 1.000 | 2.02 | 0 |
