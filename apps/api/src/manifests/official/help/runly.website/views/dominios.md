---
viewKey: /domains
title: Dominios
summary: La dirección con la que tus visitantes encuentran el sitio, incluido tu propio dominio.
---
En **Dominios** eliges la dirección de tu sitio. Hay dos formas: una **dirección de Runly** (por ejemplo `mi-negocio.sitios.tuempresa.com`) y, si tu instalación lo tiene habilitado, un **dominio propio** como `www.mitienda.mx`.

### Dirección de Runly

Escribe el nombre que quieres: Runly comprueba al momento si está libre y, si lo está, pulsa **Reservar dirección**. Queda lista enseguida y no necesitas configurar nada. Si la infraestructura todavía se está preparando, la pantalla lo indica y revisa el estado sola cada pocos segundos.

Un sitio importado desde ZIP solo se puede activar cuando tiene una dirección lista; la pantalla de importación te deja elegirla ahí mismo.

### Varias direcciones y la dirección principal

Un sitio puede tener varias direcciones activas (por ejemplo la de Runly y tu dominio propio, o `mitienda.mx` y `www.mitienda.mx`). Todas muestran el mismo sitio publicado. Cuando hay más de una, elige en **Dirección principal** la que quieres que vean visitantes y buscadores: las demás redirigen a ella automáticamente. Si la principal deja de estar activa, cada dirección vuelve a mostrar el sitio.

### Dominio propio: paso a paso

Sirve para dominios que ya compraste en GoDaddy, Namecheap, Cloudflare, Hostinger u otro proveedor, estén donde estén alojados hoy (otro servidor, un hosting o ninguno). Solo necesitas poder editar el **DNS** del dominio, que es el panel donde se administran sus registros.

1. Pulsa **Conectar dominio propio** y escribe el dominio. Usa el nombre exacto con el que quieres que te encuentren: `www.mitienda.mx`, `tienda.mitienda.mx` o `mitienda.mx` (sin subdominio).
2. Runly te muestra **dos registros DNS** con un botón para copiar cada valor.
3. Entra al panel de DNS de tu proveedor (busca «DNS», «Zona DNS» o «Administrar DNS» junto a tu dominio) y crea los dos registros:
   - Un registro **TXT** que demuestra que el dominio es tuyo.
   - Un registro **CNAME**, **A** o **ALIAS** que envía a los visitantes a Runly. Copia el tipo y el valor tal como los muestra la pantalla.
4. Guarda los cambios, espera unos minutos y pulsa **Verificar ahora**. Si todavía no encuentra el registro te lo dice. Los cambios de DNS pueden tardar (a veces horas). Puedes cerrar la ventana y volver con **Instrucciones y verificar**.
5. Cuando el dominio queda **Verificado**, pulsa **Comprobar HTTPS** (ver abajo) y abre tu dirección en el navegador. El sitio debe estar **publicado**.

Qué escribir en el campo «Nombre» o «Host» de tu proveedor:

- Muchos paneles agregan solos el nombre de tu dominio. Para `www.mitienda.mx` suelen pedir el host `_runly-verify.www` y no el nombre completo. Para `mitienda.mx` piden `_runly-verify`.
- Para el registro de envío, `www` o `tienda` representan al subdominio, y `@` representa al dominio sin subdominio.
- Si tu proveedor ya tiene un registro **A** o **CNAME** para ese mismo nombre, **edítalo** en lugar de crear otro: no puede haber dos que se contradigan.

#### Si tu dominio es «sin subdominio» (`mitienda.mx`)

Un dominio sin subdominio no admite CNAME. Usa un registro **A** con la IP que muestra Runly, o un registro **ALIAS/ANAME** si tu proveedor lo ofrece.

#### Si tu dominio ya tiene un sitio en otro servidor o hosting

Al cambiar el registro de envío, ese nombre deja de mostrar el sitio anterior y muestra el de Runly. Si solo quieres mover una parte, conecta un subdominio (por ejemplo `tienda.mitienda.mx`) y deja el resto como está.

No borres ni cambies los registros **MX** ni los de correo (SPF, DKIM, DMARC): son los que hacen funcionar tu correo y no tienen que ver con el sitio.

#### Si tienes varios dominios o subdominios

Conéctalos uno por uno: cada dominio o subdominio es una conexión aparte, con su propio TXT y su propio registro de envío. Todos pueden apuntar al mismo sitio o a sitios distintos.

#### Si usas Cloudflare

Deja los registros en «Solo DNS» (nube gris). Con la nube naranja el sitio puede abrir, pero Runly mostrará que el DNS no apunta aquí y el certificado lo administra Cloudflare.

#### Con www y sin www

`www.mitienda.mx` y `mitienda.mx` son dos direcciones distintas: conectar una no conecta la otra. Si quieres que funcionen las dos, conéctalas ambas (la ventana ofrece un botón para conectar la otra) y elige una como dirección principal. Un subdominio como `tienda.mitienda.mx` es una sola dirección y no necesita versión con www.

### HTTPS (el candado del navegador)

Runly **no emite certificados**: quien administra tu instalación debe tener uno para tu dominio. Después de verificar, pulsa **Comprobar HTTPS** y verás uno de estos estados:

- **HTTPS listo**: el certificado es válido.
- **Certificado no válido**: hay un certificado pero está vencido o no corresponde a tu dominio.
- **HTTPS sin configurar**: todavía no hay certificado; pídeselo a quien administra tu instalación, avisándole el dominio exacto.

### Avisos automáticos

Si usas Growth, al verificar tu dominio se crean solos tres monitores (disponibilidad, certificado SSL y vencimiento del dominio) que te avisan si algo falla o está por vencer.

### Liberar una dirección

**Liberar** hace que la dirección deje de mostrar tu sitio de inmediato, y la pantalla pide confirmación.

- **Dirección de Runly**: queda apartada para tu sitio durante 15 días; en ese tiempo puedes pulsar **Recuperar**. Después de los 15 días cualquier otro sitio puede reservarla (mientras nadie la tome, todavía puedes recuperarla). La pantalla muestra la fecha.
- **Dominio propio**: se desconecta de tu sitio. Puedes volver a conectarlo después. Si lo liberas, acuerda también qué registro quieres en tu DNS para que el dominio no quede apuntando a Runly sin mostrar nada.

### Si algo no funciona

- **«Todavía no encontramos el registro TXT»**: revisa que el host esté bien escrito (a veces el panel ya agrega el dominio y queda repetido) y espera a que el DNS se actualice.
- **Dice que el DNS no apunta aquí**: falta el registro de envío, o apunta a otro lugar. Compáralo con el valor que muestra la pantalla.
- **El navegador muestra otro sitio o un error 404**: el sitio debe estar publicado y el dominio debe estar verificado.
- **«Este nombre no se puede conectar»**: los nombres reservados de la instalación (por ejemplo los que empiezan con `admin`, `api` o `auth`) no se pueden usar.

### Alcances y límites

- Solo puedes conectar dominios que controles: se comprueba con el registro TXT.
- Runly no cambia tu DNS por ti: los registros los creas tú en tu proveedor.
- No se pueden conectar direcciones IP ni los dominios de la propia instalación.
- Tu empresa puede conectar hasta 25 dominios propios (el administrador puede cambiar el límite).
- Conectar y liberar dominios requiere el permiso **Gestionar nombres de sitios**.
