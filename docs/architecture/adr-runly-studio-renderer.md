# ADR: Fabric especializado para Runly Studio

Estado: aceptado para la primera vertical, 2026-10-25. Revisión base: f60c8ed81d88b72947af6cc3b8f4930b81d37fe6.

## Contexto

Canvas2DRenderer es adecuado para diagramas, hotspots y pisos POS. Extenderlo hasta composición gráfica profesional implicaría mantener controles y edición tipográfica adicionales, además de adaptar la exportación desde límites de objetos a páginas fijas. Se requieren texto editable, imágenes originales, transformaciones y reapertura fiel con un contrato propio.

Se revisaron el paquete Fabric 6.9.1 instalado para el spike, sus exports/licencia MIT y la implementación previa de Canvas Social. La documentación oficial distingue objetos y propiedades de aplicación: [introducción](https://www.fabricjs.com/docs/) y [propiedades personalizadas](https://www.fabricjs.com/docs/using-custom-properties/). La versión exacta limita el cambio al API contrastado; no se migra automáticamente al major actual ni se reutiliza Appwrite.

## Experimento reproducible

`node scripts/verify-studio-browser.mjs` ejecuta Chrome headless, inserta texto, rectángulo, elipse e imagen, modifica texto y transformaciones, serializa el contrato Runly, destruye el canvas y lo reabre. Comprueba igualdad del documento y PNG de 640 × 480, incluyendo píxeles del original.

El mismo script construye escenas de 20, 200 y 500 objetos (rectángulos, elipses y texto), con la misma posición/tamaño/color para ambos motores. La traducción al renderer técnico es un adapter del fixture. No interviene React en esas medidas.

Muestra exploratoria de una ejecución local, en milisegundos:

| Objetos | Fabric: construir editor | Fabric: render+PNG | Canvas2D: render | Canvas2D: codificar PNG |
| --- | ---: | ---: | ---: | ---: |
| 20 | 3.9 | 24.1 | 3.0 | 9.9 |
| 200 | 10.9 | 67.2 | 1.3 | 9.2 |
| 500 | 19.6 | 132.7 | 1.2 | 11.8 |

Las columnas miden operaciones distintas y no se suman como benchmark de apertura equivalente: Fabric incluye construir controles/objetos; Canvas2D dibuja una escena ya preparada. No son percentiles, presupuestos definitivos ni medidas de FPS, memoria o latencia de red. El renderer técnico resulta más ligero para dibujo simple; Fabric se elige por su edición especializada. El fixture conjunto pesa alrededor de 1.22 MB porque incluye ambos motores y sus dependencias, y no representa el incremento de producción. El build de la vertical produjo un chunk lazy StudioScreen de aproximadamente 305 kB, 94 kB gzip.

## Comparación de escenarios

| Escenario | Canvas2D existente | Fabric especializado |
| --- | --- | --- |
| Dibujo técnico y rendimiento simple | Implementado y compartido con POS | No ofrece beneficio que justifique migrar Canvas/POS |
| Texto y transformaciones interactivas | Overlay y geometría propios del editor técnico | Textbox editable y controles integrados, probados en la vertical |
| Página fija y PNG | Exportación actual encuadra bounds | Canvas con tamaño de página y exportación completa comprobada |
| Persistencia | Modelo Board/Page/Object | Adaptador explícito a contrato Runly; nunca JSON Fabric como formato único |
| Grupos, SVG, filtros, recortes | Requerirían trabajo específico | Capacidades de la librería por evaluar antes de exponer; no se anuncian en v1 |
| Colaboración | Revisiones y realtime ligados a Board | El renderer no proporciona ACL ni convergencia; siguen siendo responsabilidades de Runly |
| Navegador | Ya integrado en ERP | Solo chunk lazy Studio, sin dependencia inversa |
| Headless | Puede alojarse en navegador | PNG comprobado en Chrome headless; servicio/cola aún no implementados |
| Runtime Node nativo | Requiere canvas compatible | Export fabric/node y dependencias opcionales jsdom/node-canvas; sin validar binarios ni paridad de fuentes en esta entrega |

## Decisión y consecuencias

Mantener motores especializados. Adoptar Fabric únicamente en Studio, detrás del contrato propio versionado. No modificar el renderer actual ni publicar @runly/graphics. El coste del chunk lazy y sus límites se registra y se revisará con escenas reales, imágenes grandes y mediciones repetidas antes de capacidades profesionales.

Se descarta extender Canvas2D en esta vertical porque obligaría a ampliar su responsabilidad de diagramas para obtener herramientas ya disponibles en el editor especializado. Se descarta trasladar el prototipo Canvas Social porque auth, persistencia y colaboración no cumplen los contratos Runly. No se descarta Canvas2D por rendimiento: las medidas favorecen su uso actual.

Pendientes explícitos: memoria, FPS de arrastre, fuentes/emoji y perfiles de imagen entre plataformas, PNG con transparencia, exportación SVG/PDF y render automatizado con límites. La primera vertical usa fondo opaco y sans-serif del navegador.
