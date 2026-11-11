// Configuración pública. La "anon key" es segura de publicar:
// la protección real está en las políticas RLS de Supabase (supabase/schema.sql).
// NUNCA pongas aquí la "service_role key".
const CONFIG = {
  SUPABASE_URL: 'https://TU-PROYECTO.supabase.co',
  SUPABASE_ANON_KEY: 'TU-ANON-KEY-PUBLICA',
  NOMBRE_TIENDA: 'Mi Tienda de Ropa',
  MONEDA: 'C$',
  STOCK_BAJO: 3 // a partir de esta cantidad o menos se marca "poco stock"
};
