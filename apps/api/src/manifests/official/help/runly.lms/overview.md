---
title: Aprendizaje
summary: Cursos internos con videos, documentos y textos, asignación al personal con fecha límite, avance por lección, un reproductor a pantalla completa y certificados verificables.
---
Aprendizaje sirve para capacitar a tu equipo: inducción de personal nuevo, cursos obligatorios, procedimientos y cualquier contenido que quieras que la gente tome y termine.

### Cómo se organiza

- **Mis cursos**: los cursos que te asignaron o en los que te inscribiste, con tu avance y la fecha límite; los cursos que ya terminaste, y el catálogo de cursos con inscripción libre.
- **Cursos**: la lista de cursos de la empresa para quienes los preparan, con su estado (borrador, publicado o archivado), número de lecciones y alumnos.
- **Certificados**: las plantillas de certificado que se entregan al terminar un curso.

### Crear un curso

Con **Nuevo curso** escribes el título, un resumen, la categoría y el nivel. El curso se crea como **borrador** y se abre en el editor, que tiene tres pestañas:

- **Contenido**: secciones y lecciones. Puedes cambiar el orden de las lecciones y moverlas entre secciones.
- **Configuración**: título, descripción, portada, nivel, duración estimada y dos opciones: **Orden secuencial** (una lección se desbloquea al terminar las obligatorias anteriores) e **Inscripción libre** (el curso aparece en el catálogo para que cualquiera se inscriba).
- **Alumnos**: a quién está asignado el curso, su avance, su estado y la fecha límite.

Para que los alumnos lo vean, **publica** el curso. Un curso necesita al menos una lección para publicarse. **Archivar** retira el curso del catálogo; quienes ya estaban inscritos pueden seguir consultándolo, pero ya no registra avance.

### Tipos de lección

- **Video**: subes un archivo de video de hasta 50 MB. El reproductor recuerda en qué minuto te quedaste.
- **Enlace de video**: un video de YouTube o Vimeo (puede ser no listado). Úsalo para videos de más de 50 MB.
- **Texto**: contenido escrito con formato.
- **Archivo**: un documento para descargar, como un PDF o una presentación.

- **Examen**: preguntas que el alumno responde y se califican (ver Exámenes).
- **Tarea**: una actividad que el alumno entrega como texto o archivos y alguien revisa (ver Tareas).

Cada lección puede ser **obligatoria** u opcional. El avance del curso solo cuenta las lecciones obligatorias.

### Exámenes

En una lección de tipo **Examen** configuras la calificación mínima para aprobar (70 % de forma predeterminada), el número de intentos (o ilimitados), un límite de tiempo opcional, cuántas preguntas tomar al azar en cada intento, si se mezclan las preguntas y las opciones, y cuándo ve el alumno las respuestas correctas: nunca, al enviar o solo al aprobar. Con **Editar preguntas** agregas preguntas de opción única, opción múltiple, verdadero o falso y respuesta abierta, cada una con sus puntos y una explicación opcional.

- Las respuestas se guardan solas mientras el alumno contesta. Si el examen tiene tiempo, al terminarse se envía con lo que tenga guardado.
- Opción única y verdadero o falso dan los puntos completos si la respuesta es correcta. Opción múltiple solo da puntos si se marcan exactamente las opciones correctas.
- Las respuestas abiertas las califica una persona desde **Revisión**; mientras tanto la lección queda **En revisión**.
- Al aprobar, la lección se completa y ya no se pierde. Si se acaban los intentos sin aprobar, la lección queda **No aprobada**; desde la pestaña **Alumnos** del curso se puede **Otorgar intento extra**.

### Tareas

En una lección de tipo **Tarea** escribes las instrucciones y eliges si se entrega como texto, archivos o ambos, el máximo de archivos (hasta 10, de 50 MB cada uno), los días para entregar desde la inscripción y, si quieres, una calificación mínima. El alumno envía su entrega y la lección queda **En revisión**. Las entregas fuera de plazo se aceptan y se marcan como tardías. Si la entrega se **devuelve**, el alumno puede enviar una nueva; si se **aprueba**, la lección se completa. Cuando la tarea tiene calificación mínima, aprobar exige una calificación igual o mayor.

### Revisión

**Revisión** muestra, de la más antigua a la más reciente, las entregas de tareas y los exámenes con respuestas abiertas que esperan calificación; puedes filtrar por curso. Al calificar, el alumno recibe una notificación, y quien creó el curso recibe otra cada vez que llega algo por revisar.

### Preguntas

Debajo de cada lección, la pestaña **Preguntas** permite que los alumnos inscritos pregunten sobre esa lección y que otros respondan. Las respuestas de quienes administran cursos o califican llevan la marca **Instructor**. Cada quien puede editar o eliminar sus comentarios; si una pregunta eliminada ya tenía respuestas, se muestra como "Comentario eliminado" y conserva sus respuestas. Los instructores pueden **fijar** una pregunta para que aparezca primero y **marcarla como resuelta**; quien hizo la pregunta también puede marcarla como resuelta. Quien administra cursos puede eliminar cualquier comentario. Al llegar una pregunta nueva, quien creó el curso recibe una notificación, y al responder se avisa a quien preguntó y a quienes ya habían respondido. Un alumno dado de baja solo puede consultar sus propias preguntas.

### Reseñas

