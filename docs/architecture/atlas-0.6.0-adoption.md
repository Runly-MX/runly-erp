# Adopción Atlas 0.6.0

Atlas 0.6.0 agrega composición por elementos, contenedores libres/adaptables,
geometría heredada entre escritorio/tableta/móvil y controles del navbar. El pin
exacto se adopta en API, desktop y website-blocks. Page schema 1 no cambia.

El catálogo de edición actual se regenera con el paquete instalado mediante
`node scripts/generate-website-block-catalog.mjs`. El registro de importación
Website acepta 0.6.0 y conserva el catálogo 0.3.5 en un snapshot separado, con su
digest histórico intacto. Las herramientas de corpus y aceptación de ZIP antiguos
usan ese snapshot; no reinterpretan bytes históricos con un catálogo nuevo.

El build público acepta explícitamente 0.6.0. La prueba de navegador construye
el runtime público y SSR reales, hidrata una página sintética y comprueba la
geometría a 1280, 900, 768, 600 y 375 px sin errores. La prueba de catálogos cubre
ZIP antiguo/nuevo, conversión de secciones, normalización y paridad con el Hub.
El build web del ERP y las pruebas dirigidas de importación/preparación pasaron.

No se cambia la identidad ni se vuelve a publicar el conjunto compartido privado:
el Hub conserva sus paquetes verificados y actualiza Atlas mediante su override
exacto. El catálogo nuevo se transporta al validador aislado desde el host.

Los despliegues de ERP y Hub corresponden al operador. No se ejecutan migraciones
de datos para esta adopción ni se editan plantillas reales como fixtures. El
paquete y los catálogos actualizados no equivalen a un servicio remoto desplegado.
El control general de privacidad mantiene 16 hallazgos previos ajenos a este cambio;
los archivos de esta adopción se revisan de forma separada.
