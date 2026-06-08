import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/api/client';
import { db } from '@/lib/db';
import { useOutletContext } from 'react-router-dom';
import { m, AnimatePresence } from 'framer-motion';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { MessageCircle, Plus, X, Send, ChevronDown, ChevronUp, CheckCheck, Clock, User, ShieldAlert } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { es } from 'date-fns/locale/es';

const statusLabel = { pending: 'Pendiente', answered: 'Respondido', closed: 'Cerrado' };
const statusColor = {
  pending: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300',
  answered: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300',
  closed: 'bg-muted text-muted-foreground',
};
const statusIcon = {
  pending: Clock,
  answered: CheckCheck,
  closed: CheckCheck,
};

function TicketMessages({ ticket }) {
  const messages = ticket.messages || [];
  const lastMsgRef = React.useRef(null);

  React.useEffect(() => {
    if (lastMsgRef.current) {
      lastMsgRef.current.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }
  }, [messages.length]);

  if (messages.length === 0) {
    return (
      <p className="text-xs text-muted-foreground text-center py-4 italic">
        Sin mensajes
      </p>
    );
  }

  return (
    <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
      {messages.map((msg, i) => {
        const isUser = msg.sender === 'user';
        const isLast = i === messages.length - 1;
        return (
          <div
            key={i}
            ref={isLast ? lastMsgRef : null}
            className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[85%] rounded-xl px-3.5 py-2 text-sm ${
                isUser
                  ? 'bg-primary text-primary-foreground rounded-br-md'
                  : 'bg-muted text-foreground rounded-bl-md border border-border/50'
              }`}
            >
              <div className="flex items-center gap-1.5 mb-0.5">
                {isUser ? (
                  <User className="w-3 h-3 opacity-70" />
                ) : (
                  <ShieldAlert className="w-3 h-3 opacity-70" />
                )}
                <span className="text-[10px] opacity-70 font-medium">
                  {isUser ? 'Tú' : 'Soporte'}
                </span>
              </div>
              <p className="whitespace-pre-wrap break-words">{msg.text}</p>
              <p className="text-[10px] opacity-60 mt-0.5 text-right">
                {format(new Date(msg.created_date), 'HH:mm', { locale: es })}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function TicketCard({ ticket, onSendMessage, sending }) {
  const [expanded, setExpanded] = useState(false);
  const [inputText, setInputText] = useState('');
  const { user } = useOutletContext();
  const qc = useQueryClient();
  const isClosed = ticket.status === 'closed';
  const StatusIcon = statusIcon[ticket.status] || Clock;

  // Marcar como leído al expandir
  React.useEffect(() => {
    if (expanded) {
      db.supportTickets.markRead(ticket.id, 'user');
      qc.invalidateQueries({ queryKey: ['my-tickets'] });
      qc.invalidateQueries({ queryKey: ['support-unread'] });
    }
  }, [expanded, ticket.id, qc]);

  const handleSend = () => {
    const text = inputText.trim();
    if (!text) return;
    onSendMessage(ticket.id, text);
    setInputText('');
  };

  // Verificar si hay mensajes nuevos no leídos (para badge visual)
  const messages = ticket.messages || [];
  const lastRead = new Date(ticket.user_read_at || 0).getTime();
  const hasUnread = messages.some(m => m.sender === 'admin' && new Date(m.created_date).getTime() > lastRead);

  return (
    <Card className={`border ${hasUnread && !expanded ? 'border-primary/40 ring-1 ring-primary/20' : ''}`}>
      <CardContent className="p-0">
        {/* Header - clickeable para expandir */}
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          className="w-full flex items-center justify-between p-4 text-left hover:bg-accent/30 transition"
        >
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <div className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${
              isClosed ? 'bg-muted' : ticket.status === 'answered' ? 'bg-emerald-100 dark:bg-emerald-900/30' : 'bg-yellow-100 dark:bg-yellow-900/30'
            }`}>
              <StatusIcon className={`w-4 h-4 ${
                isClosed ? 'text-muted-foreground' : ticket.status === 'answered' ? 'text-emerald-600 dark:text-emerald-400' : 'text-yellow-600 dark:text-yellow-400'
              }`} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <p className="font-semibold text-sm truncate">{ticket.subject}</p>
                {hasUnread && !expanded && (
                  <span className="w-2 h-2 rounded-full bg-primary animate-pulse shrink-0" />
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                {ticket.user_name || ticket.user_email} · {format(new Date(ticket.created_date), "d MMM", { locale: es })}
              </p>
            </div>
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium shrink-0 flex items-center gap-1 ${statusColor[ticket.status]}`}>
              <StatusIcon className="w-3 h-3" />
              {statusLabel[ticket.status]}
            </span>
          </div>
          {expanded ? <ChevronUp className="w-4 h-4 text-muted-foreground ml-2 shrink-0" /> : <ChevronDown className="w-4 h-4 text-muted-foreground ml-2 shrink-0" />}
        </button>

        {/* Expanded chat */}
        <AnimatePresence>
          {expanded && (
            <m.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden"
            >
              <div className="px-4 pb-4 space-y-3 border-t border-border/50 pt-3">
                {/* Messages */}
                <TicketMessages ticket={ticket} />

                {/* Input area - solo si no está cerrado */}
                {!isClosed ? (
                  <div className="flex items-center gap-2 pt-1">
                    <Input
                      value={inputText}
                      onChange={(e) => setInputText(e.target.value)}
                      placeholder="Escribe tu mensaje..."
                      className="flex-1 text-sm"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault();
                          handleSend();
                        }
                      }}
                    />
                    <Button
                      size="sm"
                      onClick={handleSend}
                      disabled={!inputText.trim() || sending}
                      className="shrink-0 gap-1"
                    >
                      <Send className="w-3.5 h-3.5" />
                      <span className="hidden sm:inline">Enviar</span>
                    </Button>
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground text-center pt-1 italic">
                    Este ticket está cerrado. Si necesitas ayuda adicional, crea un nuevo ticket.
                  </p>
                )}
              </div>
            </m.div>
          )}
        </AnimatePresence>
      </CardContent>
    </Card>
  );
}

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
    refetchInterval: 30000,
  });

  const { data: unreadCount = 0 } = useQuery({
    queryKey: ['support-unread', user?.email],
    queryFn: () => db.supportTickets.unreadCount(user?.email || ''),
    enabled: !!user,
    refetchInterval: 15000,
  });

  const createMutation = useMutation({
    mutationFn: (data) => api.entities.SupportTicket.create(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['my-tickets'] });
      qc.invalidateQueries({ queryKey: ['support-unread'] });
      setShowForm(false);
      setSubject('');
      setMessage('');
      toast.success('Ticket enviado correctamente');
    },
  });

  const sendMessageMutation = useMutation({
    mutationFn: ({ id, text }) => {
      db.supportTickets.addMessage(id, 'user', text);
      return { id, text };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['my-tickets'] });
    },
    onError: (err) => {
      toast.error('Error al enviar mensaje: ' + (err?.message || err));
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

  const handleSendMessage = (ticketId, text) => {
    sendMessageMutation.mutate({ id: ticketId, text });
  };

  if (!user) {
    return (
      <div className="text-center py-12 space-y-3">
        <p className="text-muted-foreground">Debes iniciar sesión para acceder al soporte.</p>
        <Button onClick={() => api.auth.redirectToLogin(window.location.href)}>Ingresar</Button>
      </div>
    );
  }

  const pendingCount = tickets.filter(t => t.status !== 'closed').length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-4xl tracking-wide">SOPORTE</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {tickets.length} ticket{tickets.length !== 1 ? 's' : ''}
            {pendingCount > 0 && <span className="ml-1">· {pendingCount} activo{pendingCount !== 1 ? 's' : ''}</span>}
            {unreadCount > 0 && (
              <span className="ml-2 text-primary font-semibold">
                · {unreadCount} nuevo{unreadCount !== 1 ? 's' : ''}
              </span>
            )}
          </p>
        </div>
        <Button onClick={() => setShowForm(!showForm)} size="sm" className="gap-1.5" variant={showForm ? 'outline' : 'default'}>
          {showForm ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
          {showForm ? 'Cancelar' : 'Nuevo ticket'}
        </Button>
      </div>

      {/* Formulario nuevo ticket */}
      <AnimatePresence>
        {showForm && (
          <m.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
          >
            <Card>
              <CardContent className="p-4">
                <form onSubmit={handleSubmit} className="space-y-3">
                  <div>
                    <label htmlFor="support-subject" className="text-sm font-medium mb-1 block">Asunto</label>
                    <Input
                      id="support-subject"
                      value={subject}
                      onChange={e => setSubject(e.target.value)}
                      placeholder="¿Sobre qué trata tu consulta?"
                      required
                    />
                  </div>
                  <div>
                    <label htmlFor="support-message" className="text-sm font-medium mb-1 block">Mensaje</label>
                    <textarea
                      id="support-message"
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
          </m.div>
        )}
      </AnimatePresence>

      {/* Lista de tickets */}
      {isLoading ? (
        <p className="text-muted-foreground text-sm">Cargando tickets...</p>
      ) : tickets.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">
            <MessageCircle className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p>No tienes tickets aún.</p>
            <p className="text-xs mt-1">Presiona "Nuevo ticket" para crear una consulta.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {tickets.map(ticket => (
            <TicketCard
              key={ticket.id}
              ticket={ticket}
              onSendMessage={handleSendMessage}
              sending={sendMessageMutation.isPending}
            />
          ))}
        </div>
      )}
    </div>
  );
}
