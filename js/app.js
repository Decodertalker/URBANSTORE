'use strict';

/* =========================================================
   Inventario de Ropa - lógica de la aplicación
   Supabase (Auth + Postgres + Storage) + SheetJS (Excel)
   ========================================================= */

const sb = window.supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY);
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const MONEDA = CONFIG.MONEDA || '';

const state = {
  user: null,
  rol: null,
  productos: [],
  filtro: '',
  orden: 'nombre',
  editando: null,
  fotoNueva: null,
  fotoQuitada: false,
  importar: null,
  cargando: false
};

/* ---------- Utilidades ---------- */
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
));
const norm = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toLowerCase().trim().replace(/[^a-z0-9]+/g, ' ').trim();
const dinero = (n) => `${MONEDA} ${Number(n || 0).toLocaleString('es-NI', {
  minimumFractionDigits: 2, maximumFractionDigits: 2
})}`;

function toast(msg, tipo = '') {
  const t = $('#toast');
  t.textContent = msg;
  t.className = `show ${tipo}`;
  clearTimeout(toast._t);
  toast._t = setTimeout(() => { t.className = ''; }, 3500);
}

function ocupado(btn, on, texto) {
  if (!btn) return;
  if (on) {
    btn.dataset.txt = btn.textContent;
    btn.disabled = true;
    if (texto) btn.textContent = texto;
  } else {
    btn.disabled = false;
    if (btn.dataset.txt) btn.textContent = btn.dataset.txt;
  }
}

function traducirError(err) {
  const m = (err && err.message) || String(err);
  if (/Invalid login credentials/i.test(m)) return 'Correo o contraseña incorrectos.';
  if (/Database error saving new user|Correo no autorizado/i.test(m)) {
    return 'Este correo no está autorizado. Pide al administrador que lo agregue.';
  }
  if (/already registered|already been registered/i.test(m)) return 'Ya existe una cuenta con ese correo. Inicia sesión.';
  if (/Email not confirmed/i.test(m)) return 'Confirma tu correo antes de entrar (revisa tu bandeja).';
  if (/Password should be at least/i.test(m)) return 'La contraseña debe tener al menos 8 caracteres.';
  if (/rate limit/i.test(m)) return 'Demasiados intentos. Espera unos minutos.';
  return m;
}

function mostrar(vista) {
  $('#vista-login').classList.toggle('hidden', vista !== 'login');
  $('#vista-app').classList.toggle('hidden', vista !== 'app');
}

function msgLogin(texto, tipo = '') {
  const el = $('#login-msg');
  el.textContent = texto;
  el.className = `msg ${tipo}`;
}

/* ---------- Sesión ---------- */
async function iniciar() {
  document.title = CONFIG.NOMBRE_TIENDA || 'Inventario';
  $('#login-titulo').textContent = CONFIG.NOMBRE_TIENDA || 'Inventario';
  $('#app-titulo').textContent = CONFIG.NOMBRE_TIENDA || 'Inventario';

  if (CONFIG.SUPABASE_URL.includes('TU-PROYECTO')) {
    mostrar('login');
    msgLogin('Falta configurar js/config.js con la URL y la anon key de Supabase.');
    return;
  }

  const { data } = await sb.auth.getSession();
  await alCambiarSesion(data.session);

  sb.auth.onAuthStateChange((evento, sesion) => {
    // setTimeout evita bloqueos al llamar a Supabase dentro del callback
    setTimeout(async () => {
      if (evento === 'PASSWORD_RECOVERY') {
        const nueva = prompt('Escribe tu nueva contraseña (mínimo 8 caracteres):');
        if (nueva && nueva.length >= 8) {
          const { error } = await sb.auth.updateUser({ password: nueva });
          toast(error ? traducirError(error) : 'Contraseña actualizada', error ? 'error' : 'ok');
        }
      }
      if (evento === 'SIGNED_OUT') return alCambiarSesion(null);
      if (evento === 'SIGNED_IN' && sesion?.user?.id !== state.user?.id) return alCambiarSesion(sesion);
    }, 0);
  });
}

