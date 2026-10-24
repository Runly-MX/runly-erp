# Diagnóstico de escritura manuscrita en Android

Verificación del 24 de octubre de 2026 en un emulador Android API 36,
WebView 133.0.6943.137 y Gboard 15.1.08.726012951-preload-x86_64.
Estos resultados no sustituyen una prueba con S Pen y el teclado Samsung.

## Superficie de escritura de Notas

En una nota nueva, el papel visible medía 991 px CSS de alto y el
`contenteditable` solo 99 px. Un trazo sobre el papel vacío quedaba fuera
del editor. Activar únicamente `installPenInput` no corrigió esa geometría.

Al hacer crecer el contenedor de EditorContent y su `contenteditable`
mediante flex, ambos ocuparon los 991 px del papel. El mismo trazo, lejos
del cursor, produjo texto reconocido. La corrección se limita a la hoja
del editor con desplazamiento; las vistas públicas conservan su geometría.

`scripts/tests/notes-editor-writing-area-browser.test.mjs` comprueba la
superficie editable, zoom y crecimiento de documentos largos.

## Gesto para insertar espacios: pendiente

Se probó una línea vertical entre `hola` y `mundo`, conservando el cursor
al final del texto y midiendo la posición de los caracteres con DOM Range
o la fuente del textarea:

| Control | Resultado observado |
| --- | --- |
| Textarea de una línea | Insertó un espacio |
| Textarea de dos líneas, gesto en la segunda | Insertó un espacio |
| Contenteditable simple de una línea | Insertó un espacio |
| Contenteditable con dos párrafos, sin TipTap ni estilos de Runly | Interpretó el trazo como texto |
| Editor real de Notas | Interpretó el trazo como texto en el cursor |

Los eventos observados no tenían `preventDefault`. Android anunciaba
soporte para INSERT, REMOVE_SPACE y JOIN_OR_SPLIT. No se confirmó una
solución para este gesto ni su comportamiento con el servicio de Samsung.

## Navegación de tres botones

Se activó `com.android.internal.systemui.navbar.threebutton`. El inset
inferior publicado fue 48 px CSS con tamaño de teléfono y 56 px con tamaño
de tablet. En la tablet Android reportó 112 píxeles físicos a densidad 2,
incluido `tappableElement`. La prueba `HostControlsInstrumentedTest`
pasó con este modo, verificando los insets y los íconos en ambos temas.

## Primera conexión a una instancia

La confirmación esperaba a `FirebaseMessaging.deleteToken()` antes de
guardar la primera instancia. Se reprodujo el bloqueo después de que la
verificación de la instancia terminara correctamente. La primera conexión
ya omite esa eliminación: no existe una instancia anterior que revocar.
El cambio entre instancias existentes conserva la rotación del token.
Con el APK corregido se pudo agregar la instancia y acceder al sistema.

## Carga de notas en la instancia de pruebas

Después de recargar, `GET /notes` devolvió HTTP 500 con PostgreSQL 42803:
`a.parent_note_id` faltaba en la agrupación. La consulta del checkout ya
incluye `a.parent_note_id` y `a.child_count` en el `GROUP BY`; no se cambió
SQL ni se ejecutaron cambios en la base de datos. Este despliegue de API
debe actualizarse antes de completar la verificación de persistencia.

## Distribución de los cambios

Los cambios de Kotlin requieren un APK nuevo. `installPenInput` y los
ajustes de la superficie de Notas requieren actualizar también el bundle
web de la instancia. Instalar únicamente el APK no actualiza ese código.
Las pruebas en la instancia usaron inyecciones temporales de diagnóstico;
no se realizó un despliegue web.
