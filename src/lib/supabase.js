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
 * @param {string} tableName - Nombre de la tabla
 * @param {Array} records - Registros a sincronizar
 * @param {string} conflictColumn - Columna para resolver conflictos (default: 'id')
 */
export async function syncTableToSupabase(tableName, records, conflictColumn = 'id') {
  if (!supabase || !records) return false
  try {
    const { error } = await supabase
      .from(tableName)
      .upsert(records, { onConflict: conflictColumn })
    if (error) throw error
    return true
  } catch (err) {
    // Si falla por unique constraint (ej: email duplicado en users),
    // intentar uno por uno cambiando la columna de conflicto
    // Usamos upsert (INSERT ... ON CONFLICT DO UPDATE) porque
    // la anon key solo tiene permiso INSERT + SELECT (no UPDATE directo)
    if (err.code === '23505' || err.status === 409) {
      console.warn(`[Supabase] Conflict en ${tableName}, intentando individual por email...`)
      let successCount = 0
      for (const record of records) {
        try {
          // Intentar con onConflict: 'email' — hace INSERT ON CONFLICT DO UPDATE
          // así funciona con solo permiso INSERT + SELECT
          const altColumn = 'email'
          const { error: indError } = await supabase
            .from(tableName)
            .upsert(record, { onConflict: altColumn })
          if (!indError) successCount++
        } catch {}
      }
      // Si no funcionó por email, reintentar omitiendo los registros conflictivos
      if (successCount === 0 && records.length > 0) {
        // Estrategia final: upsert uno por uno con onConflict: 'id'
        // filtrando los que ya existen en Supabase (para no violar unique en email)
        try {
          const { data: existing } = await supabase
            .from(tableName)
            .select('id, email')
          const existingEmails = new Set((existing || []).map(r => r.email))
          for (const record of records) {
            if (!existingEmails.has(record.email)) {
              const { error: indError } = await supabase
                .from(tableName)
                .upsert(record, { onConflict: 'id' })
              if (!indError) successCount++
            }
          }
        } catch {}
      }
      console.warn(`[Supabase] Sincronizados ${successCount}/${records.length} en ${tableName}`)
      return successCount > 0
    }
    console.warn(`[Supabase] Error syncing ${tableName}:`, err.message)
    return false
  }
}

/**
 * Sincronizar datos de Supabase hacia local
 * Maneja: nuevos registros remotos, actualizaciones a existentes.
 * RETORNA SIEMPRE UN NUEVO ARRAY si hubo cambios (no muta localRecords).
 */
export async function syncTableFromSupabase(tableName, localRecords = []) {
  if (!supabase) return null
  try {
    const remoteData = await fetchAll(tableName)
    if (!remoteData) return localRecords

    const localMap = new Map(localRecords.map(r => [r.id, r]))
    const result = []
    let changed = false

    for (const remote of remoteData) {
      const local = localMap.get(remote.id)
      if (!local) {
        // Nuevo registro remoto — agregarlo
        result.push(remote)
        changed = true
      } else {
        // Decidir si usar el remoto o mantener el local
        const remoteTime = remote.updated_at || remote.created_date
        const localTime = local.updated_at || local.created_date

        let useRemote = false
        if (remoteTime && localTime) {
          if (new Date(remoteTime) > new Date(localTime)) {
            // Remoto más reciente → usar remoto
            useRemote = true
          } else if (new Date(remoteTime).getTime() === new Date(localTime).getTime()) {
            // Mismo timestamp → comparar contenido
            const { created_date: _, updated_at: __, ...a } = local
            const { created_date: ___, updated_at: ____, ...b } = remote
            if (JSON.stringify(a) !== JSON.stringify(b)) {
              useRemote = true
            }
          }
        } else {
          // Sin timestamps → preferir remoto si el contenido difiere
          const { created_date: _, updated_at: __, ...a } = local
          const { created_date: ___, updated_at: ____, ...b } = remote
          if (JSON.stringify(a) !== JSON.stringify(b)) {
            useRemote = true
          }
        }

        if (useRemote) {
          result.push({ ...local, ...remote })
          changed = true
        } else {
          result.push(local)
        }
      }
    }

    if (changed) return result
    return localRecords
  } catch (err) {
    console.warn(`[Supabase] Error syncing ${tableName} from server:`, err.message)
    return localRecords
  }
}

/**
 * Subir una imagen a Supabase Storage
 * @param {File} file - Archivo de imagen
 * @param {string} bucket - Nombre del bucket (default: 'banners')
 * @returns {Promise<string|null>} - URL pública de la imagen
 */
export async function uploadImage(blob, originalFileName = 'image.jpg', bucket = 'banners') {
  if (!supabase) return null
  try {
    const ext = originalFileName.split('.').pop() || 'jpg'
    const fileName = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`
    const filePath = `${fileName}`

    const { data, error } = await supabase.storage
      .from(bucket)
      .upload(filePath, blob, {
        cacheControl: '3600',
        upsert: false,
        contentType: 'image/jpeg'
      })

    if (error) throw error

    const { data: { publicUrl } } = supabase.storage
      .from(bucket)
      .getPublicUrl(filePath)

    return publicUrl
  } catch (err) {
    console.warn(`[Supabase] Error uploading image:`, err.message)
    return null
  }
}

export { TABLES }
