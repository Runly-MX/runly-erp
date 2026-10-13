# Runly para Windows

El instalador NSIS 0.3.2 instala para el usuario actual, en español, y descarga
WebView2 si falta. La pantalla inicial se incluye en el instalador y comparte
el administrador de instancias con Android. Windows añade un diseño de dos
paneles y controles propios del dispositivo.

El nombre visible de la aplicación, el instalador y los accesos directos es
**Runly**. El identificador nativo y los nombres canónicos de descarga se conservan.
El instalador migra la instalación por usuario anteriormente llamada Runly ERP
mediante su desinstalador en modo `/UPDATE`, que conserva los datos de la app.
Retira únicamente los accesos directos que apuntan a ese ejecutable anterior.

## Actualizar la distribución

`pnpm docker:release` publica las imágenes del servidor; no actualiza las
instancias ni genera instaladores de Windows o APK. En la carpeta de una
instancia existente, ejecutar `bash ./update-local.sh` o
`bash ./update-external.sh`, según su modalidad. Estos scripts refrescan los
archivos del instalador, descargan las imágenes, ejecutan migraciones y recrean
los contenedores. Después basta volver a abrir Runly para cargar la web nueva.

Un cambio del host nativo, como el nombre visible, requiere descargar y ejecutar
el instalador publicado. Actualmente no hay actualizador automático de Windows.

La URL corresponde al frontend público HTTPS, por ejemplo
`https://runly.example.com`, sin rutas ni credenciales. El host verifica `/app/`
con TLS, tiempo límite y protección de marcos antes de solicitar confianza.
No consulta `/health` en el frontend ni depende de CORS para esta verificación.
Una navegación que no termina de montar la aplicación vuelve al administrador.

Se guardan hasta 20 instancias en `instances.json`, dentro de los datos de la
aplicación. Cada origen mantiene su propia sesión y almacenamiento web. El
antiguo `store.json` se consulta únicamente para recuperar la dirección anterior;
no se conecta automáticamente a ella. El menú nativo permite volver al
administrador de instancias o dispositivo.

## Compatibilidad con la web

Antes de distribuir el nuevo instalador, desplegar también el frontend de este
cambio. Debe reconocer `__RUNLY_NATIVE_HOST__` en Windows, usar la configuración
de la instancia y confirmar el montaje con `host_ready`. Una web anterior puede
intentar cargar el conector antiguo y regresar al administrador por el watchdog.
El instalador no despliega la web.

La página remota solo tiene comandos del host, notificaciones y atención de
ventana. Los comandos de almacenamiento, SQL y ejecución de procesos no están
expuestos. La caché SQLite exclusiva del antiguo desktop queda deshabilitada en
el host remoto; la caché web sigue disponible. El listado de instancias solo se
puede consultar o modificar desde la pantalla local. Los controles nativos
verifican además el origen activo y la ruta `/app/` del documento. En Windows,
la ACL declara orígenes HTTPS: WebView2 envía el encabezado `Origin` sin la ruta
del documento. Restringir esa ACL a `/app/*` bloqueaba `host_info`, dejaba la web
en blanco y disparaba el watchdog. La navegación y cada comando propio del host
siguen comprobando el origen guardado y `/app/`; no se habilitan SQL ni acceso a
la lista local desde páginas remotas.

El frontend muestra un indicador antes de inicializar la conexión y una pantalla
de recuperación si el arranque falla. El menú de usuario mantiene el reporte de
problemas en todos los tamaños, la descarga Windows aunque se haya descartado
antes, y la preparación de la PWA del módulo sin depender de recibir el prompt.
Desde el host nativo, instalar la PWA abre el módulo en el navegador del sistema.

## Dispositivos

Cámara y micrófono tienen una prueba local con cierre de pistas al terminar o
abandonar el panel. La prueba no concede permisos a una instancia. La captura
en una instancia utiliza los permisos de WebView2 y las restricciones de
privacidad de Windows. Compartir pantalla solicita selección por sesión.

Los botones de ajustes abren únicamente páginas de Windows incluidas en una
lista fija: cámara, micrófono, Bluetooth, sonido y notificaciones. Bluetooth
permite administrar emparejamiento y audio; no se ofrece lectura BLE o NFC sin
una integración específica. No se presentan estados de autorización que el
host no puede comprobar.

## Compilación y firma

`pnpm --filter @runly/desktop build` genera `Runly-ERP-Setup.exe`.
`pnpm --filter @runly/desktop dev` abre el host local en modo desarrollo.
`build:web` continúa compilando el frontend que debe desplegarse en la instancia.

La firma se configura en el entorno privado de la máquina de compilación:

- `RUNLY_WINDOWS_CERTIFICATE_THUMBPRINT`: certificado Authenticode instalado
  en Windows. Usa SHA-256 y sello de tiempo; el servidor de sello puede
  configurarse con `RUNLY_WINDOWS_TIMESTAMP_URL`.
- `RUNLY_WINDOWS_SIGN_COMMAND`: alternativa para un servicio de firma. Utilizar
  el formato `signCommand` de Tauri y `%1` como ruta del artefacto. Las credenciales
  deben proceder del proveedor o su entorno privado, nunca del repositorio.
- `RUNLY_WINDOWS_REQUIRE_SIGNATURE=1`: impide compilar sin configurar firma.

El comando y la configuración resuelta se escriben en `.tmp/`, ignorado por Git.
Sin configuración de firma se genera un instalador local sin firma de editor.
Verificar Authenticode antes de distribuir tanto el ejecutable como el instalador.

La firma identifica al editor y contribuye a la reputación de SmartScreen;
no garantiza que una versión nueva deje de mostrar advertencias. No se modifica
SmartScreen ni se pide al usuario desactivarlo. Referencias:
[firma de Windows en Tauri](https://v2.tauri.app/distribute/sign/windows/) y
[reputación de SmartScreen](https://learn.microsoft.com/en-us/windows/apps/package-and-deploy/smartscreen-reputation).
