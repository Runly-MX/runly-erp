---
viewKey: /sites
title: Sitios conectados
summary: Que sitios web estan enviando datos a Growth.
---
Consulta que sitios (por ejemplo tu Sitio web de Runly, u otro sitio externo) estan conectados y enviando visitas/leads a este modulo.

- Un sitio externo (que no vive en el modulo de Sitio web de Runly) tambien se puede conectar aqui para reportar sus visitas y formularios.
- Cada sitio conectado tiene su propio identificador; usalo al integrar el sitio para que sus datos lleguen al lugar correcto.
- Si un sitio deja de enviar datos, revisa primero aqui que siga configurado como conectado.
- Al conectar un sitio con dominio, Runly crea sus **monitores** de disponibilidad y certificado SSL; los ves y los administras en **Monitores**.
- En **Ver codigo** puedes marcar **Avisar de errores reales de los visitantes** (opcional) para que las fallas del servidor que vean tus visitantes aparezcan en Monitores. Despues de marcarlo, copia de nuevo el codigo y pegalo en tu sitio.

### Conectar un sitio externo y verificar

- El codigo de **Ver codigo** es una sola etiqueta `<script>` sin codigo en linea: pegala dentro del `<head>` de tu sitio. Si tu sitio tiene una politica de seguridad (CSP), permite el servidor de Runly en `script-src` y `connect-src`.
- Despues de publicarlo, abre tu sitio y pulsa **Verificar conexion**. Si aun no hay visitas, Runly te dice por que:
  - **El script no ha cargado**: la etiqueta no esta publicada o la CSP la bloquea.
  - **El origen no coincide**: el sitio carga desde una direccion distinta al dominio configurado (por ejemplo con o sin `www`). Corrige el dominio en **Editar**.
  - **No rastrear o consentimiento**: el script cargo, pero el navegador o el visitante impide enviar datos.
- El sitio de Runly con tu CSP estricta (como un portal de autenticacion) puede no ser buen candidato para el script: usa un monitor de disponibilidad en **Monitores**.
