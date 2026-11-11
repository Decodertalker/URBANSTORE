// Configuración pública. La "anon key" es segura de publicar:
// la protección real está en las políticas RLS de Supabase (supabase/schema.sql).
// NUNCA pongas aquí la "service_role key".
const CONFIG = {
  SUPABASE_URL: 'https://ehoomptaflkqnqdthmuj.supabase.co',
  SUPABASE_ANON_KEY: 'sb_publishable_lD9-SPZhKnbNbRsh6j1AMQ_qTULNgBq',
  // Dominio interno para los usuarios (no es un correo real). Debe coincidir con supabase/schema.sql
  DOMINIO_USUARIOS: 'inventario.app',
  NOMBRE_TIENDA: 'Mi Tienda de Ropa',
  MONEDA: 'C$',
  STOCK_BAJO: 3 // a partir de esta cantidad o menos se marca "poco stock"
};