async function alCambiarSesion(sesion) {
  if (!sesion) {
    state.user = null;
    state.rol = null;
    state.productos = [];
    mostrar('login');
    return;
  }

  const email = (sesion.user.email || '').toLowerCase();
  const { data, error } = await sb.from('usuarios_permitidos')
    .select('rol, activo').eq('email', email).maybeSingle();

  if (error || !data || !data.activo) {
    await sb.auth.signOut();
    mostrar('login');
    msgLogin('Tu cuenta no tiene acceso a esta aplicación. Contacta al administrador.');
    return;
  }

  state.user = sesion.user;
  state.rol = data.rol;
  $('#app-usuario').textContent = `${email} · ${data.rol === 'admin' ? 'Administrador' : 'Empleado'}`;
  $('#tab-usuarios').classList.toggle('hidden', data.rol !== 'admin');
  mostrar('app');
  irTab('productos');
  await cargarProductos();
}

/* ---------- Login ---------- */
$('#form-login').addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = $('#btn-entrar');
  msgLogin('');
  ocupado(btn, true, 'Entrando…');
  const { error } = await sb.auth.signInWithPassword({
    email: $('#login-email').value.trim().toLowerCase(),
    password: $('#login-pass').value
  });
  ocupado(btn, false);
  if (error) msgLogin(traducirError(error));
});

$('#btn-registro').addEventListener('click', async () => {
  const email = $('#login-email').value.trim().toLowerCase();
  const password = $('#login-pass').value;
  if (!email || password.length < 8) {
    return msgLogin('Escribe tu correo y una contraseña de al menos 8 caracteres.');
  }
  const btn = $('#btn-registro');
  ocupado(btn, true, 'Creando…');
  const { data, error } = await sb.auth.signUp({ email, password });
  ocupado(btn, false);
  if (error) return msgLogin(traducirError(error));
  if (!data.session) msgLogin('Cuenta creada. Revisa tu correo para confirmarla y luego inicia sesión.', 'ok');
});

$('#btn-olvide').addEventListener('click', async () => {
  const email = $('#login-email').value.trim().toLowerCase();
  if (!email) return msgLogin('Escribe tu correo arriba y vuelve a pulsar.');
  const { error } = await sb.auth.resetPasswordForEmail(email, {
    redirectTo: location.origin + location.pathname
  });
  msgLogin(error ? traducirError(error) : 'Si el correo está registrado, recibirás un enlace para cambiar la contraseña.', error ? '' : 'ok');
});

$('#btn-salir').addEventListener('click', () => sb.auth.signOut());
$('#btn-refrescar').addEventListener('click', () => cargarProductos(false, true));

/* ---------- Pestañas ---------- */
function irTab(nombre) {
  $$('.tab').forEach((b) => b.classList.toggle('active', b.dataset.tab === nombre));
  $$('.panel').forEach((p) => p.classList.toggle('hidden', p.id !== `panel-${nombre}`));
  if (nombre === 'usuarios') cargarUsuarios();
}
$$('.tab').forEach((b) => b.addEventListener('click', () => irTab(b.dataset.tab)));

/* ---------- Productos: carga y lista ---------- */
async function traerTodos() {
  const paso = 1000;
  const todos = [];
  for (let desde = 0; ; desde += paso) {
    const { data, error } = await sb.from('productos').select('*')
      .order('nombre').range(desde, desde + paso - 1);
    if (error) throw error;
    todos.push(...data);
    if (data.length < paso) break;
  }
  return todos.map((p) => ({
    ...p,
    costo_compra: Number(p.costo_compra),
    precio_venta: Number(p.precio_venta),
    existencia: Number(p.existencia)
  }));
}

async function cargarProductos(silencioso = false, avisar = false) {
  if (state.cargando) return;
  state.cargando = true;
  try {
    state.productos = await traerTodos();
    renderProductos();
    if (avisar) toast('Inventario actualizado', 'ok');
  } catch (e) {
    if (!silencioso) toast(`No se pudo cargar: ${traducirError(e)}`, 'error');
  } finally {
    state.cargando = false;
  }
}

