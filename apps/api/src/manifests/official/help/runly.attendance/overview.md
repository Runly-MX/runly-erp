---
title: Asistencia
summary: Checador de entradas y salidas con kioskos públicos que funcionan sin conexión, llave de teléfono, turnos, cuotas de contratistas y reportes.
---
Asistencia registra quién entra y quién sale, sea personal propio, contratistas o visitantes. Es independiente de Recursos Humanos: puedes importar a tus empleados desde RH, pero también dar de alta a personal externo que nunca será empleado.

### Personas, grupos y categorías

Cada **persona** tiene un código único, un tipo (interno, contratista o visitante), un **grupo** (por ejemplo, la empresa contratista) y una **categoría** (el tipo de elemento: soldador, electricista, ayudante). Con esos datos se cuentan los presentes y se revisan las cuotas.

### Kioskos

Un **kiosko** es una pantalla (tablet, teléfono o computadora) donde la gente checa. Crea el kiosko, copia su enlace y ábrelo en el dispositivo. El enlace solo no basta: el dispositivo muestra un **código de emparejamiento** que un administrador debe aprobar. Así, compartir el enlace no permite que cualquiera pueda checar. Si cambias de dispositivo, usa **Restablecer**.

El kiosko **funciona sin conexión**: guarda la lista de personas, registra las checadas en el dispositivo y las envía cuando vuelve la red. Cada checada lleva un identificador propio, por lo que reintentar un envío nunca la duplica. Si el reloj del dispositivo estaba desfasado, la checada se corrige y se marca para revisión.

### Formas de checar

- **Código y PIN**: la persona escribe su código de empleado y su PIN.
- **Tarjeta o llavero NFC**: se asigna el identificador de la tarjeta a la persona.
- **Llave de teléfono**: un administrador genera una invitación; la persona la abre en su teléfono, escribe su código de empleado y el teléfono crea una llave única. Después muestra un QR que cambia cada 30 segundos y el kiosko lo escanea. Funciona sin conexión.

### Cuotas de contratistas

Una **cuota** define el mínimo de personas de un grupo y categoría que deben estar presentes (por sitio y días). El tablero muestra cuántos hay, cuántos faltan y quién cumple.

### Reportes

Presencia en vivo, horas trabajadas por persona, cumplimiento de cuotas y la bitácora de checadas con las marcas de revisión (reloj desfasado, secuencia irregular, prueba de identidad fallida).
