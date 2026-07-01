import { useCallback, useState } from 'react';
import { toast } from 'sonner';
import { db } from '@/lib/db';

/**
 * Edición inline de campos sociales (`instagram`, `tiktok`) en Mi Perfil.
 *
 * Encapsula el ciclo "validar → guardar en cache + persistir a Supabase →
 * rollback si falla". Se extrae de Profile.jsx para poder testearse sin
 * montar React.
 *
 * @param {object} user          Usuario actual (de auth context).
 * @param {function} setUser     Setter para refrescar el usuario en el árbol.
 * @returns {{ editingField, editValue, startEdit, change, cancel, save }}
 */
export function useSocialEdit(user, setUser) {
  const [editingField, setEditingField] = useState(null);
  const [editValue, setEditValue] = useState('');

  const startEdit = useCallback((field, prefill = '') => {
    setEditingField(field);
    setEditValue(prefill);
  }, []);

  const change = useCallback((value) => {
    setEditValue(value);
  }, []);

  const cancel = useCallback(() => {
    setEditingField(null);
    setEditValue('');
  }, []);

  /**
   * @param {string} field `instagram` | `tiktok`
   * @returns {Promise<boolean>} `true` si se guardó, `false` si falló.
   */
  const save = useCallback(async (field) => {
    const clean = editValue.replace('@', '').trim();
    if (!clean) {
      toast.error('El campo no puede estar vacío');
      return false;
    }
    if (clean.toLowerCase() === (user[field] || '').toLowerCase()) {
      setEditingField(null);
      setEditValue('');
      return true; // no-op intencional
    }
    const duplicate = db._init().users.find(
      (u) => u.id !== user.id && u[field] && u[field].toLowerCase() === clean.toLowerCase()
    );
    if (duplicate) {
      toast.error(
        `Este usuario de ${field === 'instagram' ? 'Instagram' : 'TikTok'} ya está registrado por otra cuenta`
      );
      return false;
    }

    // Capturar valor previo para rollback si el upsert a Supabase falla.
    const previousValue = user[field] || '';
    try {
      await db.users.update(user.id, { [field]: clean });
      const updated = db.getCurrentUser();
      if (updated) setUser(updated);
      setEditingField(null);
      setEditValue('');
      toast.success(`@${clean} actualizado`);
      return true;
    } catch (err) {
      // Rollback manual: revertir la fila local al valor anterior para que
      // la UI no muestre un cambio que la BD no aceptó.
      const list = db._init().users;
      const idx = list.findIndex((u) => u.id === user.id);
      if (idx !== -1) {
        list[idx] = { ...list[idx], [field]: previousValue };
        const fresh = db.getCurrentUser();
        if (fresh) setUser(fresh);
      }
      toast.error(
        `No se pudo guardar el cambio. ${err?.message || 'Error de conexión con el servidor.'}`
      );
      return false;
    }
  }, [editValue, user, setUser]);

  return { editingField, editValue, startEdit, change, cancel, save };
}