function renderStats(lista) {
  const unidades = lista.reduce((a, p) => a + p.existencia, 0);
  const valCosto = lista.reduce((a, p) => a + p.existencia * p.costo_compra, 0);
  const valVenta = lista.reduce((a, p) => a + p.existencia * p.precio_venta, 0);
  $('#stats').innerHTML = `
    <div class="stat"><span>Productos</span><b>${lista.length}</b></div>
    <div class="stat"><span>Unidades</span><b>${unidades}</b></div>
    <div class="stat"><span>Valor a costo</span><b>${dinero(valCosto)}</b></div>
    <div class="stat"><span>Valor a venta</span><b>${dinero(valVenta)}</b></div>`;
}

function renderProductos() {
  renderStats(state.productos);
  const q = norm(state.filtro);
  let lista = state.productos.filter((p) => !q || norm(p.nombre).includes(q));

  if (state.orden === 'stock') lista.sort((a, b) => a.existencia - b.existencia || a.nombre.localeCompare(b.nombre));
  else if (state.orden === 'reciente') lista.sort((a, b) => new Date(b.actualizado_en) - new Date(a.actualizado_en));
  else lista.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));

  if (!lista.length) {
    $('#lista').innerHTML = `<div class="vacio">${state.productos.length
      ? 'Ningún producto coincide con la búsqueda.'
      : 'Aún no hay productos. Pulsa ＋ o importa tu Excel en la pestaña “Excel / Descargas”.'}</div>`;
    return;
  }

  $('#lista').innerHTML = lista.map((p) => {
    const clase = p.existencia === 0 ? 'cero' : p.existencia <= CONFIG.STOCK_BAJO ? 'bajo' : '';
    return `
      <article class="card" data-id="${p.id}">
        <div class="foto" data-act="editar">${p.foto_url
          ? `<img src="${esc(p.foto_url)}" loading="lazy" alt="">` : '<span>👕</span>'}</div>
        <div class="info">
          <h3>${esc(p.nombre)}</h3>
          <div class="precios">
            <span>Venta <b>${dinero(p.precio_venta)}</b></span>
            <span>Costo ${dinero(p.costo_compra)}</span>
          </div>
          <div class="stock-row">
            <button class="paso" data-act="menos" aria-label="Restar uno">−</button>
            <span class="badge ${clase}">${p.existencia}</span>
            <button class="paso" data-act="mas" aria-label="Sumar uno">＋</button>
            <button class="btn link" data-act="editar">Editar</button>
          </div>
        </div>
      </article>`;
  }).join('');
}

$('#lista').addEventListener('click', (e) => {
  const el = e.target.closest('[data-act]');
  if (!el) return;
  const id = el.closest('.card').dataset.id;
  const act = el.dataset.act;
  if (act === 'editar') abrirModal(state.productos.find((p) => p.id === id));
  if (act === 'mas') ajustar(id, 1);
  if (act === 'menos') ajustar(id, -1);
});

$('#buscar').addEventListener('input', (e) => { state.filtro = e.target.value; renderProductos(); });
$('#orden').addEventListener('change', (e) => { state.orden = e.target.value; renderProductos(); });

async function ajustar(id, delta) {
  const p = state.productos.find((x) => x.id === id);
  if (!p) return;
  const nueva = Math.max(0, p.existencia + delta);
  if (nueva === p.existencia) return;
  const antes = p.existencia;
  p.existencia = nueva;
  renderProductos();
  const { error } = await sb.from('productos').update({ existencia: nueva }).eq('id', id);
  if (error) {
    p.existencia = antes;
    renderProductos();
    toast('No se pudo actualizar la existencia', 'error');
  }
}

document.addEventListener('visibilitychange', () => {
  if (!document.hidden && state.user) cargarProductos(true);
});

/* ---------- Productos: modal y fotos ---------- */
const modal = $('#modal-producto');

function pintarPreview(url) {
  $('#p-preview').innerHTML = url ? `<img src="${esc(url)}" alt="">` : '<span>👕</span>';
  $('#p-quitar-foto').classList.toggle('hidden', !url);
}

