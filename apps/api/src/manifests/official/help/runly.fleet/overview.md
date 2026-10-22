---
title: Flota
summary: Vehiculos, choferes, seguros y reportes de mantenimiento de la flota de la empresa.
---
Runly Flota administra los vehiculos de tu compania: quien los maneja, sus seguros y su historial de mantenimiento/servicio, todo desde un solo lugar en vez de hojas de calculo sueltas.

- **Resumen**: la pantalla de inicio. Muestra el estado de la flota, alertas inteligentes (mantenimientos vencidos o proximos, fallas recurrentes, gasto que sube, polizas y licencias por vencer), el gasto mensual y los proximos vencimientos. Se actualiza sola cuando alguien mas hace cambios.
- **Vehiculos**: el catalogo de vehiculos de la empresa.
- **Seguros**: polizas de seguro asociadas a cada vehiculo.
- **Reportes**: mantenimiento, servicio, reparacion u otros eventos registrados por vehiculo.
- **Choferes**: personas asignadas a manejar los vehiculos, con su licencia.
- **Catalogos**: tipos, marcas y modelos reutilizables al dar de alta un vehiculo.

### Alcances y limites

- Si un reporte de mantenimiento indica la fecha del proximo servicio, esa fecha aparece sola en el calendario "Mantenimiento de flota", visible para quienes pueden ver reportes. Si cambias la fecha o desactivas el reporte, el evento se ajusta.
- Al elegir modelo, marca o chofer en un formulario puedes crear el que falta sin salir: escribe el nombre y elige "Crear". La marca y el tipo se crean al instante; el modelo y el chofer abren un formulario con el nombre ya escrito.
- Un reporte queda asociado siempre a un vehiculo especifico; el historial completo de una unidad se arma solo con sus reportes a lo largo del tiempo.
- La licencia de un chofer y la vigencia de una poliza pueden tener fecha de vencimiento para que se les de seguimiento y no se venzan sin avisar.
- Flota no reemplaza al modulo de Contactos para los datos generales de una persona; aqui solo gestionas la parte especifica de choferes (licencia, asignacion de vehiculo).

### Con MirAI

Con la pestaña de MirAI abierta puedes pedirle, por ejemplo:

- "Que seguros vencen este mes"
- "Busca las especificaciones de este modelo" (con un vehiculo abierto)
- "Cuantos vehiculos estan en mantenimiento"
- "Asigna este vehiculo al chofer Juan Perez"

Si tienes un vehiculo abierto, MirAI sabe cual es: puedes pedirle "cambia su estado a mantenimiento" sin repetir la matricula. Como con cualquier accion, te muestra una tarjeta para confirmar antes de guardar algo.
