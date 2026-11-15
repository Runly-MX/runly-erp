---
viewKey: /domains
title: Dominios
summary: La dirección con la que tus visitantes encuentran el sitio, incluido tu propio dominio.
---
En **Dominios** eliges la dirección de tu sitio. Hay dos formas: una **dirección de Runly** (por ejemplo `mi-negocio.sitios.tuempresa.com`) y, si tu instalación lo tiene habilitado, un **dominio propio** como `www.mitienda.mx`.

### Dirección de Runly

Escribe el nombre que quieres, pulsa **Comprobar disponibilidad** y luego **Reservar**. Puedes liberarla cuando quieras.

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

El registro TXT debe quedar en «solo DNS» (nube gris). El registro de envío puede estar con la nube naranja.

### HTTPS (el candado del navegador)

Runly **no emite certificados**: quien administra tu instalación debe tener uno para tu dominio. Después de verificar, pulsa **Comprobar HTTPS** y verás uno de estos estados:

- **HTTPS listo**: el certificado es válido.
- **Certificado no válido**: hay un certificado pero está vencido o no corresponde a tu dominio.
- **HTTPS sin configurar**: todavía no hay certificado; pídeselo a quien administra tu instalación, avisándole el dominio exacto.

### Avisos automáticos

Si usas Growth, al verificar tu dominio se crean solos tres monitores (disponibilidad, certificado SSL y vencimiento del dominio) que te avisan si algo falla o está por vencer.

### Liberar un dominio

**Liberar** hace que el dominio deje de mostrar tu sitio de inmediato. Puedes volver a conectarlo después. Si lo liberas, acuerda también qué registro quieres en tu DNS para que el dominio no quede apuntando a Runly sin mostrar nada.

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