function abrirModal(p = null) {
  state.editando = p;
  state.fotoNueva = null;
  state.fotoQuitada = false;
  $('#modal-titulo').textContent = p ? 'Editar producto' : 'Nuevo producto';
  $('#p-nombre').value = p ? p.nombre : '';
  $('#p-costo').value = p ? p.costo_compra : 0;
  $('#p-precio').value = p ? p.precio_venta : 0;
  $('#p-existencia').value = p ? p.existencia : 0;
  $('#p-foto').value = '';
  $('#p-msg').textContent = '';
  $('#p-eliminar').classList.toggle('hidden', !(p && state.rol === 'admin'));
  pintarPreview(p?.foto_url || null);
  modal.showModal();
}

$('#btn-nuevo').addEventListener('click', () => abrirModal());
$('#p-cancelar').addEventListener('click', () => modal.close());

async function reducirImagen(archivo, max = 900) {
  const bmp = await createImageBitmap(archivo, { imageOrientation: 'from-image' });
  const escala = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bmp.width * escala);
  canvas.height = Math.round(bmp.height * escala);
  canvas.getContext('2d').drawImage(bmp, 0, 0, canvas.width, canvas.height);
  return new Promise((ok, fail) => canvas.toBlob(
    (b) => (b ? ok(b) : fail(new Error('No se pudo procesar la imagen'))), 'image/jpeg', 0.82
  ));
}

$('#p-foto').addEventListener('change', async (e) => {
  const archivo = e.target.files[0];
  if (!archivo) return;
  try {
    state.fotoNueva = await reducirImagen(archivo);
    state.fotoQuitada = false;
    pintarPreview(URL.createObjectURL(state.fotoNueva));
  } catch (err) {
    toast('No se pudo leer la imagen', 'error');
  }
});

$('#p-quitar-foto').addEventListener('click', () => {
  state.fotoNueva = null;
  state.fotoQuitada = true;
  $('#p-foto').value = '';
  pintarPreview(null);
});

async function subirFoto(blob) {
  const ruta = `${crypto.randomUUID()}.jpg`;
  const { error } = await sb.storage.from('productos')
    .upload(ruta, blob, { contentType: 'image/jpeg', cacheControl: '31536000' });
  if (error) throw error;
  return sb.storage.from('productos').getPublicUrl(ruta).data.publicUrl;
}

async function borrarFoto(url) {
  if (!url || !url.includes('/object/public/productos/')) return;
  const ruta = decodeURIComponent(url.split('/object/public/productos/')[1].split('?')[0]);
  await sb.storage.from('productos').remove([ruta]).catch(() => {});
}

$('#form-producto').addEventListener('submit', async (e) => {
  e.preventDefault();
  const msg = $('#p-msg');
  msg.textContent = '';

  const nombre = $('#p-nombre').value.trim();
  const costo = parseFloat($('#p-costo').value);
  const precio = parseFloat($('#p-precio').value);
  const existencia = parseInt($('#p-existencia').value, 10);

  if (!nombre) return (msg.textContent = 'Escribe el nombre del producto.');
  if ([costo, precio].some((n) => Number.isNaN(n) || n < 0)) return (msg.textContent = 'Costo y precio deben ser números positivos.');
  if (Number.isNaN(existencia) || existencia < 0) return (msg.textContent = 'La existencia debe ser un número entero, 0 o más.');

  const btn = $('#p-guardar');
  ocupado(btn, true, 'Guardando…');
  try {
    const anterior = state.editando?.foto_url || null;
    let foto_url = anterior;

    if (state.fotoNueva) foto_url = await subirFoto(state.fotoNueva);
    else if (state.fotoQuitada) foto_url = null;

    const fila = { nombre, costo_compra: costo, precio_venta: precio, existencia, foto_url };
    const consulta = state.editando
      ? sb.from('productos').update(fila).eq('id', state.editando.id)
      : sb.from('productos').insert(fila);
    const { error } = await consulta;

    if (error) {
      if (state.fotoNueva && foto_url !== anterior) await borrarFoto(foto_url);
      throw error;
    }
    if (anterior && anterior !== foto_url) await borrarFoto(anterior);

    modal.close();
    toast('Producto guardado', 'ok');
    await cargarProductos(true);
  } catch (err) {
    msg.textContent = err.code === '23505'
      ? 'Ya existe un producto con ese nombre.' : traducirError(err);
  } finally {
    ocupado(btn, false);
  }
});

