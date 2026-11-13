'use strict';
/* Panel: sesión, pestañas y datos compartidos entre módulos. */

const sb = crearCliente();
const emailDe = (usuario) => `${String(usuario).trim().toLowerCase()}@${CONFIG.DOMINIO_USUARIOS}`;

const App = {
  user: null,
  usuario: null,
  rol: null,
  categorias: [],
  productos: [],
  modulos: {},
  tabActual: null,

  esAdmin() { return this.rol === 'admin'; },

  registrar(nombre, modulo) { this.modulos[nombre] = Object.assign({ iniciado: false }, modulo); },

  mostrarVista(v) {
    $('#vista-login').classList.toggle('hidden', v !== 'login');
    $('#vista-app').classList.toggle('hidden', v !== 'app');
  },

  msgLogin(texto) { $('#login-msg').textContent = texto; },

  async arrancar() {
    inyectarSprite();
    this.enlazarEventos();
    if (!sb) {
      this.mostrarVista('login');
      this.msgLogin('Falta configurar js/config.js con la URL y la clave de Supabase.');
      return;
    }
    const { data } = await sb.auth.getSession();
    await this.alCambiarSesion(data.session);
    sb.auth.onAuthStateChange((evento, sesion) => {
      // setTimeout evita bloqueos al llamar a Supabase dentro del callback
      setTimeout(() => {
        if (evento === 'SIGNED_OUT') this.alCambiarSesion(null);
        else if (evento === 'SIGNED_IN' && sesion?.user?.id !== this.user?.id) this.alCambiarSesion(sesion);
      }, 0);
    });
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
  },

  enlazarEventos() {
    $('#form-login').addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = $('#btn-entrar');
      this.msgLogin('');
      if (!sb) return this.msgLogin('Falta configurar js/config.js.');
      ocupado(btn, true, 'Entrando…');
      const { error } = await sb.auth.signInWithPassword({
        email: emailDe($('#login-usuario').value),
        password: $('#login-pass').value
      });
      ocupado(btn, false);
      if (error) this.msgLogin(traducirError(error));
    });

    $('#btn-salir').addEventListener('click', () => sb.auth.signOut());

    $('#btn-clave').addEventListener('click', async () => {
      const nueva = prompt('Nueva contraseña (mínimo 8 caracteres):');
      if (nueva === null) return;
      if (nueva.length < 8) return toast('La contraseña debe tener al menos 8 caracteres.', 'error');
      const { error } = await sb.auth.updateUser({ password: nueva });
      toast(error ? traducirError(error) : 'Contraseña actualizada', error ? 'error' : 'ok');
    });

    $('#tabs').addEventListener('click', (e) => {
      const b = e.target.closest('[data-tab]');
      if (b) this.irTab(b.dataset.tab);
    });
  },

  async alCambiarSesion(sesion) {
    if (!sesion) {
      if (this.user) { location.reload(); return; }
      this.mostrarVista('login');
      return;
    }
    const email = (sesion.user.email || '').toLowerCase();
    const { data, error } = await sb.from('usuarios_permitidos')
      .select('usuario, rol, activo').eq('email', email).maybeSingle();

    if (error || !data || !data.activo) {
      await sb.auth.signOut();
      this.mostrarVista('login');
      this.msgLogin('Tu cuenta no tiene acceso al panel. Contacta al administrador.');
      return;
    }
    this.user = sesion.user;
    this.usuario = data.usuario;
    this.rol = data.rol;
    $('#usr').textContent = `${data.usuario} · ${data.rol === 'admin' ? 'Administrador' : 'Empleado'}`;
    this.mostrarVista('app');
    await this.abrirPanel();
  },

  async abrirPanel() {
    $$('#tabs .tab').forEach((t) => { t.classList.toggle('hidden', !!t.dataset.admin && !this.esAdmin()); });
    if (this.esAdmin()) {
      try {
        await Promise.all([this.cargarCategorias(), this.cargarProductos()]);
      } catch (e) {
        toast(`No se pudieron cargar los datos: ${traducirError(e)}`, 'error');
      }
    }
    this.irTab(this.esAdmin() ? 'dashboard' : 'vender');
  },

  irTab(nombre) {
    const btn = $(`#tabs [data-tab="${nombre}"]`);
    if (!btn || btn.classList.contains('hidden')) return;
    this.tabActual = nombre;
    $$('#tabs .tab').forEach((t) => t.classList.toggle('active', t.dataset.tab === nombre));
    $$('.panel').forEach((p) => p.classList.toggle('hidden', p.id !== `p-${nombre}`));
    const mod = this.modulos[nombre];
    if (!mod) return;
    if (!mod.iniciado) { mod.iniciado = true; if (mod.iniciar) mod.iniciar(); }
    if (mod.mostrar) mod.mostrar();
  },

  async cargarCategorias() {
    const { data, error } = await sb.from('categorias').select('*').order('nombre');
    if (error) throw error;
    this.categorias = data;
  },

  async cargarProductos() {
    const filas = await traerTodo(() => sb.from('productos').select('*, categorias(nombre, prefijo)').order('nombre'));
    this.productos = filas.map((p) => ({
      ...p,
      categoria: p.categorias?.nombre || '',
      prefijo: p.categorias?.prefijo || '',
      costo_compra: Number(p.costo_compra),
      precio_venta: Number(p.precio_venta),
      existencia: Number(p.existencia)
    }));
  },

  /* Imprime el contenido en la zona de impresión (recibos y etiquetas). */
  imprimirZona(html, preparar) {
    const z = $('#print-zone');
    z.innerHTML = html;
    if (preparar) preparar(z);
    const fin = () => {
      document.body.classList.remove('imprimiendo');
      z.innerHTML = '';
      window.removeEventListener('afterprint', fin);
    };
    window.addEventListener('afterprint', fin);
    document.body.classList.add('imprimiendo');
    setTimeout(() => window.print(), 60);
  }
};
