# OCR corpus standard (seed 20261126, 160 files, synthetic=True)

| Modo | Archivos | Errores | CER | WER | Ids exactos | Recall busqueda | Precision busqueda | s medio | s p95 | RSS max MiB | 2das pasadas |
|---|---|---|---|---|---|---|---|---|---|---|---|
| fast | 152 | 0 | 0.142 | 0.190 | 0.795 | 0.781 | 0.791 | 0.51 | 1.35 | 126 | 0 |
| balanced | 152 | 0 | 0.068 | 0.095 | 0.886 | 0.875 | 0.805 | 0.95 | 2.49 | 137 | 21 |
| accurate | 152 | 0 | 0.065 | 0.086 | 0.920 | 0.912 | 0.802 | 1.14 | 2.69 | 137 | 37 |

## Por tipo

| Grupo | Modo | Archivos | Errores | CER | Ids exactos | s medio | 2das pasadas |
|---|---|---|---|---|---|---|---|
| device-label | fast | 32 | 0 | 0.175 | 0.594 | 0.48 | 0 |
| device-label | balanced | 32 | 0 | 0.116 | 0.688 | 0.85 | 5 |
| device-label | accurate | 32 | 0 | 0.104 | 0.844 | 1.27 | 10 |
| glare-shadow | fast | 8 | 0 | 0.839 | 0.125 | 0.39 | 0 |
| glare-shadow | balanced | 8 | 0 | 0.727 | 0.125 | 1.39 | 14 |
| glare-shadow | accurate | 8 | 0 | 0.724 | 0.125 | 1.72 | 18 |
| heic-photo | fast | 8 | 0 | 0.008 | 0.750 | 0.47 | 0 |
| heic-photo | balanced | 8 | 0 | 0.003 | 0.875 | 0.82 | 0 |
| heic-photo | accurate | 8 | 0 | 0.000 | 1.000 | 0.93 | 0 |
| invoice | fast | 8 | 0 | 0.131 | 0.812 | 0.43 | 0 |
| invoice | balanced | 8 | 0 | 0.002 | 0.938 | 0.66 | 0 |
| invoice | accurate | 8 | 0 | 0.000 | 1.000 | 0.89 | 2 |
| office | fast | 32 | 0 | 0.000 | 1.000 | 0.02 | 0 |
| office | balanced | 32 | 0 | 0.000 | 1.000 | 0.02 | 0 |
| office | accurate | 32 | 0 | 0.000 | 1.000 | 0.02 | 0 |
| pdf-digital | fast | 8 | 0 | 0.000 | 1.000 | 0.14 | 0 |
| pdf-digital | balanced | 8 | 0 | 0.000 | 1.000 | 0.15 | 0 |
| pdf-digital | accurate | 8 | 0 | 0.000 | 1.000 | 0.12 | 0 |
| pdf-hybrid | fast | 8 | 0 | 0.001 | 1.000 | 1.27 | 0 |
| pdf-hybrid | balanced | 8 | 0 | 0.001 | 1.000 | 2.27 | 0 |
| pdf-hybrid | accurate | 8 | 0 | 0.000 | 1.000 | 2.52 | 1 |
| pdf-rotated | fast | 16 | 0 | 0.455 | 0.500 | 1.34 | 0 |
| pdf-rotated | balanced | 16 | 0 | 0.000 | 1.000 | 2.48 | 0 |
| pdf-rotated | accurate | 16 | 0 | 0.002 | 1.000 | 2.71 | 2 |
| pdf-scanned | fast | 8 | 0 | 0.089 | 1.000 | 1.29 | 0 |
| pdf-scanned | balanced | 8 | 0 | 0.089 | 1.000 | 2.36 | 0 |
| pdf-scanned | accurate | 8 | 0 | 0.089 | 1.000 | 2.53 | 0 |
| perspective-label | fast | 8 | 0 | 0.019 | 0.625 | 0.29 | 0 |
| perspective-label | balanced | 8 | 0 | 0.005 | 0.875 | 0.78 | 2 |
| perspective-label | accurate | 8 | 0 | 0.003 | 0.875 | 0.96 | 4 |
| screenshot | fast | 8 | 0 | 0.000 | 1.000 | 0.41 | 0 |
| screenshot | balanced | 8 | 0 | 0.000 | 1.000 | 0.68 | 0 |
| screenshot | accurate | 8 | 0 | 0.000 | 1.000 | 0.77 | 0 |
| small-label | fast | 8 | 0 | 0.000 | 1.000 | 0.29 | 0 |
| small-label | balanced | 8 | 0 | 0.000 | 1.000 | 0.46 | 0 |
| small-label | accurate | 8 | 0 | 0.003 | 0.875 | 0.57 | 0 |

## Por dificultad

| Grupo | Modo | Archivos | Errores | CER | Ids exactos | s medio | 2das pasadas |
|---|---|---|---|---|---|---|---|
| clean | fast | 70 | 0 | 0.001 | 0.977 | 0.31 | 0 |
| clean | balanced | 70 | 0 | 0.001 | 0.977 | 0.50 | 0 |
| clean | accurate | 70 | 0 | 0.000 | 0.989 | 0.57 | 2 |
| hard | fast | 45 | 0 | 0.276 | 0.533 | 0.40 | 0 |
| hard | balanced | 45 | 0 | 0.212 | 0.644 | 0.89 | 21 |
| hard | accurate | 45 | 0 | 0.203 | 0.733 | 1.26 | 30 |
| moderate | fast | 37 | 0 | 0.246 | 0.698 | 1.02 | 0 |
| moderate | balanced | 37 | 0 | 0.020 | 0.953 | 1.86 | 0 |
| moderate | accurate | 37 | 0 | 0.021 | 0.977 | 2.07 | 5 |
