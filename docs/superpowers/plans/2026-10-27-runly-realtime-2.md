# Runly Realtime 2 — plan progresivo local

Base: `c5498bd3873c2f9067643fc8b018dbcc0c44b828`. Trabajar sobre main; revisar HEAD/status
antes de cada commit y preparar solo archivos propios. Spec:
`../specs/2026-10-27-runly-realtime-2-design.md`.

1. A: auditar wrapper, relay, broadcaster, RLS, Notes, Canvas y Chat. Crear runner
   Playwright con pila Docker verificada desechable, Auth real, métricas y artefactos
   privados. Medir 60 s en reposo/interacción y 1/5/10 participantes antes de producción.
   Registrar pendientes de UI, seguridad, recovery y compatibilidad explícitamente.
2. B: optimizar solo problemas Canvas demostrados; validar permisos, deltas, cursores,
   varias pestañas, revisiones, undo/redo y recuperación; comparar contra base; commit.
3. C: medir Notes texto y gráfico; coalescing/handshake solo con convergencia probada,
   público lector, permisos, IME, guardado concurrente, cierre y snapshot tardío; commit.
4. D: medir duplicaciones Chat; compartir suscripciones y reducir invalidación conservando
   citas/adjuntos/reacciones/ediciones/eliminaciones, notificaciones y recuperación;
   invitados y llamadas tienen contratos independientes; commit.
5. E: regresión Studio, tests integrales, builds, privacidad, Installer local/external,
   compatibilidad cruzada y sesión prolongada. Emitir informe con métricas independientes,
   SHA/commits, límites y GO/NO GO. No publicar ni desplegar.

Si falla la infraestructura, conservar diagnóstico reproducible y continuar el trabajo
independiente; no sustituir resultados reales por mocks ni estimaciones. No avanzar a
refactors profundos de B/C/D sin línea base. No migrar instalaciones existentes.

## Avance comprobado

- A: spec/matriz, runner y línea base de transportes 60 s con 1/5/10 completados.
  Auth/RLS y persistencia concurrente probados en pila nueva. Se detectó saturación
  del pool por revalidación con Prisma global dentro de una transacción y se corrigió
  pasando la transacción al callback. Sin mover el bloqueo de revocación ni crear SQL.
- B: store de cursores por sesión con expiración y limpieza; repintado por RAF del
  viewport, sin setState por cursor en el Board. Misma frecuencia y mismo protocolo.
  Evento `canvas.changed` reservado al backend. Comparación 60 s con 1/5/10 y pruebas
  Auth/RLS posteriores completadas; 223 tests Canvas pasaron. Pendiente: validar
  visualmente el editor completo y los escenarios extendidos antes del GO.
- C/D/E: pendientes; conservar los resultados fallidos de Notes con 10 usuarios y
  comparar integridad además de consumo. No considerar esa caída de tráfico un éxito.
