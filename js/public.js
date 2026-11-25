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

/* ---------- Banner de más vendidos ---------- */
const banner = { items: [], i: 0, timer: null, pausa: false };

function arteMarca() {
  return `<div class="hero-art" aria-hidden="true">
    <svg class="a-hoodie" viewBox="0 0 120 120"><use href="#hoodie"/></svg>
    <svg class="a-tee" viewBox="0 0 120 120"><use href="#tee"/></svg>
    <svg class="a-cap" viewBox="0 0 120 120"><use href="#cap"/></svg>
    <div class="sticker">NUEVOS<br>INGRESOS</div></div>`;
}

function diapositiva(p, n) {
  const titulo = p.es_top ? `Más vendido #${n}` : 'Nuevo ingreso';
  const desc = p.descripcion || `${p.categoria} · Disponible en tienda`;
  const aviso = p.disponibilidad === 'ultimas' ? `<span class="badge low static">Últimas ${esc(p.unidades)}</span>` : '';
  return `
    <article class="tb-slide" data-codigo="${esc(p.codigo)}" aria-roledescription="diapositiva">
      <div class="tb-copy">
        <span class="eyebrow">${esc(titulo)}</span>
        <h2 class="tb-name">${esc(p.nombre)}</h2>
        <p class="tb-desc">${esc(desc)}</p>
        <div class="tb-row">
          <div class="tb-price"><small>${esc(MONEDA)}</small>${esc(entero(p.precio_venta))}</div>
          ${aviso}
        </div>
        <button class="btn small" type="button" data-ver="${esc(p.codigo)}">Ver detalle</button>
      </div>
      <div class="tb-media thumb" style="${estiloMiniatura(p)}">${contenidoMiniatura(p)}</div>
    </article>`;
}

function diapositivaMarca() {
  return `
    <article class="tb-slide tb-marca">
      <div class="tb-copy">
        <span class="eyebrow">Catálogo de la tienda</span>
        <h2 class="tb-name">Viste <span class="mark">la calle</span></h2>
        <p class="tb-desc">Camisetas, hoodies, pantalones y accesorios que tenemos hoy en tienda. Mira el catálogo y escríbenos para apartar tu prenda.</p>
      </div>
      <div class="tb-media tb-art">${arteMarca()}</div>
    </article>`;
}

function irA(i, suave = true) {
  const t = $('#tb-track');
  const n = banner.items.length || 1;
  banner.i = (i + n) % n;
  t.scrollTo({ left: banner.i * t.clientWidth, behavior: suave && !reducirMovimiento() ? 'smooth' : 'auto' });
  marcarPunto();
}
function reducirMovimiento() { return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches; }
function marcarPunto() {
  document.querySelectorAll('#tb-dots button').forEach((b, k) => b.setAttribute('aria-current', String(k === banner.i)));
}

function pintarBanner(items) {
  banner.items = items;
  const t = $('#tb-track');
  let n = 0;
  t.innerHTML = items.length
    ? items.map((p) => diapositiva(p, p.es_top ? ++n : 0)).join('')
    : diapositivaMarca();
  const varias = items.length > 1;
  ['#tb-prev', '#tb-next', '#tb-dots'].forEach((s) => { $(s).hidden = !varias; });
  $('#tb-dots').innerHTML = varias
    ? items.map((p, k) => `<button type="button" data-i="${k}" aria-label="Ir al producto ${k + 1}"></button>`).join('')
    : '';
  banner.i = 0;
  marcarPunto();
  clearInterval(banner.timer);
  if (varias && !reducirMovimiento()) {
    banner.timer = setInterval(() => { if (!banner.pausa && !document.hidden) irA(banner.i + 1); }, 6000);
  }
}

async function cargarBanner() {
  let items = [];
  if (sb) {
    try {
      const { data, error } = await sb.rpc('mas_vendidos', { p_limite: 5 });
      if (!error && Array.isArray(data)) items = data;
    } catch (_) { /* se muestra el banner de la marca */ }
  }
  pintarBanner(items);
}

function iniciarBanner() {
  const t = $('#tb-track');
  t.addEventListener('scroll', () => {
    const k = Math.round(t.scrollLeft / (t.clientWidth || 1));
    if (k !== banner.i) { banner.i = k; marcarPunto(); }
  }, { passive: true });
  $('#tb-prev').addEventListener('click', () => irA(banner.i - 1));
  $('#tb-next').addEventListener('click', () => irA(banner.i + 1));
  $('#tb-dots').addEventListener('click', (e) => { const b = e.target.closest('[data-i]'); if (b) irA(Number(b.dataset.i)); });
  const tb = $('#tb');
  ['pointerenter', 'focusin', 'touchstart'].forEach((ev) => tb.addEventListener(ev, () => { banner.pausa = true; }, { passive: true }));
  ['pointerleave', 'focusout', 'touchend'].forEach((ev) => tb.addEventListener(ev, () => { banner.pausa = false; }, { passive: true }));
  t.addEventListener('click', (e) => {
    const b = e.target.closest('[data-ver]');
    const p = b && banner.items.find((x) => x.codigo === b.dataset.ver);
    if (p) abrir(p);
  });
  window.addEventListener('resize', () => irA(banner.i, false));
  cargarBanner();
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
  const d = $('#m-desc');
  d.textContent = p.descripcion || '';
  d.hidden = !p.descripcion;
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
iniciarBanner();
pintarContacto();
cargar();
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
