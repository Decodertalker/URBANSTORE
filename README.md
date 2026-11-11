# Inventario de Ropa (web + móvil)

App web instalable en el celular (PWA) para llevar el inventario de una tienda de ropa.

- **Productos:** nombre, costo de compra, precio de venta, foto y existencia.
- **Carga inicial** desde Excel y después ingreso manual en la app.
- **Descarga** de la base de datos actualizada en Excel (.xlsx) o CSV.
- **Usuarios permitidos:** solo los correos autorizados por el administrador pueden crear cuenta y entrar.
- **Backend:** Supabase (Auth + Postgres + Storage). **Hosting:** GitHub Pages (gratis).

## Estructura

```
index.html          Interfaz
css/styles.css      Estilos (móvil primero, modo oscuro automático)
js/config.js        URL y anon key de Supabase  <-- editar
js/app.js           Lógica
manifest.json, sw.js, icon.svg   Instalación como app (PWA)
supabase/schema.sql Tablas, seguridad (RLS) y almacenamiento de fotos
```

## Puesta en marcha

### 1. Supabase
1. Crea un proyecto en <https://supabase.com>.
2. Ve a **SQL Editor → New query**, pega todo `supabase/schema.sql`.
   **Antes de ejecutar**, cambia `tu-correo@ejemplo.com` (última sección) por tu correo: será el primer administrador.
3. Ve a **Project Settings → API** y copia la **Project URL** y la clave **anon public**.
4. Pégalas en `js/config.js`. No uses nunca la `service_role key` aquí.
5. En **Authentication → Providers → Email** puedes desactivar *Confirm email* si quieres que los empleados entren sin confirmar el correo (más cómodo; el control de acceso ya lo da la lista de usuarios permitidos).

### 2. GitHub Pages
1. Crea un repositorio y sube todo el contenido de esta carpeta.
2. **Settings → Pages → Deploy from a branch → main / (root)**.
3. Tu app quedará en `https://TU-USUARIO.github.io/TU-REPO/`.
4. En Supabase, **Authentication → URL Configuration**, pon esa URL en *Site URL* (y en *Redirect URLs*). Sirve para el enlace de "Olvidé mi contraseña".

### 3. Primer uso
1. Abre la app, escribe tu correo (el del administrador) y una contraseña de 8+ caracteres, y pulsa **Crear cuenta**.
2. Pestaña **Usuarios**: agrega los correos de tus empleados. Cada uno entra a la app y pulsa **Crear cuenta** con ese correo.
3. Pestaña **Excel / Descargas**: baja la plantilla, llénala e impórtala. Si el nombre ya existe, se actualizan sus datos y se conserva la foto.
4. Las fotos se agregan producto por producto (Excel no las trae): abre el producto → **Tomar / elegir foto**. Se reducen automáticamente a ~900 px para ahorrar espacio.

### 4. Instalar en el celular
- **Android (Chrome):** menú ⋮ → *Instalar aplicación*.
- **iPhone (Safari):** Compartir → *Agregar a pantalla de inicio*.

## Roles y seguridad

| | Empleado | Administrador |
|---|---|---|
| Ver, agregar, editar productos y existencia | ✔ | ✔ |
| Importar / descargar Excel | ✔ | ✔ |
| Eliminar productos | ✘ | ✔ |
| Administrar usuarios permitidos | ✘ | ✔ |

- La seguridad la aplica la base de datos (RLS), no solo la interfaz: sin estar en la lista de permitidos activos no se puede leer ni escribir nada, aunque alguien tenga la anon key.
- Un trigger bloquea el registro de correos que no estén en la lista.
- **Desactivar** a un usuario le quita el acceso al instante. **Quitar** lo borra de la lista (su cuenta de login sigue existiendo en Supabase pero sin permisos; para borrarla del todo: Authentication → Users).
- Los costos son visibles para todos los usuarios. Si no quieres que los empleados vean el costo de compra, dímelo y lo separamos con una vista.

## Notas

- Los nombres de producto son únicos. Para variantes usa el nombre completo: "Camisa blanca talla M", "Camisa blanca talla L".
- Las fotos están en un bucket público (`productos`): quien tenga el enlace exacto de una foto puede verla, pero no listarlas.
- Plan gratuito de Supabase: 1 GB de archivos y 500 MB de base de datos, más que suficiente para miles de productos con fotos reducidas. Los proyectos gratuitos se pausan tras una semana sin actividad.
- Cambia moneda, nombre de la tienda y umbral de "poco stock" en `js/config.js`.
