# Compras: cierre puntual de contraste y auditoría

Base: `128dee669`. El desarrollo funcional permanece congelado.

## Corrección y comprobaciones

El texto de fecha vacía de `DateField`, `DateTimeField` y `DatePickerField`
deja de aplicar opacidad al color secundario y usa el color legible del combobox
en oscuro. No cambian los iconos, valores, eventos, validaciones ni flujos.

En el editor documental, a 390 y 1440 px, con controles habilitados:

| Tema | Antes | Después | Mínimo |
|---|---:|---:|---:|
| Claro | 3.49:1 | 7.13:1 | 4.5:1 |
| Oscuro | 2.89:1 | 10.50:1 | 4.5:1 |

Las cuatro comprobaciones visuales anteriormente fallidas pasan. La suite
documental completa pasa 59/59 comprobaciones, incluidos los diez criterios
funcionales, permisos, aislamiento, correcciones y compatibilidad sin migración.
La prueba de componentes compartidos cubre fecha, fecha/hora y selector normal
y compacto, habilitados, en claro/oscuro y reposo/hover/foco: 24 combinaciones.
Las 543 pruebas unitarias relevantes pasan. ESLint pasa y React Doctor no
encuentra problemas en los dos componentes modificados.

Las suites con API y base se ejecutaron exclusivamente sobre stacks nuevos y
desechables, con identidad verificada y puertos propios. Se retiraron al terminar.

## Auditoría operacional de solo lectura

La API 4010 no tenía listener. Fue posible consultar directamente la misma base
configurada para la API local: los destinos de DATABASE_URL y DIRECT_URL
coinciden. Se usaron sesiones PostgreSQL con `default_transaction_read_only=on`,
transacciones READ ONLY verificadas, límites de tiempo y cierre sin escrituras.
No se inició ni alteró ningún servidor o base compartidos.

Se identificaron 64 documentos candidatos por prefijo de prueba. Once recientes
coinciden con tres cohortes de las suites y con su usuario configurado; los otros
53 son anteriores y no se atribuyen automáticamente al incidente reciente.

Los once candidatos recientes tienen ocho expedientes, doce partidas, dos
recepciones completadas y dieciséis relaciones persistentes entre documentos.
Permanecen dos órdenes canceladas, una factura cancelada y una factura con pago
parcial legado. La configuración de negocio actual coincide con la anterior
a las suites. Cuatro relaciones temporales con un activo existente ya estaban
eliminadas; no quedan vínculos de esos once documentos con Inventarios.

En los candidatos anteriores persisten siete relaciones con tres activos:
tres son historia de órdenes canceladas y cuatro corresponden a una orden
recibida y una factura parcialmente pagada. Estas últimas pueden afectar la
vista operativa y la ocupación de vínculos. No se eliminó ni restauró nada.
Los timestamps de los activos y la auditoría disponible no muestran cambios
directos recientes; sin respaldo anterior no se certifica igualdad completa.

Los identificadores, dependencias, consultas y evidencia se guardaron únicamente
en el informe operacional privado local, fuera de Git. La base no se declara
limpia. Cualquier limpieza requiere revisión y aprobación humana posterior;
no deben borrarse por prefijo datos financieros, auditoría ni contadores.

## Fallos preexistentes y límites de despliegue

| Hallazgo | Preparación local | Ejecución o publicación |
|---|---|---|
| Catálogo runtime: 3/4 pruebas, versiones declaradas distintas de las instaladas; reproducido también sobre el SHA inicial de la entrega anterior | No bloquea preparar los cambios puntuales de Compras | Impide declarar toda la API verde y certificar la correspondencia del catálogo con ese artefacto; requiere resolución o decisión explícita del proceso de release |
| Privacidad: los mismos 67 hallazgos previos, ninguno en los archivos de este cierre | No bloquea preparar localmente estos cambios | La comprobación global sigue roja y no puede declararse cumplimiento de la política del repositorio ni publicación con esa validación aprobada |
| Residuos de pruebas en desarrollo | No bloquean preparar artefactos | Bloquean declarar limpia esa base o promover/copiar sus datos sin una decisión humana sobre los residuos |
| La base auditada aún no tiene las tablas de las migraciones documental, de pagos ni de versiones | No impide preparar el paquete y su procedimiento | Activar Control documental en esa base exige antes su migración y el cliente Prisma correspondiente; no se ejecutó ninguna migración real |

Veredicto del alcance: **APTO para preparar despliegue**. Esto no es autorización
para ejecutarlo, publicar ni migrar. El incidente quedó auditado con residuos
identificados; su limpieza no está realizada ni autorizada por este cierre.
