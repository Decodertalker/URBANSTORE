'use strict';
/* Productos: lista, alta/edición con foto, entradas, ajustes y etiquetas con código de barras. */

App.registrar('productos', (() => {
  const POR_PAGINA = 60;
  let limite = POR_PAGINA;
  let editando = null;
  let fotoNueva = null;
  let fotoQuitada = false;
  let entProd = null;
  let ajProd = null;
  let etProd = null;

  const buscarEnMemoria = (texto, tope = 8) => {
    const q = norm(texto);
    if (q.length < 2) return [];
    return App.productos.filter((p) => norm(p.nombre).includes(q) || norm(p.codigo).includes(q)).slice(0, tope);
  };

  const pickHtml = (p) => `
    <span class="thumb" style="${estiloMiniatura(p)}">${contenidoMiniatura(p)}</span>
    <span class="n">${esc(p.nombre)}<small>${esc(p.codigo)} · ${esc(p.categoria)} · existencia ${p.existencia}</small></span>`;

  /* ---------- Lista ---------- */
  function filtrados() {
    const q = norm($('#pr-q').value);
    const cat = $('#pr-cat').value;
    return App.productos.filter((p) =>
      (!cat || String(p.categoria_id) === cat) &&
      (!q || norm(p.nombre).includes(q) || norm(p.codigo).includes(q)));
  }

  function pintarCategorias() {
    const sel = $('#pr-cat');
    const actual = sel.value;
    sel.innerHTML = '<option value="">Todas las categorías</option>' +
      App.categorias.map((c) => `<option value="${c.id}">${esc(c.nombre)}</option>`).join('');
    sel.value = actual;
    const pf = $('#pf-cat');
    const prev = pf.value;
    pf.innerHTML = App.categorias.map((c) => `<option value="${c.id}">${esc(c.nombre)} (${esc(c.prefijo)})</option>`).join('');
    if (prev) pf.value = prev;
  }

  function pintarLista() {
    const lista = filtrados();
    $('#pr-count').textContent = `${lista.length} ${lista.length === 1 ? 'producto' : 'productos'}`;
    const cont = $('#pr-lista');
    if (!lista.length) {
      cont.innerHTML = `<div class="empty-note" style="grid-column:1/-1">${App.productos.length
        ? 'Ningún producto coincide con la búsqueda.'
        : 'Aún no hay productos. Crea el primero con “Nuevo producto” o importa tu Excel en la pestaña Excel.'}</div>`;
      $('#pr-mas').classList.add('hidden');
      return;
    }
    cont.innerHTML = lista.slice(0, limite).map((p) => `
      <article class="pcard ${p.visible ? '' : 'oculto'}" data-id="${p.id}">
        <div class="thumb" style="${estiloMiniatura(p)}">${contenidoMiniatura(p)}</div>
        <div style="min-width:0">
          <h3>${esc(p.nombre)}</h3>
          <div class="code">${esc(p.codigo)} · ${esc(p.categoria)}${p.visible ? '' : ' · oculto'}</div>
          <div class="pp"><span>Compra <b>${esc(money(p.costo_compra))}</b></span><span>Venta <b>${esc(money(p.precio_venta))}</b></span></div>
          <div class="acts">
            <span class="stk ${p.existencia === 0 ? 'zero' : p.existencia <= CONFIG.STOCK_BAJO ? 'low' : ''}">${p.existencia}</span>
            <button class="btn small" type="button" data-act="editar">Editar</button>
            <button class="btn small" type="button" data-act="entrada">Entrada</button>
            <button class="btn small" type="button" data-act="etiqueta">Etiqueta</button>
          </div>
        </div>
      </article>`).join('');
    $('#pr-mas').classList.toggle('hidden', lista.length <= limite);
  }

  async function recargar() {
    try {
      await Promise.all([App.cargarCategorias(), App.cargarProductos()]);
    } catch (e) {
      toast(`No se pudo actualizar: ${traducirError(e)}`, 'error');
    }
    pintarCategorias();
    pintarLista();
  }

  /* ---------- Fotos ---------- */
  async function reducirImagen(archivo, max = 900) {
    const bmp = await createImageBitmap(archivo, { imageOrientation: 'from-image' });
    const escala = Math.min(1, max / Math.max(bmp.width, bmp.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bmp.width * escala);
    canvas.height = Math.round(bmp.height * escala);
    canvas.getContext('2d').drawImage(bmp, 0, 0, canvas.width, canvas.height);
    return new Promise((ok, fail) => canvas.toBlob(
      (b) => (b ? ok(b) : fail(new Error('No se pudo procesar la imagen'))), 'image/jpeg', 0.82));
  }

  async function subirFoto(blob) {
    const ruta = `${crypto.randomUUID()}.jpg`;
    const { error } = await sb.storage.from('productos').upload(ruta, blob, { contentType: 'image/jpeg', cacheControl: '31536000' });
    if (error) throw error;
    return sb.storage.from('productos').getPublicUrl(ruta).data.publicUrl;
  }

  async function borrarFoto(url) {
    if (!url || !url.includes('/object/public/productos/')) return;
    const ruta = decodeURIComponent(url.split('/object/public/productos/')[1].split('?')[0]);
    await sb.storage.from('productos').remove([ruta]).catch(() => {});
  }

  function pintarFoto(url) {
    const prev = $('#pf-prev');
    prev.setAttribute('style', '--tone:#bfe5f8;--garment:#fff');
    prev.innerHTML = url ? `<img src="${esc(url)}" alt="">` : '<svg class="ph" viewBox="0 0 120 120" aria-hidden="true"><use href="#tee"/></svg>';
    $('#pf-quitar').classList.toggle('hidden', !url);
  }

  /* ---------- Producto: alta y edición ---------- */
  function abrirProducto(p) {
    editando = p || null;
    fotoNueva = null;
    fotoQuitada = false;
    $('#pf-titulo').textContent = p ? 'Editar producto' : 'Nuevo producto';
    $('#pf-nombre').value = p ? p.nombre : '';
    $('#pf-cat').value = p ? String(p.categoria_id) : String(App.categorias[0]?.id || '');
    $('#pf-prov').value = p?.proveedor || '';
    $('#pf-costo').value = p ? p.costo_compra : 0;
    $('#pf-precio').value = p ? p.precio_venta : 0;
    $('#pf-exist').value = 0;
    $('#pf-fecha').value = hoyISO();
    $('#pf-visible').checked = p ? p.visible : true;
    $('#pf-foto').value = '';
    $('#pf-msg').textContent = '';
    $('#pf-nuevo-box').classList.toggle('hidden', !!p);
    $('#pf-edit-box').classList.toggle('hidden', !p);
    $('#pf-eliminar').classList.toggle('hidden', !p);
    if (p) { $('#pf-codigo').textContent = p.codigo; $('#pf-exist-act').textContent = p.existencia; }
    pintarFoto(p?.foto_url || null);
    $('#d-prod').showModal();
  }

  async function guardarProducto(e) {
    e.preventDefault();
    const msg = $('#pf-msg');
    msg.textContent = '';
    const nombre = $('#pf-nombre').value.trim();
    const categoria_id = Number($('#pf-cat').value);
    const proveedor = $('#pf-prov').value.trim();
    const costo = parseFloat($('#pf-costo').value);
    const precio = parseFloat($('#pf-precio').value);
    const existencia = parseInt($('#pf-exist').value, 10) || 0;
    const visible = $('#pf-visible').checked;

    if (!nombre) return (msg.textContent = 'Escribe el nombre del producto.');
    if (!categoria_id) return (msg.textContent = 'Elige una categoría.');
    if ([costo, precio].some((n) => Number.isNaN(n) || n < 0)) return (msg.textContent = 'Los precios deben ser números de 0 o más.');
    if (!editando && existencia < 0) return (msg.textContent = 'La existencia inicial no puede ser negativa.');

    const btn = $('#pf-guardar');
    ocupado(btn, true, 'Guardando…');
    let fotoSubida = null;
    try {
      const anterior = editando ? editando.foto_url : null;
      let foto_url = anterior;
      if (fotoNueva) { fotoSubida = await subirFoto(fotoNueva); foto_url = fotoSubida; }
      else if (fotoQuitada) foto_url = null;

      if (editando) {
        const { error } = await sb.from('productos').update({
          nombre, categoria_id, proveedor: proveedor || null,
          costo_compra: costo, precio_venta: precio, foto_url, visible
        }).eq('id', editando.id);
        if (error) throw error;
        if (anterior && anterior !== foto_url) await borrarFoto(anterior);
      } else {
        const { data: id, error } = await sb.rpc('crear_producto', {
          p_nombre: nombre, p_categoria_id: categoria_id, p_proveedor: proveedor || null,
          p_costo: costo, p_precio: precio, p_existencia: existencia,
          p_foto_url: foto_url, p_fecha: $('#pf-fecha').value || hoyISO()
        });
        if (error) throw error;
        if (!visible) await sb.from('productos').update({ visible: false }).eq('id', id);
      }
      $('#d-prod').close();
      toast('Producto guardado', 'ok');
      await recargar();
    } catch (err) {
      if (fotoSubida) await borrarFoto(fotoSubida);
      msg.textContent = err.code === '23505' || /ya existe/i.test(err.message || '')
        ? 'Ya existe un producto con ese nombre.' : traducirError(err);
    } finally {
      ocupado(btn, false);
    }
  }

  async function eliminarProducto() {
    const p = editando;
    if (!p) return;
    if (!confirm(`¿Eliminar “${p.nombre}”? Su historial de ventas y entradas se conserva.`)) return;
    const { error } = await sb.from('productos').delete().eq('id', p.id);
    if (error) return ($('#pf-msg').textContent = traducirError(error));
    await borrarFoto(p.foto_url);
    $('#d-prod').close();
    toast('Producto eliminado', 'ok');
    await recargar();
  }

  /* ---------- Entrada ---------- */
  function elegirEntrada(p) {
    entProd = p;
    $('#en-prod').innerHTML = pickHtml(p);
    $('#en-prod').classList.remove('hidden');
    $('#en-sug').innerHTML = '';
    $('#en-scan').value = '';
    $('#en-costo').placeholder = `Actual ${p.costo_compra}`;
    $('#en-precio').placeholder = `Actual ${p.precio_venta}`;
    $('#en-costo').value = '';
    $('#en-precio').value = '';
    $('#en-prov').value = p.proveedor || '';
    $('#en-cant').focus();
  }

  function abrirEntrada(p) {
    entProd = null;
    $('#en-msg').textContent = '';
    $('#en-scan').value = '';
    $('#en-sug').innerHTML = '';
    $('#en-cant').value = 1;
    $('#en-fecha').value = hoyISO();
    $('#en-costo').value = '';
    $('#en-precio').value = '';
    $('#en-prov').value = '';
    $('#en-prod').classList.add('hidden');
    $('#d-entrada').showModal();
    if (p) elegirEntrada(p);
    else $('#en-scan').focus();
  }

  function pintarSugEntrada(lista) {
    $('#en-sug').innerHTML = lista.map((p) => `
      <button type="button" data-id="${p.id}">
        <span class="thumb" style="${estiloMiniatura(p)}">${contenidoMiniatura(p)}</span>
        <span class="n">${esc(p.nombre)}<small>${esc(p.codigo)} · existencia ${p.existencia}</small></span>
        <span class="pr">${esc(money(p.precio_venta))}</span>
      </button>`).join('');
  }

  function procesarEntrada(texto) {
    const q = String(texto).trim();
    if (!q) return;
    const exacto = App.productos.find((p) => p.codigo === q.toUpperCase());
    if (exacto) return elegirEntrada(exacto);
    const lista = buscarEnMemoria(q);
    if (lista.length === 1) return elegirEntrada(lista[0]);
    if (!lista.length) toast('No se encontró ese producto.', 'error');
    pintarSugEntrada(lista);
  }

  async function guardarEntrada(e) {
    e.preventDefault();
    const msg = $('#en-msg');
    msg.textContent = '';
    if (!entProd) return (msg.textContent = 'Elige primero el producto.');
    const cant = parseInt($('#en-cant').value, 10);
    const costo = $('#en-costo').value === '' ? null : parseFloat($('#en-costo').value);
    const precio = $('#en-precio').value === '' ? null : parseFloat($('#en-precio').value);
    if (Number.isNaN(cant) || cant < 1) return (msg.textContent = 'La cantidad debe ser 1 o más.');
    if ([costo, precio].some((n) => n !== null && (Number.isNaN(n) || n < 0))) return (msg.textContent = 'Los precios deben ser números de 0 o más.');
    const btn = $('#en-guardar');
    ocupado(btn, true, 'Registrando…');
    const { error } = await sb.rpc('registrar_entrada', {
      p_producto_id: entProd.id, p_cantidad: cant, p_costo: costo, p_precio: precio,
      p_proveedor: $('#en-prov').value.trim() || null, p_fecha: $('#en-fecha').value || hoyISO()
    });
    ocupado(btn, false);
    if (error) return (msg.textContent = traducirError(error));
    $('#d-entrada').close();
    toast(`Entrada registrada: +${cant} de ${entProd.nombre}`, 'ok');
    await recargar();
  }

  /* ---------- Ajuste ---------- */
  function abrirAjuste(p) {
    ajProd = p;
    $('#aj-prod').innerHTML = pickHtml(p);
    $('#aj-actual').value = p.existencia;
    $('#aj-nueva').value = p.existencia;
    $('#aj-motivo').value = '';
    $('#aj-msg').textContent = '';
    $('#d-ajuste').showModal();
  }

  async function guardarAjuste(e) {
    e.preventDefault();
    const msg = $('#aj-msg');
    const nueva = parseInt($('#aj-nueva').value, 10);
    if (Number.isNaN(nueva) || nueva < 0) return (msg.textContent = 'La existencia debe ser 0 o más.');
    const btn = $('#aj-guardar');
    ocupado(btn, true, 'Guardando…');
    const { error } = await sb.rpc('ajustar_existencia', {
      p_producto_id: ajProd.id, p_nueva: nueva, p_motivo: $('#aj-motivo').value.trim()
    });
    ocupado(btn, false);
    if (error) return (msg.textContent = traducirError(error));
    $('#d-ajuste').close();
    toast('Existencia ajustada', 'ok');
    await recargar();
  }

  /* ---------- Etiquetas con código de barras ---------- */
  function imprimirEtiquetas(items) {
    if (typeof JsBarcode === 'undefined') return toast('No se pudo cargar el generador de códigos de barras.', 'error');
    let html = '<div class="etiquetas">';
    items.forEach((it) => {
      for (let i = 0; i < it.copias; i++) {
        html += `<div class="etq">
          <div class="tienda">${esc(CONFIG.NOMBRE_TIENDA)}</div>
          <div class="nombre">${esc(it.nombre)}</div>
          <svg class="bc" data-code="${esc(it.codigo)}"></svg>
          <div class="pie"><span>${esc(it.codigo)}</span><b>${esc(money(it.precio))}</b></div>
        </div>`;
      }
    });
    html += '</div>';
    App.imprimirZona(html, (z) => {
      z.querySelectorAll('svg.bc').forEach((s) => {
        JsBarcode(s, s.dataset.code, { format: 'CODE128', displayValue: false, margin: 0, height: 40, width: 1.6 });
      });
    });
  }

  function abrirEtiquetas(p) {
    etProd = p;
    $('#et-prod').innerHTML = pickHtml(p);
    $('#et-copias').value = Math.max(1, Math.min(p.existencia, 500));
    $('#d-etiq').showModal();
  }

  /* ---------- Eventos ---------- */
  function iniciar() {
    $('#pr-q').addEventListener('input', () => { limite = POR_PAGINA; pintarLista(); });
    $('#pr-cat').addEventListener('change', () => { limite = POR_PAGINA; pintarLista(); });
    $('#pr-mas').addEventListener('click', () => { limite += POR_PAGINA; pintarLista(); });
    $('#pr-nuevo').addEventListener('click', () => abrirProducto(null));
    $('#pr-entrada').addEventListener('click', () => abrirEntrada(null));
    $('#pr-etiquetas').addEventListener('click', () => {
      const lista = filtrados();
      if (!lista.length) return toast('No hay productos para imprimir.', 'error');
      if (!confirm(`Se imprimirá 1 etiqueta por cada uno de los ${lista.length} productos filtrados. ¿Continuar?`)) return;
      imprimirEtiquetas(lista.map((p) => ({ codigo: p.codigo, nombre: p.nombre, precio: p.precio_venta, copias: 1 })));
    });

    $('#pr-lista').addEventListener('click', (e) => {
      const b = e.target.closest('[data-act]');
      if (!b) return;
      const p = App.productos.find((x) => String(x.id) === b.closest('.pcard').dataset.id);
      if (!p) return;
      if (b.dataset.act === 'editar') abrirProducto(p);
      if (b.dataset.act === 'entrada') abrirEntrada(p);
      if (b.dataset.act === 'etiqueta') abrirEtiquetas(p);
    });

    // Producto
    $('#f-prod').addEventListener('submit', guardarProducto);
    $('#pf-cancelar').addEventListener('click', () => $('#d-prod').close());
    $('#pf-eliminar').addEventListener('click', eliminarProducto);
    $('#pf-ajustar').addEventListener('click', () => { const p = editando; $('#d-prod').close(); if (p) abrirAjuste(p); });
    $('#pf-quitar').addEventListener('click', () => { fotoNueva = null; fotoQuitada = true; $('#pf-foto').value = ''; pintarFoto(null); });
    $('#pf-foto').addEventListener('change', async (e) => {
      const archivo = e.target.files[0];
      if (!archivo) return;
      try {
        fotoNueva = await reducirImagen(archivo);
        fotoQuitada = false;
        pintarFoto(URL.createObjectURL(fotoNueva));
      } catch (_) {
        toast('No se pudo leer la imagen', 'error');
      }
    });

    // Entrada
    const scan = $('#en-scan');
    scan.addEventListener('input', () => pintarSugEntrada(buscarEnMemoria(scan.value)));
    scan.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); procesarEntrada(scan.value); } });
    $('#en-cam').addEventListener('click', () => Escaner.abrir((codigo) => procesarEntrada(codigo)));
    $('#en-sug').addEventListener('click', (e) => {
      const b = e.target.closest('[data-id]');
      const p = b && App.productos.find((x) => String(x.id) === b.dataset.id);
      if (p) elegirEntrada(p);
    });
    $('#f-ent').addEventListener('submit', guardarEntrada);
    $('#en-cancelar').addEventListener('click', () => $('#d-entrada').close());

    // Ajuste y etiquetas
    $('#f-aj').addEventListener('submit', guardarAjuste);
    $('#aj-cancelar').addEventListener('click', () => $('#d-ajuste').close());
    $('#f-et').addEventListener('submit', (e) => {
      e.preventDefault();
      const n = parseInt($('#et-copias').value, 10);
      if (Number.isNaN(n) || n < 1 || n > 500) return toast('Escribe de 1 a 500 etiquetas.', 'error');
      $('#d-etiq').close();
      imprimirEtiquetas([{ codigo: etProd.codigo, nombre: etProd.nombre, precio: etProd.precio_venta, copias: n }]);
    });
    $('#et-cancelar').addEventListener('click', () => $('#d-etiq').close());
  }

  function mostrar() {
    pintarCategorias();
    pintarLista();
  }

  return { iniciar, mostrar, recargar };
})());
