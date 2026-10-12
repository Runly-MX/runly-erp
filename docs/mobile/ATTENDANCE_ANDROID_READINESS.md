# Checador: preparación de Android y llaves personales

Revisión: 2026-10-12. Auditoría de documentación y código; no constituye
validación en hardware ni certificación de un APK.

## Resultado

La base de asistencia está implementada como módulo integrado `runly.attendance`.
No es un módulo RME3 custom: tiene modelos Prisma `Att*`, rutas propias y pantallas
incluidas en la web. Conservar esta distinción al planear modificaciones; las
reglas de tablas RME3 siguen aplicando a módulos custom.

Compilar el host Android actual no añade HCE, desbloqueo biométrico, BLE ni
bloqueo de kiosko. Estas funciones necesitan implementación nativa, contratos
del bridge, integración con asistencia y pruebas en dispositivos reales.

## Inventario comprobado

| Función | Estado del código | Trabajo pendiente |
| --- | --- | --- |
| Código de persona + PIN | Implementado con validación local para offline | Pruebas físicas y política de intentos/bloqueo |
| Llave del teléfono por QR | Clave privada P-256 no exportable en Web Crypto; QR firmado que rota cada 20 s | Autorización biométrica y prueba vinculada a un kiosko |
| Lectura NFC de tarjetas | Android lee UID/tecnologías; existe puente de eventos al kiosko. Web NFC usa NDEFReader | Verificar modelos/tarjetas reales y presentación del lector nativo |
| Teléfono como tarjeta NFC | No existe servicio HostApduService | HCE, AID/protocolo APDU y lector IsoDep en la tablet |
| Huella/rostro del teléfono | No existe BiometricPrompt ni firma con Android Keystore | Enrolamiento de clave nativa y firma autorizada por biometría |
| Bluetooth | Consulta de dispositivos emparejados y permiso CONNECT | Escaneo/anuncio BLE, GATT y protocolo autenticado |
| Geocerca | Tablet obtiene coordenadas; servidor marca outside_geofence | Permisos Android, precisión/antigüedad y política cuando no hay posición |
| Foto de evidencia | Captura, cola offline, subida y miniatura implementadas | Verificar cámara real, fallos y política de evidencia obligatoria |
| Comparación facial | No implementada | Enrolamiento facial, comparación, prueba de vida y umbrales |
| Firma manuscrita | No encontrada en el flujo de checada | Captura, evidencia, sincronización y visualización |
| Kiosko bloqueado | Pantalla completa y wake lock web | Lock task, gestión de tablet y salida administrativa |
| APK | Wrapper Tauri y proyecto Android disponibles | Compilar versión nueva, firmar, instalar y verificar antes de publicar |

## Hallazgos que afectan al flujo solicitado

### Ubicación

El manifiesto Android carece de ACCESS_COARSE_LOCATION y ACCESS_FINE_LOCATION.
DeviceAccess y ScreenSharePlugin solo aceptan camera, microphone, notifications
y bluetooth. Añadir ubicación requiere el manifiesto, solicitud conjunta en
runtime, estado de permiso, acceso a ajustes e integración del bridge/WebView.
No basta con declarar permisos.

En `kiosk/lib/geo.js`, getCurrentPosition usa enableHighAccuracy:false. Se
descarta coords.accuracy y se puede reutilizar una posición de hasta 30 minutos.
En `attendance-core.js`, geofenceFlag retorna null si faltan coordenadas;
la checada puede quedar valid sin que se haya verificado su ubicación.

La posición actual pertenece a la tablet. No prueba dónde está el teléfono del
empleado. Para checar desde el teléfono hay que añadir un flujo autorizado y
vincular la posición del teléfono a su prueba firmada.

Solicitar ubicación precisa no garantiza una exactitud fija: Android permite
elegir aproximada y la precisión física depende del entorno. Guardar accuracy,
capturedAt y origen de la posición; evaluar calidad y frescura antes de aplicar
la geocerca. Ubicación debe ser evidencia complementaria, no una llave de identidad.
Para checadas en primer plano no se necesita pedir ubicación en segundo plano.

