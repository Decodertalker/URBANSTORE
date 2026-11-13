'use strict';
/* Dashboard de ventas: totales, productos top, ventas por día y salidas en vivo. */

App.registrar('dashboard', (() => {
  let dias = 7;
  let canal = null;
  let timerRefresco = null;
  let timerPolling = null;
  let ultimoId = 0;

  const visible = () => !$('#p-dashboard').classList.contains('hidden');
  const tz = () => Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Managua';

  function rango() {
    const hoy = hoyISO();
    return { hoy, desde: inicioDia(sumarDias(hoy, -(dias - 1))), hasta: inicioDiaSiguiente(hoy) };
  }

  /* ---------- Resumen ---------- */
  async function cargarResumen() {
    const r = rango();
    const { data, error } = await sb.rpc('dashboard_resumen', {
      p_desde: r.desde, p_hasta: r.hasta, p_tz: tz(), p_umbral: CONFIG.STOCK_BAJO
    });
    if (error) { toast(`Dashboard: ${traducirError(error)}`, 'error'); return; }
    pintarKpis(data);
    pintarTop(data.top || []);
    pintarDias(data.por_dia || [], r.hoy);
    pintarInventario(data.inventario, data.stock_bajo || []);
  }

  function pintarKpis(d) {
    const etiqueta = dias === 1 ? 'hoy' : `últimos ${dias} días`;
    $('#db-kpis').innerHTML = `
      <div class="kpi main"><span>Vendido (${etiqueta})</span><b>${esc(money(d.total))}</b></div>
      <div class="kpi"><span>Unidades</span><b>${esc(entero(d.unidades))}</b></div>
      <div class="kpi"><span>Ventas (tickets)</span><b>${esc(entero(d.tickets))}</b></div>
      <div class="kpi"><span>Ganancia estimada</span><b>${esc(money(d.ganancia))}</b></div>`;
  }

  function pintarTop(top) {
    const cont = $('#db-top');
    if (!top.length) { cont.innerHTML = '<div class="empty-note">Aún no hay ventas en este período.</div>'; return; }
    const max = Math.max(...top.map((t) => t.unidades), 1);
    cont.innerHTML = top.map((t) => `
      <div class="bar-row">
        <div class="lbl"><span title="${esc(t.producto)}">${esc(t.producto)}</span><span>${esc(entero(t.unidades))} u · ${esc(money(t.total))}</span></div>
        <div class="bar"><i style="width:${Math.max(4, Math.round((t.unidades / max) * 100))}%"></i></div>
      </div>`).join('');
  }

  function pintarDias(porDia, hoy) {
    const mapa = new Map(porDia.map((d) => [d.dia, d]));
    const lista = [];
    for (let i = dias - 1; i >= 0; i--) {
      const iso = sumarDias(hoy, -i);
      lista.push({ iso, total: Number(mapa.get(iso)?.total || 0), unidades: Number(mapa.get(iso)?.unidades || 0) });
    }
    const mejor = Math.max(...lista.map((d) => d.total), 0);
    const max = Math.max(mejor, 1);
    if (dias === 1) {
      $('#db-dias').innerHTML = `<div class="empty-note">${lista[0].total ? `Hoy se han vendido ${esc(money(lista[0].total))} en ${esc(entero(lista[0].unidades))} unidades.` : 'Todavía no hay ventas hoy.'}</div>`;
      return;
    }
    const salto = dias > 14 ? 5 : 1;
    $('#db-dias').innerHTML = `<div class="cols">${lista.map((d, i) => `
      <div class="col" title="${esc(fmtFecha(d.iso))}: ${esc(money(d.total))}">
        <div class="b" style="height:${d.total ? Math.max(3, Math.round((d.total / max) * 100)) : 0}%"></div>
        <small>${i % salto === 0 || i === lista.length - 1 ? esc(fmtFecha(d.iso).slice(0, 5)) : '&nbsp;'}</small>
      </div>`).join('')}</div>
      <p class="muted" style="margin:8px 0 0;font-size:.85rem">Mejor día del período: ${esc(money(mejor))}</p>`;
  }

  function pintarInventario(inv, bajo) {
    $('#db-inv').innerHTML = `
      <div class="sum">
        <div class="r"><span>Productos</span><b>${esc(entero(inv.productos))}</b></div>
        <div class="r"><span>Unidades en existencia</span><b>${esc(entero(inv.unidades))}</b></div>
        <div class="r"><span>Valor a costo</span><b>${esc(money(inv.valor_costo))}</b></div>
        <div class="r"><span>Valor a precio de venta</span><b>${esc(money(inv.valor_venta))}</b></div>
      </div>`;
    $('#db-bajo').innerHTML = bajo.length
      ? `<h3 style="font-size:.9rem">Poco stock</h3>${bajo.map((b) => `
          <div class="live-row" style="grid-template-columns:1fr auto">
            <span class="p">${esc(b.nombre)}<small>${esc(b.codigo)}</small></span>
            <span class="stk ${b.existencia === 0 ? 'zero' : 'low'}">${b.existencia}</span>
          </div>`).join('')}`
      : '<p class="muted" style="margin:0">No hay productos con poco stock.</p>';
  }

  /* ---------- En vivo ---------- */
  async function cargarVivo() {
    const { data, error } = await sb.from('salidas')
      .select('id,fecha,producto,codigo,cantidad,total,usuario')
      .order('fecha', { ascending: false }).order('id', { ascending: false }).limit(15);
    if (error) { $('#db-live').innerHTML = `<p class="msg">${esc(traducirError(error))}</p>`; return; }
    const nuevoDesde = ultimoId;
    ultimoId = data.length ? Math.max(...data.map((r) => r.id)) : ultimoId;
    if (!data.length) { $('#db-live').innerHTML = '<div class="empty-note">Aún no hay salidas registradas.</div>'; return; }
    $('#db-live').innerHTML = data.map((r) => `
      <div class="live-row ${nuevoDesde && r.id > nuevoDesde ? 'nuevo' : ''}">
        <span class="h">${esc(fmtFecha(r.fecha).slice(0, 5))} ${esc(fmtHora(r.fecha))}</span>
        <span class="p">${esc(r.producto)}<small>${esc(r.codigo)} · ${esc(r.usuario)} · ${esc(entero(r.cantidad))} u</small></span>
        <span class="m">${esc(money(r.total))}</span>
      </div>`).join('');
  }

  function estadoVivo(conectado) {
    $('#db-dot').classList.toggle('off', !conectado);
    $('#db-live-estado').textContent = conectado ? '· conectado' : '· actualizando cada 30 s';
  }

  function refrescarPronto() {
    clearTimeout(timerRefresco);
    timerRefresco = setTimeout(() => { cargarVivo(); cargarResumen(); }, 600);
  }

  function suscribir() {
    if (canal) return;
    canal = sb.channel('salidas-vivo')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'salidas' }, refrescarPronto)
      .subscribe((estado) => estadoVivo(estado === 'SUBSCRIBED'));
  }

  /* ---------- Eventos ---------- */
  function marcarRango() {
    $$('#db-rango .chip').forEach((c) => c.setAttribute('aria-pressed', String(Number(c.dataset.dias) === dias)));
  }

  function iniciar() {
    $('#db-rango').addEventListener('click', (e) => {
      const b = e.target.closest('[data-dias]');
      if (!b) return;
      dias = Number(b.dataset.dias);
      marcarRango();
      cargarResumen();
    });
    estadoVivo(false);
    suscribir();
    timerPolling = setInterval(() => { if (visible() && !document.hidden) { cargarVivo(); cargarResumen(); } }, 30000);
  }

  function mostrar() {
    marcarRango();
    cargarResumen();
    cargarVivo();
  }

  return { iniciar, mostrar };
})());