$('#p-eliminar').addEventListener('click', async () => {
  const p = state.editando;
  if (!p || !confirm(`¿Eliminar “${p.nombre}”? Esta acción no se puede deshacer.`)) return;
  const { error } = await sb.from('productos').delete().eq('id', p.id);
  if (error) return ($('#p-msg').textContent = traducirError(error));
  await borrarFoto(p.foto_url);
  modal.close();
  toast('Producto eliminado', 'ok');
  await cargarProductos(true);
});

/* ---------- Exportar ---------- */
function filasParaExportar(lista) {
  return lista.map((p) => ({
    'Nombre': p.nombre,
    'Costo compra': p.costo_compra,
    'Precio venta': p.precio_venta,
    'Existencia': p.existencia,
    'Foto (URL)': p.foto_url || '',
    'Última actualización': p.actualizado_en ? new Date(p.actualizado_en).toLocaleString('es-NI') : ''
  }));
}

const hoy = () => new Date().toISOString().slice(0, 10);

async function exportar(formato, btn) {
  ocupado(btn, true, 'Preparando…');
  try {
    const lista = await traerTodos(); // siempre datos frescos
    const ws = XLSX.utils.json_to_sheet(filasParaExportar(lista));
    ws['!cols'] = [{ wch: 36 }, { wch: 14 }, { wch: 14 }, { wch: 12 }, { wch: 50 }, { wch: 22 }];
    if (formato === 'xlsx') {
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Inventario');
      XLSX.writeFile(wb, `inventario_${hoy()}.xlsx`);
    } else {
      const csv = '﻿' + XLSX.utils.sheet_to_csv(ws);
      const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
      const a = Object.assign(document.createElement('a'), { href: url, download: `inventario_${hoy()}.csv` });
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    }
    toast(`Descargados ${lista.length} productos`, 'ok');
  } catch (e) {
    toast(`No se pudo exportar: ${traducirError(e)}`, 'error');
  } finally {
    ocupado(btn, false);
  }
}
$('#btn-export-xlsx').addEventListener('click', (e) => exportar('xlsx', e.currentTarget));
$('#btn-export-csv').addEventListener('click', (e) => exportar('csv', e.currentTarget));