### Llave y presencia

KeyCard firma automáticamente con la clave almacenada en IndexedDB. Una clave
no exportable de Web Crypto no equivale a una clave Android Keystore protegida
por autenticación biométrica.

El payload actual RA1 firma persona y tiempo. No vincula kiosko, sede, dirección
de checada ni un desafío único emitido por la tablet. Existe detección de replay,
pero una fotografía del QR puede presentarse en otro kiosko dentro de su ventana.
La consulta seguida de inserción de replay merece pruebas de concurrencia entre
dos kioskos; no equivale a consumo atómico de un desafío.

Diseñar una nueva versión de prueba con credentialId, kioskId, desafío aleatorio,
caducidad y contexto de checada. El teléfono debe firmarla después de autorizar
el uso de su llave. Verificar con la misma lógica para QR, NFC y BLE y consumir
el desafío de forma atómica cuando hay conexión. Offline requiere controles
locales y conciliación: no prometer prevención global de replay o revocación
instantánea entre tablets desconectadas. Conservar RA1 bajo una política explícita
de compatibilidad durante la transición.

La huella/rostro del teléfono autoriza una llave asociada previamente al empleado;
no identifica qué empleado está usando el sensor de la tablet. Para identificar
empleados por huella en un punto fijo se necesita lector externo compatible y
su SDK. Comparar una foto con un rostro registrado es otra función independiente.

### NFC, RFID y BLE

La lectura actual de Android entrega tag.id. HCE necesita intercambio APDU con
HostApduService e IsoDep; el identificador de una tarjeta emulada no debe usarse
como identidad persistente del teléfono. HCE y lectura de tarjetas deben tener
flujos distintos y probarse con hardware compatible.

NfcPanel solo considera NDEFReader para mostrar la pestaña de tarjeta. El loop
nativo puede emitir eventos sin que aparezca esa pestaña. Añadir disponibilidad
y estado de lectura nativa para dar indicaciones visibles al empleado.

NFC cubre una familia de RFID; no cubre lectores 125 kHz/UHF. Esos equipos
necesitan integración según su protocolo USB, serie, red o fabricante. Un UID
por sí solo no proporciona prueba criptográfica de posesión.

BLE requiere SCAN/ADVERTISE según el rol, además de CONNECT cuando corresponda,
y permisos en runtime. La distancia inferida de RSSI no prueba presencia exacta.
Usar intercambio de desafío firmado y confirmación explícita de la checada.

### Tablet fija y evidencias

Pantalla completa no bloquea salir de la aplicación. El lock task real requiere
que un controlador de políticas autorice la app; planear gestión de dispositivos,
arranque/recuperación y salida administrativa. No bloquear teléfonos personales.

La checada se encola antes de terminar la captura de foto. requireSelfie puede
producir evidencia unavailable y la subida ocurre después de sincronizar. Si foto
o firma son obligatorias, modelar estado pendiente/incompleto y revisión: no
presentar una checada como plenamente validada solo por haberse guardado.

## Orden de implementación

1. Definir política por sede/kiosko: métodos permitidos, evidencia obligatoria,
   tratamiento de ubicación ausente/imprecisa y checadas offline.
2. Completar ubicación Android y calidad de coordenadas; presentar estado del
   lector NFC nativo. Conservar QR/PIN como primer flujo operativo.
3. Implementar llave Android Keystore y autorización BiometricPrompt; añadir
   enrolamiento/revocación y prueba de checada vinculada al kiosko.
4. Implementar transporte HCE/IsoDep y kiosko administrado en la tablet.
5. Completar fotografía obligatoria y firma manuscrita según política.
6. Añadir BLE y comparación facial como fases separadas con pruebas propias.
7. Compilar y distribuir APK identificado por versión, ABI, certificado y hash;
   desplegar también la web/API si cambian bridge o contratos.

