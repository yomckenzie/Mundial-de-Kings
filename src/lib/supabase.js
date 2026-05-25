import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn(
    '[Supabase] Variables de entorno no configuradas. ' +
    'Crea un archivo .env con VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY. ' +
    'La app funcionará en modo local (solo localStorage).'
  )
}

export const supabase = supabaseUrl && supabaseAnonKey
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null

// Helper para determinar si Supabase está disponible
export const isSupabaseAvailable = () => supabase !== null

// Tablas en Supabase
const TABLES = {
  users: 'users',
  matches: 'matches',
  predictions: 'predictions',
  prizes: 'prizes',
  redemptions: 'redemptions',
  support_tickets: 'support_tickets',
  points_bonuses: 'points_bonuses',
  app_settings: 'app_settings',
}

/**
 * Obtener todos los registros de una tabla
 */
export async function fetchAll(tableName, options = {}) {
  if (!supabase) return null
  try {
    let query = supabase.from(tableName).select('*')
    if (options.order) {
      const field = options.order.startsWith('-') ? options.order.slice(1) : options.order
      const ascending = !options.order.startsWith('-')
      query = query.order(field, { ascending })
    }
    const { data, error } = await query
    if (error) throw error
    return data
  } catch (err) {
    console.warn(`[Supabase] Error fetching ${tableName}:`, err.message)
    return null
  }
}

/**
 * Insertar un registro en una tabla
 */
export async function insertRecord(tableName, record) {
  if (!supabase) return null
  try {
    const { data, error } = await supabase
      .from(tableName)
      .insert(record)
      .select()
      .single()
    if (error) throw error
    return data
  } catch (err) {
    console.warn(`[Supabase] Error inserting into ${tableName}:`, err.message)
    return null
  }
}

/**
 * Actualizar un registro en una tabla
 */
export async function updateRecord(tableName, id, updates) {
  if (!supabase) return null
  try {
    const { data, error } = await supabase
      .from(tableName)
      .update(updates)
      .eq('id', id)
      .select()
      .single()
    if (error) throw error
    return data
  } catch (err) {
    console.warn(`[Supabase] Error updating ${tableName}:`, err.message)
    return null
  }
}

/**
 * Eliminar registros de una tabla (con filtro)
 */
export async function deleteRecords(tableName, field, value) {
  if (!supabase) return null
  try {
    const { error } = await supabase
      .from(tableName)
      .delete()
      .eq(field, value)
    if (error) throw error
    return true
  } catch (err) {
    console.warn(`[Supabase] Error deleting from ${tableName}:`, err.message)
    return null
  }
}

/**
 * Sincronizar datos locales hacia Supabase
 * Envía los datos de una tabla completa
 */
export async function syncTableToSupabase(tableName, records) {
  if (!supabase || !records) return false
  try {
    // Insertar todos los registros (upsert por id)
    const { error } = await supabase
      .from(tableName)
      .upsert(records, { onConflict: 'id' })
    if (error) throw error
    return true
  } catch (err) {
    console.warn(`[Supabase] Error syncing ${tableName}:`, err.message)
    return false
  }
}

/**
 * Sincronizar datos de Supabase hacia local
 */
export async function syncTableFromSupabase(tableName, localRecords = []) {
  if (!supabase) return null
  try {
    const remoteData = await fetchAll(tableName)
    if (!remoteData) return localRecords

    // Mapa de IDs locales para evitar duplicados
    const localIds = new Set(localRecords.map(r => r.id))

    // Agregar registros remotos que no existen localmente
    const newRecords = remoteData.filter(r => !localIds.has(r.id))

    if (newRecords.length > 0) {
      return [...localRecords, ...newRecords]
    }
    return localRecords
  } catch (err) {
    console.warn(`[Supabase] Error syncing ${tableName} from server:`, err.message)
    return localRecords
  }
}

export { TABLES }