/* ---------- Importar desde Excel ---------- */
$('#btn-plantilla').addEventListener('click', () => {
  const ws = XLSX.utils.json_to_sheet([
    { 'Nombre': 'Camisa blanca talla M', 'Costo compra': 180, 'Precio venta': 350, 'Existencia': 12 },
    { 'Nombre': 'Jeans azul talla 32', 'Costo compra': 320, 'Precio venta': 650, 'Existencia': 8 }
  ]);
  ws['!cols'] = [{ wch: 36 }, { wch: 14 }, { wch: 14 }, { wch: 12 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Inventario');
  XLSX.writeFile(wb, 'plantilla_inventario.xlsx');
});

const ALIAS = {
  nombre: ['nombre', 'producto', 'nombre del producto', 'articulo', 'descripcion'],
  costo: ['costo', 'costo compra', 'costo de compra', 'precio compra', 'precio de compra', 'costo unitario'],
  precio: ['precio', 'precio venta', 'precio de venta', 'venta', 'pvp'],
  existencia: ['existencia', 'existencias', 'stock', 'cantidad', 'inventario', 'unidades']
};

function aNumero(v) {
  if (typeof v === 'number') return v;
  let s = String(v ?? '').replace(/[^\d.,-]/g, '');
  if (!s) return 0;
  if (s.includes('.') && s.includes(',')) s = s.replace(/,/g, '');
  else if (s.includes(',')) s = /,\d{1,2}$/.test(s) ? s.replace(',', '.') : s.replace(/,/g, '');
  const n = parseFloat(s);
  return Number.isNaN(n) ? NaN : n;
}

async function leerExcel(archivo) {
  const wb = XLSX.read(await archivo.arrayBuffer(), { type: 'array' });
  const filas = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '' });
  if (!filas.length) throw new Error('El archivo no tiene filas.');

  const columnas = Object.keys(filas[0]);
  const buscar = (alias) => columnas.find((c) => alias.includes(norm(c)));
  const col = {
    nombre: buscar(ALIAS.nombre), costo: buscar(ALIAS.costo),
    precio: buscar(ALIAS.precio), existencia: buscar(ALIAS.existencia)
  };
  if (!col.nombre) {
    throw new Error(`No encontré la columna “Nombre”. Columnas detectadas: ${columnas.join(', ')}`);
  }

  const existentes = new Map(state.productos.map((p) => [p.nombre.toLowerCase(), p.nombre]));
  const porNombre = new Map();
  const errores = [];

  filas.forEach((f, i) => {
    const nombre = String(f[col.nombre] ?? '').trim();
    if (!nombre) return;
    const costo = col.costo ? aNumero(f[col.costo]) : 0;
    const precio = col.precio ? aNumero(f[col.precio]) : 0;
    const existencia = col.existencia ? aNumero(f[col.existencia]) : 0;
    if ([costo, precio, existencia].some((n) => Number.isNaN(n) || n < 0)) {
      errores.push(`Fila ${i + 2} (${nombre}): valores numéricos inválidos`);
      return;
    }
    const clave = nombre.toLowerCase();
    const nombreFinal = existentes.get(clave) || nombre; // respeta mayúsculas del existente
    porNombre.set(clave, {
      nombre: nombreFinal, costo_compra: costo, precio_venta: precio, existencia: Math.round(existencia)
    });
  });

  const items = [...porNombre.values()];
  const nuevos = items.filter((it) => !existentes.has(it.nombre.toLowerCase())).length;
  return { items, nuevos, actualizados: items.length - nuevos, errores, faltan: { costo: !col.costo, precio: !col.precio, existencia: !col.existencia } };
}

$('#archivo-excel').addEventListener('change', async (e) => {
  const archivo = e.target.files[0];
  if (!archivo) return;
  const prev = $('#import-preview');
  const btn = $('#btn-importar');
  state.importar = null;
  btn.classList.add('hidden');
  prev.classList.remove('hidden');
  prev.textContent = 'Leyendo archivo…';
  try {
    const r = await leerExcel(archivo);
    state.importar = r;
    const faltan = Object.entries(r.faltan).filter(([, v]) => v).map(([k]) => k);
    prev.innerHTML = `
      <p><b>${r.items.length}</b> productos listos: <b>${r.nuevos}</b> nuevos y <b>${r.actualizados}</b> por actualizar.</p>
      ${faltan.length ? `<p class="msg">No se encontró la columna: ${faltan.join(', ')} (se usará 0).</p>` : ''}
      ${r.errores.length ? `<p class="msg">${r.errores.length} filas omitidas:<br>${r.errores.slice(0, 5).map(esc).join('<br>')}${r.errores.length > 5 ? '<br>…' : ''}</p>` : ''}
      <table><thead><tr><th>Nombre</th><th>Costo</th><th>Venta</th><th>Exist.</th></tr></thead><tbody>
      ${r.items.slice(0, 5).map((it) => `<tr><td>${esc(it.nombre)}</td><td>${it.costo_compra}</td><td>${it.precio_venta}</td><td>${it.existencia}</td></tr>`).join('')}
      </tbody></table>${r.items.length > 5 ? `<p>… y ${r.items.length - 5} más</p>` : ''}`;
    if (r.items.length) btn.classList.remove('hidden');
  } catch (err) {
    prev.innerHTML = `<p class="msg">${esc(err.message)}</p>`;
  }
});

