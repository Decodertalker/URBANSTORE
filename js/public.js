'use strict';
/* Catálogo público: lee la vista "catalogo_publico" (sin iniciar sesión). */

const sb = crearCliente({ auth: { persistSession: false, autoRefreshToken: false } });
const estado = { productos: [], cat: 'Todo', q: '' };

function etiqueta(p) {
  if (p.disponibilidad === 'agotado') return '<span class="badge out">Agotado</span>';
  if (p.disponibilidad === 'ultimas') return `<span class="badge low">Últimas ${esc(p.unidades)}</span>`;
  if (p.nuevo) return '<span class="badge">Nuevo</span>';
  return '';
}

function pintarHero() {
  $('#hero-art').innerHTML = `
    <svg class="a-hoodie" viewBox="0 0 120 120"><use href="#hoodie"/></svg>
    <svg class="a-tee" viewBox="0 0 120 120"><use href="#tee"/></svg>
    <svg class="a-cap" viewBox="0 0 120 120"><use href="#cap"/></svg>
    <div class="sticker">NUEVOS<br>INGRESOS</div>`;
}

function pintarContacto() {
  const items = [];
  if (CONFIG.DIRECCION) items.push(['Visítanos', CONFIG.DIRECCION]);
  if (CONFIG.HORARIO) items.push(['Horario', CONFIG.HORARIO]);
  if (CONFIG.WHATSAPP) items.push(['WhatsApp', `+${CONFIG.WHATSAPP}`]);
  if (items.length) {
    $('#contacto-items').innerHTML = items.map(([t, v]) => `<div><h3>${esc(t)}</h3><p>${esc(v)}</p></div>`).join('');
    $('#contacto').hidden = false;
    $('#nav-contacto').hidden = false;
  }
  if (CONFIG.WHATSAPP) {
    const a = $('#hero-wa');
    a.href = `https://wa.me/${CONFIG.WHATSAPP}?text=${encodeURIComponent('Hola URBANSTORE, quiero consultar por una prenda del catálogo.')}`;
    a.hidden = false;
  }
}

function pintarChips() {
  const cats = ['Todo', ...new Set(estado.productos.map((p) => p.categoria))];
  if (!cats.includes(estado.cat)) estado.cat = 'Todo';
  $('#chips').innerHTML = cats.length > 2
    ? cats.map((c) => `<button class="chip" type="button" data-cat="${esc(c)}" aria-pressed="${c === estado.cat}">${esc(c)}</button>`).join('')
    : '';
}

function pintarGrid() {
  const q = norm(estado.q);
  const lista = estado.productos.filter((p) =>
    (estado.cat === 'Todo' || p.categoria === estado.cat) && (!q || norm(p.nombre).includes(q)));
  $('#count').textContent = `${lista.length} ${lista.length === 1 ? 'prenda' : 'prendas'}`;
  if (!lista.length) {
    $('#grid').innerHTML = estado.productos.length
      ? '<div class="empty"><p>No encontramos prendas con ese filtro.</p><button class="btn" type="button" id="limpiar">Ver todo el catálogo</button></div>'
      : '<div class="empty"><p>Pronto tendremos prendas en el catálogo.</p></div>';
    return;
  }
  $('#grid').innerHTML = lista.map((p) => `
    <button class="card ${p.disponibilidad === 'agotado' ? 'agotado' : ''}" type="button" data-codigo="${esc(p.codigo)}">
      <div class="thumb" style="${estiloMiniatura(p)}">${contenidoMiniatura(p)}${etiqueta(p)}</div>
      <div class="info">
        <h3>${esc(p.nombre)}</h3>
        <div class="price"><small>${esc(MONEDA)}</small>${esc(entero(p.precio_venta))}</div>
      </div>
    </button>`).join('');
}

const dlg = $('#detalle');
function abrir(p) {
  const th = $('#m-thumb');
  th.setAttribute('style', estiloMiniatura(p));
  th.innerHTML = contenidoMiniatura(p);
  $('#m-cat').textContent = p.categoria;
  $('#m-nombre').textContent = p.nombre;
  $('#m-precio').innerHTML = `<small>${esc(MONEDA)}</small>${esc(entero(p.precio_venta))}`;
  $('#m-codigo').textContent = `Código ${p.codigo}`;
  const s = $('#m-stock');
  s.className = 'stock' + (p.disponibilidad === 'agotado' ? ' out' : p.disponibilidad === 'ultimas' ? ' low' : '');
  s.textContent = p.disponibilidad === 'agotado' ? 'Agotado por ahora'
    : p.disponibilidad === 'ultimas' ? `Últimas ${p.unidades} unidades` : 'Disponible en tienda';
  const wa = $('#m-wa');
  if (CONFIG.WHATSAPP) {
    wa.href = `https://wa.me/${CONFIG.WHATSAPP}?text=${encodeURIComponent(`Hola URBANSTORE, me interesa: ${p.nombre} (${p.codigo})`)}`;
    wa.hidden = false;
  } else {
    wa.hidden = true;
  }
  dlg.showModal();
}

async function cargar() {
  if (!sb) {
    $('#hero-count').textContent = 'Catálogo no disponible';
    $('#grid').innerHTML = '<div class="empty"><p>Falta configurar js/config.js con la URL y la clave de Supabase.</p></div>';
    return;
  }
  try {
    estado.productos = await traerTodo(() => sb.from('catalogo_publico').select('*').order('nombre'));
    $('#hero-count').textContent = `${estado.productos.length} ${estado.productos.length === 1 ? 'prenda' : 'prendas'} en catálogo`;
    pintarChips();
    pintarGrid();
  } catch (e) {
    $('#hero-count').textContent = 'Catálogo no disponible';
    $('#grid').innerHTML = `<div class="empty"><p>No pudimos cargar el catálogo. Intenta de nuevo en unos minutos.</p><button class="btn" type="button" id="reintentar">Reintentar</button></div>`;
  }
}

$('#chips').addEventListener('click', (e) => {
  const b = e.target.closest('[data-cat]');
  if (!b) return;
  estado.cat = b.dataset.cat;
  pintarChips();
  pintarGrid();
});
$('#buscar').addEventListener('input', (e) => { estado.q = e.target.value; pintarGrid(); });
$('#grid').addEventListener('click', (e) => {
  if (e.target.closest('#limpiar')) {
    estado.cat = 'Todo'; estado.q = ''; $('#buscar').value = '';
    pintarChips(); pintarGrid();
    return;
  }
  if (e.target.closest('#reintentar')) { cargar(); return; }
  const c = e.target.closest('[data-codigo]');
  if (c) abrir(estado.productos.find((p) => p.codigo === c.dataset.codigo));
});
$('#m-cerrar').addEventListener('click', () => dlg.close());
dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); });

$('#anio').textContent = new Date().getFullYear();
inyectarSprite();
pintarHero();
pintarContacto();
cargar();
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
