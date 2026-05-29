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
export const TABLES = {
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
/**
 * Limpiar campos locales que no existen en las tablas de Supabase
 * (created_date, updated_at son solo del localStorage local)
 */
export function stripLocalFields(records) {
  return records.map(r => {
    const { created_date, updated_at, live_started_at, ...clean } = r
    return clean
  })
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
  const cleanedRecords = stripLocalFields(records)
  try {
    const { error } = await supabase
      .from(tableName)
      .upsert(cleanedRecords, { onConflict: conflictColumn })
    if (error) throw error
    return true
  } catch (err) {
    // Si falla por violación de foreign key (prize_id no existe), omite el batch
    if (err.code === '23503') {
      console.warn(`[Supabase] FK violation en ${tableName}, omitiendo sync temporalmente`)
      return false
    }
    // Si falla por unique constraint (ej: email duplicado en users),
    // intentar uno por uno cambiando la columna de conflicto
    if (err.code === '23505' || err.status === 409) {
      console.warn(`[Supabase] Conflict en ${tableName}, intentando individual por email...`)
      let successCount = 0
      for (const record of cleanedRecords) {
        try {
          const { error: indError } = await supabase
            .from(tableName)
            .upsert(record, { onConflict: 'email' })
          if (!indError) successCount++
        } catch {}
      }
      if (successCount === 0 && records.length > 0) {
        try {
          const { data: existing } = await supabase
            .from(tableName)
            .select('id, email')
          const existingEmails = new Set((existing || []).map(r => r.email))
          for (const record of cleanedRecords) {
            if (!existingEmails.has(record.email)) {
              const { error: indError } = await supabase
                .from(tableName)
                .upsert(record, { onConflict: 'id' })
              if (!indError) successCount++
            }
          }
        } catch {}
      }
      console.warn(`[Supabase] Sincronizados ${successCount}/${cleanedRecords.length} en ${tableName}`)
      return successCount > 0
    }
    // Fallback: si no existe la constraint UNIQUE para la columna de conflicto (ej: key)
    // reintentar con 'id' como columna de conflicto
    if (conflictColumn !== 'id' && (err.code === '42P10' || err.message?.includes('ON CONFLICT'))) {
      console.warn(`[Supabase] No hay UNIQUE en ${conflictColumn} para ${tableName}, reintentando con id...`)
      return await syncTableToSupabase(tableName, records, 'id')
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

    // 1. Procesar todos los registros provenientes de Supabase (el servidor manda)
    for (const remote of remoteData) {
      const local = localMap.get(remote.id)
      if (!local) {
        // Nuevo registro remoto — agregarlo
        result.push(remote)
        changed = true
      } else {
        // Comparar contenido omitiendo fechas locales de creación/modificación
        const { created_date: _, updated_at: __, ...a } = local
        const { created_date: ___, updated_at: ____, ...b } = remote
        
        const contentChanged = JSON.stringify(a) !== JSON.stringify(b)
        
        if (contentChanged) {
          // Para tablas de admin (matches, prizes), la nube manda
          // Para tablas de usuario (predictions, redemptions, etc.), el local manda
          const adminTables = ['matches', 'prizes']
          if (adminTables.includes(tableName)) {
            // La nube es la autoridad — el admin hizo cambios allí
            result.push({ ...local, ...remote })
          } else {
            // El usuario local puede tener datos no subidos aún
            result.push({ ...remote, ...local })
          }
          changed = true
        } else {
          result.push(local)
        }
      }
    }

    // 2. Preservar registros locales que aún no se han subido a Supabase
    // Para app_settings, comparamos por KEY en vez de por ID
    if (tableName === 'app_settings') {
      const remoteKeys = new Set(remoteData.map(r => r.key))
      for (const local of localRecords) {
        if (!remoteKeys.has(local.key)) {
          result.push(local)
          changed = true
        }
      }
    } else {
      const remoteIds = new Set(remoteData.map(r => r.id))
      const userGeneratedTables = ['predictions', 'support_tickets', 'redemptions', 'users']
      
      for (const local of localRecords) {
        if (!remoteIds.has(local.id)) {
          const isUserGenerated = userGeneratedTables.includes(tableName)
          const isRecent = local.created_date && (Date.now() - new Date(local.created_date).getTime() < 5 * 60 * 1000)
          
          if (isUserGenerated || isRecent) {
            result.push(local)
          } else {
            changed = true
          }
        }
      }
    }

    // Deduplicar app_settings por key (habían duplicados por errores anteriores de sync)
    // Los registros vienen de Supabase sin created_date (se limpia al subir),
    // así que mantenemos la ÚLTIMA ocurrencia de cada key (orden de inserción = más reciente al final)
    if (changed && tableName === 'app_settings') {
      const keyMap = new Map()
      for (const rec of result) {
        keyMap.set(rec.key, rec) // la última ocurrencia sobreescribe las anteriores
      }
      const deduped = Array.from(keyMap.values())
      if (deduped.length !== result.length) {
        console.log(`[Supabase] Deduplicados ${result.length - deduped.length} registros en ${tableName}`)
        result.length = 0
        result.push(...deduped)
      }
    }

    // Deduplicar usuarios por email (evita admins duplicados en el ranking)
    if (changed && tableName === 'users') {
      const emailMap = new Map()
      for (const rec of result) {
        const existing = emailMap.get(rec.email)
        if (!existing) {
          emailMap.set(rec.email, rec)
        } else {
          const existingFields = Object.keys(existing).length
          const recFields = Object.keys(rec).length
          if (recFields > existingFields) {
            emailMap.set(rec.email, rec)
          }
        }
      }
      const deduped = Array.from(emailMap.values())
      if (deduped.length !== result.length) {
        console.log(`[Supabase] Deduplicados ${result.length - deduped.length} usuarios por email`)
        result.length = 0
        result.push(...deduped)
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
