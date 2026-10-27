# Plan de implementación: intercambio Studio

1. Leer contratos, investigar SVG/OpenRaster/ODG y fijar spec antes de código.
2. Implementar lector/escritor ZIP cerrado con presupuestos, hashes, manifest,
   mapeo de referencias y validación de imágenes/v7. Pruebas maliciosas originales.
3. Implementar adaptador SVG separado, con lista positiva de elementos/atributos,
   geometría y pintura editables; rechazar lo no representable sin rasterizarlo.
4. Añadir journal SQL aditivo, RLS sin acceso directo de clientes y cuotas de
   staging. No modificar SQL histórico ni añadir modelos Prisma para estas tablas.
5. Instrumentar Files con un hook interno previo a Storage para registrar la
   intención durable. Reutilizar transacciones de creación de diseño/plantilla.
6. Añadir servicio inspect/prepare/confirm/cancel/recover/export y router propio;
   montaje puntual preservando los cambios concurrentes del router principal.
7. Extender SDK y documentar el contrato para controles futuros, sin editar UI.
8. Verificar servicio/HTTP/SDK y adversariales; después dos instalaciones
   Supabase desechables, imágenes privadas, plantillas, aislamiento y fallos.
   Usar el renderer real para roundtrip, historial y equivalencia visual.
9. Documentar límites reales, resultados y pendientes ORA/ODG. Checks de privacidad
   dirigidos/globales; commits propios en main, sin publicar ni desplegar.

El primer corte debe ser utilizable mediante HTTP/SDK de extremo a extremo.
La falta de una conversión SVG concreta se informa como bloqueo; no se sacrifica
la vertical nativa por ampliar formatos. Ninguna confirmación visual se simula:
los clientes envían decisiones explícitas que el backend vuelve a comprobar.

Estado: pasos 1–9 completados. Ver resultados, límites y comandos reproducibles en
el spec y el contrato público `docs/developers/studio-template-package.md`.
Formato y límites documentados; verificaciones terminadas, cero hallazgos de
privacidad en los 25 archivos propios. Commits en main. ORA/ODG quedan como fases
posteriores.
