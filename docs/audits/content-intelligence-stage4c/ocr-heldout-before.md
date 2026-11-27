# OCR corpus standard (seed 20270105, 160 files, synthetic=True)

| Modo | Archivos | Errores | CER | WER | Ids exactos | Recall busqueda | Precision busqueda | s medio | s p95 | RSS max MiB | 2das pasadas |
|---|---|---|---|---|---|---|---|---|---|---|---|
| fast | 144 | 8 | 0.169 | 0.208 | 0.774 | 0.719 | 0.714 | 0.49 | 1.29 | 126 | 0 |
| balanced | 144 | 8 | 0.106 | 0.195 | 0.839 | 0.781 | 0.714 | 0.89 | 2.35 | 137 | 13 |
| accurate | 144 | 8 | 0.098 | 0.194 | 0.810 | 0.750 | 0.706 | 1.07 | 2.53 | 137 | 37 |

## Por tipo

| Grupo | Modo | Archivos | Errores | CER | Ids exactos | s medio | 2das pasadas |
|---|---|---|---|---|---|---|---|
| device-label | fast | 32 | 0 | 0.275 | 0.594 | 0.45 | 0 |
| device-label | balanced | 32 | 0 | 0.169 | 0.781 | 0.78 | 4 |
| device-label | accurate | 32 | 0 | 0.160 | 0.688 | 1.14 | 17 |
| glare-shadow | fast | 8 | 0 | 0.445 | 0.250 | 0.39 | 0 |
| glare-shadow | balanced | 8 | 0 | 0.437 | 0.250 | 0.82 | 3 |
| glare-shadow | accurate | 8 | 0 | 0.402 | 0.250 | 1.13 | 7 |
| heic-photo | fast | 0 | 8 | - | 0.000 | - | 0 |
| heic-photo | balanced | 0 | 8 | - | 0.000 | - | 0 |
| heic-photo | accurate | 0 | 8 | - | 0.000 | - | 0 |
| invoice | fast | 8 | 0 | 0.074 | 0.875 | 0.45 | 0 |
| invoice | balanced | 8 | 0 | 0.074 | 0.875 | 0.79 | 1 |
| invoice | accurate | 8 | 0 | 0.076 | 0.750 | 0.91 | 1 |
| office | fast | 32 | 0 | 0.100 | 0.833 | 0.03 | 0 |
| office | balanced | 32 | 0 | 0.100 | 0.833 | 0.03 | 0 |
| office | accurate | 32 | 0 | 0.100 | 0.833 | 0.03 | 0 |
| pdf-digital | fast | 8 | 0 | 0.000 | 1.000 | 0.12 | 0 |
| pdf-digital | balanced | 8 | 0 | 0.000 | 1.000 | 0.13 | 0 |
| pdf-digital | accurate | 8 | 0 | 0.000 | 1.000 | 0.15 | 0 |
| pdf-hybrid | fast | 8 | 0 | 0.000 | 1.000 | 1.25 | 0 |
| pdf-hybrid | balanced | 8 | 0 | 0.000 | 1.000 | 2.26 | 0 |
| pdf-hybrid | accurate | 8 | 0 | 0.002 | 1.000 | 2.45 | 1 |
| pdf-rotated | fast | 16 | 0 | 0.455 | 0.500 | 1.24 | 0 |
| pdf-rotated | balanced | 16 | 0 | 0.000 | 1.000 | 2.33 | 0 |
| pdf-rotated | accurate | 16 | 0 | 0.000 | 1.000 | 2.53 | 2 |
| pdf-scanned | fast | 8 | 0 | 0.095 | 1.000 | 1.27 | 0 |
| pdf-scanned | balanced | 8 | 0 | 0.095 | 1.000 | 2.30 | 0 |
| pdf-scanned | accurate | 8 | 0 | 0.100 | 1.000 | 2.60 | 2 |
| perspective-label | fast | 8 | 0 | 0.008 | 0.875 | 0.28 | 0 |
| perspective-label | balanced | 8 | 0 | 0.108 | 0.625 | 0.76 | 4 |
| perspective-label | accurate | 8 | 0 | 0.033 | 0.625 | 0.91 | 4 |
| screenshot | fast | 8 | 0 | 0.000 | 1.000 | 0.40 | 0 |
| screenshot | balanced | 8 | 0 | 0.000 | 1.000 | 0.64 | 0 |
| screenshot | accurate | 8 | 0 | 0.000 | 1.000 | 0.81 | 1 |
| small-label | fast | 8 | 0 | 0.000 | 1.000 | 0.29 | 0 |
| small-label | balanced | 8 | 0 | 0.120 | 0.875 | 0.47 | 1 |
| small-label | accurate | 8 | 0 | 0.110 | 0.875 | 0.60 | 2 |

## Por dificultad

| Grupo | Modo | Archivos | Errores | CER | Ids exactos | s medio | 2das pasadas |
|---|---|---|---|---|---|---|---|
| clean | fast | 64 | 4 | 0.051 | 0.887 | 0.29 | 0 |
| clean | balanced | 64 | 4 | 0.051 | 0.887 | 0.47 | 0 |
| clean | accurate | 64 | 4 | 0.053 | 0.875 | 0.56 | 5 |
| hard | fast | 46 | 0 | 0.269 | 0.587 | 0.38 | 0 |
| hard | balanced | 46 | 0 | 0.232 | 0.652 | 0.75 | 12 |
| hard | accurate | 46 | 0 | 0.201 | 0.630 | 1.04 | 26 |
| moderate | fast | 34 | 4 | 0.254 | 0.762 | 1.01 | 0 |
| moderate | balanced | 34 | 4 | 0.040 | 0.952 | 1.86 | 1 |
| moderate | accurate | 34 | 4 | 0.043 | 0.881 | 2.07 | 6 |
