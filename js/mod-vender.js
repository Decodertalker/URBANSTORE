'use strict';
/* Salida de productos: escáner o búsqueda, carrito, consolidado y recibo. */

App.registrar('vender', (() => {
  const COLS = 'id,codigo,nombre,categoria,precio_venta,existencia,foto_url';
  const cart = [];
  let sug = [];
  let token = 0;
  let timer = null;
  let ultima = null;
  let catalogo = [];
  let cargado = false;
  let visibles = 40;

  const limpiarQ = (q) => String(q).replace(/[%,()*\\]/g, ' ').trim();

  /* ---------- Búsqueda ---------- */
  async function buscar(texto) {
    const q = limpiarQ(texto);
    const mi = ++token;
    if (q.length < 2) { sug = []; pintarSug(); return; }
    const { data, error } = await sb.from('productos_venta').select(COLS)
      .or(`nombre.ilike.%${q}%,codigo.ilike.%${q}%`).order('nombre').limit(8);
    if (mi !== token) return;
    if (error) { toast(traducirError(error), 'error'); return; }
    sug = data;
    pintarSug();
  }

  function pintarSug() {
    const box = $('#v-sug');
    if (!sug.length) { box.innerHTML = ''; return; }
    box.innerHTML = sug.map((p) => `
      <button type="button" data-id="${p.id}" ${p.existencia <= 0 ? 'disabled' : ''}>
        <span class="thumb" style="${estiloMiniatura(p)}">${contenidoMiniatura(p)}</span>
        <span class="n">${esc(p.nombre)}<small>${esc(p.codigo)} · ${p.existencia > 0 ? `${p.existencia} disponibles` : 'Agotado'}</small></span>
        <span class="pr">${esc(money(p.precio_venta))}</span>
      </button>`).join('');
  }

  async function procesar(texto) {
    const q = String(texto).trim();
    if (!q) return;
    clearTimeout(timer);
    const { data, error } = await sb.from('productos_venta').select(COLS)
      .eq('codigo', q.toUpperCase()).maybeSingle();
    if (error) return toast(traducirError(error), 'error');
    if (data) { agregar(data); limpiarEntrada(); return; }
    await buscar(q);
    if (sug.length === 1) { agregar(sug[0]); limpiarEntrada(); }
    else if (!sug.length) toast('No se encontró ese producto.', 'error');
  }

  function limpiarEntrada() {
    const i = $('#v-scan');
    i.value = '';
    sug = [];
    token++;
    pintarSug();
    if (window.matchMedia('(pointer: fine)').matches) i.focus();
  }

  /* ---------- Listado de productos ---------- */
  async function cargarCatalogo() {
    try {
      catalogo = await traerTodo(() => sb.from('productos_venta').select(COLS).order('nombre'));
      cargado = true;
      const cats = [...new Set(catalogo.map((p) => p.categoria).filter(Boolean))].sort();
      $('#v-cat').innerHTML = '<option value="">Todas</option>' + cats.map((c) => `<option>${esc(c)}</option>`).join('');
    } catch (e) { toast(traducirError(e), 'error'); }
    pintarLista();
  }

  function pintarLista() {
    const q = norm($('#v-filtro').value);
    const cat = $('#v-cat').value;
    const lista = catalogo.filter((p) => (!cat || p.categoria === cat) && (!q || norm(`${p.nombre} ${p.codigo}`).includes(q)));
    $('#v-cuenta').textContent = cargado ? `${lista.length} ${lista.length === 1 ? 'producto' : 'productos'}` : 'Cargando productos…';
    $('#v-lista').innerHTML = lista.slice(0, visibles).map((p) => {
      const enCarro = (cart.find((l) => l.id === p.id) || {}).cant || 0;
      const agotado = Number(p.existencia) <= 0;
      return `
        <div class="vcard ${agotado ? 'agotado' : ''}" data-id="${p.id}">
          <span class="thumb" style="${estiloMiniatura(p)}">${contenidoMiniatura(p)}</span>
          <div style="min-width:0">
            <h3>${esc(p.nombre)}</h3>
            <div class="code">${esc(p.codigo)}</div>
            <div class="pp"><span>Precio <b>${esc(money(p.precio_venta))}</b></span><span>${agotado ? 'Agotado' : `Disp. <b>${p.existencia}</b>`}</span></div>
            <div class="acts">
              <button type="button" class="btn small dark" data-add="${p.id}" ${agotado ? 'disabled' : ''}>Agregar al carrito</button>
              ${enCarro ? `<span class="enc">En carrito: ${enCarro}</span>` : ''}
            </div>
          </div>
        </div>`;
    }).join('') || '<p class="muted">No hay productos que coincidan.</p>';
    $('#v-mas').classList.toggle('hidden', lista.length <= visibles);
  }

  /* ---------- Carrito ---------- */
  function agregar(p) {
    const existencia = Number(p.existencia);
    if (existencia <= 0) return toast(`“${p.nombre}” está agotado.`, 'error');
    const l = cart.find((x) => x.id === p.id);
    if (l) {
      if (l.cant + 1 > existencia) return toast(`Solo hay ${existencia} de “${p.nombre}”.`, 'error');
      l.cant += 1;
      l.existencia = existencia;
    } else {
      cart.push({ id: p.id, codigo: p.codigo, nombre: p.nombre, precio: Number(p.precio_venta), existencia, cant: 1 });
    }
    pintar();
  }

  function pintar() {
    const cont = $('#v-lineas');
    if (!cart.length) {
      cont.innerHTML = '<div class="empty-note">El carrito está vacío. Escanea o busca un producto para empezar.</div>';
    } else {
      cont.innerHTML = cart.map((l, i) => `
        <div class="line" data-i="${i}">
          <div class="n">${esc(l.nombre)}<small>${esc(l.codigo)} · ${esc(money(l.precio))} c/u · disponibles ${l.existencia}</small></div>
          <div class="sub">${esc(money(l.precio * l.cant))}</div>
          <div class="acts">
            <div class="qty">
              <button type="button" data-act="menos" aria-label="Restar uno">−</button>
              <input type="number" inputmode="numeric" min="1" max="${l.existencia}" step="1" value="${l.cant}" data-act="cant" aria-label="Cantidad de ${esc(l.nombre)}">
              <button type="button" data-act="mas" aria-label="Sumar uno">+</button>
            </div>
            <button type="button" class="del" data-act="quitar">Quitar</button>
          </div>
        </div>`).join('');
    }
    totales();
    if (cargado) pintarLista();
  }

  function descuento(subtotal) {
    const d = parseFloat($('#v-desc').value);
    if (Number.isNaN(d) || d < 0) return 0;
    return Math.min(d, subtotal);
  }

  function totales() {
    const subtotal = cart.reduce((a, l) => a + l.precio * l.cant, 0);
    const unidades = cart.reduce((a, l) => a + l.cant, 0);
    const desc = descuento(subtotal);
    const total = subtotal - desc;
    $('#v-items').textContent = cart.length;
    $('#v-unid').textContent = unidades;
    $('#v-sub').textContent = money(subtotal);
    $('#v-total').textContent = money(total);
    $('#v-barra-n').textContent = `${unidades} u.`;
    $('#v-barra-t').textContent = money(total);
    $('#v-barra').classList.toggle('hidden', !cart.length);

    const efectivo = $('#v-metodo').value === 'efectivo';
    $('#v-fila-recibido').hidden = !efectivo;
    $('#v-fila-cambio').hidden = !efectivo;
    const recibido = parseFloat($('#v-recibido').value);
    let falta = false;
    const cambio = $('#v-cambio');
    cambio.className = '';
    if (efectivo && !Number.isNaN(recibido)) {
      if (recibido < total) { falta = true; cambio.textContent = `Falta ${money(total - recibido)}`; cambio.className = 'falta'; }
      else cambio.textContent = money(recibido - total);
    } else {
      cambio.textContent = money(0);
    }
    $('#v-cobrar').disabled = !cart.length || falta;
  }

  function vaciar() {
    cart.length = 0;
    $('#v-desc').value = '0';
    $('#v-recibido').value = '';
    $('#v-cliente').value = '';
    $('#v-nota').value = '';
    pintar();
  }

  /* ---------- Cobro y recibo ---------- */
  async function cobrar() {
    if (!cart.length) return;
    const btn = $('#v-cobrar');
    const subtotal = cart.reduce((a, l) => a + l.precio * l.cant, 0);
    const metodo = $('#v-metodo').value;
    const recibido = parseFloat($('#v-recibido').value);
    const cliente = $('#v-cliente').value.trim();
    ocupado(btn, true, 'Cobrando…');
    const { data, error } = await sb.rpc('registrar_venta', {
      p_items: cart.map((l) => ({ producto_id: l.id, cantidad: l.cant })),
      p_descuento: descuento(subtotal),
      p_metodo: metodo,
      p_cliente: cliente || null,
      p_nota: $('#v-nota').value.trim() || null
    });
    ocupado(btn, false);
    if (error) { toast(traducirError(error), 'error'); totales(); return; }
    ultima = { ...data, cliente, recibido: metodo === 'efectivo' && !Number.isNaN(recibido) ? recibido : null };
    vaciar();
    cargarCatalogo();
    mostrarRecibo();
  }

  const ANCHO = 42;
  function envolver(texto, ancho) {
    const out = [];
    let actual = '';
    String(texto).split(/\s+/).forEach((w) => {
      while (w.length > ancho) { if (actual) { out.push(actual); actual = ''; } out.push(w.slice(0, ancho)); w = w.slice(ancho); }
      if (!actual) actual = w;
      else if ((actual + ' ' + w).length <= ancho) actual += ' ' + w;
      else { out.push(actual); actual = w; }
    });
    if (actual) out.push(actual);
    return out;
  }
  const centro = (t) => ' '.repeat(Math.max(0, Math.floor((ANCHO - t.length) / 2))) + t;
  const izqDer = (a, b) => a + ' '.repeat(Math.max(1, ANCHO - a.length - b.length)) + b;

  function reciboTexto(v) {
    const L = [];
    const raya = '-'.repeat(ANCHO);
    L.push(centro(CONFIG.NOMBRE_TIENDA));
    L.push(centro(`Ticket #${String(v.venta_id).padStart(6, '0')}`));
    L.push(`Fecha:   ${fmtFechaHora(v.fecha)}`);
    L.push(`Atendió: ${v.usuario}`);
    if (v.cliente) L.push(`Cliente: ${v.cliente}`);
    L.push(raya);
    v.lineas.forEach((l) => {
      envolver(`${l.cantidad} x ${l.producto}`, ANCHO).forEach((t) => L.push(t));
      L.push(izqDer(`   ${money(l.precio)} c/u`, money(l.subtotal)));
    });
    L.push(raya);
    L.push(izqDer(`Unidades: ${v.unidades}`, ''));
    L.push(izqDer('Subtotal', money(v.subtotal)));
    if (Number(v.descuento) > 0) L.push(izqDer('Descuento', `-${money(v.descuento)}`));
    L.push(izqDer('TOTAL', money(v.total)));
    L.push(`Pago: ${v.metodo}`);
    if (v.recibido != null && v.metodo === 'efectivo') {
      L.push(izqDer('Recibido', money(v.recibido)));
      L.push(izqDer('Cambio', money(Math.max(0, v.recibido - Number(v.total)))));
    }
    L.push(raya);
    L.push(centro('¡Gracias por su compra!'));
    return L.join('\n');
  }

  function mostrarRecibo() {
    $('#rc-pre').textContent = reciboTexto(ultima);
    $('#d-recibo').showModal();
  }

  /* ---------- Eventos ---------- */
  function iniciar() {
    const scan = $('#v-scan');
    scan.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(() => buscar(scan.value), 220); });
    scan.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); procesar(scan.value); } });
    $('#v-filtro').addEventListener('input', () => { visibles = 40; pintarLista(); });
    $('#v-cat').addEventListener('change', () => { visibles = 40; pintarLista(); });
    $('#v-mas').addEventListener('click', () => { visibles += 40; pintarLista(); });
    $('#v-lista').addEventListener('click', (e) => {
      const b = e.target.closest('[data-add]');
      if (!b || b.disabled) return;
      const p = catalogo.find((x) => String(x.id) === b.dataset.add);
      if (p) agregar(p);
    });
    $('#v-barra').addEventListener('click', () => {
      const r = $('#v-resumen');
      r.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    $('#v-cam').addEventListener('click', () => Escaner.abrir((codigo) => procesar(codigo)));

    $('#v-sug').addEventListener('click', (e) => {
      const b = e.target.closest('[data-id]');
      if (!b) return;
      const p = sug.find((x) => String(x.id) === b.dataset.id);
      if (p) { agregar(p); limpiarEntrada(); }
    });

    const cont = $('#v-lineas');
    cont.addEventListener('click', (e) => {
      const b = e.target.closest('[data-act]');
      if (!b || b.tagName === 'INPUT') return;
      const i = Number(b.closest('.line').dataset.i);
      const l = cart[i];
      if (b.dataset.act === 'quitar') cart.splice(i, 1);
      if (b.dataset.act === 'mas') { if (l.cant + 1 > l.existencia) toast(`Solo hay ${l.existencia} de “${l.nombre}”.`, 'error'); else l.cant += 1; }
      if (b.dataset.act === 'menos') { if (l.cant > 1) l.cant -= 1; else cart.splice(i, 1); }
      pintar();
    });
    cont.addEventListener('change', (e) => {
      if (e.target.dataset.act !== 'cant') return;
      const i = Number(e.target.closest('.line').dataset.i);
      const l = cart[i];
      let n = parseInt(e.target.value, 10);
      if (Number.isNaN(n) || n < 1) n = 1;
      if (n > l.existencia) { toast(`Solo hay ${l.existencia} de “${l.nombre}”.`, 'error'); n = l.existencia; }
      l.cant = n;
      pintar();
    });

    ['#v-desc', '#v-recibido'].forEach((s) => $(s).addEventListener('input', totales));
    $('#v-metodo').addEventListener('change', totales);
    $('#v-cobrar').addEventListener('click', cobrar);
    $('#v-vaciar').addEventListener('click', () => { if (!cart.length || confirm('¿Vaciar el carrito?')) vaciar(); });

    $('#rc-imprimir').addEventListener('click', () => {
      if (ultima) App.imprimirZona(`<pre class="recibo">${esc(reciboTexto(ultima))}</pre>`);
    });
    $('#rc-cerrar').addEventListener('click', () => $('#d-recibo').close());
    $('#d-recibo').addEventListener('close', () => {
      if (window.matchMedia('(pointer: fine)').matches) $('#v-scan').focus();
    });
    pintar();
  }

  function mostrar() {
    cargarCatalogo();
    if (window.matchMedia('(pointer: fine)').matches) $('#v-scan').focus();
  }

  return { iniciar, mostrar };
})());
