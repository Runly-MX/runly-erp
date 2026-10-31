---
title: Automatizaciones
summary: Flujos que se ponen en marcha solos; reciben un aviso, esperan, deciden, avisan y crean cosas en otros módulos.
---
Automatizaciones es un módulo propio, con su menú y sus permisos, que junta en un solo lugar los flujos de tu empresa (los módulos creados con el Constructor tienen además sus propias automatizaciones dentro del módulo). Cada flujo empieza con un disparador y sigue con bloques que se ejecutan en orden.

- **Disparadores**: un evento de otro módulo (por ejemplo, "se aprobó una orden"), un horario (cada hora, día, semana o mes), un webhook (una dirección secreta a la que otro sistema puede enviar datos) o **una fecha de un registro**: unos días antes o después de que venza una factura, una tarea o una póliza, de la entrega esperada de una orden o del aniversario de ingreso de un colaborador.
- **Bloques**: crear o actualizar contactos, notificar a personas, enviar correos, generar un reporte en CSV o Excel y guardarlo en Archivos, agendar eventos, consultar un registro (por ejemplo, el nombre y correo del responsable), pedir una aprobación, esperar minutos, horas o días, o llamar a otro sistema por HTTPS.
- **Para cada uno**: busca registros (artículos, contactos, colaboradores o vehículos), se queda con los que cumplen una condición y repite hasta 3 acciones con cada uno.
- **Condiciones Sí / No**: una condición divide el flujo en dos caminos que se juntan después.
- **Datos entre bloques**: lo que devuelve un bloque (por ejemplo, el identificador de un reporte) lo pueden usar los bloques que siguen. A quién avisar también puede salir de los datos, como el responsable de una tarea.
- **Notificaciones con enlace**: «Abrir el registro que activó la automatización» lleva a la pantalla de ese registro.

### Cómo se usa

1. Entra a Automatizaciones y elige **Nueva automatización**; parte de una plantilla o de cero.
2. En el lienzo, arrastra bloques desde la paleta o usa el "+" de cada flecha. Haz clic en un bloque para configurarlo.
3. Usa **Probar** para ver qué haría con datos de ejemplo, y **Guardar** cuando esté lista.
4. En **Consola** ves cada ejecución: qué datos llegaron, qué envió cada bloque, qué devolvió y, si falló, el error completo. En el teléfono la consola y cada bloque se abren en una hoja a casi toda la pantalla.

### Llamadas, chats y vacaciones

- **Minuta de videollamadas**: «Transcribir cada llamada grabada» pide la transcripción al terminar la grabación, y «Minuta de videollamada a los participantes» escribe la minuta cuando la transcripción está lista y la manda por correo, con el PDF, a cada participante con correo, de la empresa o externo. Si quieres que solo la reciba tu equipo, en «Para cada uno» elige *solo de la empresa*.
- **Sin MirAI** la minuta se escribe igual, sin IA: fecha, duración, participantes, las frases que parecen acuerdos o pendientes y la transcripción completa por persona. La transcripción no depende de MirAI.
- **Chat del sitio web**: «Contestar en automático en el chat del sitio web» da la bienvenida al primer mensaje de cada visitante. Con las condiciones *Hora local* y *Día de la semana* puedes contestar solo fuera de horario.
- **Vacaciones**: «Respuesta automática de vacaciones» contesta a quien te escriba por mensaje directo, una vez al día por conversación. En **Cuándo está activa** eliges desde y hasta qué día, y en la condición, a la persona que se va de vacaciones. El mensaje que recibió nunca se guarda en la automatización.

### Si algo falla

- Si otro módulo o sistema no responde, la automatización **se reintenta sola** desde el bloque que falló, hasta 5 veces (a 1, 5, 15 y 60 minutos). En la consola aparece *Reintentando* con la hora del siguiente intento.
- Si el error es de permisos o de datos, se detiene, quien la creó recibe un aviso y en la consola aparece **Reintentar desde el bloque N** para cuando lo corrijas.
- Puedes apagar los reintentos con «Reintentar sola» en el disparador (sección *Si algo falla*).

### Conexiones (a quién hablas y de quién recibes)

El botón **Conexiones**, arriba en la lista y en cada automatización, tiene dos listas que administra quien tiene el permiso de administrar automatizaciones:

- **Recibir**: los orígenes (IP o redes) desde donde se aceptan mensajes de webhook. Vacío acepta a cualquiera que tenga la dirección secreta.
- **Enviar**: los servidores a los que Runly puede llamar con el bloque «Llamar a una URL» y a los que responden los botones de las integraciones del chat. Si un servidor no está en la lista, la llamada falla con un aviso claro. La lista es una sola para toda la instancia.
- En **Enviar** también está la **clave de firma**: con ella tu servidor comprueba que el mensaje viene de Runly (encabezado `X-Runly-Signature`).

### Con MirAI

Con la pestaña de MirAI abierta puedes pedirle, por ejemplo:

- "Qué automatizaciones tengo con errores"
- "Por qué falló la última ejecución de Pedidos de mi tienda"
- "Crea una automatización que cada lunes a las 8 me avise de las vacantes abiertas"
- "Pausa la automatización de pedidos"

MirAI propone y tú confirmas. Las automatizaciones que crea MirAI **quedan en pausa**: revísalas en el lienzo y actívalas tú. Nunca ve ni comparte la dirección secreta de un webhook.

### Quién puede qué

- Las automatizaciones son **de la empresa**, no personales: todas las personas con permiso para verlas ven las mismas, y quien puede administrarlas las crea, edita y borra.
- Las ejecuciones corren en segundo plano a nombre de la empresa, sin una persona conectada; por eso solo ofrecen las acciones que pueden correr así.
- Guardar una automatización autoriza los servicios que usa; si cambias de opinión, quitar el bloque quita la autorización.

### Alcances y límites

- Hasta 50 automatizaciones por empresa y 12 bloques en cada una (las esperas y las condiciones cuentan).
- Hasta 2 esperas, 1 aprobación y 3 condiciones Sí / No por automatización.
- *Para cada uno* procesa hasta 50 resultados; una fecha de un registro corre hasta 200 veces al día.
- Las llamadas HTTP solo van a servidores que un administrador permitió, por HTTPS y sin redirecciones.
- Los reportes incluyen hasta 1000 filas y los correos aceptan un archivo adjunto de hasta 10 MB.
