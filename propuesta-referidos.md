# 🏆 Propuesta: Sistema de Referidos Multinivel
## ChessKing — Mundial de Kings 2026

---

## 1. Resumen Ejecutivo

Implementar un sistema de referidos multinivel donde los usuarios puedan invitar a otros a través de un código único y ganar puntos por cada acierto de las personas en su red de referidos, con recompensas que disminuyen por nivel.

---

## 2. Arquitectura General

```
Usuario A (tu código: CHESS-A1B2)
   │
   ├── Nivel 1 → Usuario B (invitado directo de A)
   │                │
   │                └── Nivel 2 → Usuario C (invitado de B)
   │                                 │
   │                                 └── Nivel 3 → Usuario D (invitado de C)
   │                                                │
   │                                                └── Nivel 4 → ...
   │
   └── Cuando cualquier persona en tu red acierta un
       pronóstico, TÚ ganas puntos según el nivel
```

---

## 3. Modelo de Datos

### 3.1 Tabla `users` — Columnas nuevas

| Columna | Tipo | Descripción |
|---|---|---|
| `referral_code` | `TEXT UNIQUE` | Código único del usuario para compartir |
| `referred_by` | `TEXT` | Código de referido de quien lo invitó |
| `referral_points` | `INTEGER DEFAULT 0` | Puntos acumulados solo por referidos |

### 3.2 Nueva tabla: `referrals`

```sql
CREATE TABLE IF NOT EXISTS referrals (
  id TEXT PRIMARY KEY,
  referrer_code TEXT NOT NULL,           -- Código de quien invitó
  referrer_email TEXT NOT NULL,          -- Email de quien invitó
  referred_email TEXT NOT NULL,          -- Email de quien se registró
  level INTEGER DEFAULT 1,              -- Nivel en la red (1 = directo)
  status TEXT DEFAULT 'active',          -- active / inactive
  created_date TIMESTAMPTZ DEFAULT NOW()
);
```

### 3.3 Nueva tabla: `referral_commissions`

```sql
CREATE TABLE IF NOT EXISTS referral_commissions (
  id TEXT PRIMARY KEY,
  from_email TEXT NOT NULL,              -- Quién acertó el pronóstico
  to_email TEXT NOT NULL,                -- Quién recibe la comisión
  match_id TEXT,                         -- Partido en el que se acertó
  level INTEGER NOT NULL,                -- Nivel de la relación
  points_earned INTEGER DEFAULT 0,       -- Puntos otorgados
  created_date TIMESTAMPTZ DEFAULT NOW()
);
```

---

## 4. Estructura de Recompensas por Nivel

### 4.1 Puntos por acierto de pronóstico

Cuando un usuario acierta un pronóstico (100 pts para él), su red también gana:

| Nivel en tu red | Relación | Puntos por acierto |
|---|---|---|
| **Nivel 1** | Invitados directos | **20 pts** |
| **Nivel 2** | Invitados de tus invitados | **10 pts** |
| **Nivel 3** | Siguiente nivel | **5 pts** |
| **Nivel 4+** | Niveles superiores | **2 pts** |

### 4.2 Ejemplo práctico

```
Tú invitas a Ana (Nivel 1)
Ana invita a Carlos (Nivel 2 → tuyo)
Carlos invita a María (Nivel 3 → tuyo)

María acierta un pronóstico:
  → María gana 100 pts
  → Carlos (Nivel 1 de María) gana 20 pts
  → Ana (Nivel 2 → tuyo) gana 10 pts
  → TÚ (Nivel 3 → tuyo) ganas 5 pts

Carlos acierta un pronóstico:
  → Carlos gana 100 pts
  → Ana (Nivel 1 de Carlos) gana 20 pts
  → TÚ (Nivel 2 → tuyo) ganas 10 pts
```

### 4.3 Fórmula de puntos totales

```
total_points = prediction_points + bonus_points + referral_points
```

Donde:
- `prediction_points`: Puntos por pronósticos acertados (100 pts c/u)
- `bonus_points`: Puntos otorgados por admin
- `referral_points`: Puntos acumulados por comisiones de la red

---

## 5. Flujo Completo del Usuario

### 5.1 Registro con código de referido

```
1. Usuario A obtiene su código: CHESS-A1B2
2. Lo comparte: https://chessking.app/register?ref=CHESS-A1B2
3. Usuario B abre el link
4. El campo "Código de invitación" se pre-carga automáticamente
5. Usuario B se registra
6. El sistema:
   a. Genera código único para B
   b. Guarda referred_by = 'CHESS-A1B2' en B
   c. Busca a todos los referers en cadena (A, y quien invitó a A...)
   d. Crea registros en referrals para cada nivel
   e. Acredita bono de bienvenida a B (100 pts)
   f. Acredita comisión de referido a A (20 pts nivel 1)
```

### 5.2 Cuando alguien en tu red acierta

```
1. Se evalúa el pronóstico (lógica existente en evaluateMatchPredictions)
2. Se otorgan 100 pts al usuario que acertó
3. El sistema busca en la cadena de referidos:
   - ¿Quién invitó a este usuario? → +20 pts (Nivel 1)
   - ¿Quién invitó a ese? → +10 pts (Nivel 2)
   - ¿Quién invitó a ese? → +5 pts (Nivel 3)
   - Siguientes niveles → +2 pts c/u (máximo 5 niveles)
4. Se registra cada comisión en referral_commissions
```

### 5.3 Visualización para el usuario

En la sección "Mis Referidos" del perfil:

