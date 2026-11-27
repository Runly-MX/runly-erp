# OCR corpus standard (seed 20261126, 160 files, synthetic=True)

| Modo | Archivos | Errores | CER | WER | Ids exactos | Recall busqueda | Precision busqueda | s medio | s p95 | RSS max MiB | 2das pasadas |
|---|---|---|---|---|---|---|---|---|---|---|---|
| fast | 144 | 8 | 0.172 | 0.217 | 0.750 | 0.688 | 0.786 | 0.50 | 1.29 | 119 | 0 |
| balanced | 144 | 8 | 0.115 | 0.148 | 0.815 | 0.756 | 0.801 | 0.94 | 2.42 | 137 | 15 |
| accurate | 144 | 8 | 0.111 | 0.144 | 0.845 | 0.787 | 0.797 | 1.12 | 2.56 | 137 | 33 |

## Por tipo

| Grupo | Modo | Archivos | Errores | CER | Ids exactos | s medio | 2das pasadas |
|---|---|---|---|---|---|---|---|
| device-label | fast | 32 | 0 | 0.175 | 0.594 | 0.47 | 0 |
| device-label | balanced | 32 | 0 | 0.146 | 0.656 | 0.87 | 5 |
| device-label | accurate | 32 | 0 | 0.132 | 0.812 | 1.31 | 11 |
| glare-shadow | fast | 8 | 0 | 0.839 | 0.125 | 0.36 | 0 |
| glare-shadow | balanced | 8 | 0 | 0.727 | 0.125 | 0.99 | 7 |
| glare-shadow | accurate | 8 | 0 | 0.724 | 0.125 | 1.30 | 11 |
| heic-photo | fast | 0 | 8 | - | 0.000 | - | 0 |
| heic-photo | balanced | 0 | 8 | - | 0.000 | - | 0 |
| heic-photo | accurate | 0 | 8 | - | 0.000 | - | 0 |
| invoice | fast | 8 | 0 | 0.131 | 0.812 | 0.45 | 0 |
| invoice | balanced | 8 | 0 | 0.002 | 0.938 | 0.70 | 0 |
| invoice | accurate | 8 | 0 | 0.000 | 1.000 | 0.89 | 1 |
| office | fast | 32 | 0 | 0.100 | 0.833 | 0.03 | 0 |
| office | balanced | 32 | 0 | 0.100 | 0.833 | 0.03 | 0 |
| office | accurate | 32 | 0 | 0.100 | 0.833 | 0.02 | 0 |
| pdf-digital | fast | 8 | 0 | 0.000 | 1.000 | 0.13 | 0 |
| pdf-digital | balanced | 8 | 0 | 0.000 | 1.000 | 0.13 | 0 |
| pdf-digital | accurate | 8 | 0 | 0.000 | 1.000 | 0.10 | 0 |
| pdf-hybrid | fast | 8 | 0 | 0.001 | 1.000 | 1.27 | 0 |
| pdf-hybrid | balanced | 8 | 0 | 0.001 | 1.000 | 2.33 | 0 |
| pdf-hybrid | accurate | 8 | 0 | 0.000 | 1.000 | 2.52 | 1 |
| pdf-rotated | fast | 16 | 0 | 0.455 | 0.500 | 1.26 | 0 |
| pdf-rotated | balanced | 16 | 0 | 0.000 | 1.000 | 2.39 | 0 |
| pdf-rotated | accurate | 16 | 0 | 0.002 | 1.000 | 2.60 | 2 |
| pdf-scanned | fast | 8 | 0 | 0.089 | 1.000 | 1.32 | 0 |
| pdf-scanned | balanced | 8 | 0 | 0.089 | 1.000 | 2.46 | 0 |
| pdf-scanned | accurate | 8 | 0 | 0.089 | 1.000 | 2.48 | 0 |
| perspective-label | fast | 8 | 0 | 0.019 | 0.625 | 0.28 | 0 |
| perspective-label | balanced | 8 | 0 | 0.028 | 0.750 | 0.68 | 1 |
| perspective-label | accurate | 8 | 0 | 0.025 | 0.750 | 0.85 | 3 |
| screenshot | fast | 8 | 0 | 0.000 | 1.000 | 0.42 | 0 |
| screenshot | balanced | 8 | 0 | 0.000 | 1.000 | 0.72 | 0 |
| screenshot | accurate | 8 | 0 | 0.000 | 1.000 | 0.79 | 0 |
| small-label | fast | 8 | 0 | 0.000 | 1.000 | 0.29 | 0 |
| small-label | balanced | 8 | 0 | 0.237 | 0.750 | 0.48 | 2 |
| small-label | accurate | 8 | 0 | 0.220 | 0.625 | 0.69 | 4 |

## Por dificultad

| Grupo | Modo | Archivos | Errores | CER | Ids exactos | s medio | 2das pasadas |
|---|---|---|---|---|---|---|---|
| clean | fast | 66 | 4 | 0.049 | 0.893 | 0.30 | 0 |
| clean | balanced | 66 | 4 | 0.049 | 0.893 | 0.50 | 0 |
| clean | accurate | 66 | 4 | 0.049 | 0.893 | 0.55 | 2 |
| hard | fast | 45 | 0 | 0.276 | 0.533 | 0.39 | 0 |
| hard | balanced | 45 | 0 | 0.279 | 0.556 | 0.82 | 15 |
| hard | accurate | 45 | 0 | 0.265 | 0.644 | 1.21 | 27 |
| moderate | fast | 33 | 4 | 0.275 | 0.692 | 1.06 | 0 |
| moderate | balanced | 33 | 4 | 0.023 | 0.949 | 1.96 | 0 |
| moderate | accurate | 33 | 4 | 0.023 | 0.974 | 2.13 | 4 |
