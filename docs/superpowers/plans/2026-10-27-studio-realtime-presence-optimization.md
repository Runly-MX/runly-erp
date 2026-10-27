# Plan: optimización de colaboración Studio

Estado: implementación, commits e integración local terminados. Matriz hasta
diez participantes y carga continua de tres minutos aprobadas. La carga de veinte
se ejecutó pero no superó los criterios; se documentan timeouts y caducidades,
sin atribuirles una causa no demostrada. No hubo despliegue ni publicación.

1. Registrar HEAD/status y preservar cambios ajenos; leer contratos, módulos
   vecinos y políticas reales. Investigación y spec antes del cambio de arquitectura.
2. Completar línea base Chrome/SQL/Realtime en stack nuevo, 60 s por escenario;
   conservar datos sintéticos ignorados y métricas resumidas públicas.
3. Implementar contrato efímero v1, validación, firma/atestación, lease y emisor
   acotado. Unitarios de seguridad, secuencias, throttle y ciclo de vida.
4. Migración aditiva para rol socket limitado, sin tocar políticas globales ni
   migraciones históricas. Probar SQL y WebSocket reales antes de adoptarlo.
5. Endpoint de contexto autorizado/renovación y SDK; mantener live y persistencia.
6. Cambiar el hook por controlador Presence/Broadcast; aislar render del overlay,
   limpiar canales/temporizadores, reducir actividad oculta y recuperar conexiones.
7. Medir después con escenarios equivalentes. E2E de múltiples identidades,
   revocación, spoof/replay, Auth, fallos, MCP, multipágina y compatibilidad vieja.
8. Regresión Studio/Files/permisos/plantillas/Canvas/Notes, builds afectados,
   ESLint, React Doctor y privacidad propia/global separados.
9. Actualizar contrato UI e informe local con resultados reales, riesgos, límites
   y commits; commitear solo cambios propios en main. No publicar ni desplegar.

Evidencia final y reproducción:
`docs/deployment/STUDIO_REALTIME_OPTIMIZATION_LOCAL.md`.
Se corrigieron además la mutación de referencias del SDK Presence 2.105.1,
la firma en vuelo durante renovación y el timer antiguo que invalidaba una
concesión nueva durante limpieza offline. Cada caso tiene regresión específica.
API/Web/Worker se construyeron desde una revisión Git y se probaron como imágenes
reales sobre un stack nuevo. El borrador local y el protocolo persistente siguen
siendo responsabilidad del motor existente.