$('#btn-importar').addEventListener('click', async (e) => {
  const r = state.importar;
  if (!r || !r.items.length) return;
  if (!confirm(`Se importarán ${r.items.length} productos (${r.nuevos} nuevos, ${r.actualizados} actualizados). ¿Continuar?`)) return;
  const btn = e.currentTarget;
  ocupado(btn, true, 'Importando…');
  try {
    for (let i = 0; i < r.items.length; i += 500) {
      const { error } = await sb.from('productos')
        .upsert(r.items.slice(i, i + 500), { onConflict: 'nombre' });
      if (error) throw error;
    }
    toast(`Importación completa: ${r.items.length} productos`, 'ok');
    state.importar = null;
    $('#archivo-excel').value = '';
    $('#import-preview').classList.add('hidden');
    btn.classList.add('hidden');
    await cargarProductos(true);
    irTab('productos');
  } catch (err) {
    toast(`Error al importar: ${traducirError(err)}`, 'error');
  } finally {
    ocupado(btn, false);
  }
});

/* ---------- Usuarios (solo administrador) ---------- */
async function cargarUsuarios() {
  if (state.rol !== 'admin') return;
  const cont = $('#lista-usuarios');
  const { data, error } = await sb.from('usuarios_permitidos').select('*').order('creado_en');
  if (error) { cont.textContent = traducirError(error); return; }
  const yo = (state.user.email || '').toLowerCase();
  cont.innerHTML = data.map((u) => {
    const soyYo = u.email === yo;
    return `
      <div class="usuario ${u.activo ? '' : 'inactivo'}" data-email="${esc(u.email)}">
        <div class="correo">${esc(u.email)}${soyYo ? '<small>(tú)</small>' : ''}</div>
        <select data-act="rol" ${soyYo ? 'disabled' : ''} aria-label="Rol">
          <option value="empleado" ${u.rol === 'empleado' ? 'selected' : ''}>Empleado</option>
          <option value="admin" ${u.rol === 'admin' ? 'selected' : ''}>Administrador</option>
        </select>
        <button class="btn" data-act="activo" ${soyYo ? 'disabled' : ''}>${u.activo ? 'Desactivar' : 'Activar'}</button>
        <button class="btn peligro" data-act="borrar" ${soyYo ? 'disabled' : ''}>Quitar</button>
      </div>`;
  }).join('') || '<p>No hay usuarios.</p>';
}

$('#form-usuario').addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = $('#u-email').value.trim().toLowerCase();
  const { error } = await sb.from('usuarios_permitidos').insert({ email, rol: $('#u-rol').value });
  if (error) return toast(error.code === '23505' ? 'Ese correo ya está en la lista.' : traducirError(error), 'error');
  $('#u-email').value = '';
  toast('Usuario agregado. Ya puede crear su cuenta.', 'ok');
  cargarUsuarios();
});

$('#lista-usuarios').addEventListener('click', async (e) => {
  const b = e.target.closest('button[data-act]');
  if (!b) return;
  const fila = b.closest('.usuario');
  const email = fila.dataset.email;
  let error;
  if (b.dataset.act === 'activo') {
    const activar = b.textContent.trim() === 'Activar';
    ({ error } = await sb.from('usuarios_permitidos').update({ activo: activar }).eq('email', email));
  } else if (b.dataset.act === 'borrar') {
    if (!confirm(`¿Quitar el acceso de ${email}?`)) return;
    ({ error } = await sb.from('usuarios_permitidos').delete().eq('email', email));
  }
  if (error) toast(traducirError(error), 'error');
  cargarUsuarios();
});

$('#lista-usuarios').addEventListener('change', async (e) => {
  if (e.target.dataset.act !== 'rol') return;
  const email = e.target.closest('.usuario').dataset.email;
  const { error } = await sb.from('usuarios_permitidos').update({ rol: e.target.value }).eq('email', email);
  toast(error ? traducirError(error) : 'Rol actualizado', error ? 'error' : 'ok');
});

/* ---------- Arranque ---------- */
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
iniciar();
