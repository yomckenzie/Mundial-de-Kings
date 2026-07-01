/**
 * Regression para el bug "cambio de Instagram no se actualiza en BD".
 *
 * Síntoma: tras editar @instagram, el toast decía "actualizado" pero al
 * refrescar, la BD tenía el valor viejo.
 *
 * Causa raíz en dos capas:
 *   (1) handleSaveSocial no hacía await ni try/catch del db.users.update
 *       (async), por lo que un fallo del upsert a Supabase se convertía
 *       en unhandled rejection y la UI mostraba un éxito falso.
 *   (2) db.users.update subía TODA la tabla _data.users vía db._persist,
 *       no solo la fila editada. El batch incluía filas huérfanas
 *       (public.users sin auth.users) que la RLS rechaza — el upsert
 *       entero fallaba aunque la fila del usuario fuese suya.
 *
 * Fix en dos capas:
 *   (1) Hook useSocialEdit con try/await/rollback (este test).
 *   (2) db.users.update ahora llama _upsertToCloud('users', [row]) con
 *       una sola fila, evitando que filas ajenas rompan el batch.
 *
 * Mock de Supabase usa `upsert([singleRow], { onConflict })` — el camino
 * real sigue siendo un upsert, solo que con un array de 1 elemento.
 *
 * Verifica:
 *   1) Si Supabase rechaza el upsert → fila local REVIERTE al valor
 *      previo (rollback), `setUser` se invoca con el valor viejo.
 *   2) Si Supabase acepta → fila local queda con el valor nuevo.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

const upsertMock = vi.fn();
const setUserSpy = vi.fn();

vi.mock('@/lib/supabase.js', () => ({
  supabase: {
    from: () => ({ upsert: upsertMock }),
  },
  isSupabaseAvailable: () => true,
  fetchAll: vi.fn(async () => []),
  syncTableToSupabase: vi.fn(),
  syncTableFromSupabase: vi.fn(),
  stripLocalFields: (records) => records,
  TABLES: { users: 'users' },
  setupRealtimeSubscriptions: vi.fn(),
  cleanupRealtimeSubscriptions: vi.fn(),
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

const { db } = await import('@/lib/db');
const { useSocialEdit } = await import('./useSocialEdit');

const FIXTURE_USER = {
  id: 'u1',
  email: 'ana@x.com',
  full_name: 'Ana',
  instagram: 'old_ig',
  tiktok: 'old_tt',
};

function seedLocalUser() {
  db._init({ force: true });
  db._data.users.push({ ...FIXTURE_USER });
  db._data.currentUserEmail = FIXTURE_USER.email;
}

beforeEach(() => {
  upsertMock.mockReset();
  setUserSpy.mockReset();
  seedLocalUser();
});

describe('useSocialEdit — cambio de Instagram', () => {
  it('rollback si Supabase rechaza el upsert', async () => {
    upsertMock.mockResolvedValue({
      error: { message: 'new row violates row-level security policy' },
    });

    // Sembrar DB.in-memory para que el catch del hook pueda hacer rollback
    // y luego invocar setUser con el valor viejo.
    seedLocalUser();
    const user = db._init().users[0];

    const { result } = renderHook(() => useSocialEdit(user, setUserSpy));

    act(() => result.current.startEdit('instagram'));
    act(() => result.current.change('new_ig'));

    let saveOk = true;
    await act(async () => {
      saveOk = await result.current.save('instagram');
    });

    expect(saveOk).toBe(false);
    // Cache local debe haber vuelto al IG viejo.
    const local = db._init().users.find((u) => u.id === FIXTURE_USER.id);
    expect(local.instagram).toBe('old_ig');
    // setUser invocado con el IG rollback.
    expect(setUserSpy).toHaveBeenCalled();
    const lastRollbackArg = setUserSpy.mock.calls.at(-1)[0];
    expect(lastRollbackArg.instagram).toBe('old_ig');
  });

  it('persiste el valor nuevo si Supabase acepta', async () => {
    upsertMock.mockResolvedValue({ error: null });

    seedLocalUser();
    const user = db._init().users[0];

    const { result } = renderHook(() => useSocialEdit(user, setUserSpy));

    act(() => result.current.startEdit('instagram'));
    act(() => result.current.change('brand_new'));

    let saveOk = false;
    await act(async () => {
      saveOk = await result.current.save('instagram');
    });

    expect(saveOk).toBe(true);
    const local = db._init().users.find((u) => u.id === FIXTURE_USER.id);
    expect(local.instagram).toBe('brand_new');
    expect(setUserSpy).toHaveBeenCalled();
    const lastArg = setUserSpy.mock.calls.at(-1)[0];
    expect(lastArg.instagram).toBe('brand_new');
  });
});
