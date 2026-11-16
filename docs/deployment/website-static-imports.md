# Importar sitios y plantillas ZIP

En **Sitio web > Importar ZIP**, **Sitio HTML, CSS y JavaScript** publica la
exportación en los subdominios de la instalación. No requiere otro dominio:
el JavaScript corre en una sandbox del navegador, sin permiso de mismo origen.
**Plantilla HTML y CSS (sin JavaScript)** sigue disponible como modo sin scripts.

## Configuración

```dotenv
RUNLY_APP_URL=https://erp.example.com
RUNLY_WEBSITE_NAMESPACE_ROOT=sites.example.com
```

La instalación debe controlar exclusivamente el namespace, tener DNS y TLS para
`*.sites.example.com` y dirigir esas solicitudes al contenedor web conservando
`Host`. Reserva una dirección desde **Dominios** antes de activar la versión.
La raíz del namespace no puede ser el host administrativo ni un dominio padre
del mismo. Se exige HTTPS.

El cambio requiere actualizar las imágenes de API y web; rellenar variables en
una versión anterior no añade esta modalidad. No necesita nuevas migraciones.

## Contenido y publicación

El ZIP debe contener `index.html` en la raíz o dentro de una única carpeta. Puede
incluir HTML, CSS, JavaScript, imágenes, fuentes y medios locales. También se
admiten README y documentación Markdown, licencias sin extensión, JSON, CSV,
mapas de código (.map) y fuentes OTF. PDF y XML se entregan como descargas en
ambos modos del namespace, incluidos sus aliases e históricos; no se incrustan.
Todo archivo incluido es público: revisa los mapas de código y documentación
para no publicar información privada. Se mantienen
los límites de tamaño, expansión, rutas, integridad y referencias del importador.
Los archivos se validan en privado, se prepara una versión y luego se activa.
Los assets que cambian deben usar nombres nuevos para conservar los históricos.

En **Plantilla HTML y CSS** se rechazan archivos JavaScript, WASM, documentos incrustados, eventos como
`onclick`, enlaces ejecutables, SVG activo y otros tipos no permitidos. El HTML
se analiza con un parser, incluidos templates y noscript; la validación tiene
presupuesto de tiempo y memoria. No se elimina código para hacer pasar un ZIP.

En ese modo, las respuestas públicas, incluidos assets e históricos, aplican una CSP con
scripts, conexiones, formularios, workers y frames deshabilitados, además de
sandbox sin permiso de scripts. Los formularios incluidos se muestran, pero no
envían datos. Las interacciones que dependan de JavaScript no están disponibles.

Una exportación HTML/CSS de Atlas Web Builder puede publicarse si cumple esta
política. No se convierte en bloques editables de Páginas ni se garantiza la
compatibilidad de cualquier exportación del builder.

## JavaScript en el namespace

El modo predeterminado **Sitio HTML, CSS y JavaScript** admite scripts locales,
incluidos módulos y eventos, para menús, animaciones e interacciones del DOM.
La CSP usa `sandbox allow-scripts allow-downloads`, sin `allow-same-origin`:
la página tiene origen opaco y no accede a cookies ni almacenamiento. Los módulos
y fuentes públicos se sirven con CORS sin credenciales para que puedan cargarse.
La sandbox y los encabezados se conservan en los assets históricos y URLs con hash.

No se permiten fetch/XHR, llamadas a APIs, envío de formularios, frames, workers,
popups ni evaluación dinámica. Una SPA que depende de History API,
localStorage, login o llamadas de red puede no funcionar en esta modalidad.
Los enlaces HTML entre páginas sí funcionan. No se reescribe el código del ZIP
para emular APIs o añadir acceso al ERP. Los ZIP históricos no se reclasifican:
hay que volver a importarlos y publicarlos en esta modalidad.

## Sitios con sesión propia y vistas previas

**Sitio con almacenamiento y sesión** conserva la política anterior: requiere
`RUNLY_WEBSITE_CONTENT_ROOT` en un dominio registrable independiente del ERP y
fuera de la marca restringida por el código. Las vistas previas privadas siguen
requiriendo `RUNLY_WEBSITE_PREVIEW_ROOT` aislado, también para HTML/CSS. Sin esa
configuración se puede publicar HTML/CSS, pero no usar la vista previa privada.

Los clientes API pueden enviar `contentMode=static` o `contentMode=sandboxed`
como campo multipart de la importación. Omitirlo conserva el modo aislado
anterior (`isolated`). La acreditación y versión de política correspondiente
se guardan únicamente después de validar los bytes y se copian al
manifest sellado de la versión. Cambiar parámetros de activación no reclasifica
un ZIP antiguo. Los aliases y assets históricos conservan su política original.
