---
viewKey: /domains
title: Dominios
summary: La dirección con la que tus visitantes encuentran el sitio, incluido tu propio dominio.
---
En **Dominios** eliges la dirección de tu sitio. Hay dos formas: una **dirección de Runly** (por ejemplo `mi-negocio.sitios.tuempresa.com`) y, si tu instalación lo tiene habilitado, un **dominio propio** como `www.mitienda.mx`.

### Dirección de Runly

Escribe el nombre que quieres, pulsa **Comprobar disponibilidad** y luego **Reservar**. Puedes liberarla cuando quieras.

### Dominio propio

Si ya tienes un dominio (lo compraste en GoDaddy, Namecheap, Cloudflare u otro proveedor), puedes usarlo para tu sitio:

1. Pulsa **Conectar dominio propio** y escribe el dominio, por ejemplo `www.mitienda.mx`.
2. Runly te muestra **dos registros DNS** con un botón para copiar cada valor. Créalos en el panel de DNS de tu proveedor:
   - Un registro **TXT** que demuestra que el dominio es tuyo.
   - Un registro **CNAME** (o **A**, o **ALIAS** si usas el dominio sin «www») que envía a los visitantes a tu instalación de Runly.
3. Espera unos minutos y pulsa **Verificar ahora**. Si todavía no encuentra el registro, te lo dice; los cambios de DNS pueden tardar (a veces horas). Puedes cerrar la ventana y volver más tarde con **Instrucciones y verificar**.
4. Cuando el dominio queda **Verificado**, tu sitio ya responde en él.

Muchos paneles de DNS agregan solos el nombre de tu dominio: para `www.mitienda.mx` suelen pedir el host `_runly-verify.www` y no el nombre completo.

### HTTPS (el candado del navegador)

Runly **no emite certificados**: quien administra tu instalación debe tener uno para tu dominio. Después de verificar, pulsa **Comprobar HTTPS** y verás uno de estos estados:

- **HTTPS listo**: el certificado es válido.
- **Certificado no válido**: hay un certificado pero está vencido o no corresponde a tu dominio.
- **HTTPS sin configurar**: todavía no hay certificado; pídeselo a quien administra tu instalación.

### Avisos automáticos

Si usas Growth, al verificar tu dominio se crean solos tres monitores (disponibilidad, certificado SSL y vencimiento del dominio) que te avisan si algo falla o está por vencer.

### Liberar un dominio

**Liberar** hace que el dominio deje de mostrar tu sitio de inmediato. Puedes volver a conectarlo después.

### Alcances y límites

- Solo puedes conectar dominios que controles: se comprueba con el registro TXT.
- No se pueden conectar direcciones IP ni los dominios de la propia instalación.
- Tu empresa puede conectar hasta 25 dominios propios (el administrador puede cambiar el límite).
- Tu sitio debe estar **publicado** para que los visitantes lo vean.
- Conectar y liberar dominios requiere el permiso **Gestionar nombres de sitios**.
