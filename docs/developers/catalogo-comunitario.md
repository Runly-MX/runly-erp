---
title: Marketplace comunitario y catálogo v2
summary: Oficial Runly frente a comunidad, publicadores verificados, firma separada, catálogo v2 secuenciado, revocaciones, compatibilidad y comportamiento offline.
order: 9.5
---

El catálogo oficial v1 (**Módulos > Disponibles**) no cambia. El catálogo v2 es un canal **paralelo y opcional** que añade módulos de la comunidad con confianza explícita. Ningún módulo de la comunidad entra en el feed oficial antiguo.

## Tres niveles de confianza que nunca se mezclan

| Etiqueta | Qué significa | Quién firma |
|---|---|---|
| **✓ Oficial Runly** | Módulo revisado y publicado por Runly. | Clave oficial fijada en Runly (la misma del v1). |
| **✓ Publicador verificado · Comunidad** | Identidad del publicador comprobada por la moderación de Developer Hub. **No** es autoría de Runly. | Clave comunitaria, distinta de la oficial. |
| **Comunidad · publicador no verificado** | Publicado por la comunidad sin verificación de identidad. | Clave comunitaria. |
| **Catálogo administrado** | Catálogo privado que configuró la administración de tu instancia. | Claves que agregó tu administrador. |

Una firma comunitaria nunca produce «Oficial Runly», aunque el publicador esté verificado. Las firmas de la comunidad usan un formato con separación de dominio que no puede coincidir con la firma oficial `key@version:sha256`. Si una entrada afirma ser oficial sin la firma oficial válida, se muestra **Firma no confiable** y no se puede instalar.

## Publicadores y claves de módulo

- Un **publicador** es una identidad pública separada de tu organización: identificador permanente (por ejemplo `acme-labs`) y nombre visible.
- No se admiten identificadores ni nombres que imiten a Runly, Racoon Devs u «oficial/verificado».
- Las claves instalables siguen siendo `custom.*`. Cada clave pertenece a un solo publicador y no puede reclamarse si ya está en el canal oficial.
- Una clave solo cambia de dueño mediante **transferencia**: la solicita el publicador de origen, la acepta el destino y la aprueba la moderación. El proyecto se mueve con la clave y el historial queda visible en la página pública del publicador.

## Publicar en el Marketplace

1. Valida, genera el ZIP y guarda una **versión privada** (como para la publicación oficial). Si tiene pantallas CUSTOM, compílalas primero.
2. En **Publicador**, reclama la clave y crea una release desde esa versión: visibilidad **pública** o **no listada** y rango de versiones de Runly. Los contratos de compilador/runtime y las capacidades se toman de la evidencia verificada, no de la versión del módulo.
3. Envíala a moderación. La moderación comunitaria la aprueba o la devuelve; es una autoridad separada de la revisión oficial.
4. Un proceso separado firma la release con la clave comunitaria y publica un nuevo snapshot del catálogo v2.

Las versiones privadas nunca aparecen en el Marketplace ni en el catálogo público. Las no listadas no aparecen en búsquedas; se abren por enlace y siguen sujetas a las mismas reglas de confianza.

## Retirar y revocar

- **Retirar** deja de listar y recomendar una versión. No invalida instalaciones existentes ni borra el ZIP.
- **Revocar** marca una versión como insegura para futuras operaciones: Runly bloquea nuevas instalaciones y avisa en las instancias que la tienen instalada, con la actualización recomendada si existe.
- También se puede revocar un **publicador** (todas sus versiones dejan de ser instalables) o una **clave de firma** (las versiones firmadas con ella pierden confianza).
- Una revocación **nunca desinstala módulos ni borra datos**. No existe un interruptor remoto. Los ZIP e historiales se conservan.

## Catálogo v2: secuencia y frescura

Cada snapshot del catálogo v2 incluye una secuencia creciente, la huella del snapshot anterior, fecha de generación, vigencia de 7 días, publicadores, entradas, revocaciones y claves comunitarias activas/retiradas/revocadas. El snapshot completo está firmado.

Runly rechaza y conserva la última copia verificada cuando recibe:

- un snapshot con secuencia menor (rollback/replay);
- dos snapshots distintos con la misma secuencia (feed comprometido);
- un snapshot que no continúa la cadena del anterior;
- un catálogo v1 donde se esperaba v2 (downgrade);
- firmas que no son de una clave de confianza.

## Compatibilidad

Antes de instalar, Runly comprueba la versión de Runly declarada, los contratos de compilador/runtime, que los servicios, eventos y Connections existan en la instancia y que las dependencias `custom.*` estén instaladas. Si algo no se cumple, el módulo se muestra como no compatible y no se instala. La metadata de seguridad firmada (capacidades, servicios, eventos, Connections, dependencias) debe coincidir con el ZIP inspeccionado.

## Snapshot oficial firmado

