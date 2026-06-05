import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/api/client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { MessageCircle, CheckCheck } from 'lucide-react';
import { toast } from 'sonner';

const statusLabel = { pending: 'Pendiente', answered: 'Respondido', closed: 'Cerrado' };
const statusColor = { pending: 'bg-yellow-100 text-yellow-800', answered: 'bg-green-100 text-green-800', closed: 'bg-gray-100 text-gray-600' };

export default function AdminSupport() {
  const qc = useQueryClient();
  const [replyingId, setReplyingId] = useState(null);
  const [replyText, setReplyText] = useState('');
  const [filter, setFilter] = useState('pending');

  const { data: tickets = [], isLoading } = useQuery({
    queryKey: ['admin-tickets'],
    queryFn: () => api.entities.SupportTicket.list('-created_date'),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => api.entities.SupportTicket.update(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-tickets'] });
      setReplyingId(null);
      setReplyText('');
      toast.success('Ticket actualizado');
    },
  });

  const handleReply = (ticket) => {
    if (!replyText.trim()) return;
    updateMutation.mutate({ id: ticket.id, data: { admin_reply: replyText.trim(), status: 'answered' } });
  };

  const handleClose = (ticket) => {
    updateMutation.mutate({ id: ticket.id, data: { status: 'closed' } });
  };

  const filtered = filter === 'all' ? tickets : tickets.filter(t => t.status === filter);
  const pendingCount = tickets.filter(t => t.status === 'pending').length;

  return (
    <div className="space-y-4">
      {/* Filter tabs */}
      <div className="flex flex-wrap gap-2 items-center">
        {[
          { key: 'pending', label: `Pendientes${pendingCount > 0 ? ` (${pendingCount})` : ''}` },
          { key: 'answered', label: 'Respondidos' },
          { key: 'closed', label: 'Cerrados' },
          { key: 'all', label: 'Todos' },
        ].map(f => (
          <Button
            key={f.key}
            size="sm"
            variant={filter === f.key ? 'default' : 'outline'}
            onClick={() => setFilter(f.key)}
          >
            {f.label}
          </Button>
        ))}
      </div>

      {isLoading ? (
        <p className="text-muted-foreground text-sm">Cargando tickets...</p>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">
            <MessageCircle className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p>No hay tickets en esta categoría.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {filtered.map(t => (
            <Card key={t.id}>
              <CardContent className="p-4 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold text-sm">{t.subject}</p>
                    <p className="text-xs text-muted-foreground">{t.user_email} · {new Date(t.created_date).toLocaleDateString('es-PA')}</p>
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium shrink-0 ${statusColor[t.status]}`}>
                    {statusLabel[t.status]}
                  </span>
                </div>

                <p className="text-sm bg-muted rounded-lg p-3">{t.message}</p>

                {t.admin_reply && (
                  <div className="bg-primary/5 border border-primary/20 rounded-lg p-3">
                    <p className="text-xs font-semibold text-primary mb-1">Tu respuesta:</p>
                    <p className="text-sm">{t.admin_reply}</p>
                  </div>
                )}

                {replyingId === t.id ? (
                  <div className="space-y-2">
                    <label htmlFor={`reply-${t.id}`} className="sr-only">Respuesta al ticket</label>
                    <textarea
                      id={`reply-${t.id}`}
                      aria-label="Respuesta al ticket"
                      value={replyText}
                      onChange={e => setReplyText(e.target.value)}
                      placeholder="Escribe tu respuesta..."
                      rows={3}
                      className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-none"
                    />
                    <div className="flex gap-2">
                      <Button size="sm" onClick={() => handleReply(t)} disabled={updateMutation.isPending}>
                        Enviar respuesta
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => { setReplyingId(null); setReplyText(''); }}>
                        Cancelar
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    {t.status !== 'closed' && (
                      <>
                        <Button size="sm" variant="outline" onClick={() => { setReplyingId(t.id); setReplyText(t.admin_reply || ''); }}>
                          {t.admin_reply ? 'Editar respuesta' : 'Responder'}
                        </Button>
                        <Button size="sm" variant="ghost" className="text-muted-foreground" onClick={() => handleClose(t)}>
                          <CheckCheck className="w-4 h-4 mr-1" /> Cerrar
                        </Button>
                      </>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}