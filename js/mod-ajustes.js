'use strict';
/* Ajustes: categorías (con el prefijo de los códigos) y usuarios. */

App.registrar('ajustes', (() => {
  /* ---------- Categorías ---------- */
  function pintarCategorias() {
    const cont = $('#cat-lista');
    const cuenta = new Map();
    App.productos.forEach((p) => cuenta.set(p.categoria_id, (cuenta.get(p.categoria_id) || 0) + 1));
    cont.innerHTML = App.categorias.map((c) => {
      const n = cuenta.get(c.id) || 0;
      return `
        <div class="item" data-id="${c.id}">
          <div class="nm">${esc(c.nombre)}<small>Prefijo ${esc(c.prefijo)} · ${n} ${n === 1 ? 'producto' : 'productos'}</small></div>
          <button class="btn small" type="button" data-act="renombrar">Renombrar</button>
          <button class="btn small danger" type="button" data-act="borrar" ${n > 0 ? 'disabled title="Tiene productos"' : ''}>Eliminar</button>
        </div>`;
    }).join('') || '<p class="muted">No hay categorías.</p>';
  }

  async function recargarCategorias() {
    try { await Promise.all([App.cargarCategorias(), App.cargarProductos()]); } catch (e) { toast(traducirError(e), 'error'); }
    pintarCategorias();
  }

  /* ---------- Usuarios ---------- */
  async function cargarUsuarios() {
    const cont = $('#lista-usuarios');
    const { data, error } = await sb.from('usuarios_permitidos').select('usuario, rol, activo').order('creado_en');
    if (error) { cont.textContent = traducirError(error); return; }
    cont.innerHTML = data.map((u) => {
      const soyYo = u.usuario === App.usuario;
      return `
        <div class="item ${u.activo ? '' : 'off'}" data-usuario="${esc(u.usuario)}">
          <div class="nm">${esc(u.usuario)}${soyYo ? '<small>(tú)</small>' : ''}</div>
          <select data-act="rol" ${soyYo ? 'disabled' : ''} aria-label="Rol de ${esc(u.usuario)}">
            <option value="empleado" ${u.rol === 'empleado' ? 'selected' : ''}>Empleado</option>
            <option value="admin" ${u.rol === 'admin' ? 'selected' : ''}>Administrador</option>
          </select>
          <button class="btn small" type="button" data-act="clave">Contraseña</button>
          <button class="btn small" type="button" data-act="activo" ${soyYo ? 'disabled' : ''}>${u.activo ? 'Desactivar' : 'Activar'}</button>
          <button class="btn small danger" type="button" data-act="borrar" ${soyYo ? 'disabled' : ''}>Eliminar</button>
        </div>`;
    }).join('') || '<p class="muted">No hay usuarios.</p>';
  }

  function iniciar() {
    $('#cat-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = $('#cat-form button[type=submit]');
      ocupado(btn, true, 'Creando…');
      const { error } = await sb.rpc('crear_categoria', {
        p_nombre: $('#cat-nombre').value,
        p_prefijo: $('#cat-prefijo').value.trim() || null
      });
      ocupado(btn, false);
      if (error) return toast(traducirError(error), 'error');
      $('#cat-nombre').value = '';
      $('#cat-prefijo').value = '';
      toast('Categoría creada', 'ok');
      recargarCategorias();
    });

    $('#cat-lista').addEventListener('click', async (e) => {
      const b = e.target.closest('button[data-act]');
      if (!b || b.disabled) return;
      const id = Number(b.closest('.item').dataset.id);
      const cat = App.categorias.find((c) => c.id === id);
      let error;
      if (b.dataset.act === 'renombrar') {
        const nombre = prompt(`Nuevo nombre para “${cat.nombre}” (el prefijo y los códigos no cambian):`, cat.nombre);
        if (nombre === null || !nombre.trim() || nombre.trim() === cat.nombre) return;
        ({ error } = await sb.from('categorias').update({ nombre: nombre.trim() }).eq('id', id));
        if (!error) toast('Categoría renombrada', 'ok');
      } else if (b.dataset.act === 'borrar') {
        if (!confirm(`¿Eliminar la categoría “${cat.nombre}”?`)) return;
        ({ error } = await sb.from('categorias').delete().eq('id', id));
        if (!error) toast('Categoría eliminada', 'ok');
      }
      if (error) toast(error.code === '23505' ? 'Ya existe una categoría con ese nombre.' : traducirError(error), 'error');
      recargarCategorias();
    });

    $('#form-usuario').addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = $('#form-usuario button[type=submit]');
      ocupado(btn, true, 'Creando…');
      const { error } = await sb.rpc('crear_usuario', {
        p_usuario: $('#u-usuario').value,
        p_password: $('#u-pass').value,
        p_rol: $('#u-rol').value
      });
      ocupado(btn, false);
      if (error) return toast(error.message, 'error');
      $('#u-usuario').value = '';
      $('#u-pass').value = '';
      toast('Usuario creado. Ya puede entrar con su usuario y contraseña.', 'ok');
      cargarUsuarios();
    });

    $('#lista-usuarios').addEventListener('click', async (e) => {
      const b = e.target.closest('button[data-act]');
      if (!b || b.disabled) return;
      const usuario = b.closest('.item').dataset.usuario;
      let error;
      if (b.dataset.act === 'activo') {
        const activar = b.textContent.trim() === 'Activar';
        ({ error } = await sb.from('usuarios_permitidos').update({ activo: activar }).eq('usuario', usuario));
      } else if (b.dataset.act === 'clave') {
        const nueva = prompt(`Nueva contraseña para “${usuario}” (mínimo 8 caracteres):`);
        if (nueva === null) return;
        ({ error } = await sb.rpc('cambiar_password', { p_usuario: usuario, p_password: nueva }));
        if (!error) toast('Contraseña cambiada', 'ok');
      } else if (b.dataset.act === 'borrar') {
        if (!confirm(`¿Eliminar al usuario “${usuario}”? Ya no podrá entrar. Sus ventas registradas se conservan.`)) return;
        ({ error } = await sb.rpc('eliminar_usuario', { p_usuario: usuario }));
        if (!error) toast('Usuario eliminado', 'ok');
      }
      if (error) toast(error.message, 'error');
      cargarUsuarios();
    });

    $('#lista-usuarios').addEventListener('change', async (e) => {
      if (e.target.dataset.act !== 'rol') return;
      const usuario = e.target.closest('.item').dataset.usuario;
      const { error } = await sb.from('usuarios_permitidos').update({ rol: e.target.value }).eq('usuario', usuario);
      toast(error ? traducirError(error) : 'Rol actualizado', error ? 'error' : 'ok');
    });
  }

  function mostrar() {
    pintarCategorias();
    cargarUsuarios();
  }

  return { iniciar, mostrar };
})());