```
┌─────────────────────────────────────────┐
│  👥 MIS REFERIDOS                       │
│                                         │
│  🔗 Tu código: CHESS-A1B2               │
│  [Copiar] [Compartir]                   │
│                                         │
│  📊 Estadísticas                        │
│  Invitados directos:  12                │
│  Red total:           47                │
│  Puntos por referidos: 340              │
│                                         │
│  📋 Historial                          │
│  Usuario   | Nivel | Pts generados      │
│  ana@...   |   1   | 120 pts            │
│  carlos@.. |   2   |  50 pts            │
│  maria@... |   1   |  80 pts            │
└─────────────────────────────────────────┘
```

---

## 6. Componentes de UI Necesarios

| Componente | Archivo | Descripción |
|---|---|---|
| **Sección Mis Referidos** | `Profile.jsx` | Código, estadísticas, historial |
| **Campo código en registro** | `RegisterForm.jsx` | Input opcional + validación |
| **Badge de referido** | `Profile.jsx` | Indicador visual de red |
| **Columna en Admin** | `AdminUsers.jsx` | Mostrar código y referidos |

---

## 7. Cambios en el Código

| Archivo | Cambio |
|---|---|
| `supabase-schema.sql` | Nuevas columnas + tablas `referrals` y `referral_commissions` |
| `src/lib/db.js` | Nuevos métodos: `referrals.*`, `referralCommissions.*`, `generateReferralCode()`, `calculateReferralChain()` |
| `src/api/client.js` | Nuevos endpoints: `entities.Referral`, `entities.ReferralCommission` |
| `src/api/evaluateMatchPredictions.js` | Integrar lógica de comisiones cuando se evalúa un acierto |
| `src/pages/Register.jsx` | Leer `?ref=` de URL, guardar `referred_by`, crear cadena de referidos |
| `src/pages/register/RegisterForm.jsx` | Agregar campo "Código de invitación (opcional)" |
| `src/pages/Profile.jsx` | Nueva sección "Mis Referidos" |
| `src/pages/admin/AdminUsers.jsx` | Mostrar código de referido y red |

---

## 8. SQL para migración

```sql
-- ============================================================
-- MIGRACIÓN: SISTEMA DE REFERIDOS
-- ============================================================

-- 1. Nuevas columnas en users
ALTER TABLE users ADD COLUMN IF NOT EXISTS referral_code TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS referred_by TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS referral_points INTEGER DEFAULT 0;

-- Índice único para referral_code
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_referral_code ON users(referral_code);

-- 2. Tabla de referidos (relaciones)
CREATE TABLE IF NOT EXISTS referrals (
  id TEXT PRIMARY KEY,
  referrer_code TEXT NOT NULL,
  referrer_email TEXT NOT NULL,
  referred_email TEXT NOT NULL,
  level INTEGER DEFAULT 1,
  status TEXT DEFAULT 'active',
  created_date TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Tabla de comisiones pagadas
CREATE TABLE IF NOT EXISTS referral_commissions (
  id TEXT PRIMARY KEY,
  from_email TEXT NOT NULL,
  to_email TEXT NOT NULL,
  match_id TEXT,
  level INTEGER NOT NULL,
  points_earned INTEGER DEFAULT 0,
  created_date TIMESTAMPTZ DEFAULT NOW()
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_referrals_referrer ON referrals(referrer_email);
CREATE INDEX IF NOT EXISTS idx_referrals_referred ON referrals(referred_email);
CREATE INDEX IF NOT EXISTS idx_referral_commissions_to ON referral_commissions(to_email);
CREATE INDEX IF NOT EXISTS idx_referral_commissions_from ON referral_commissions(from_email);
```

---

## 9. Plan de Implementación

| Fase | Tareas | Esfuerzo |
|---|---|---|
| **1. Base de datos** | Migración SQL, nuevas tablas e índices | ⏱️ 1 día |
| **2. Lógica de negocio** | Generación de códigos, cálculo de cadena, comisiones | ⏱️ 2 días |
| **3. Registro** | Campo de código en formulario, validación, creación de red | ⏱️ 1 día |
| **4. Perfil** | Sección "Mis Referidos" con estadísticas | ⏱️ 2 días |
| **5. Evaluación** | Integrar comisiones en evaluateMatchPredictions | ⏱️ 1 día |
| **6. Admin** | Columna de referidos en panel admin | ⏱️ 1 día |
| **Total** | | **⏱️ 8 días** |

---

## 10. Consideraciones Técnicas

### Prevención de abusos
- **Máximo 5 niveles** de profundidad en la red
- Un usuario **no puede autoreferirse** (su propio código)
- Validación de **cédula única** (ya implementada) evita cuentas múltiples
- Límite de **100 niveles evaluados** por rendimiento

### Rendimiento
- La cadena de referidos se calcula UNA VEZ al registrarse y se guarda en `referrals`
- Al evaluar comisiones, solo se hace un SELECT por nivel (máximo 5 queries)
- Las comisiones se procesan en el mismo batch que `evaluateMatchPredictions`

### Visualización admin
- En `AdminUsers.jsx` se agrega columna con código de referido
- Enlace para ver la red completa de un usuario

---

## 11. Preguntas para Definir

- [ ] ¿**Máximo de niveles**? (propongo 5 niveles)
- [ ] ¿**Puntos fijos o porcentaje**? (propongo puntos fijos: 20-10-5-2-2)
- [ ] ¿**Bono adicional** al referido cuando se registra? (ej: +20 pts para el nuevo)
- [ ] ¿**Notificación** al usuario cuando alguien en su red acierta?

---

*Documento generado el 4 de junio de 2026*
