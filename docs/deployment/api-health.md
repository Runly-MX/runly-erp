# Liveness y readiness de la API

GET `/health` indica que el proceso responde. Conserva nombre y fechas del
contrato anterior; no consulta dependencias. GET `/ready` devuelve 200 sólo si
el bootstrap del runtime terminó, el registro de rutas no contiene ERROR o
estados desconocidos y una consulta `SELECT 1 AS ready` al pool compartido
terminó correctamente. En otro caso devuelve 503.

Ejemplos de sondeo para una instancia de pruebas:

```sh
curl --fail http://api.example.test:4010/health
curl --fail http://api.example.test:4010/ready
```

Ambos endpoints son públicos y usan `Cache-Control: no-store`. `/ready` sólo
devuelve `ok` y `checks.database/runtime`; no incluye destinos, claves de
módulos, errores, stacks, versiones o datos de empresas. No necesita token ni
acepta timeout/query configurable por el llamador. HEAD también funciona.

| Estado | Significado |
|---|---|
| database: ready | Query simple completada; no acepta permisos/schema ERP |
| database: unavailable | Conexión/query falla o resultado no esperado |
| database: timeout | Deadline agotado; la adquisición subyacente podría seguir pendiente |
| database: not_checked | Runtime no listo, DB no sondeada |
| runtime: unavailable | Bootstrap incompleto, shutdown, ERROR o estado desconocido del registro |

El presupuesto interno es 1,500 ms, con cache local de resultado DB verde por
1,000 ms y rojo por 250 ms. Runtime se revisa en cada request y antes de devolver
el resultado. Peticiones concurrentes comparten un sondeo. Un sondeo colgado
permanece único y rojo hasta que su operación subyacente termina. Timeout
destruye el cliente adquirido; si llega tarde tras esperar en el pool, se
libera sin consultar. No se cierra el pool de la aplicación. La adquisición
hereda el límite de 30 s del pool existente. Un loop de Node bloqueado puede
demorar cualquier respuesta: el deadline no constituye un SLA.

MISSING_API y UNLOADED son estados válidos. Un ERROR conservado por el loader
puede mantener readiness rojo hasta reload/unload/reinicio; revisar el estado
administrativo privado antes de tomar decisiones operativas. Readiness no
comprueba errores suprimidos de componentes/public routes/bundles, provisión
asíncrona de modelos core, Auth, Storage, servicios opcionales o workers.

No usar un 503 de readiness como única razón para reiniciar el proceso: una
base caída no se repara reiniciando la API. Liveness, readiness y alertas tienen
propósitos distintos. Esta implementación no cambia Compose, balanceadores,
healthchecks instalados, CI o políticas de reinicio. La integración operativa
requiere probar la imagen/configuración y mecanismos de observación reales.

El adaptador sigue los contratos oficiales de adquisición y liberación de
clientes: [node-postgres Pool](https://node-postgres.com/apis/pool).
