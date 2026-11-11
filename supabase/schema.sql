-- =====================================================
-- Inventario tienda de ropa - Esquema de Supabase
-- Ejecutar completo en: Supabase > SQL Editor > New query
-- =====================================================

-- 1) Usuarios permitidos ---------------------------------
create table if not exists public.usuarios_permitidos (
  email      text primary key,
  rol        text not null default 'empleado' check (rol in ('admin', 'empleado')),
  activo     boolean not null default true,
  creado_en  timestamptz not null default now()
);

create or replace function public.normalizar_email()
returns trigger language plpgsql as $$
begin
  new.email := lower(trim(new.email));
  return new;
end $$;

drop trigger if exists trg_normalizar_email on public.usuarios_permitidos;
create trigger trg_normalizar_email
  before insert or update on public.usuarios_permitidos
  for each row execute function public.normalizar_email();

-- 2) Funciones auxiliares de rol --------------------------
create or replace function public.mi_rol()
returns text language sql stable security definer set search_path = public as $$
  select rol from public.usuarios_permitidos
  where email = lower(auth.jwt() ->> 'email') and activo
  limit 1
$$;

create or replace function public.es_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(public.mi_rol() = 'admin', false)
$$;

create or replace function public.es_usuario_activo()
returns boolean language sql stable security definer set search_path = public as $$
  select public.mi_rol() is not null
$$;

-- 3) Solo pueden registrarse correos autorizados ----------
create or replace function public.validar_registro()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not exists (
    select 1 from public.usuarios_permitidos
    where email = lower(new.email) and activo
  ) then
    raise exception 'Correo no autorizado';
  end if;
  return new;
end $$;

drop trigger if exists trg_validar_registro on auth.users;
create trigger trg_validar_registro
  before insert on auth.users
  for each row execute function public.validar_registro();

-- 4) Productos --------------------------------------------
create table if not exists public.productos (
  id            uuid primary key default gen_random_uuid(),
  nombre        text not null unique,
  costo_compra  numeric(12,2) not null default 0 check (costo_compra >= 0),
  precio_venta  numeric(12,2) not null default 0 check (precio_venta >= 0),
  existencia    integer not null default 0 check (existencia >= 0),
  foto_url      text,
  creado_en     timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);

create or replace function public.tocar_actualizado()
returns trigger language plpgsql as $$
begin
  new.actualizado_en := now();
  return new;
end $$;

drop trigger if exists trg_productos_actualizado on public.productos;
create trigger trg_productos_actualizado
  before update on public.productos
  for each row execute function public.tocar_actualizado();

-- 5) Seguridad por filas (RLS) ----------------------------
alter table public.usuarios_permitidos enable row level security;
alter table public.productos enable row level security;

drop policy if exists up_leer on public.usuarios_permitidos;
create policy up_leer on public.usuarios_permitidos for select to authenticated
  using (public.es_admin() or email = lower(auth.jwt() ->> 'email'));

drop policy if exists up_admin on public.usuarios_permitidos;
create policy up_admin on public.usuarios_permitidos for all to authenticated
  using (public.es_admin()) with check (public.es_admin());

drop policy if exists prod_leer on public.productos;
create policy prod_leer on public.productos for select to authenticated
  using (public.es_usuario_activo());

drop policy if exists prod_insertar on public.productos;
create policy prod_insertar on public.productos for insert to authenticated
  with check (public.es_usuario_activo());

drop policy if exists prod_actualizar on public.productos;
create policy prod_actualizar on public.productos for update to authenticated
  using (public.es_usuario_activo()) with check (public.es_usuario_activo());

drop policy if exists prod_borrar on public.productos;
create policy prod_borrar on public.productos for delete to authenticated
  using (public.es_admin());

-- 6) Almacenamiento de fotos ------------------------------
insert into storage.buckets (id, name, public)
values ('productos', 'productos', true)
on conflict (id) do nothing;

drop policy if exists fotos_leer on storage.objects;
create policy fotos_leer on storage.objects for select
  using (bucket_id = 'productos');

drop policy if exists fotos_subir on storage.objects;
create policy fotos_subir on storage.objects for insert to authenticated
  with check (bucket_id = 'productos' and public.es_usuario_activo());

drop policy if exists fotos_editar on storage.objects;
create policy fotos_editar on storage.objects for update to authenticated
  using (bucket_id = 'productos' and public.es_usuario_activo());

drop policy if exists fotos_borrar on storage.objects;
create policy fotos_borrar on storage.objects for delete to authenticated
  using (bucket_id = 'productos' and public.es_usuario_activo());

-- 7) PRIMER ADMINISTRADOR ---------------------------------
-- Cambia el correo por el tuyo y ejecuta esta línea.
-- Luego entra a la app, pulsa "Crear cuenta" con ese mismo correo.
insert into public.usuarios_permitidos (email, rol)
values ('tu-correo@ejemplo.com', 'admin')
on conflict (email) do nothing;