Un alumno puede calificar el curso con 1 a 5 estrellas y un comentario opcional cuando lleva al menos 30 % de avance o ya lo terminó. Hay una reseña por alumno y curso, y se puede editar. La calificación promedio y el número de reseñas aparecen en el catálogo y en el curso. Desde la pestaña **Reseñas** del editor, quien administra cursos puede **ocultar** una reseña (deja de contar en el promedio y solo la ven los administradores) y **responderla**; el alumno recibe una notificación con la respuesta.

### Anuncios

En la pestaña **Anuncios** del editor, quien administra cursos publica avisos para los alumnos, como cambios de fechas o material nuevo. Los anuncios se muestran del más reciente al más antiguo en la pestaña **Anuncios** del reproductor, y cada alumno activo recibe una notificación cuando se publica uno en un curso publicado.

### Avance y finalización

Un video se marca como completado al llegar al 90 % de su duración. Las lecciones de texto, archivo o enlace sin duración se completan con **Marcar como completada**. Cuando el alumno termina todas las lecciones obligatorias, el curso queda **completado** con su fecha. Si después agregas lecciones, los cursos ya completados no se reabren.

### Certificados

En **Certificados** creas plantillas con un título, un texto, quién firma (nombre, cargo y una imagen de la firma en PNG o JPEG), un color y si se muestra el logotipo de la empresa. El texto admite estos campos, que se reemplazan al generar el certificado: `{{alumno}}`, `{{curso}}`, `{{fecha}}`, `{{horas}}`, `{{folio}}` y `{{empresa}}`. La vista previa muestra el PDF con datos de ejemplo.

- En la pestaña **Configuración** del curso eliges la plantilla en **Certificado**. Sin plantilla, el curso no entrega certificado.
- Cuando un alumno completa el curso, el certificado se emite solo, con un folio por año (por ejemplo 2026-000123). El nombre del alumno, el título del curso y las horas quedan fijos al emitirse; editarlos después no cambia los certificados ya emitidos.
- Las horas salen de la duración estimada del curso o, si no tiene, de la suma de la duración de sus lecciones, redondeadas a media hora.
- En la pestaña **Alumnos** ves el folio de cada certificado, lo descargas, lo **revocas** con un motivo o lo **emites** cuando falta (por ejemplo, si la plantilla se eligió después de que el alumno terminara). Volver a emitir crea un folio nuevo.
- Cada alumno descarga sus certificados desde **Mis cursos** y al terminar el curso en el reproductor.
- El PDF incluye un código QR que abre una página pública de verificación, sin iniciar sesión, con el folio, el nombre, el curso, la fecha y si el certificado es válido o fue revocado. Un certificado revocado sigue apareciendo, marcado como **Revocado**.
- Una plantilla que algún curso usa no se puede desactivar; primero quítala de esos cursos.

### Lecciones gratis y video de presentación

- En **Contenido**, el botón de regalo de cada sección la marca como **Gratis**. En el editor de una lección, **Vista previa gratis (sin inscripción)** hace lo mismo con una sola lección.
- Cualquier persona con acceso a Aprendizaje abre esas lecciones desde la página de un curso publicado sin inscribirse. Las ve en **vista previa gratuita**: no se guarda avance y no hay preguntas, recursos ni anuncios. Los exámenes y las tareas siempre piden inscripción.
- En **Configuración**, **Video de presentación** elige una lección de video o enlace que sea gratis o vista previa. Se muestra arriba en la página del curso; el botón de modo cine lo agranda y la elección se recuerda en tu navegador. Verlo no cuenta como avance.

### Compartir con personas externas

**Compartir**, en el encabezado del editor del curso, crea un enlace público para personas sin cuenta en Runly. Solo escriben su nombre (el correo es opcional) y entran a un reproductor reducido.

- **Qué se comparte:** todo el curso, o solo las lecciones en vista previa y las de secciones gratis. Las tareas nunca se comparten.
- **Permitir exámenes:** los invitados presentan los exámenes compartidos; las respuestas abiertas llegan a **Revisión** con su nombre.
- **Emitir certificado al completar:** requiere que el curso tenga plantilla. El certificado lleva el nombre que escribió el invitado y se descarga al terminar.
- Los invitados no tienen preguntas, reseñas, anuncios ni recursos descargables. Su avance se guarda en su navegador; **No soy…** empieza de nuevo con otro nombre.
- En **Alumnos** aparecen con la etiqueta **Invitado** y puedes darlos de baja.
- Desactivar el enlace o usar **Generar nuevo enlace** corta de inmediato el acceso de quien tenga el anterior.

### Asignar cursos

En la pestaña **Alumnos**, **Asignar** permite elegir varios usuarios de la empresa y, si quieres, una fecha límite. Un curso asignado aparece en **Mis cursos** de cada persona. Si la fecha límite pasa sin terminarlo, el curso se marca como **Vencido**. Puedes cambiar la fecha, dar de baja a un alumno o reactivarlo; al reactivarlo conserva su avance.

### Permisos

- **Acceder a Aprendizaje**: ver Mis cursos, el catálogo y tomar los cursos.
- **Administrar cursos**: crear, editar, publicar y archivar cursos, ver la vista previa de cualquier curso y administrar las plantillas de certificado.
- **Asignar cursos y ver avance**: asignar cursos, cambiar fechas límite, dar de baja, ver el avance de cada alumno y emitir o revocar certificados.
- **Calificar actividades y tareas**: abrir Revisión, calificar exámenes y tareas, y otorgar intentos extra.
