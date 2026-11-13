# URBANSTORE · Catálogo e inventario

Dos páginas en un mismo sitio (GitHub Pages) con datos en Supabase:

- `index.html` → **Catálogo público** (sin usuario ni contraseña).
- `admin.html` → **Acceso del personal** (usuario + contraseña, sin correo).

## Roles
| Rol | Puede |
|---|---|
| **Administrador** | Todo: Dashboard, Vender, Productos (alta, edición, entradas, ajustes, etiquetas), Reportes, Excel, Ajustes (categorías y usuarios) |
| **Empleado** | Solo **Vender** (salida de productos con carrito). No ve costos de compra |

Cada entrada, salida y ajuste guarda el **usuario** que lo hizo.

## Puesta en marcha
1. **Supabase → SQL Editor**: pega y ejecuta `schema.sql` completo (se puede ejecutar más de una vez). Si ya tenías productos de la versión anterior, quedan copiados en la categoría SIN CATEGORIA y respaldados en `productos_v1_respaldo`.
2. **GitHub**: sube el contenido de este zip a tu repositorio (rama `main`) y en *Settings → Pages* elige **Source: GitHub Actions**.
3. Edita `js/config.js` si quieres mostrar dirección, horario y WhatsApp en el catálogo (`DIRECCION`, `HORARIO`, `WHATSAPP` con código de país, p. ej. `50588888888`). Vacíos, esos bloques se ocultan.
4. Entra en `admin.html` con **admin / Access02** y **cambia la contraseña** (botón "Contraseña" arriba a la derecha).
5. En *Ajustes* crea los usuarios (empleados o administradores).

## Códigos y lector
- Cada producto recibe un código automático `PREFIJO-00001` (prefijo de su categoría + ID). No cambia después.
- En Productos → **Etiqueta** / **Imprimir etiquetas** se generan códigos de barras (Code128, 50×30 mm).
- En **Vender**: un lector USB/Bluetooth escribe el código y pulsa Enter solo; también hay botón **Cámara**.

## Excel
- Plantilla en `plantilla/PLANTILLA_URBANSTORE.xlsx`. Se importa la hoja **entrada** (ID y código se generan solos). Si el producto ya existe, se suma la cantidad. La importación es todo o nada: si una fila tiene error, se indica la fila.
- *Excel → Descargar base de datos* baja un libro con GENERAL, entrada y SALIDA actualizados. Los reportes también se exportan con sus filtros.

## Alertas de reposición
En *Ajustes → Alertas de reposición* defines cuántos de los productos más vendidos del mes vigilar (top N) y cuándo avisar: cuando queden X unidades o menos, o cuando quede X % o menos de lo que había al empezar el mes (0 apaga ese criterio). Los avisos salen en el Dashboard, en la tarjeta "Por reponer".

## Limpieza inicial (una sola vez)
`limpieza_inicial.sql` borra salidas, ventas y ajustes de prueba, devuelve al inventario las unidades de esas ventas y registra el inventario general como entradas (sin duplicar). No volver a ejecutarlo.

## Seguridad de la sesión
Si nadie toca la pantalla durante 60 segundos (cambia `INACTIVIDAD_SEG` en `js/config.js`), el panel avisa en los últimos 10 s y cierra la sesión; hay que entrar otra vez con usuario y contraseña. También se pide al reabrir la app pasado ese tiempo. El carrito sin cobrar se pierde al cerrarse.

## Notas
- La existencia solo cambia mediante entradas, ventas o ajustes (todo queda registrado).
- Las ventas toman el precio desde la base de datos y no permiten vender más de lo que hay.
- El recibo es texto de 42 columnas, listo para una impresora matricial más adelante.
- Aún no existe "anular venta"; para corregir, usa un ajuste de existencia.