## Construcción y publicación

El host documentado es 1.2.2, ARM64, con distribución directa firmada para debug
en verificaciones anteriores. Existen Java, Rust, targets Android y SDK/NDK en
el entorno revisado; esto no confirma que el build actual termine correctamente.
No se encontró un APK en `.tmp/artifacts/` ni local.properties en el proyecto
Android. El SDK puede configurarse por entorno, por lo que su ausencia no es
por sí sola un error de compilación.

El wrapper soporta `pnpm native:android build production --debug --apk` para
pruebas y `pnpm native:android build production --apk` para preparar release.
La distribución debe conservar el certificado de las instalaciones existentes
y aumentar versionCode. Verificar firma de salida; no confundir build release
con un artefacto firmado listo para instalación.

`scripts/publish-release.mjs` publica también el instalador de escritorio,
sobrescribe assets y marca latest. No usarlo sin revisar el destino y alcance
de una publicación exclusiva de Android.

Destino confirmado por el usuario el 2026-10-12: GitHub Releases de
`Runly-MX/runly-erp`, compartido con el instalador Windows. No volver a preguntar
por el destino en solicitudes de publicación de Runly. La release consultada en
esta fecha es `v0.2.0`, con `Runly-ERP-Setup.exe` y `Runly-ERP.apk`; consultar
de nuevo el tag vigente al publicar y conservar los assets de Windows cuando
solo se actualice Android.

- [Releases](https://github.com/Runly-MX/runly-erp/releases).
- [Descarga estable Android](https://github.com/Runly-MX/runly-erp/releases/latest/download/Runly-ERP.apk).
- [Descarga estable Windows](https://github.com/Runly-MX/runly-erp/releases/latest/download/Runly-ERP-Setup.exe).

No guardar ni reutilizar como destino las redirecciones temporales firmadas de
release-assets.githubusercontent.com.

## Aceptación antes de anunciar funciones

En esta revisión pasaron 43 pruebas Node existentes de reglas de asistencia,
llave del teléfono, helpers de foto/ubicación y host nativo. No se ejecutó
validación física, build de APK ni publicación. Las pruebas de helpers no
demuestran que los permisos Android o HCE estén implementados.

- Tablet y teléfono reales: permisos concedidos, aproximados, denegados y
  revocados; ubicación desactivada, antigua y de baja precisión.
- Llave: enrolamiento, cancelación biométrica, revocación, cambio de instancia,
  pérdida del teléfono, desafío vencido y uso simultáneo en dos kioskos.
- NFC: tarjetas compatibles, teléfono HCE, dispositivo sin NFC y suspensión.
- Kiosko: reinicio, salida administrativa, restauración, pérdida de red y energía.
- Evidencias: cámara ausente, fallo de captura/subida, firma incompleta, cola
  offline y sincronización idempotente.
- APK: actualización sobre la instalación anterior, certificado, versión,
  ABI, navegación al kiosko/llave y acceso desde el enlace de descarga.

## Referencias

- Contexto local: `docs/ai-context/attendance-module.md` y
  `docs/superpowers/plans/2026-10-11-attendance.md`. Los apartados posteriores
  del plan registran foto/geocerca como implementadas aunque el diseño inicial
  las dejaba fuera de alcance.
- Host: `docs/mobile/RUNLY_NATIVE_HOST.md`.
- [Ubicación Android](https://developer.android.com/develop/sensors-and-location/location/permissions/runtime).
- [HCE Android](https://developer.android.com/develop/connectivity/nfc/hce).
- [Biometría y claves](https://developer.android.com/identity/sign-in/biometric-auth).
- [Permisos Bluetooth](https://developer.android.com/develop/connectivity/bluetooth/bt-permissions).
- [Lock task](https://developer.android.com/work/dpc/dedicated-devices/lock-task-mode).
