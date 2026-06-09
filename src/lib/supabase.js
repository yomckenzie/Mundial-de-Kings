import { createClient } from '@supabase/supabase-js'

// Tablas donde la NUBE es la fuente de verdad (admin-controlled).
// Incluye 'users' porque el admin es quien actualiza prediction_points,
// total_points, bonus_points, referral_points, role, profile_complete
// (vía evaluateMatchPredictions, GrantPointsModal, sistema de referidos).
// Sin esto, el sync de "Local gana" descartaba los puntos actualizados
// y el ranking del usuario nunca se actualizaba desde otro dispositivo.
const ADMIN_TABLES = new Set(['matches', 'prizes', 'users'])
const USER_GENERATED_TABLES = new Set(['predictions', 'redemptions', 'support_tickets', 'points_bonuses'])

let supabaseUrl = ''
let supabaseAnonKey = ''
try {
  // In Vite/Esm environment
  supabaseUrl = import.meta.env.VITE_SUPABASE_URL
  supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY
} catch {
  // Fallback to Node env variables (e.g., when running scripts)
  supabaseUrl = process.env.VITE_SUPABASE_URL || ''
  supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY || ''
}

if (!supabaseUrl || !supabaseAnonKey) {
  // variables de entorno no configuradas, modo local (solo localStorage)
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
  audit_logs: 'audit_logs',
  referrals: 'referrals',
  referral_commissions: 'referral_commissions',
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
  } catch {
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
  } catch {
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
  } catch {
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
  } catch {
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
    // Eliminar password y campos de control local en el sync.
    // Con Supabase Auth, la contraseña se maneja de forma segura por Supabase.
    const { password, created_date, updated_at, live_started_at, messages, user_read_at, admin_read_at, ...clean } = r
    // sizes y selected_size SÍ existen en Supabase, se conservan
    return clean
  })
}

/**
 * Sincronizar datos locales hacia Supabase
 * Envía los datos de una tabla completa
 * @param {string} tableName - Nombre de la tabla
 * @param {Array} records - Registros a sincronizar
 * @param {string} conflictColumn - Columna para resolver conflictos (default: 'id')
 */export async function syncTableToSupabase(tableName, records, conflictColumn = 'id') {
  if (!supabase || !records) return false
  const cleanedRecords = stripLocalFields(records)
  try {
    const { error } = await supabase
      .from(tableName)
      .upsert(cleanedRecords, { onConflict: conflictColumn })
    if (error) throw error
    return true
  } catch (err) {
    // Log error para visibilidad (antes se fallaba silenciosamente)
    console.warn(`[Supabase] syncTableToSupabase(${tableName}) error:`, err?.code || err?.message || err)

    // Si falla por violación de foreign key (prize_id no existe), omite el batch
    if (err.code === '23503') {
      return false
    }
    // Si falla por unique constraint (ej: email duplicado en users),
    // intentar uno por uno cambiando la columna de conflicto
    if (err.code === '23505' || err.status === 409) {
      const results = await Promise.all(cleanedRecords.map(async (record) => {
        try {
          const { error: indError } = await supabase
            .from(tableName)
            .upsert(record, { onConflict: 'email' })
          return !indError ? 1 : 0
        } catch { return 0 }
      }))
      let successCount = results.reduce((sum, v) => sum + v, 0)
      if (successCount === 0 && records.length > 0) {
        try {
          const { data: existing } = await supabase
            .from(tableName).select('id, email')
          const existingEmails = new Set((existing || []).map(r => r.email))
          const fallbackResults = await Promise.all(cleanedRecords.map(async (record) => {
            if (!existingEmails.has(record.email)) {
              try {
                const { error: indError } = await supabase
                  .from(tableName)
                  .upsert(record, { onConflict: 'id' })
                return !indError ? 1 : 0
              } catch { return 0 }
            }
            return 0
          }))
          successCount = fallbackResults.reduce((sum, v) => sum + v, 0)
        } catch {}
      }
      return successCount > 0
    }
    // Fallback: si no existe la constraint UNIQUE para la columna de conflicto
    if (conflictColumn !== 'id' && (err.code === '42P10' || err.message?.includes('ON CONFLICT'))) {
      return await syncTableToSupabase(tableName, records, 'id')
    }
    return false
  }
}

