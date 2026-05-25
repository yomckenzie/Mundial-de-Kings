import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/api/client';
import { useOutletContext } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { MessageCircle, Plus, X } from 'lucide-react';
import { toast } from 'sonner';

const statusLabel = { pending: 'Pendiente', answered: 'Respondido', closed: 'Cerrado' };
const statusColor = { pending: 'bg-yellow-100 text-yellow-800', answered: 'bg-green-100 text-green-800', closed: 'bg-gray-100 text-gray-600' };

export default function Support() {
  const { user } = useOutletContext();
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');

  const { data: tickets = [], isLoading } = useQuery({
    queryKey: ['my-tickets', user?.email],
    queryFn: () => api.entities.SupportTicket.filter({ user_email: user?.email }, '-created_date'),
    enabled: !!user,
  });

  const createMutation = useMutation({
    mutationFn: (data) => api.entities.SupportTicket.create(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['my-tickets'] });
      setShowForm(false);
      setSubject('');
      setMessage('');
      toast.success('Ticket enviado correctamente');
    },
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!subject.trim() || !message.trim()) return;
    createMutation.mutate({
      user_email: user.email,
      user_name: user.full_name || user.email,
      subject: subject.trim(),
      message: message.trim(),
    });
  };

  if (!user) {
    return (
      <div className="text-center py-12 space-y-3">
        <p className="text-muted-foreground">Debes iniciar sesión para acceder al soporte.</p>
        <Button onClick={() => api.auth.redirectToLogin(window.location.href)}>Ingresar</Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-4xl tracking-wide">SOPORTE</h1>
        <Button onClick={() => setShowForm(!showForm)} size="sm" className="gap-1.5">
          {showForm ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
          {showForm ? 'Cancelar' : 'Nuevo ticket'}
        </Button>
      </div>

      {showForm && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Crear ticket de soporte</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-3">
              <div>
                <label className="text-sm font-medium mb-1 block">Asunto</label>
                <Input
                  value={subject}
                  onChange={e => setSubject(e.target.value)}
                  placeholder="¿Sobre qué trata tu consulta?"
                  required
                />
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">Mensaje</label>
                <textarea
                  value={message}
                  onChange={e => setMessage(e.target.value)}
                  placeholder="Describe tu consulta con detalle..."
                  required
                  rows={4}
                  className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-none"
                />
              </div>
              <Button type="submit" disabled={createMutation.isPending}>
                {createMutation.isPending ? 'Enviando...' : 'Enviar ticket'}
              </Button>
            </form>
          </CardContent>
        </Card>
      )}

      {isLoading ? (
        <p className="text-muted-foreground text-sm">Cargando tickets...</p>
      ) : tickets.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">
            <MessageCircle className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p>No tienes tickets aún. ¡Crea uno si tienes alguna consulta!</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {tickets.map(t => (
            <Card key={t.id}>
              <CardContent className="p-4 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <p className="font-semibold text-sm">{t.subject}</p>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium shrink-0 ${statusColor[t.status]}`}>
                    {statusLabel[t.status]}
                  </span>
                </div>
                <p className="text-sm text-muted-foreground">{t.message}</p>
                {t.admin_reply && (
                  <div className="bg-muted rounded-lg p-3 mt-2">
                    <p className="text-xs font-semibold text-primary mb-1">Respuesta del equipo:</p>
                    <p className="text-sm">{t.admin_reply}</p>
                  </div>
                )}
                <p className="text-xs text-muted-foreground">{new Date(t.created_date).toLocaleDateString('es-PA')}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}