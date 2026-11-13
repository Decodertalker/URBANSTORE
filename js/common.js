'use strict';
/* Utilidades compartidas por el catálogo público y el panel. */

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const MONEDA = CONFIG.MONEDA || '';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
));
const norm = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

const nfMoney = new Intl.NumberFormat('es-NI', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const nfInt = new Intl.NumberFormat('es-NI', { maximumFractionDigits: 0 });
const money = (n) => `${MONEDA} ${nfMoney.format(Number(n) || 0)}`;
const entero = (n) => nfInt.format(Number(n) || 0);

/* ---------- Fechas (siempre en la hora local del navegador) ---------- */
const pad2 = (n) => String(n).padStart(2, '0');
const fechaISO = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
const hoyISO = () => fechaISO(new Date());
function sumarDias(iso, dias) {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + dias);
  return fechaISO(d);
}
function fmtFecha(v) {
  if (!v) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) { const [y, m, d] = v.split('-'); return `${d}/${m}/${y}`; }
  const d = new Date(v);
  return `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()}`;
}
const fmtHora = (v) => { const d = new Date(v); return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`; };
const fmtFechaHora = (v) => `${fmtFecha(v)} ${fmtHora(v)}`;
/* Inicio del día local como instante UTC (para filtrar columnas timestamptz). */
const inicioDia = (iso) => new Date(`${iso}T00:00:00`).toISOString();
const inicioDiaSiguiente = (iso) => inicioDia(sumarDias(iso, 1));

/* ---------- Avisos ---------- */
function toast(msg, tipo = '') {
  const t = $('#toast');
  if (!t) return;
  t.textContent = msg;
  t.className = `show ${tipo}`;
  clearTimeout(toast._t);
  toast._t = setTimeout(() => { t.className = ''; }, 4200);
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
  const c = err && err.code;
  if (/Invalid login credentials/i.test(m)) return 'Usuario o contraseña incorrectos.';
  if (/Email not confirmed/i.test(m)) return 'La cuenta no está confirmada. Contacta al administrador.';
  if (/Password should be at least/i.test(m)) return 'La contraseña debe tener al menos 8 caracteres.';
  if (/same password|different from the old/i.test(m)) return 'La nueva contraseña debe ser distinta a la actual.';
  if (/rate limit/i.test(m)) return 'Demasiados intentos. Espera unos minutos.';
  if (/Failed to fetch|NetworkError|Load failed/i.test(m)) return 'Sin conexión con el servidor. Revisa tu internet.';
  if (c === '23505') return 'Ya existe un registro con ese nombre.';
  if (c === '23503') return 'No se puede eliminar: tiene registros relacionados.';
  return m;
}

/* ---------- Lectura por páginas (PostgREST limita a 1000 filas) ---------- */
async function traerTodo(construir, max = 20000) {
  const paso = 1000;
  const out = [];
  for (let desde = 0; desde < max; desde += paso) {
    const { data, error } = await construir().range(desde, desde + paso - 1);
    if (error) throw error;
    out.push(...data);
    if (data.length < paso) break;
  }
  return out;
}

/* ---------- Excel ---------- */
function exportarXlsx(archivo, hojas) {
  const wb = XLSX.utils.book_new();
  hojas.forEach((h) => {
    const ws = XLSX.utils.json_to_sheet(h.filas, { header: h.columnas });
    ws['!cols'] = h.columnas.map((c) => ({ wch: Math.max(12, String(c).length + 3) }));
    XLSX.utils.book_append_sheet(wb, ws, h.nombre);
  });
  XLSX.writeFile(wb, archivo);
}

/* ---------- Dibujos de prendas (cuando un producto no tiene foto) ---------- */
const SPRITE = `<svg width="0" height="0" style="position:absolute" aria-hidden="true" focusable="false"><defs>
<symbol id="tee" viewBox="0 0 120 120"><path class="g" d="M42 16 L16 30 L26 54 L38 48 L38 104 L82 104 L82 48 L94 54 L104 30 L78 16 C75 26 68 31 60 31 C52 31 45 26 42 16 Z"/></symbol>
<symbol id="hoodie" viewBox="0 0 120 120"><path class="g" d="M40 36 L12 60 L22 84 L38 74 L38 106 L82 106 L82 74 L98 84 L108 60 L80 36 Z"/><path class="g" d="M42 36 C40 12 80 12 78 36 C74 48 46 48 42 36 Z"/><path class="d" d="M60 48 V68 M51 80 H69 L67 94 H53 Z"/></symbol>
<symbol id="jacket" viewBox="0 0 120 120"><path class="g" d="M42 16 L14 38 L20 98 L36 98 L38 60 L38 106 L82 106 L82 60 L84 98 L100 98 L106 38 L78 16 C75 26 68 31 60 31 C52 31 45 26 42 16 Z"/><path class="d" d="M60 31 V106 M38 90 H82"/></symbol>
<symbol id="jeans" viewBox="0 0 120 120"><path class="g" d="M36 12 H84 L92 108 H65 L60 52 L55 108 H28 Z"/><path class="d" d="M36 25 H84 M60 25 V52"/></symbol>
<symbol id="shorts" viewBox="0 0 120 120"><path class="g" d="M30 22 H90 L100 84 H66 L60 58 L54 84 H20 Z"/><path class="d" d="M30 35 H90"/></symbol>
<symbol id="dress" viewBox="0 0 120 120"><path class="g" d="M46 12 H74 L78 44 L100 108 H20 L42 44 Z"/><path class="d" d="M42 44 H78"/></symbol>
<symbol id="cap" viewBox="0 0 120 120"><path class="g" d="M20 74 C20 44 40 26 62 26 C84 26 100 46 100 74 Z"/><path class="g" d="M62 74 C84 70 110 74 112 86 C94 92 72 88 62 82 Z"/><path class="d" d="M62 28 V72"/></symbol>
<symbol id="bag" viewBox="0 0 120 120"><path class="d" d="M44 44 C44 12 76 12 76 44"/><path class="g" d="M28 44 H92 L98 106 H22 Z"/><path class="d" d="M42 74 H78"/></symbol>
<symbol id="shoe" viewBox="0 0 120 120"><path class="g" d="M14 78 V60 C32 60 38 46 42 38 L54 50 C64 58 84 60 102 68 C110 72 110 84 102 84 H18 C14 84 14 82 14 78 Z"/><path class="d" d="M14 92 H108 M44 46 L50 54 M52 54 L58 60"/></symbol>
</defs></svg>`;

function inyectarSprite() {
  if (!$('#sprite-prendas')) {
    const d = document.createElement('div');
    d.id = 'sprite-prendas';
    d.innerHTML = SPRITE;
    document.body.prepend(d);
  }
}

function iconoDe(categoria) {
  const c = norm(categoria);
  if (/hood|sudadera|buzo/.test(c)) return 'hoodie';
  if (/chaqueta|abrigo|jacket|bomber/.test(c)) return 'jacket';
  if (/jean|pantal|cargo/.test(c)) return 'jeans';
  if (/short/.test(c)) return 'shorts';
  if (/vestido|falda/.test(c)) return 'dress';
  if (/calzado|tenis|zapat|sandal/.test(c)) return 'shoe';
  if (/gorr|cap\b|sombrero/.test(c)) return 'cap';
  if (/mochila|bolso|acces|cartera/.test(c)) return 'bag';
  return 'tee';
}

const TONOS = ['#bfe5f8', '#ffffff', '#fadce6', '#d5f0e2', '#fff0c2'];
const PRENDAS = ['#ffffff', '#bfe5f8', '#fadce6', '#d5f0e2', '#fff0c2'];
function hashTxt(s) { let h = 0; for (const ch of String(s)) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return h; }
function estiloMiniatura(p) {
  const h = hashTxt(p.codigo || p.nombre);
  return `--tone:${TONOS[h % TONOS.length]};--garment:${PRENDAS[(h >> 3) % PRENDAS.length]}`;
}
function contenidoMiniatura(p) {
  return p.foto_url
    ? `<img src="${esc(p.foto_url)}" alt="" loading="lazy">`
    : `<svg class="ph" viewBox="0 0 120 120" aria-hidden="true"><use href="#${iconoDe(p.categoria)}"/></svg>`;
}

function crearCliente(opciones) {
  if (!window.supabase || CONFIG.SUPABASE_URL.includes('TU-PROYECTO')) return null;
  return window.supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY, opciones);
}