Además de la firma `key@version:sha256` de cada módulo, Developer Hub exporta un **snapshot oficial** firmado con la clave oficial: secuencia, huella del snapshot anterior, módulos, compatibilidad firmada por versión y **revocaciones oficiales**. Runly lo verifica igual que el catálogo v2: una firma que no es de la clave oficial fijada, un dominio de confianza distinto de `OFFICIAL`, una secuencia menor o dos snapshots distintos con la misma secuencia se rechazan y se conserva la última copia verificada. Un rollback legítimo de Runly llega como un snapshot **nuevo** con secuencia mayor.

## Instalar y actualizar en Runly

**Módulos > Marketplace** muestra la etiqueta de confianza, el publicador, la versión, la compatibilidad (con el motivo cuando no se cumple), las dependencias declaradas, los cambios, las capacidades y los permisos solicitados. El flujo es explorar → detalle → **Verificar** → instalar:

1. **Descargando**: el ZIP se resuelve solo desde el catálogo verificado, en una ruta direccionada por su huella.
2. **Verificando**: tamaño y SHA-256 deben coincidir con la entrada firmada; la clave y la versión del ZIP, y su superficie de seguridad, deben coincidir con lo firmado.
3. **Comprobaciones previas**: compatibilidad, revocaciones y dependencias. Después, el flujo oficial de paquetes aplica sus propias comprobaciones de estructura (y pide decisiones si un cambio puede perder datos).
4. **Instalando** y **Habilitado**: se usa el mismo instalador de módulos de Runly; no existe un instalador paralelo.

Si algo falla, se indica la fase y el código del diagnóstico. Para un módulo no oficial, la administración debe aceptar explícitamente la versión exacta. Las actualizaciones muestran la versión actual y la disponible, pero **siempre requieren confirmación**: no hay actualizaciones automáticas.

- Los módulos **incluidos en Runly** (`runly.*`) llegan con la plataforma y nunca se descargan del Marketplace.
- Las dependencias se muestran antes de instalar. No se instala ninguna dependencia oculta: si falta una, se bloquea con la explicación y, si está en el Marketplace, se indica que debe instalarse primero.
- El módulo se instala **una vez para toda la instancia** y queda habilitado para todas las empresas; cada empresa puede deshabilitarlo después.
- Solo la administración de la instancia (administración del sistema o de la empresa activa) puede instalar, actualizar o configurar el catálogo. Ver el Marketplace no da permiso de instalar, y la API lo valida en el servidor.

## Versión revocada o retirada en una instancia

- **Revocada**: aparece la alerta «Esta versión fue revocada» con el motivo y la versión recomendada. Se bloquean nuevas instalaciones, reinstalaciones de esa versión y actualizaciones hacia una versión revocada. El módulo instalado no se desinstala ni se borran datos.
- **Retirada por el publicador**: no es un incidente de seguridad. La instalación existente sigue registrada y funcionando; esa versión ya no se ofrece para instalaciones nuevas.

## Origen del catálogo y claves de confianza

Las instalaciones nuevas de Runly usan el **catálogo de Runly** por defecto; las instancias que ya existían conservan su configuración. En **Módulos > Marketplace > Origen del catálogo** la administración elige «Catálogo de Runly», «Personalizado» (URLs propias, solo HTTPS o `file://`) o «Desactivado». Cualquier catálogo cuya firma no corresponde a una clave de confianza se rechaza.

El trust store separa claves **oficiales**, de **comunidad** y **administradas**. Las oficiales y de comunidad llegan con las versiones de Runly y cada una tiene un estado: **activa**, **en retiro** (solo valida contenido fechado hasta su fecha límite) o **revocada**. La administración puede agregar claves de catálogos administrados (nunca se vuelven «Oficial Runly») y revocar una clave localmente, pero no puede volver a confiar en ella ni promoverla. Runly nunca guarda claves privadas.

## Sin conexión

Sin conexión, Runly muestra la **última copia verificada** e indica cuándo se verificó. Con esa copia se puede instalar o actualizar durante 24 horas; entre 24 y 72 horas hace falta confirmar que puede estar desactualizada, y después solo se puede consultar (valores configurables por la administración). Los paquetes siempre se descargan y se verifican, y un catálogo comunitario vencido (7 días) nunca permite instalar. Sin una copia verificada previa, se muestra el error en lugar de una lista vacía. Los módulos instalados siguen funcionando. Una instancia offline no recibe revocaciones hasta volver a sincronizar.

## runly.mx/modulos

La página pública de módulos lee el mismo catálogo de Developer Hub (no mantiene una lista propia). Solo muestra módulos listados y disponibles, con su confianza, publicador, versión, capacidades y compatibilidad, y no instala nada: indica que el módulo está disponible desde Runly. Los módulos no listados se abren solo por enlace y no se indexan.

## Estado actual

Developer Hub implementa Marketplace, publicadores, moderación, firma comunitaria, snapshot oficial y exportación del catálogo v2 en desarrollo local. **La publicación productiva sigue desactivada** y no existen claves de producción: la clave comunitaria todavía no está fijada en Runly. Hasta que se activen, el Marketplace solo se prueba con catálogos firmados con claves efímeras de prueba y no hay despliegue público del catálogo. La preparación estática verifica firmas, secuencia y bytes con `pnpm catalog:prepare:v2 --from <export>`.
