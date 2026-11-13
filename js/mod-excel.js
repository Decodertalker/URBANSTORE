'use strict';
/* Excel: importar la hoja "entrada" de la plantilla y descargar la base de datos completa. */

App.registrar('excel', (() => {
  const MAX_IMPORTAR = 3000;
  let listo = null; // { items, ... } listo para enviar

  const ALIAS = {
    producto: ['producto', 'nombre', 'nombre del producto', 'articulo'],
    categoria: ['categoria', 'categorias'],
    codigo: ['codigo', 'codigo de producto', 'cod'],
    costo: ['precio de compra', 'costo de compra', 'costo compra', 'precio compra', 'costo'],
    precio: ['precio de venta', 'precio venta', 'venta', 'precio'],
    cantidad: ['cantidad', 'existencia', 'stock', 'unidades'],
    proveedor: ['proveedor'],
    fecha: ['fecha', 'fecha de ingreso', 'fecha de producto existente']
  };

  function aNumero(v) {
    if (v === '' || v == null) return null;
    if (typeof v === 'number') return v;
    let s = String(v).replace(/[^\d.,-]/g, '');
    if (!s) return NaN;
    if (s.includes('.') && s.includes(',')) s = s.replace(/,/g, '');
    else if (s.includes(',')) s = /,\d{1,2}$/.test(s) ? s.replace(',', '.') : s.replace(/,/g, '');
    const n = parseFloat(s);
    return Number.isNaN(n) ? NaN : n;
  }

  function aFechaISO(v) {
    if (v === '' || v == null) return null;
    if (typeof v === 'number') {
      const d = XLSX.SSF.parse_date_code(v);
      return d ? `${d.y}-${pad2(d.m)}-${pad2(d.d)}` : null;
    }
    if (v instanceof Date) return fechaISO(v);
    const s = String(v).trim();
    let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (m) return `${m[1]}-${pad2(m[2])}-${pad2(m[3])}`;
    m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})/); // día/mes/año
    if (m) return `${m[3]}-${pad2(m[2])}-${pad2(m[1])}`;
    return null;
  }

  /* Elige la hoja "entrada" (o la primera que tenga una columna de producto). */
  function elegirHoja(wb) {
    const porNombre = wb.SheetNames.find((n) => norm(n) === 'entrada');
    const candidatas = porNombre ? [porNombre] : wb.SheetNames;
    for (const nombre of candidatas) {
      const matriz = XLSX.utils.sheet_to_json(wb.Sheets[nombre], { header: 1, raw: true, defval: '' });
      const cab = matriz.findIndex((fila) => fila.some((c) => ALIAS.producto.includes(norm(c))));
      if (cab >= 0) return { nombre, matriz, cab };
    }
    return null;
  }

  async function leer(archivo) {
    const wb = XLSX.read(await archivo.arrayBuffer(), { type: 'array' });
    const hoja = elegirHoja(wb);
    if (!hoja) throw new Error('No encontré la hoja “entrada” con la columna “producto”. Usa la plantilla.');

    const encabezados = hoja.matriz[hoja.cab].map((c) => norm(c));
    const col = {};
    Object.entries(ALIAS).forEach(([k, alias]) => { col[k] = encabezados.findIndex((h) => alias.includes(h)); });

    const items = [];
    const errores = [];
    for (let i = hoja.cab + 1; i < hoja.matriz.length; i++) {
      const f = hoja.matriz[i];
      const fila = i + 1; // fila real en Excel
      const producto = String(col.producto >= 0 ? f[col.producto] : '').trim();
      if (!producto) continue; // filas vacías y la fila de ejemplo “AUTOMATICO”
      const cantidad = aNumero(f[col.cantidad]);
      const costo = col.costo >= 0 ? aNumero(f[col.costo]) : null;
      const precio = col.precio >= 0 ? aNumero(f[col.precio]) : null;
      if (cantidad == null || Number.isNaN(cantidad) || cantidad <= 0 || !Number.isInteger(cantidad)) {
        errores.push(`Fila ${fila} (${producto}): la cantidad debe ser un número entero mayor que cero.`);
        continue;
      }
      if (Number.isNaN(costo) || Number.isNaN(precio) || (costo != null && costo < 0) || (precio != null && precio < 0)) {
        errores.push(`Fila ${fila} (${producto}): los precios deben ser números de 0 o más.`);
        continue;
      }
      items.push({
        fila,
        producto,
        categoria: col.categoria >= 0 ? String(f[col.categoria] ?? '').trim() : '',
        codigo: col.codigo >= 0 ? String(f[col.codigo] ?? '').trim() : '',
        costo,
        precio,
        cantidad,
        proveedor: col.proveedor >= 0 ? String(f[col.proveedor] ?? '').trim() : '',
        fecha: col.fecha >= 0 ? aFechaISO(f[col.fecha]) : null
      });
    }
    return { hoja: hoja.nombre, items, errores };
  }

  function resumenImport(r) {
    const nombres = new Set(App.productos.map((p) => norm(p.nombre)));
    const codigos = new Set(App.productos.map((p) => p.codigo));
    const vistos = new Set();
    let nuevos = 0;
    let existentes = 0;
    r.items.forEach((it) => {
      const clave = norm(it.producto);
      const existe = nombres.has(clave) || codigos.has(it.codigo.toUpperCase()) || vistos.has(clave);
      if (existe) existentes++; else nuevos++;
      vistos.add(clave);
    });
    const cats = new Set(App.categorias.map((c) => norm(c.nombre)));
    const catNuevas = [...new Set(r.items.map((it) => it.categoria).filter((c) => c && !cats.has(norm(c))))];
    return { nuevos, existentes, catNuevas, unidades: r.items.reduce((a, it) => a + it.cantidad, 0) };
  }

  async function alElegirArchivo(e) {
    const archivo = e.target.files[0];
    const prev = $('#xl-preview');
    const btn = $('#xl-importar');
    listo = null;
    btn.classList.add('hidden');
    if (!archivo) { prev.innerHTML = ''; return; }
    prev.innerHTML = '<p class="muted">Leyendo archivo…</p>';
    try {
      const r = await leer(archivo);
      if (!r.items.length && !r.errores.length) throw new Error('La hoja no tiene productos para importar.');
      const s = resumenImport(r);
      const filasVista = r.items.slice(0, 5).map((it) =>
        `<tr><td class="wrap">${esc(it.producto)}</td><td>${esc(it.categoria || 'SIN CATEGORIA')}</td><td class="num">${it.costo ?? ''}</td><td class="num">${it.precio ?? ''}</td><td class="num">${it.cantidad}</td></tr>`).join('');
      prev.innerHTML = `
        <p><b>${r.items.length}</b> filas listas (hoja “${esc(r.hoja)}”): <b>${s.nuevos}</b> productos nuevos y <b>${s.existentes}</b> que ya existen (se suma su cantidad). Entrarán <b>${entero(s.unidades)}</b> unidades.</p>
        ${s.catNuevas.length ? `<p>Categorías nuevas que se crearán: <b>${esc(s.catNuevas.join(', '))}</b></p>` : ''}
        ${r.errores.length ? `<p class="msg">Corrige estas filas en el Excel y vuelve a elegirlo:<br>${r.errores.slice(0, 8).map(esc).join('<br>')}${r.errores.length > 8 ? `<br>… y ${r.errores.length - 8} más` : ''}</p>` : ''}
        ${r.items.length ? `<div class="tablewrap"><table class="t"><thead><tr><th>Producto</th><th>Categoría</th><th class="num">Compra</th><th class="num">Venta</th><th class="num">Cantidad</th></tr></thead><tbody>${filasVista}</tbody></table></div>${r.items.length > 5 ? `<p class="muted">… y ${r.items.length - 5} más</p>` : ''}` : ''}`;
      if (r.items.length > MAX_IMPORTAR) {
        prev.innerHTML += `<p class="msg">El archivo tiene más de ${MAX_IMPORTAR} filas. Divídelo en partes para importarlo.</p>`;
        return;
      }
      if (r.items.length && !r.errores.length) { listo = r; btn.classList.remove('hidden'); }
    } catch (err) {
      prev.innerHTML = `<p class="msg">${esc(err.message)}</p>`;
    }
  }

  async function importar() {
    if (!listo) return;
    const s = resumenImport(listo);
    if (!confirm(`Se importarán ${listo.items.length} filas: ${s.nuevos} productos nuevos y ${s.existentes} existentes, ${s.unidades} unidades en total. ¿Continuar?`)) return;
    const btn = $('#xl-importar');
    ocupado(btn, true, 'Importando…');
    const { data, error } = await sb.rpc('importar_entradas', { p_items: listo.items });
    ocupado(btn, false);
    if (error) { toast(traducirError(error), 'error'); return; }
    toast(`Importación completa: ${data.nuevos} nuevos, ${data.existentes} existentes, ${entero(data.unidades)} unidades.`, 'ok');
    listo = null;
    $('#xl-archivo').value = '';
    $('#xl-preview').innerHTML = '';
    btn.classList.add('hidden');
    try { await Promise.all([App.cargarCategorias(), App.cargarProductos()]); } catch (_) { /* se recarga al abrir Productos */ }
  }

  /* ---------- Descargar la base de datos ---------- */
  async function descargarBD() {
    const btn = $('#xl-bd');
    ocupado(btn, true, 'Preparando…');
    try {
      const [productos, entradas, salidas] = await Promise.all([
        traerTodo(() => sb.from('productos').select('*, categorias(nombre)').order('nombre')),
        traerTodo(() => sb.from('entradas').select('*').order('fecha', { ascending: false }).order('id', { ascending: false })),
        traerTodo(() => sb.from('salidas').select('*').order('fecha', { ascending: false }).order('id', { ascending: false }))
      ]);
      exportarXlsx(`base_de_datos_${hoyISO()}.xlsx`, [
        {
          nombre: 'GENERAL',
          columnas: ['ID', 'fecha', 'producto', 'categoria', 'codigo', 'precio de compra', 'precio de venta', 'cantidad', 'proveedor'],
          filas: productos.map((p) => ({
            'ID': p.id, 'fecha': fmtFecha(p.fecha_ingreso), 'producto': p.nombre, 'categoria': p.categorias?.nombre || '',
            'codigo': p.codigo, 'precio de compra': Number(p.costo_compra), 'precio de venta': Number(p.precio_venta),
            'cantidad': p.existencia, 'proveedor': p.proveedor || ''
          }))
        },
        {
          nombre: 'entrada',
          columnas: ['ID', 'fecha', 'producto', 'categoria', 'codigo', 'precio de compra', 'precio de venta', 'cantidad', 'proveedor', 'Perfil de usuario'],
          filas: entradas.map((r) => ({
            'ID': r.id, 'fecha': fmtFecha(r.fecha), 'producto': r.producto, 'categoria': r.categoria, 'codigo': r.codigo,
            'precio de compra': Number(r.costo_compra), 'precio de venta': Number(r.precio_venta), 'cantidad': r.cantidad,
            'proveedor': r.proveedor || '', 'Perfil de usuario': r.usuario
          }))
        },
        {
          nombre: 'SALIDA',
          columnas: ['ID', 'fecha', 'producto', 'categoria', 'codigo', 'precio de venta', 'cantidad', 'Perfil de usuario'],
          filas: salidas.map((r) => ({
            'ID': r.id, 'fecha': fmtFechaHora(r.fecha), 'producto': r.producto, 'categoria': r.categoria, 'codigo': r.codigo,
            'precio de venta': Number(r.precio_venta), 'cantidad': r.cantidad, 'Perfil de usuario': r.usuario
          }))
        }
      ]);
      toast(`Base de datos descargada: ${productos.length} productos, ${entradas.length} entradas, ${salidas.length} salidas.`, 'ok');
    } catch (e) {
      toast(`No se pudo descargar: ${traducirError(e)}`, 'error');
    } finally {
      ocupado(btn, false);
    }
  }

  function iniciar() {
    $('#xl-archivo').addEventListener('change', alElegirArchivo);
    $('#xl-importar').addEventListener('click', importar);
    $('#xl-bd').addEventListener('click', descargarBD);
  }

  return { iniciar };
})());
