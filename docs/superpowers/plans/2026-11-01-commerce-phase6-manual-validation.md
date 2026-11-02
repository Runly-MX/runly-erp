# Runly Commerce — validación manual pendiente (piloto)

Estas comprobaciones requieren personas, dispositivos o tecnologías de asistencia reales. Ninguna se ha ejecutado: el software no las simula y el expediente las marca como **pendientes**. Para cada una, anota en la columna de resultado `APRUEBA` o `RECHAZA`, la fecha, el dispositivo y la evidencia (captura, foto o grabación).

Preparación común: instalación local o de prueba con datos sintéticos (nunca datos reales de clientes), una empresa con sucursales Tienda, Restaurante y Mixta, un usuario por rol (Cajero, Mesero, Cocina, Administrador), un producto con variantes y otro con modificadores, y un método de efectivo, uno de tarjeta con referencia obligatoria.

## A. Lector de pantalla (accesibilidad)

Lo ya comprobado por DOM, ARIA y teclado (pestañas, foco atrapado y devuelto en la hoja móvil, `role="dialog"`, `inert` del fondo, avisos `role="status"`, nombres accesibles) **no sustituye** esta prueba.

| Entorno | Navegador | Tareas |
|---|---|---|
| Windows + NVDA (versión estable actual) | Chrome o Edge | T1–T5 |
| iPhone + VoiceOver | Safari | T1–T5 |
| Android + TalkBack | Chrome | T1–T5 |

Tareas (con el lector activo y sin mirar la pantalla):

1. **T1 Tienda**: abrir caja, buscar un producto, elegir variante, cobrar en efectivo con cambio y llegar a «Cobrar» con el carrito colapsado en teléfono.
2. **T2 Comandero**: elegir mesa, abrir cuenta, agregar un producto con modificador y nota, abrir la hoja de la comanda, enviar a cocina y cerrar la hoja.
3. **T3 Cocina**: identificar una comanda (mesa, mesero, hora, «Extra · envío n»), avanzar un producto y usar «Deshacer».
4. **T4 Caja Restaurante**: elegir una cuenta, dividir por comensal, cobrar y oír el cambio.
5. **T5 Errores y conexión**: provocar «Sin conexión» y una respuesta perdida y comprobar que el lector anuncia el estado y cómo recuperarse.

Criterios de aprobación por tarea: se completa sin ayuda visual; cada botón, campo y estado se anuncia con un nombre comprensible; el foco no sale de una hoja o diálogo abierto y regresa al control que lo abrió; los mensajes de estado se anuncian sin mover el foco; no hay «botón sin nombre» ni lectura de contenido que está detrás de un diálogo. **Evidencia**: grabación de audio o pantalla y lista de hallazgos con la pantalla y el texto leído.

## B. Hardware

| ID | Equipo | Configuración | Pasos exactos | Resultado esperado | Evidencia | Aprueba si |
|---|---|---|---|---|---|---|
| H1 | Tableta táctil Android o iPad (landscape) | Navegador actual, sesión de Cajero, sucursal Restaurante | Abrir Mesas, abrir una cuenta, agregar 5 productos con el dedo, abrir la hoja, enviar, cobrar | Todos los controles se activan al primer toque; sin zoom accidental; sin scroll horizontal | Video de 1 min | 0 toques fallidos en 20 intentos |
| H2 | Teléfono (390–430 px) | Sesión de Mesero | Tomar un pedido completo con una mano y enviar | «Enviar» alcanzable con el pulgar; la hoja abre y cierra con gestos y botones | Video | Pedido completo sin tocar fuera de la mitad inferior |
| H3 | Lector de códigos de barras USB o Bluetooth (modo teclado) | Caja de Tienda abierta, foco fuera de campos | Escanear 10 códigos seguidos de productos distintos; luego un código inexistente; luego uno ambiguo | 10 productos agregados una vez cada uno; el inexistente avisa; el ambiguo pide elegir | Video + resumen de la orden | 10/10 exactos, 0 duplicados |
| H4 | Impresora térmica de tickets (USB/red) | Impresión del navegador (`BROWSER`) | Cobrar y pulsar «Ver o imprimir comprobante» → imprimir | Ticket legible, importes iguales a pantalla, un solo comprobante de venta | Foto del ticket + captura | Importes y folio idénticos; estado «Enviado» sin afirmar confirmación |
| H5 | Impresora Bluetooth en Android | Transporte `BLUETOOTH`, Chrome en Android | Imprimir un comprobante y una comanda de Cocina | El sistema solicita el dispositivo; se imprime; si se apaga la impresora aparece el error | Fotos + captura del error | Imprime; el fallo es visible y reintentable. Un «SUBMITTED» no cuenta como papel confirmado |
| H6 | Terminal bancaria | Registrar el pago de tarjeta con su referencia manualmente | Cobrar con tarjeta ingresando el folio de la terminal | El pago exige la referencia y la guarda; no hay conexión automática con la terminal | Captura del pago y del recibo | La referencia consta en el comprobante. **No existe integración bancaria**: no debe presentarse como tal |
| H7 | 3 pantallas de Cocina simultáneas (distintos dispositivos o navegadores) | Misma sucursal, estaciones distintas | Enviar 20 comandas desde 2 meseros; avanzar productos desde las 3 pantallas | Cada pantalla ve los cambios en ≤10 s; ningún producto avanza dos veces; los conflictos se explican | Video de las 3 pantallas | 0 duplicados; todos los conflictos con mensaje |
| H8 | Pantalla de cocina de gran formato (TV/monitor) a 2–3 m | Cocina en 1920×1080 | Leer 5 comandas a distancia | Mesa, producto y notas legibles | Foto | 5/5 legibles sin acercarse |
| H9 | Corte de red real (apagar Wi-Fi) | Cualquier pantalla operativa | Cortar la red 30 s durante: envío de comanda, cobro, avance en Cocina; restaurar | Avisos de conexión; la operación no se pierde ni se duplica al reintentar | Video + revisión de la orden | 0 duplicados, 0 operaciones perdidas |

## C. Operación de piloto

| ID | Comprobación | Aprueba si |
|---|---|---|
| O1 | Un turno completo real con datos sintéticos de 4 horas (Tienda y Restaurante) | Corte de caja sin diferencias inexplicables |
| O2 | Capacitación: un mesero y un cajero nuevos completan sus recorridos con la guía impresa | Sin ayuda en el 2.º intento |
| O3 | Respaldo y restauración de la base del piloto | Restauración verificada con una venta reciente |
| O4 | Contrato y permisos reales de la empresa piloto revisados por su administrador | Cada rol solo ve lo que debe |

## D. Acciones que no puede hacer el software

1. Ejecutar A, B y C con los dispositivos reales anteriores y devolver los resultados.
2. Decidir el momento del piloto y la empresa piloto.
3. Hacer el push y el despliegue (esta revisión no los realiza): `pnpm docker:release` y la actualización en cada servidor, según el flujo habitual.
4. Aplicar a una instalación existente las migraciones nuevas de las fases 1 a 4 (`20261101120000_commerce_recovery_integrity`, `20261101233000_commerce_restaurant`, entre otras) con copia de seguridad previa.
