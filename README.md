# Inventario de Ropa (web + móvil)

App web instalable en el celular (PWA) para llevar el inventario de una tienda de ropa.

- **Productos:** nombre, costo de compra, precio de venta, foto y existencia.
- **Carga inicial** desde Excel y después ingreso manual en la app.
- **Descarga** de la base de datos actualizada en Excel (.xlsx) o CSV.
- **Usuarios con usuario y contraseña (sin correo):** el administrador crea, cambia la contraseña y elimina usuarios desde la app.
- **Backend:** Supabase (Auth + Postgres + Storage). **Hosting:** GitHub Pages (gratis).

## Estructura

```
index.html               Interfaz
css/styles.css           Estilos (móvil primero, modo oscuro automático)
js/config.js             URL y clave pública de Supabase  <-- editar
js/app.js                Lógica
manifest.json, sw.js, icon.svg   Instalación como app (PWA)
supabase/schema.sql      Tablas, seguridad (RLS), fotos y usuario admin
.github/workflows/pages.yml      Publica la web en GitHub Pages
```

## Puesta en marcha

### 1. Supabase
1. Crea un proyecto en <https://supabase.com>.
2. **SQL Editor → New query**, pega todo `supabase/schema.sql` y pulsa **Run**. Esto crea las tablas, la seguridad, el almacenamiento de fotos y el usuario inicial **admin / Access02**.
3. **Project Settings → API**: copia la *Project URL* y la clave *anon / publishable* en `js/config.js`. Nunca uses la `service_role` / `secret`.
4. (Opcional) **Authentication → Sign In / Providers**: desactiva *Allow new users to sign up*. Es una capa extra: el sistema ya bloquea los registros que no vengan de un administrador.

### 2. GitHub Pages
1. Sube todo el contenido de esta carpeta a un repositorio (incluida la carpeta oculta `.github`). La rama debe llamarse `main`.
2. **Settings → Pages → Build and deployment → Source: GitHub Actions**.
3. Cada push a `main` publica la app (pestaña **Actions**). Quedará en `https://TU-USUARIO.github.io/TU-REPO/`.

### 3. Primer uso
1. Entra con usuario `admin` y contraseña `Access02`. Cámbiala enseguida con el botón 🔑.
2. Pestaña **Usuarios**: crea los usuarios de tus empleados (usuario + contraseña inicial). Cada uno puede cambiar la suya con 🔑.
3. Pestaña **Excel / Descargas**: baja la plantilla, llénala e impórtala. Si el nombre ya existe, se actualizan sus datos y se conserva la foto.
4. Las fotos se agregan producto por producto: abre el producto → **Tomar / elegir foto**.

### 4. Instalar en el celular
- **Android (Chrome):** menú ⋮ → *Instalar aplicación*.
- **iPhone (Safari):** Compartir → *Agregar a pantalla de inicio*.

## Roles y seguridad

| | Empleado | Administrador |
|---|---|---|
| Ver, agregar, editar productos y existencia | ✔ | ✔ |
| Importar / descargar Excel | ✔ | ✔ |
| Cambiar su propia contraseña | ✔ | ✔ |
| Eliminar productos | ✘ | ✔ |
| Crear / eliminar usuarios, cambiar contraseñas y roles | ✘ | ✔ |

- Los nombres de usuario usan 3 a 30 caracteres: letras minúsculas, números, punto, guion y guion bajo (sin espacios).
- Internamente cada usuario se guarda como `usuario@inventario.app`. No es un correo real y nunca se envían mensajes. Si cambias el dominio, hazlo igual en `schema.sql` y en `DOMINIO_USUARIOS` de `config.js`.
- No hay "olvidé mi contraseña" por correo: si alguien la olvida, el administrador le pone una nueva desde la pestaña Usuarios.
- **Desactivar** quita el acceso al instante. **Eliminar** borra al usuario por completo.
- La seguridad la aplica la base de datos (RLS y funciones solo para administradores), no solo la interfaz.
- Los costos de compra son visibles para todos los usuarios.

## Notas

- Los nombres de producto son únicos. Para variantes usa el nombre completo: "Camisa blanca talla M", "Camisa blanca talla L".
- Las fotos están en un bucket público (`productos`): quien tenga el enlace exacto de una foto puede verla, pero no listarlas.
- Plan gratuito de Supabase: 1 GB de archivos y 500 MB de base de datos. Los proyectos gratuitos se pausan tras una semana sin actividad.
- Si ya habías ejecutado una versión anterior de `schema.sql` (con usuarios por correo), vuelve a ejecutar esta: reemplaza la tabla de usuarios y conserva los productos. Puedes borrar el usuario viejo en Authentication → Users.
- Cambia moneda, nombre de la tienda y umbral de "poco stock" en `js/config.js`.