/**
 * Sincronizar datos de Supabase hacia local
 * Maneja: nuevos registros remotos, actualizaciones a existentes.
 * RETORNA SIEMPRE UN NUEVO ARRAY si hubo cambios (no muta localRecords).
 */
export async function syncTableFromSupabase(tableName, localRecords = [], options = {}) {
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
          if (ADMIN_TABLES.has(tableName)) {
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
          // Si el setting no está en la nube y fue creado hace más de 5 minutos,
          // se asume que fue eliminado en la nube y lo removemos localmente.
          if (local.created_date && (Date.now() - new Date(local.created_date).getTime() < 30 * 1000)) {
            result.push(local)
          } else {
            changed = true
          }
        }
      }
    } else {
      const remoteIds = new Set(remoteData.map(r => r.id))
      // Tablas donde la nube manda incluso para limpieza de registros huérfanos.
      // (Consistente con ADMIN_TABLES arriba.)
      // Cuando hay un "clean" activo, TODAS las tablas limpiadas se vuelven
      // cloud-authoritative: si el remoto no las tiene, no se preservan
      // locales (evita que reaparezcan en otros dispositivos tras un clean).
      const cleanAffectedTables = [
        'predictions', 'support_tickets', 'redemptions', 'users',
        'points_bonuses', 'referrals', 'referral_commissions',
      ]
      const cloudAuthoritativeTables = cleanAffectedTables

      // Si hay lastCleanAt activo y es una tabla cloudAuthoritative,
      // la nube es la autoridad: NO preservar registros locales ausentes.
      // Esto garantiza que las limpiezas se propaguen entre dispositivos.
      const isCleanActive = options.lastCleanAt && cloudAuthoritativeTables.includes(tableName)

      for (const local of localRecords) {
        if (!remoteIds.has(local.id)) {
          if (isCleanActive) {
            // Limpieza activa — descartar todos los registros ausentes en remoto
            changed = true
          } else if (local.created_date && (Date.now() - new Date(local.created_date).getTime() < 30 * 1000)) {
            // Registro recien creado localmente (menos de 30s) — preservar para permitir sync offline inicial
            result.push(local)
          } else {
            // La nube es la autoridad. Si el registro no está en la nube y es antiguo,
            // significa que fue eliminado. NO lo preservamos, permitiendo que se elimine
            // localmente para todas las tablas (premios, predicciones, partidos, etc.).
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

        result.length = 0
        result.push(...deduped)
      }
    }

    // Deduplicar partidos por fixture_id (evita duplicados por seed múltiple o sync entre dispositivos)
    if (changed && tableName === 'matches') {
      const fixtureMap = new Map()
      for (const rec of result) {
        const fKey = rec.fixture_id != null ? String(rec.fixture_id) : null
        if (fKey == null) {
          // Sin fixture_id: deduplicar por team1+team2+match_date
          const combo = `${rec.team1 || ''}|${rec.team2 || ''}|${rec.match_date || ''}`
          const existing = fixtureMap.get(combo)
          if (!existing) {
            fixtureMap.set(combo, rec)
          } else {
            // Preferir el que tenga más datos (más campos llenos)
            if (Object.keys(rec).length > Object.keys(existing).length) {
              fixtureMap.set(combo, rec)
            }
          }
        } else {
          const existing = fixtureMap.get(fKey)
          if (!existing) {
            fixtureMap.set(fKey, rec)
          } else {
            // Preferir el que tenga más datos
            if (Object.keys(rec).length > Object.keys(existing).length) {
              fixtureMap.set(fKey, rec)
            }
          }
        }
      }
      const deduped = Array.from(fixtureMap.values())
      if (deduped.length !== result.length) {
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

        result.length = 0
        result.push(...deduped)
      }
    }

    if (changed) return result
    return localRecords
  } catch {
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
    // Usar el contentType real del blob si está disponible, o inferir desde la extensión
    const ext = originalFileName.split('.').pop()?.toLowerCase() || 'jpg';
    const mimeMap = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp' };
    const contentType = blob.type || mimeMap[ext] || 'image/jpeg';
    // Normalizar extensión al tipo MIME real para evitar discrepancias (ej: .png pero image/jpeg)
    const extMap = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/gif': 'gif', 'image/webp': 'webp' };
    const finalExt = extMap[contentType] || ext;
    const fileName = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${finalExt}`;
    const filePath = `${fileName}`

    const { data, error } = await supabase.storage
      .from(bucket)
      .upload(filePath, blob, {
        cacheControl: '3600',
        upsert: false,
        contentType,
      })

    if (error) throw error

    const { data: { publicUrl } } = supabase.storage
      .from(bucket)
      .getPublicUrl(filePath)

    return publicUrl
  } catch {
    return null
  }
}

/**
 * Listar imágenes disponibles en un bucket de Supabase Storage.
 * Retorna un array de { name, publicUrl, created_at }.
 */
export async function listImages(bucket = 'banners') {
  if (!supabase) return []
  try {
    const { data, error } = await supabase.storage.from(bucket).list();
    if (error) throw error
    if (!data || data.length === 0) return []

    return data
      .filter(f => f.id && !f.name.startsWith('.')) // filtrar carpetas y archivos ocultos
      .map(f => {
        const { data: { publicUrl } } = supabase.storage
          .from(bucket)
          .getPublicUrl(f.name)
        return {
          name: f.name,
          publicUrl,
          created_at: f.created_at,
          id: f.id,
          metadata: f.metadata,
        }
      })
      .sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0)) // más recientes primero
  } catch {
    return []
  }
}

/**
 * ─────────────────────────────────────────────────────────────────
 * SUPABASE REALTIME SUBSCRIPTIONS
 * ─────────────────────────────────────────────────────────────────
 * Escucha cambios (INSERT / UPDATE / DELETE) en tablas de Supabase
 * y dispara eventos personalizados para que db.js los procese.
 *
 * Requisito: las tablas deben tener Realtime habilitado.
 *   → Ejecutar supabase-enable-realtime.sql en el SQL Editor.
 *
 * Uso:
 *   setupRealtimeSubscriptions()  // llama una vez al iniciar la app
 *   cleanupRealtimeSubscriptions() // llama al cerrar sesión / desmontar
 */

let _realtimeChannels = [];

/**
 * Configura suscripciones Realtime para todas las tablas.
 * Cuando se detecta un cambio, dispara el evento 'db-cloud-change'
 * con detalle { tableName, eventType }.
 */
export function setupRealtimeSubscriptions() {
  if (!supabase) return;

  // Limpiar suscripciones previas por si se llama dos veces
  cleanupRealtimeSubscriptions();

  const TABLES_TO_WATCH = [
    'users', 'matches', 'predictions', 'prizes', 'redemptions',
    'support_tickets', 'points_bonuses', 'app_settings',
    'audit_logs', 'referrals', 'referral_commissions',
  ];

  // Usamos varios canales para evitar límites de eventos por canal
  const CHANNELS = [
    supabase.channel('cloud-changes-1'),
    supabase.channel('cloud-changes-2'),
  ];

  // Repartir las tablas entre los canales
  TABLES_TO_WATCH.forEach((table, i) => {
    const channel = CHANNELS[i % CHANNELS.length];
    channel.on(
      'postgres_changes',
      { event: '*', schema: 'public', table },
      (payload) => {
        // Disparar evento para que db.js lo capture
        window.dispatchEvent(new CustomEvent('db-cloud-change', {
          detail: {
            tableName: table,
            eventType: payload.event_type, // INSERT | UPDATE | DELETE
            newRecord: payload.new,
            oldRecord: payload.old,
          },
        }));
      }
    );
  });

  // Suscribir ambos canales
  for (const channel of CHANNELS) {
    channel.subscribe();
    _realtimeChannels.push(channel);
  }
}

/**
 * Limpia todas las suscripciones Realtime.
 */
export function cleanupRealtimeSubscriptions() {
  if (supabase) {
    for (const ch of _realtimeChannels) {
      supabase.removeChannel(ch);
    }
  }
  _realtimeChannels = [];
}
