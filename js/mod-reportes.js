'use strict';
/* Reportes de entradas, salidas, inventario general y ajustes, con filtros de fecha. */

App.registrar('reportes', (() => {
  const MAX_FILAS = 300;
  let actual = 'salidas';
  let filas = [];
  let visibles = [];
  let cargando = 0;

  const suma = (arr, f) => arr.reduce((a, r) => a + f(r), 0);

  /* Cada reporte define su consulta, sus columnas en pantalla y las del Excel
     (las mismas de la plantilla: GENERAL, entrada y SALIDA). */
  const REPORTES = {
    salidas: {
      conFechas: true,
      hoja: 'SALIDA',
      consulta: (d, h) => () => sb.from('salidas').select('*')
        .gte('fecha', inicioDia(d)).lt('fecha', inicioDiaSiguiente(h))
        .order('fecha', { ascending: false }).order('id', { ascending: false }),
      buscable: (r) => [r.producto, r.codigo, r.categoria, r.usuario].join(' '),
      columnas: [
        { t: 'ID', v: (r) => r.id },
        { t: 'Fecha', v: (r) => fmtFechaHora(r.fecha) },
        { t: 'Producto', v: (r) => r.producto, wrap: true },
        { t: 'Categoría', v: (r) => r.categoria },
        { t: 'Código', v: (r) => r.codigo },
        { t: 'Precio venta', v: (r) => money(r.precio_venta), num: true },
        { t: 'Cantidad', v: (r) => entero(r.cantidad), num: true },
        { t: 'Total', v: (r) => money(r.total), num: true },
        { t: 'Usuario', v: (r) => r.usuario }
      ],
      resumen: (rs) => [
        ['Total vendido', money(suma(rs, (r) => Number(r.total)))],
        ['Unidades', entero(suma(rs, (r) => r.cantidad))],
        ['Ventas (tickets)', entero(new Set(rs.map((r) => r.venta_id)).size)],
        ['Ganancia estimada', money(suma(rs, (r) => (Number(r.precio_venta) - Number(r.costo_compra)) * r.cantidad))]
      ],
      excel: (r) => ({
        'ID': r.id, 'fecha': fmtFechaHora(r.fecha), 'producto': r.producto, 'categoria': r.categoria,
        'codigo': r.codigo, 'precio de venta': Number(r.precio_venta), 'cantidad': r.cantidad,
        'Perfil de usuario': r.usuario, 'total': Number(r.total)
      }),
      encabezados: ['ID', 'fecha', 'producto', 'categoria', 'codigo', 'precio de venta', 'cantidad', 'Perfil de usuario', 'total']
    },

    entradas: {
      conFechas: true,
      hoja: 'entrada',
      consulta: (d, h) => () => sb.from('entradas').select('*')
        .gte('fecha', d).lte('fecha', h)
        .order('fecha', { ascending: false }).order('id', { ascending: false }),
      buscable: (r) => [r.producto, r.codigo, r.categoria, r.proveedor, r.usuario].join(' '),
      columnas: [
        { t: 'ID', v: (r) => r.id },
        { t: 'Fecha', v: (r) => fmtFecha(r.fecha) },
        { t: 'Producto', v: (r) => r.producto, wrap: true },
        { t: 'Categoría', v: (r) => r.categoria },
        { t: 'Código', v: (r) => r.codigo },
        { t: 'Precio compra', v: (r) => money(r.costo_compra), num: true },
        { t: 'Precio venta', v: (r) => money(r.precio_venta), num: true },
        { t: 'Cantidad', v: (r) => entero(r.cantidad), num: true },
        { t: 'Proveedor', v: (r) => r.proveedor || '' },
        { t: 'Usuario', v: (r) => r.usuario }
      ],
      resumen: (rs) => [
        ['Ingresos registrados', entero(rs.length)],
        ['Unidades que entraron', entero(suma(rs, (r) => r.cantidad))],
        ['Costo total de compra', money(suma(rs, (r) => Number(r.costo_compra) * r.cantidad))]
      ],
      excel: (r) => ({
        'ID': r.id, 'fecha': fmtFecha(r.fecha), 'producto': r.producto, 'categoria': r.categoria,
        'codigo': r.codigo, 'precio de compra': Number(r.costo_compra), 'precio de venta': Number(r.precio_venta),
        'cantidad': r.cantidad, 'proveedor': r.proveedor || '', 'Perfil de usuario': r.usuario
      }),
      encabezados: ['ID', 'fecha', 'producto', 'categoria', 'codigo', 'precio de compra', 'precio de venta', 'cantidad', 'proveedor', 'Perfil de usuario']
    },

    inventario: {
      conFechas: false,
      hoja: 'GENERAL',
      consulta: () => () => sb.from('productos').select('*, categorias(nombre)').order('nombre'),
      normalizar: (r) => ({ ...r, categoria: r.categorias?.nombre || '' }),
      buscable: (r) => [r.nombre, r.codigo, r.categoria, r.proveedor].join(' '),
      columnas: [
        { t: 'ID', v: (r) => r.id },
        { t: 'Fecha ingreso', v: (r) => fmtFecha(r.fecha_ingreso) },
        { t: 'Producto', v: (r) => r.nombre, wrap: true },
        { t: 'Categoría', v: (r) => r.categoria },
        { t: 'Código', v: (r) => r.codigo },
        { t: 'Precio compra', v: (r) => money(r.costo_compra), num: true },
        { t: 'Precio venta', v: (r) => money(r.precio_venta), num: true },
        { t: 'Existencia', v: (r) => entero(r.existencia), num: true },
        { t: 'Proveedor', v: (r) => r.proveedor || '' },
        { t: 'Valor a costo', v: (r) => money(r.existencia * Number(r.costo_compra)), num: true },
        { t: 'Valor a venta', v: (r) => money(r.existencia * Number(r.precio_venta)), num: true }
      ],
      resumen: (rs) => [
        ['Productos', entero(rs.length)],
        ['Unidades en existencia', entero(suma(rs, (r) => r.existencia))],
        ['Valor a costo', money(suma(rs, (r) => r.existencia * Number(r.costo_compra)))],
        ['Valor a venta', money(suma(rs, (r) => r.existencia * Number(r.precio_venta)))]
      ],
      excel: (r) => ({
        'ID': r.id, 'fecha': fmtFecha(r.fecha_ingreso), 'producto': r.nombre, 'categoria': r.categoria,
        'codigo': r.codigo, 'precio de compra': Number(r.costo_compra), 'precio de venta': Number(r.precio_venta),
        'cantidad': r.existencia, 'proveedor': r.proveedor || ''
      }),
      encabezados: ['ID', 'fecha', 'producto', 'categoria', 'codigo', 'precio de compra', 'precio de venta', 'cantidad', 'proveedor']
    },

    ajustes: {
      conFechas: true,
      hoja: 'AJUSTES',
      consulta: (d, h) => () => sb.from('ajustes').select('*')
        .gte('fecha', inicioDia(d)).lt('fecha', inicioDiaSiguiente(h))
        .order('fecha', { ascending: false }).order('id', { ascending: false }),
      buscable: (r) => [r.producto, r.codigo, r.motivo, r.usuario].join(' '),
      columnas: [
        { t: 'ID', v: (r) => r.id },
        { t: 'Fecha', v: (r) => fmtFechaHora(r.fecha) },
        { t: 'Producto', v: (r) => r.producto, wrap: true },
        { t: 'Código', v: (r) => r.codigo },
        { t: 'Antes', v: (r) => entero(r.anterior), num: true },
        { t: 'Después', v: (r) => entero(r.nuevo), num: true },
        { t: 'Diferencia', v: (r) => (r.diferencia > 0 ? `+${r.diferencia}` : String(r.diferencia)), num: true },
        { t: 'Motivo', v: (r) => r.motivo, wrap: true },
        { t: 'Usuario', v: (r) => r.usuario }
      ],
      resumen: (rs) => [
        ['Ajustes', entero(rs.length)],
        ['Unidades sumadas', entero(suma(rs.filter((r) => r.diferencia > 0), (r) => r.diferencia))],
        ['Unidades restadas', entero(Math.abs(suma(rs.filter((r) => r.diferencia < 0), (r) => r.diferencia)))]
      ],
      excel: (r) => ({
        'ID': r.id, 'fecha': fmtFechaHora(r.fecha), 'producto': r.producto, 'codigo': r.codigo,
        'existencia anterior': r.anterior, 'existencia nueva': r.nuevo, 'diferencia': r.diferencia,
        'motivo': r.motivo, 'Perfil de usuario': r.usuario
      }),
      encabezados: ['ID', 'fecha', 'producto', 'codigo', 'existencia anterior', 'existencia nueva', 'diferencia', 'motivo', 'Perfil de usuario']
    }
  };

  /* ---------- Carga y pantalla ---------- */
  function fechasValidas() {
    const d = $('#rp-desde').value;
    const h = $('#rp-hasta').value;
    if (!d || !h) { toast('Elige las dos fechas.', 'error'); return null; }
    if (d > h) { toast('La fecha “Desde” no puede ser posterior a “Hasta”.', 'error'); return null; }
    return { d, h };
  }

  async function cargar() {
    const rep = REPORTES[actual];
    let f = { d: null, h: null };
    if (rep.conFechas) { f = fechasValidas(); if (!f) return; }
    const mio = ++cargando;
    $('#rp-nota').textContent = 'Cargando…';
    try {
      let datos = await traerTodo(rep.consulta(f.d, f.h));
      if (rep.normalizar) datos = datos.map(rep.normalizar);
      if (mio !== cargando) return;
      filas = datos;
      pintar();
    } catch (e) {
      if (mio !== cargando) return;
      filas = [];
      $('#rp-tabla').innerHTML = '';
      $('#rp-resumen').innerHTML = '';
      $('#rp-nota').textContent = `No se pudo cargar el reporte: ${traducirError(e)}`;
    }
  }

  function pintar() {
    const rep = REPORTES[actual];
    const q = norm($('#rp-q').value);
    visibles = q ? filas.filter((r) => norm(rep.buscable(r)).includes(q)) : filas;

    $('#rp-resumen').innerHTML = rep.resumen(visibles)
      .map(([t, v]) => `<span>${esc(t)}: <b>${esc(v)}</b></span>`).join('');

    const cab = `<thead><tr>${rep.columnas.map((c) => `<th class="${c.num ? 'num' : ''}">${esc(c.t)}</th>`).join('')}</tr></thead>`;
    const cuerpo = visibles.slice(0, MAX_FILAS).map((r) =>
      `<tr>${rep.columnas.map((c) => `<td class="${c.num ? 'num' : ''} ${c.wrap ? 'wrap' : ''}">${esc(c.v(r))}</td>`).join('')}</tr>`).join('');
    $('#rp-tabla').innerHTML = visibles.length
      ? `${cab}<tbody>${cuerpo}</tbody>`
      : `${cab}<tbody><tr><td colspan="${rep.columnas.length}" style="text-align:center;padding:24px;font-weight:700">No hay registros con estos filtros.</td></tr></tbody>`;

    $('#rp-nota').textContent = visibles.length > MAX_FILAS
      ? `Se muestran ${MAX_FILAS} de ${visibles.length} registros. Descarga el Excel para verlos todos.`
      : '';
    $('#rp-xlsx').disabled = !visibles.length;
  }

  function marcar() {
    $$('#rp-tabs .chip').forEach((c) => c.setAttribute('aria-pressed', String(c.dataset.rep === actual)));
    const conFechas = REPORTES[actual].conFechas;
    $('#rp-fechas').classList.toggle('hidden', !conFechas);
    $('#rp-rapido').classList.toggle('hidden', !conFechas);
  }

  function rapido(tipo) {
    const hoy = hoyISO();
    let desde = hoy;
    if (tipo === '7') desde = sumarDias(hoy, -6);
    if (tipo === 'mes') desde = `${hoy.slice(0, 8)}01`;
    $('#rp-desde').value = desde;
    $('#rp-hasta').value = hoy;
  }

  function descargar() {
    const rep = REPORTES[actual];
    if (!visibles.length) return;
    const nombre = `${actual}_${hoyISO()}.xlsx`;
    try {
      exportarXlsx(nombre, [{ nombre: rep.hoja, columnas: rep.encabezados, filas: visibles.map(rep.excel) }]);
    } catch (e) {
      toast(`No se pudo crear el Excel: ${traducirError(e)}`, 'error');
    }
  }

  function iniciar() {
    rapido('hoy');
    $('#rp-tabs').addEventListener('click', (e) => {
      const b = e.target.closest('[data-rep]');
      if (!b) return;
      actual = b.dataset.rep;
      marcar();
      cargar();
    });
    $('#rp-rapido').addEventListener('click', (e) => {
      const b = e.target.closest('[data-r]');
      if (!b) return;
      rapido(b.dataset.r);
      cargar();
    });
    ['#rp-desde', '#rp-hasta'].forEach((s) => $(s).addEventListener('change', cargar));
    $('#rp-q').addEventListener('input', pintar);
    $('#rp-xlsx').addEventListener('click', descargar);
  }

  function mostrar() {
    marcar();
    cargar();
  }

  return { iniciar, mostrar };
})());
