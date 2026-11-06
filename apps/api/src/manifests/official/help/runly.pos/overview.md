---
title: POS
summary: Punto de venta para tienda, restaurante u operacion mixta, con cajas por enlace, citas y cocina en tiempo real.
---
Runly POS es la terminal de venta: abre y cierra caja, cobra ventas de mostrador, atiende mesas, manda comandas a cocina y agenda citas que se cobran desde la caja.

- **Caja**: se cobra. Escanea o toca productos, cobra un monto libre, aplica descuentos, divide el pago y genera el comprobante. En restaurante tambien cobras las cuentas de las mesas.
- **Citas**: agenda servicios con tus clientes y cobralos desde la caja; tambien aparecen en el Calendario.
- **Comandero**: las mesas del restaurante; el mesero abre la cuenta, captura el consumo y lo envia a cocina.
- **Cocina**: las comandas por estacion (Cocina, Barra, Postres...), en tiempo real.
- **Ordenes**: el historial de ventas, comprobantes y devoluciones.
- **Administracion**: tu negocio, sucursales, cajas, formas de pago, cajas por enlace y, si sirves mesas, lo de restaurante.

Cada sucursal se define como **tienda**, **restaurante** o **mixta**; lo de restaurante (mesas, comandero, cocina) solo aparece donde hace falta.

### Cajas por enlace

Una caja puede abrirse fuera del ERP, en el dispositivo del mostrador, con un enlace (en **Administracion > Cajas por enlace**). Al abrirlo aparece un codigo que un administrador autoriza; desde entonces ese dispositivo queda vinculado a la caja. Si activas **PIN de cajeros**, cada persona entra con su PIN de 4 a 6 digitos.

### Como se conecta con el resto del sistema

- Los productos y servicios que vendes vienen del modulo de Catalogo.
- Una venta o una cita puede vincularse a un contacto de Contactos.
- Las citas se reflejan en el Calendario.

### Alcances y limites

- Para vender se necesita una caja abierta. El cierre compara el efectivo contado contra el esperado y deja registrada la diferencia; un turno cerrado queda fijo para reportes.
- Comandero y Cocina son opcionales: una tienda cobra directo en Caja.
- El plano del salon es opcional; las mesas se crean con nombre y capacidad sin dibujar nada.
