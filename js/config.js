// Configuración pública. La clave "publishable/anon" es segura de publicar:
// la protección real está en las políticas de seguridad de Supabase (supabase/schema.sql).
// NUNCA pongas aquí la clave "service_role" ni la "secret".
const CONFIG = {
  SUPABASE_URL: 'https://ehoomptaflkqnqdthmuj.supabase.co',
  SUPABASE_ANON_KEY: 'sb_publishable_lD9-SPZhKnbNbRsh6j1AMQ_qTULNgBq',

  // Dominio interno de los usuarios (no es un correo real). Debe coincidir con supabase/schema.sql
  DOMINIO_USUARIOS: 'inventario.app',

  NOMBRE_TIENDA: 'URBANSTORE',
  MONEDA: 'C$',
  STOCK_BAJO: 3, // con esta cantidad o menos se marca "poco stock"

  // Datos de contacto de la página pública. Deja vacío ('') lo que no quieras mostrar.
  DIRECCION: '',
  HORARIO: '',
  // WhatsApp: solo números con código de país, por ejemplo '50588887777'
  WHATSAPP: ''
};
