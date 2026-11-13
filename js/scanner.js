'use strict';
/* Lector por cámara (códigos de barras y QR). Los lectores USB o Bluetooth
   no necesitan esto: escriben el código y pulsan Enter en el campo enfocado. */

const Escaner = (() => {
  let lector = null;
  let alLeer = null;
  const dlg = () => $('#d-scan');

  async function detener() {
    if (!lector) return;
    const l = lector;
    lector = null;
    try { await l.stop(); l.clear(); } catch (_) { /* ya detenido */ }
  }

  function cerrar() {
    detener();
    alLeer = null;
    if (dlg().open) dlg().close();
  }

  async function abrir(callback) {
    alLeer = callback;
    $('#scan-msg').textContent = '';
    dlg().showModal();
    if (!window.Html5Qrcode) {
      $('#scan-msg').textContent = 'No se pudo cargar el lector de cámara. Revisa tu conexión.';
      return;
    }
    try {
      lector = new Html5Qrcode('scan-reader');
      await lector.start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 260, height: 160 } },
        (texto) => {
          const f = alLeer;
          if (!f) return;
          cerrar();
          f(String(texto).trim());
        },
        () => {}
      );
    } catch (e) {
      lector = null;
      $('#scan-msg').textContent = 'No se pudo abrir la cámara. Permite el acceso a la cámara en el navegador.';
    }
  }

  dlg().addEventListener('close', detener);
  $('#scan-cerrar').addEventListener('click', cerrar);
  return { abrir };
})();
