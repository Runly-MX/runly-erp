---
viewKey: /monitors
title: Monitores
summary: Revisa cada pocos minutos que tus sitios, servicios y procesos funcionen, y recibe un aviso cuando algo falle o esté por vencer.
---
Los monitores vigilan tus sitios por ti. Runly los revisa de forma automática y te avisa **cuando un sitio deja de responder, cuando se recupera y cuando un certificado o dominio está por vencer**, sin que tengas que estar mirando. Funcionan igual con sitios que viven en Runly y con sitios hechos en otro lugar, incluso si no tienes acceso a su código.

### Empezar en dos minutos

1. Entra a **Growth > Sitios conectados** y conecta tu sitio con su dominio (por ejemplo `mitienda.mx`). Al abrir **Monitores** verás que ya se crearon dos revisiones: **disponibilidad** y **certificado SSL**.
2. Para vigilar más cosas, pulsa **Detectar y crear**: elige el sitio, escribe su dirección y pulsa **Detectar**. Runly revisa el sitio, reconoce de qué tipo es (Shopify, WooCommerce, WordPress, Wix, Tiendanube, Squarespace, Next.js u otro) y te propone qué vigilar, por ejemplo su página de acceso o su ruta de salud. Marca lo que quieras y pulsa **Crear**.
3. Listo. La tabla muestra el estado de cada monitor, su disponibilidad (24 horas y 30 días), la latencia o los días que faltan para vencer, y cuándo se revisó por última vez.

### Qué puede revisar un monitor

| Tipo | Para qué sirve |
|---|---|
| **Disponibilidad** | Que la página responda y no tarde demasiado. Detecta sitios caídos o con error. |
| **Texto en la página** | Que aparezca (o no aparezca) un texto, por ejemplo «Agregar al carrito». Detecta páginas que cargan pero están rotas. |
| **API o login** | Que una dirección de tu servidor responda bien. Puede validar un campo de la respuesta (por ejemplo `data.ok`) y enviar un encabezado como `Authorization`, que se guarda cifrado y nunca se muestra. |
| **Certificado SSL** | Te avisa antes de que venza el certificado de seguridad del sitio. |
| **Vencimiento del dominio** | Te avisa antes de que venza el registro del dominio. |
| **Puerto o servicio (TCP)** | Que un servicio acepte conexiones, por ejemplo el correo o una base de datos. |
| **Registros DNS** | Que el dominio resuelva y, si quieres, que contenga un valor esperado. |
| **Señal de un proceso** | Para tareas que no tienen página, como un cron o un worker: el proceso avisa a Runly que sigue vivo. |

La frecuencia va de **cada minuto a cada día**. Por defecto es cada 5 minutos, y cada día para el vencimiento del dominio.

### Sitios que no son tuyos o de los que no tienes el código

No necesitas instalar nada. Con solo la dirección, Runly puede revisar que el sitio responda, que el certificado esté vigente, que el dominio no venza y que una página muestre lo que debe. Usa **Detectar y crear** y deja que Runly proponga los monitores.

Lo que **no** puede ver desde afuera: el interior del servidor, procesos internos ni los errores que solo ve un visitante. Para una página de acceso, Runly comprueba que la página cargue; no inicia sesión con credenciales reales.

### Vigilar un proceso interno (cron o worker)

Crea un monitor de tipo **Señal de un proceso**. Runly te muestra una **dirección secreta**: haz que tu proceso la llame cada vez que termine bien. Si deja de llegar la señal durante más tiempo del esperado, el monitor cae y recibes el aviso.

- La ventana de conexión te da la línea lista para un **cron**, un ejemplo en **Node.js** y un **prompt para tu asistente de IA** que agrega la llamada a tu proyecto.
- **Por seguridad, la dirección solo se muestra al crearla.** Si la perdiste, usa **Generar nueva dirección**; la anterior deja de funcionar.

### Errores reales de visitantes (opcional)

Un monitor revisa tu sitio desde Runly, pero un visitante puede encontrar una falla que el monitor no ve (por ejemplo, un inicio de sesión que da error). Para verlas:

