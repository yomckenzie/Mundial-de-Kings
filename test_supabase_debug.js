import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://khrxddafhzvfdyivysay.supabase.co';
const supabaseAnonKey = 'sb_publishable_Osx7SAGlxtM_A2WOnUjY7w_NPGchvj8';

console.log('Iniciando prueba de conexion a Supabase...');
const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function run() {
  try {
    console.log('Intentando leer la tabla app_settings...');
    const { data, error } = await supabase.from('app_settings').select('*');
    if (error) {
      console.error('Error al consultar app_settings:', error.message, error);
    } else {
      console.log('Conexion exitosa! Registros encontrados:', data.length);
      console.log('Detalle de los registros:', JSON.stringify(data, null, 2));
    }
  } catch (err) {
    console.error('Error inesperado durante la prueba:', err);
  }
}

run();
