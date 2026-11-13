'use strict';
/* Panel: sesión, pestañas y datos compartidos entre módulos. */

const CLAVE_ACT = 'urbanstore_ultima_actividad';
const CLAVE_AVISO = 'urbanstore_aviso_inactividad';
const localStorage_get = (k) => { try { return localStorage.getItem(k); } catch (_) { return null; } };
const localStorage_set = (k, v) => { try { localStorage.setItem(k, v); } catch (_) { /* sin almacenamiento */ } };
const localStorage_del = (k) => { try { localStorage.removeItem(k); } catch (_) { /* sin almacenamiento */ } };

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
    // Si la app estuvo cerrada o en segundo plano más del límite, se pide el acceso otra vez.
    if (data.session && this.inactividadVencida()) {
      await this.cerrarSesion({ porInactividad: true, recargar: false });
      data.session = null;
    }
    await this.alCambiarSesion(data.session);
    if (localStorage_get(CLAVE_AVISO)) {
      localStorage_del(CLAVE_AVISO);
      if (!data.session) this.msgLogin('Tu sesión se cerró por inactividad. Entra de nuevo.');
    }
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

    $('#btn-salir').addEventListener('click', () => this.cerrarSesion());

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

  /* ---------- Cierre de sesión y bloqueo por inactividad ---------- */
  recargar() { location.reload(); },

  // Cierra la sesión de forma fiable también en la app instalada: si Supabase no responde
  // (sin red, bloqueo entre pestañas), igualmente se borra la sesión guardada en el aparato.
  async cerrarSesion({ porInactividad = false, recargar = true } = {}) {
    if (this.cerrando) return;
    this.cerrando = true;
    if (porInactividad) localStorage_set(CLAVE_AVISO, '1');
    try {
      await Promise.race([sb.auth.signOut(), new Promise((r) => setTimeout(r, 2500))]);
    } catch (_) { /* se limpia igual abajo */ }
    try {
      Object.keys(localStorage).filter((k) => /^sb-.*-auth-token/.test(k) || /^sb-.*-code-verifier$/.test(k))
        .forEach((k) => localStorage.removeItem(k));
    } catch (_) { /* sin almacenamiento */ }
    localStorage_del(CLAVE_ACT);
    this.cerrando = false;
    if (recargar) this.recargar();
  },

  limiteInactividad() { return (Number(CONFIG.INACTIVIDAD_SEG) || 60) * 1000; },

  ultimaActividad() {
    const guardada = Number(localStorage_get(CLAVE_ACT)) || 0;
    return Math.max(guardada, this._ultima || 0);
  },

  marcarActividad() {
    this._ultima = Date.now();
    localStorage_set(CLAVE_ACT, String(this._ultima));
  },

  inactividadVencida() {
    const g = Number(localStorage_get(CLAVE_ACT)) || 0;
    return g > 0 && Date.now() - g >= this.limiteInactividad();
  },

  vigilarInactividad() {
    if (this._vigilando) return;
    this._vigilando = true;
    this.marcarActividad();
    let ultimoRegistro = 0;
    const alActividad = () => {
      const t = Date.now();
      if (t - ultimoRegistro < 500) return; // no escribir en cada movimiento
      ultimoRegistro = t;
      this.marcarActividad();
    };
    ['pointerdown', 'keydown', 'touchstart', 'wheel', 'scroll', 'input', 'click'].forEach((ev) =>
      document.addEventListener(ev, alActividad, { passive: true, capture: true }));

    const revisar = () => {
      if (!this.user || this.cerrando) return;
      if (document.querySelector('#d-scan[open]')) this.marcarActividad(); // escaneando con la cámara
      const inactivo = Date.now() - this.ultimaActividad();
      const limite = this.limiteInactividad();
      if (inactivo >= limite) { this.cerrarSesion({ porInactividad: true }); return; }
      const faltan = Math.ceil((limite - inactivo) / 1000);
      if (faltan <= 10) toast(`Sesión inactiva: se cerrará en ${faltan} s. Toca la pantalla para continuar.`, 'error');
    };
    setInterval(revisar, 1000);
    // Al volver a la app (teléfono bloqueado, otra pestaña) se revisa al instante
    document.addEventListener('visibilitychange', () => { if (!document.hidden) revisar(); });
    window.addEventListener('pageshow', revisar);
    window.addEventListener('focus', revisar);
  },

  async alCambiarSesion(sesion) {
    if (!sesion) {
      if (this.user) { this.recargar(); return; }
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
    this.marcarActividad();
    this.vigilarInactividad();
    await this.abrirPanel();
  },

  async abrirPanel() {
    $$('#tabs .tab').forEach((t) => { t.classList.toggle('hidden', !!t.dataset.admin && !this.esAdmin()); });
    const unaSola = $$('#tabs .tab:not(.hidden)').length <= 1;
    $('#tabs').classList.toggle('solo', unaSola);
    $('#vista-app').classList.toggle('solo-tab', unaSola);
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
