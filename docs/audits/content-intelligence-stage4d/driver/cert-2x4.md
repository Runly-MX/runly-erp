# Certificacion Content Intelligence (2x4)
Host: Docker 4.8 GB, libre 3.8 GB

| Escenario | Estado | Detalle |
|---|---|---|
| corpus-smoke | passed |  |
| worker-restart | failed | every file reaches a terminal state; post-interruption upload processed |
| storage-interrupt | error | /files/upload 500: {"error":"No se pudo subir el archivo."} |
| postgres-restart | failed | every file reaches a terminal state; post-interruption upload processed |
| backfill-pause-resume | passed |  |
