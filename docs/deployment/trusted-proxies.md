# Proxies confiables (`RUNLY_TRUSTED_PROXIES`)

La API decide quien llama a los endpoints publicos (LMS, asistencia, archivos compartidos, inventario, canvas, formularios, login externo, webhooks, reservas, boletos, MCP) y aplica sus limites de solicitudes con una sola regla:

1. La direccion del socket es la autoridad.
2. `X-Forwarded-For` solo se lee si el socket pertenece a `RUNLY_TRUSTED_PROXIES` (si esta vacio, a `RUNLY_MCP_TRUSTED_PROXIES`).
3. La cadena se recorre de derecha a izquierda saltando los saltos confiables; la primera direccion no confiable es el cliente. Lo que el visitante antepone a la cabecera se ignora.
4. Sin configuracion, o con una entrada invalida, se usa la IP del socket. Una entrada invalida nunca se confia.

Implementacion: `apps/api/src/lib/client-ip.js` (usado por todas las rutas publicas) sobre `apps/api/src/mcp/client-ip.js`.

## Formato

Lista separada por comas de IP, CIDR o atajos: `172.18.0.0/16, 10.0.0.5, loopback, private`. `private` confia en 10/8, 172.16/12, 192.168/16, fc00::/7 y loopback; es comodo para nginx en Docker pero amplio. Si el servidor tiene otro proxy, prefiere su IP exacta.

## Topologias

| Topologia | Valor recomendado |
| --- | --- |
| Sin proxy (la API recibe visitantes directamente) | vacio |
| Contenedor web de Runly -> API (instalacion estandar) | red Docker del proyecto, o `private` |
| Proxy del host -> contenedor web -> API | red Docker + IP del proxy del host |
| Varios proxies encadenados | todos los saltos propios, nunca las IP de visitantes |

El contenedor web agrega la IP que ve con `proxy_add_x_forwarded_for`, de modo que cada salto confiable anade su eslabon y un valor forjado por el visitante queda a la izquierda.

## Que hace el instalador y el actualizador

- Plantillas `.env.local.example` / `.env.external.example`: `RUNLY_TRUSTED_PROXIES=private` solo se agrega si la clave **no existe**. Un valor propio, o vacio explicito, no se toca.
- `setup-local.mjs` / `setup-external.mjs` (lo que ejecutan `./update-local.sh` y `./update-external.sh`): antes de reiniciar, respaldan el archivo `.env.*` en `.runly-installer/env-backups/` (5 versiones, sin duplicar si no cambio) y validan estrictamente la clave. Un valor invalido aborta sin modificar el archivo ni reiniciar contenedores.
- No tocan dominios, certificados, secretos, nginx ni compose.
- Es idempotente: repetir el actualizador no duplica variables.

## Diagnostico (solo lectura)

Desde la carpeta del instalador:

```bash
node diagnose-trusted-proxies.mjs --mode local      # o --mode external
node diagnose-trusted-proxies.mjs --mode external --probe https://api.example.com
```

Sin `--probe` solo lee la clave, valida el formato, compara con lo que ve el contenedor de la API y lista las redes Docker. Con `--probe` envia 40 solicitudes con `X-Forwarded-For` distinto a un endpoint publico con limite; si el limite no se activa, una cabecera falsificada cambia la identidad. Ejecutalo desde fuera del servidor: desde una IP privada confiable el resultado puede ser un falso positivo. La sonda deja limitada brevemente la IP desde la que se ejecuta.

Revertir configuracion: `node -e "import('./lib/trusted-proxies.mjs').then(m=>m.restoreLatestEnvBackup('.env.local'))"` (o `.env.external`) y volver a ejecutar el actualizador.
