import { Card, CardContent } from '@/components/ui/card';
import { User, Pencil, Check, XCircle } from 'lucide-react';

function InfoRow({ label, value, children }) {
  return (
    <div className="flex items-center justify-between py-1.5">
      <span className="text-sm text-muted-foreground">{label}{children}</span>
      <span className="text-sm font-medium text-right">{value || '—'}</span>
    </div>
  );
}

function EditableSocialRow({ label, value, editingField, field, editValue, onStartEdit, onChange, onSave, onCancel }) {
  const isEditing = editingField === field;
  return (
    <div className="flex items-center justify-between py-1.5 gap-2">
      <span className="text-sm text-muted-foreground shrink-0">{label}</span>
      {isEditing ? (
        <div className="flex items-center gap-1 flex-1 justify-end">
          <div className="relative flex-1 max-w-[180px]">
            <span className="absolute left-2 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">@</span>
            <input
              type="text"
              value={editValue}
              onChange={(e) => onChange(e.target.value.replace('@', ''))}
              onKeyDown={(e) => { if (e.key === 'Enter') onSave(); if (e.key === 'Escape') onCancel(); }}
              className="w-full pl-6 pr-2 py-1 text-sm rounded-md border border-input bg-background focus:outline-none focus:ring-1 focus:ring-ring"
              placeholder="usuario"
              aria-label={label}
            />
          </div>
          <button type="button" onClick={onSave} className="p-1 rounded hover:bg-muted transition" title="Guardar" aria-label="Guardar">
            <Check className="w-4 h-4 text-emerald-500" />
          </button>
          <button type="button" onClick={onCancel} className="p-1 rounded hover:bg-muted transition" title="Cancelar" aria-label="Cancelar">
            <XCircle className="w-4 h-4 text-muted-foreground" />
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={onStartEdit}
          className="flex items-center gap-1.5 text-sm font-medium text-right hover:text-foreground/80 transition group"
          aria-label={`Editar ${label}`}
        >
          <span>{value || '—'}</span>
          <Pencil className="w-3 h-3 text-muted-foreground/40 group-hover:text-muted-foreground transition" />
        </button>
      )}
    </div>
  );
}

export default function PersonalData({ user, editingField, editValue, onStartEdit, onChange, onSave, onCancel }) {
  return (
    <>
      <div className="flex items-center gap-2 text-sm font-semibold text-muted-foreground mb-3">
        <User className="w-4 h-4" />
        Datos personales
      </div>
      <Card>
        <CardContent className="p-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1">
            <InfoRow label="Nombre completo" value={user?.full_name} />
            <InfoRow label="Correo electrónico" value={user?.email} />
            <InfoRow label="Cédula" value={user?.cedula} />
            <EditableSocialRow
              label="Instagram"
              value={user?.instagram ? `@${user.instagram}` : null}
              field="instagram"
              editingField={editingField}
              editValue={editValue}
              onStartEdit={() => { onStartEdit('instagram'); }}
              onChange={(v) => onChange(v)}
              onSave={() => onSave('instagram')}
              onCancel={() => onCancel()}
            />
            <EditableSocialRow
              label="TikTok"
              value={user?.tiktok ? `@${user.tiktok}` : null}
              field="tiktok"
              editingField={editingField}
              editValue={editValue}
              onStartEdit={() => { onStartEdit('tiktok'); }}
              onChange={(v) => onChange(v)}
              onSave={() => onSave('tiktok')}
              onCancel={() => onCancel()}
            />
            <InfoRow label="WhatsApp" value={user?.phone || user?.whatsapp} />
          </div>
        </CardContent>
      </Card>
    </>
  );
}
