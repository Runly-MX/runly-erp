# Reconocimiento reproducible

Doce casos sintéticos, tres modos, 36 extracciones. No son fotografías reales.
Generador: benchmark_corpus.py; ground truth y texto original: corpus.json.
Incluye laptop, switch, AP, CCTV, factura, captura, texto pequeño, franja que
simula reflejo, contraste bajo, inclinación, rotación e imagen sin texto.
CER/WER son promedios por caso (incluida imagen vacía), con espacios normalizados.
Identificadores se comparan sin sustituir caracteres. 1 CPU / 1 GiB, red deshabilitada.
RSS es el máximo de procesos Python/nativo, no suma simultánea del contenedor.

| Modo | CER medio | WER medio | Identificadores exactos | Tiempo total (s) | RSS proceso máx. (KiB) | Segundas pasadas |
|---|---:|---:|---:|---:|---:|---:|
| fast | 11.774% | 12.857% | 16/19 | 5.982 | 73196 | 0 |
| balanced | 0.146% | 1.190% | 18/19 | 10.793 | 73200 | 1 |
| accurate | 0.146% | 1.190% | 19/19 | 13.615 | 82944 | 2 |

Alta precisión recuperó un identificador adicional frente a equilibrado; no mejoró
el CER/WER medio ni la etiqueta canónica y tomó más tiempo. No se presenta como
mejor en todo documento. Equilibrado es la opción inicial conservadora.
Faltan fotografías autorizadas de campo, perspectiva, regiones complejas y
recuperación de todos estos identificadores a través del buscador real.
