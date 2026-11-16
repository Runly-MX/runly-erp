# Importar plantillas HTML y CSS

En **Sitio web > Importar ZIP**, el tipo **Plantilla HTML y CSS (sin JavaScript)**
permite publicar archivos estáticos en los subdominios de la instalación. No
requiere un dominio registrable separado del ERP.

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
incluir HTML, CSS, imágenes, SVG pasivo, fuentes y medios locales. Se mantienen
los límites de tamaño, expansión, rutas, integridad y referencias del importador.
Los archivos se validan en privado, se prepara una versión y luego se activa.
Los assets que cambian deben usar nombres nuevos para conservar los históricos.

Se rechazan archivos JavaScript, WASM, documentos incrustados, eventos como
`onclick`, enlaces ejecutables, SVG activo y otros tipos no permitidos. El HTML
se analiza con un parser, incluidos templates y noscript; la validación tiene
presupuesto de tiempo y memoria. No se elimina código para hacer pasar un ZIP.

Las respuestas públicas, incluidos assets e históricos, aplican una CSP con
scripts, conexiones, formularios, workers y frames deshabilitados, además de
sandbox sin permiso de scripts. Los formularios incluidos se muestran, pero no
envían datos. Las interacciones que dependan de JavaScript no están disponibles.

Una exportación HTML/CSS de Atlas Web Builder puede publicarse si cumple esta
política. No se convierte en bloques editables de Páginas ni se garantiza la
compatibilidad de cualquier exportación del builder.

## Sitios con JavaScript y vistas previas

**Sitio con JavaScript** conserva la política anterior: requiere
`RUNLY_WEBSITE_CONTENT_ROOT` en un dominio registrable independiente del ERP y
fuera de la marca restringida por el código. Las vistas previas privadas siguen
requiriendo `RUNLY_WEBSITE_PREVIEW_ROOT` aislado, también para HTML/CSS. Sin esa
configuración se puede publicar HTML/CSS, pero no usar la vista previa privada.

Los clientes API pueden enviar `contentMode=static` como campo multipart de la
importación. Omitirlo conserva el modo aislado anterior. La acreditación de
HTML/CSS se guarda únicamente después de validar los bytes y se copia al
manifest sellado de la versión. Cambiar parámetros de activación no reclasifica
un ZIP antiguo. Los aliases y assets históricos conservan su política original.
