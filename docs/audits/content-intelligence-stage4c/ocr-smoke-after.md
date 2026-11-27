# OCR corpus smoke (seed 20261126, 19 files, synthetic=True)

| Modo | Archivos | Errores | CER | WER | Ids exactos | Recall busqueda | Precision busqueda | s medio | s p95 | RSS max MiB | 2das pasadas |
|---|---|---|---|---|---|---|---|---|---|---|---|
| fast | 18 | 0 | 0.103 | 0.111 | 0.905 | 0.895 | 0.739 | 0.49 | 1.25 | 125 | 0 |
| balanced | 18 | 0 | 0.039 | 0.048 | 0.952 | 0.947 | 0.750 | 0.92 | 2.38 | 137 | 2 |
| accurate | 18 | 0 | 0.040 | 0.056 | 0.952 | 0.947 | 0.750 | 1.09 | 2.45 | 137 | 5 |

## Por tipo

| Grupo | Modo | Archivos | Errores | CER | Ids exactos | s medio | 2das pasadas |
|---|---|---|---|---|---|---|---|
| device-label | fast | 3 | 0 | 0.000 | 1.000 | 0.56 | 0 |
| device-label | balanced | 3 | 0 | 0.000 | 1.000 | 0.96 | 0 |
| device-label | accurate | 3 | 0 | 0.000 | 1.000 | 1.55 | 3 |
| glare-shadow | fast | 1 | 0 | 1.000 | 0.000 | 0.33 | 0 |
| glare-shadow | balanced | 1 | 0 | 0.696 | 0.000 | 1.29 | 2 |
| glare-shadow | accurate | 1 | 0 | 0.717 | 0.000 | 1.58 | 2 |
| heic-photo | fast | 1 | 0 | 0.000 | 1.000 | 0.44 | 0 |
| heic-photo | balanced | 1 | 0 | 0.000 | 1.000 | 0.73 | 0 |
| heic-photo | accurate | 1 | 0 | 0.000 | 1.000 | 0.78 | 0 |
| invoice | fast | 1 | 0 | 0.000 | 1.000 | 0.30 | 0 |
| invoice | balanced | 1 | 0 | 0.000 | 1.000 | 0.48 | 0 |
| invoice | accurate | 1 | 0 | 0.000 | 1.000 | 0.68 | 0 |
| office | fast | 4 | 0 | 0.000 | 1.000 | 0.02 | 0 |
| office | balanced | 4 | 0 | 0.000 | 1.000 | 0.02 | 0 |
| office | accurate | 4 | 0 | 0.000 | 1.000 | 0.02 | 0 |
| pdf-digital | fast | 1 | 0 | 0.000 | 1.000 | 0.07 | 0 |
| pdf-digital | balanced | 1 | 0 | 0.000 | 1.000 | 0.07 | 0 |
| pdf-digital | accurate | 1 | 0 | 0.000 | 1.000 | 0.13 | 0 |
| pdf-hybrid | fast | 1 | 0 | 0.000 | 1.000 | 1.31 | 0 |
| pdf-hybrid | balanced | 1 | 0 | 0.000 | 1.000 | 2.32 | 0 |
| pdf-hybrid | accurate | 1 | 0 | 0.000 | 1.000 | 2.38 | 0 |
| pdf-rotated | fast | 2 | 0 | 0.424 | 0.500 | 1.22 | 0 |
| pdf-rotated | balanced | 2 | 0 | 0.000 | 1.000 | 2.36 | 0 |
| pdf-rotated | accurate | 2 | 0 | 0.000 | 1.000 | 2.44 | 0 |
| pdf-scanned | fast | 1 | 0 | 0.000 | 1.000 | 1.19 | 0 |
| pdf-scanned | balanced | 1 | 0 | 0.000 | 1.000 | 2.38 | 0 |
| pdf-scanned | accurate | 1 | 0 | 0.000 | 1.000 | 2.45 | 0 |
| perspective-label | fast | 1 | 0 | 0.000 | 1.000 | 0.32 | 0 |
| perspective-label | balanced | 1 | 0 | 0.000 | 1.000 | 0.70 | 0 |
| perspective-label | accurate | 1 | 0 | 0.000 | 1.000 | 0.73 | 0 |
| screenshot | fast | 1 | 0 | 0.000 | 1.000 | 0.39 | 0 |
| screenshot | balanced | 1 | 0 | 0.000 | 1.000 | 0.64 | 0 |
| screenshot | accurate | 1 | 0 | 0.000 | 1.000 | 0.76 | 0 |
| small-label | fast | 1 | 0 | 0.000 | 1.000 | 0.29 | 0 |
| small-label | balanced | 1 | 0 | 0.000 | 1.000 | 0.36 | 0 |
| small-label | accurate | 1 | 0 | 0.000 | 1.000 | 0.46 | 0 |

## Por dificultad

| Grupo | Modo | Archivos | Errores | CER | Ids exactos | s medio | 2das pasadas |
|---|---|---|---|---|---|---|---|
| clean | fast | 9 | 0 | 0.000 | 1.000 | 0.31 | 0 |
| clean | balanced | 9 | 0 | 0.000 | 1.000 | 0.52 | 0 |
| clean | accurate | 9 | 0 | 0.000 | 1.000 | 0.55 | 0 |
| hard | fast | 5 | 0 | 0.200 | 0.800 | 0.42 | 0 |
| hard | balanced | 5 | 0 | 0.139 | 0.800 | 0.87 | 2 |
| hard | accurate | 5 | 0 | 0.143 | 0.800 | 1.32 | 5 |
| moderate | fast | 4 | 0 | 0.212 | 0.800 | 0.98 | 0 |
| moderate | balanced | 4 | 0 | 0.000 | 1.000 | 1.90 | 0 |
| moderate | accurate | 4 | 0 | 0.000 | 1.000 | 2.00 | 0 |
