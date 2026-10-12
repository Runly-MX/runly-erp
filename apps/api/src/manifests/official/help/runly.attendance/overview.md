---
title: Asistencia
summary: Checador de entradas y salidas con kioskos públicos que funcionan sin conexión, llave de teléfono, turnos, cuotas de contratistas, vínculo con RH y reportes.
---
Asistencia registra quién entra y quién sale, sea personal propio, contratistas o visitantes. Es independiente de Recursos Humanos: puedes vincular a tus empleados con su expediente, pero también dar de alta a personal externo que nunca será empleado.

### Cómo se organiza

- **Resumen**: quién está dentro ahora, cuotas en incumplimiento, estado de los kioskos y checadas por revisar.
- **Personas**: el padrón de quienes checan, con su código, PIN, tarjeta, llave de teléfono, turno y vínculo con RH.
- **Checadas**: la bitácora de entradas y salidas, con marcas de revisión y captura manual.
- **Kioskos**: las pantallas donde la gente checa, con enlace público y emparejamiento.
- **Reportes**: horas trabajadas, cumplimiento de cuotas y presencia.
- **Configuración**: sitios, grupos, categorías, turnos y cuotas. La pestaña que abriste se recuerda al recargar la página.

### Personas, grupos y categorías

Cada **persona** tiene un código único, un tipo (interno, contratista o visitante), un **grupo** (por ejemplo, la empresa contratista) y una **categoría** (el tipo de elemento: soldador, electricista, ayudante). Con esos datos se cuentan los presentes y se revisan las cuotas.

### Vínculo con RH

Al escribir el nombre de una persona nueva, Asistencia sugiere a los colaboradores de RH que coinciden. Si eliges uno, la persona queda **vinculada**: comparte identidad con el expediente (y con su usuario de Runly, si lo tiene). En el expediente de RH aparece una sección **Asistencia** con el turno, si está presente, las horas de la semana y las últimas checadas. Un colaborador solo puede estar vinculado a una persona. Puedes desvincular cuando quieras sin perder las checadas.

### Importar personal

Con **Importar** subes un Excel o CSV. Puedes descargar la **plantilla base** (con las columnas de código, nombre, tipo, grupo, categoría, turno, PIN y código de RH, y una hoja con los valores válidos), o subir tu propio archivo y **relacionar tus columnas** con los campos de Asistencia, igual que en Inventario. Antes de guardar ves una vista previa con lo que se creará, actualizará u omitirá y los errores por fila. Puedes crear automáticamente los grupos y categorías que falten y vincular con RH por código o correo.

### Kioskos

Un **kiosko** es una pantalla (tablet, teléfono o computadora) donde la gente checa. Crea el kiosko, copia su enlace y ábrelo en el dispositivo. El enlace solo no basta: el dispositivo muestra un **código de emparejamiento** que un administrador debe aprobar. Así, compartir el enlace no permite que cualquiera pueda checar. Si cambias de dispositivo, usa **Restablecer**.

El kiosko **funciona sin conexión**: guarda la lista de personas, registra las checadas en el dispositivo y las envía cuando vuelve la red. Cada checada lleva un identificador propio, por lo que reintentar un envío nunca la duplica. Si el reloj del dispositivo estaba desfasado, la checada se corrige y se marca para revisión.

### Formas de checar

- **Código y PIN**: la persona escribe su código de empleado y su PIN.
- **Tarjeta o llavero NFC**: se asigna el identificador de la tarjeta a la persona.
- **Llave de teléfono**: un administrador genera una invitación; la persona la abre en su teléfono, escribe su código de empleado y el teléfono crea una llave única. Después muestra un QR que cambia cada pocos segundos y el kiosko lo escanea. Funciona sin conexión.

### Cuotas de contratistas

Una **cuota** define el mínimo de personas de un grupo y categoría que deben estar presentes (por sitio y días). El Resumen muestra cuántos hay, cuántos faltan y quién cumple.

### Alcances y límites

- La huella o el rostro del teléfono no identifican a nadie en el kiosko; solo pueden proteger la llave del propio teléfono (próximamente).
- Los PIN se guardan cifrados, pero el kiosko emparejado recibe su verificación para poder funcionar sin red; por eso conviene revocar un kiosko extraviado.
- Las checadas marcadas (reloj desfasado, secuencia irregular, identidad no verificada, QR reutilizado) se conservan para revisión; no se descartan.

### Con MirAI

Con la pestaña de MirAI abierta puedes pedirle, por ejemplo:

- "¿Quién está dentro ahora?" o "¿Cuántos contratistas hay presentes por empresa?"
- "¿Laura Navarro está presente? ¿Qué turno tiene?"
- "¿Qué cuotas de contratistas no se están cumpliendo y cuántos faltan?"
- "¿Cuántas horas trabajó cada persona esta semana?"

MirAI solo consulta: no registra checadas ni modifica personas, y solo ve lo que tu rol permite en Asistencia.
