# Studio — evaluación local de quitar fondo

## Resultado

Se ejecutó segmentación real de una ilustración sintética local de 768 × 768 con
BiRefNet Lite ONNX y se produjeron una máscara y un PNG de cuatro canales. La
verificación confirmó alfa 0…255, original intacto y cancelación durante la carga
en 288 ms. No se enviaron fotos a proveedores ni se escribieron archivos en Files.

El resultado no habilita una función productiva: la inferencia CPU tardó 12.30 s
con dos hilos y el proceso alcanzó 5443116 KiB de RSS máximo (aprox. 5.2 GiB).
La medición incluye memoria nativa y carga del modelo. Se deshabilitaron los
arenas de memoria y se usó optimización básica; aun así el coste es alto.

Los artefactos locales están en `.artifacts/studio/bg-prototype/`: original,
`alpha.png`, `transparent.png`, métricas y verificación. Son datos de prueba
ignorados por Git. El modelo y el runtime tampoco forman parte del bundle,
Docker productivo, dependencias del monorepo ni arranque de Runly.

También se procesó el retrato de prueba de NASA `astronaut` (512 × 512),
identificado como dominio público en la
[documentación del dataset](https://scikit-image.org/docs/0.25.x/api/skimage.data.html#skimage.data.astronaut).
Se descargó del [tag v0.25.2](https://github.com/scikit-image/scikit-image/blob/v0.25.2/skimage/data/astronaut.png),
SHA-256 `88431cd9653ccd539741b555fb0a46b61558b301d4110412b5bc28b5e3ea6cb5`.
La inferencia tardó 15.75 s y el RSS máximo fue 5447788 KiB. El original permaneció
intacto; `astronaut-comparison.png` compara original y recorte sobre blanco.

## Licencias y alternativas

| Opción | Código/pesos | Evaluación |
| --- | --- | --- |
| rembg | Código MIT; pesos según modelo | Su licencia no autoriza automáticamente todos sus modelos. Es una envoltura posible, no una validación de pesos. |
| BRIA RMBG 1.4 | Pesos con licencia no comercial | Descartado para distribución comercial sin un acuerdo adicional. |
| BiRefNet Lite, ONNX | Modelo publicado MIT; conversión ONNX MIT; runtime MIT | Candidato del prototipo; requiere avisos de licencia y evaluación de calidad/recursos antes de distribuirlo. |
| ONNX en cliente | Mismos pesos; runtime web independiente | No medido. El consumo CPU/RAM observado desaconseja asumir soporte móvil o descargarlo por defecto. |
| Servicio local opcional | Proceso aislado y cuotas propias | Alternativa preferible para continuar: imagen/worker opcional, memoria nativa acotada y cancelación de proceso. No se implementó endpoint productivo. |
| Máscaras geométricas manuales | Motor propio, sin modelo | Disponibles como recorte no destructivo; no segmentan automáticamente cabello o bordes complejos. |

Fuentes primarias: [rembg](https://github.com/danielgatis/rembg),
[licencia RMBG 1.4](https://huggingface.co/briaai/RMBG-1.4),
[modelo original BiRefNet Lite](https://huggingface.co/ZhengPeng7/BiRefNet_lite),
[conversión ONNX](https://huggingface.co/onnx-community/BiRefNet_lite-ONNX),
[código BiRefNet](https://github.com/ZhengPeng7/BiRefNet/blob/main/LICENSE) y
[ONNX Runtime](https://github.com/microsoft/onnxruntime/blob/main/LICENSE).

Se verificó la licencia declarada por el publicador del modelo por separado de
la licencia del runtime. Esto no demuestra calidad ni garantías sobre todas las
imágenes del entrenamiento. No se incorporaron dependencias AGPL ni modelos
declarados no comerciales.

## Prototipo reproducible

El script requiere instalación explícita fuera del monorepo, en un directorio
ignorado. Usa `onnxruntime-node@1.23.2`; Sharp se reutiliza desde el API. Los pesos
revisados son `onnx/model.onnx`, 224005088 bytes, SHA-256:

`5600024376f572a557870a5eb0afb1e5961636bef4e1e22132025467d0f03333`

El script solo abre un modelo local con ese hash. La descarga manual desde el
publicador se realizó para la prueba; el script no contiene descarga automática.
El modelo FP16 publicado ocupa 114538221 bytes, pero no se probó y no se le
atribuyen mejoras de tiempo, memoria ni calidad.

Después de preparar runtime y modelo en `.artifacts/studio/bg-prototype/`:

```sh
node scripts/run-studio-background-prototype.mjs
node scripts/run-studio-background-prototype.mjs --input=imagen-de-prueba.png
```

Procesa fuera del hilo principal mediante un worker, CPU con dos hilos, entrada
PNG/JPG/WebP de hasta 10 MiB, 25 MP y 8192 px por lado. Produce el alfa a 1024² y
lo interpola a la resolución de entrada, multiplicándolo por su alfa original.
No cambia el archivo fuente. El límite JS de 512 MiB **no limita la memoria nativa
de ONNX**: este es el bloqueo concreto para integrarlo sin aislamiento adicional.

El contrato opcional del prototipo recibe `AbortSignal` y progreso y devuelve
los buffers para revisión. No tiene acceso a Storage. Una futura integración
deberá guardar mediante `saveImageCopy` únicamente tras confirmar y revalidar
permisos. No se expone una acción que aparente quitar fondo en producción.

## Calidad y siguiente paso

La ilustración sintética prueba inferencia, alfa, conservación del original y
cancelación. En el retrato real, la inspección visual muestra conservación del
contorno principal y del cabello corto, pero el modelo elimina el casco negro
que sostiene la persona: es un fallo importante de selección de objeto. Una
sola imagen no valida cabello largo, transparencias, fotos de producto ni bordes
difíciles. Falta un conjunto local de fotografías con licencia verificada,
métricas de calidad, ensayo FP16/otros modelos comerciales aptos y un proceso con
límite real de RAM/CPU. Ese trabajo puede hacerse completamente en local.