1. En **Sitios conectados**, abre **Ver código** del sitio y marca **Avisar de errores reales de los visitantes**.
2. Copia de nuevo el código y pégalo en tu sitio.
3. Los errores del servidor que vean tus visitantes aparecen en **Monitores > Errores reales de visitantes**, agrupados por ruta, con cuántas veces y a cuántos visitantes afectaron.

Qué se guarda y qué no: solo la dirección **sin datos personales** (los números, correos y códigos se reemplazan por `:id`), el tipo de error y la hora. Nunca se leen contraseñas, formularios ni encabezados. Solo se envía si el visitante aceptó el rastreo y respeta la opción «No rastrear» del navegador. Una misma falla se cuenta una vez por minuto, por eso la columna se llama **Reportes**. Esta opción activa también la analítica del sitio.

### Mantenimiento programado

Si vas a actualizar o migrar un sitio, pulsa el botón de la llave inglesa del monitor y elige **1 hora, 4 horas o 24 horas**. Durante ese tiempo Runly no lo revisa ni te avisa. Puedes terminarlo antes en cualquier momento.

### Avisos y qué significa cada estado

- **En línea**: todo bien. **Con advertencia**: responde, pero lento, o algo está por vencer. **Caído**: no funciona. **Sin datos**: aún no hay una revisión o el dato no está disponible.
- Para evitar falsas alarmas, un monitor se considera caído tras **dos fallos seguidos**. Entonces se abre un **incidente** y se avisa dentro de Runly y por correo a los administradores y a quienes pueden gestionar sitios conectados.
- Mientras siga caído, se repite el aviso **cada hora**. Al recuperarse, el incidente se cierra y recibes otro aviso.
- El certificado SSL avisa a los **30, 14, 7, 3 y 1 días** antes de vencer; el dominio, a los **60, 30, 14 y 7**.
- El historial de revisiones se conserva **30 días**. Los incidentes recientes aparecen debajo de la tabla.
- Si el propio servidor de Runly pierde internet y todo falla a la vez, no se envían alertas masivas.

### Página de estado pública

Con **Página de estado** puedes publicar una página que cualquiera con el enlace ve **sin iniciar sesión**, ideal para tus clientes. Muestra el nombre de cada monitor, su estado (operativo, con problemas, sin servicio o en mantenimiento), su disponibilidad de 30 días y los incidentes de ese periodo. **No muestra** direcciones, errores técnicos ni datos internos.

- Elige el sitio, ponle un título y marca **Publicar la página**. Copia el enlace con **Copiar**.
- Los **nombres de tus monitores serán públicos**: revísalos antes de compartir el enlace.
- **Generar enlace nuevo** invalida el anterior de inmediato. Si desmarcas **Publicar**, la página deja de estar disponible.

### Automatiza los avisos

Estos eventos están disponibles en **Automatizaciones** para crear tus propios flujos (avisar por chat o a otro sistema, crear una tarea de renovación, etc.):

- **Un sitio o servicio monitoreado dejó de responder**
- **Un sitio o servicio monitoreado se recuperó**
- **Un certificado SSL o dominio está por vencer**

Cada uno trae el nombre del monitor, el sitio, el tipo, el detalle del error y los días que faltan.

### Pregúntale a MirAI

Puedes preguntar «¿cómo están mis sitios?» o «¿hay algún incidente abierto?». MirAI te dice cuántos monitores están en línea, cuáles fallan y los incidentes recientes. Solo consulta; no cambia nada.

### Límites a tener en cuenta

- Las revisiones se hacen desde **un solo punto** (el servidor de Runly). No indican si un sitio falla solo en una región.
- Solo se revisan **direcciones públicas**; no se puede vigilar un servidor dentro de una red privada.
- Algunos registros de dominio, como los **`.mx`**, no publican su fecha de vencimiento: ese monitor muestra **Sin datos**. Anota esa fecha por tu cuenta.
- Los errores reales de visitantes funcionan con el código del sitio de Sitios conectados, no con el paquete npm.

### Permisos

Ver Monitores requiere acceso a Growth. Crear, editar, probar, poner en mantenimiento y publicar la página de estado requiere el permiso **Gestionar sitios conectados**.
