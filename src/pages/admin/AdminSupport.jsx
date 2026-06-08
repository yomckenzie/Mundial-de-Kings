import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/api/client';
import { db } from '@/lib/db';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { MessageCircle, Send, CheckCheck, ChevronDown, ChevronUp, User, ShieldAlert, X } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { es } from 'date-fns/locale/es';
import { m, AnimatePresence } from 'framer-motion';

const statusLabel = { pending: 'Pendiente', answered: 'Respondido', closed: 'Cerrado' };
const statusColor = {
  pending: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300',
  answered: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300',
  closed: 'bg-muted text-muted-foreground',
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
    return <p className="text-xs text-muted-foreground text-center py-4 italic">Sin mensajes</p>;
  }

  return (
    <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
      {messages.map((msg, i) => {
        const isUser = msg.sender === 'user';
        const isLast = i === messages.length - 1;
        return (
          <div key={msg.created_date || i} ref={isLast ? lastMsgRef : null} className={`flex ${isUser ? 'justify-start' : 'justify-end'}`}>
            <div className={`max-w-[85%] rounded-xl px-3.5 py-2 text-sm ${
              isUser
                ? 'bg-muted text-foreground rounded-bl-md border border-border/50'
                : 'bg-primary text-primary-foreground rounded-br-md'
            }`}>
              <div className="flex items-center gap-1.5 mb-0.5">
                {isUser ? <User className="w-3 h-3 opacity-70" /> : <ShieldAlert className="w-3 h-3 opacity-70" />}
                <span className="text-[10px] opacity-70 font-medium">
                  {isUser ? (ticket.user_name || ticket.user_email) : 'Tú (Admin)'}
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

function TicketCard({ ticket, onSendMessage, onCloseTicket, sending }) {
  const [expanded, setExpanded] = useState(false);
  const [inputText, setInputText] = useState('');
  const [closing, setClosing] = useState(false);
  const qc = useQueryClient();
  const isClosed = ticket.status === 'closed';

  const handleToggleExpand = () => {
    const willExpand = !expanded;
    setExpanded(willExpand);
    if (willExpand) {
      db.supportTickets.markRead(ticket.id, 'admin');
      qc.invalidateQueries({ queryKey: ['admin-tickets'] });
      qc.invalidateQueries({ queryKey: ['admin-support-unread'] });
    }
  };

  const handleSend = () => {
    const text = inputText.trim();
    if (!text) return;
    onSendMessage(ticket.id, text);
    setInputText('');
  };

  const handleClose = async () => {
    if (closing) return;
    setClosing(true);
    try {
      await onCloseTicket(ticket.id);
    } finally {
      setClosing(false);
    }
  };

  const messages = ticket.messages || [];
  const lastRead = new Date(ticket.admin_read_at || 0).getTime();
  const hasUnread = messages.some(m => m.sender === 'user' && new Date(m.created_date).getTime() > lastRead);

  return (
    <Card className={`border ${hasUnread && !expanded ? 'border-primary/40 ring-1 ring-primary/20' : ''}`}>
      <CardContent className="p-0">
        {/* Header */}
        <button
          type="button"
          onClick={handleToggleExpand}
          className="w-full flex items-center justify-between p-4 text-left hover:bg-accent/30 transition"
        >
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <div className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${
              isClosed ? 'bg-muted' : ticket.status === 'answered' ? 'bg-emerald-100 dark:bg-emerald-900/30' : 'bg-yellow-100 dark:bg-yellow-900/30'
            }`}>
              <MessageCircle className={`w-4 h-4 ${
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
              <p className="text-xs text-muted-foreground mt-0.5 truncate">
                {ticket.user_name || ticket.user_email} · {format(new Date(ticket.created_date), "d MMM yyyy, HH:mm", { locale: es })}                </p>
            </div>
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium shrink-0 ${statusColor[ticket.status]}`}>
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
                {/* Info del usuario */}
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 bg-muted/30 rounded-lg px-3 py-2 text-xs text-muted-foreground">
                  <span>👤 {ticket.user_name || '—'}</span>
                  <span>📧 {ticket.user_email}</span>
                </div>

                {/* Messages */}
                <TicketMessages ticket={ticket} />

                {/* Input + Close actions */}
                {!isClosed ? (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <Input
                        value={inputText}
                        onChange={(e) => setInputText(e.target.value)}
                        placeholder="Escribe tu respuesta..."
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
                    <div className="flex justify-end">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={handleClose}
                        disabled={closing}
                        className="text-muted-foreground hover:text-destructive gap-1.5"
                      >
                        <X className="w-3.5 h-3.5" />
                        {closing ? 'Cerrando...' : 'Cerrar ticket'}
                      </Button>
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground text-center pt-1 italic">
                    Ticket cerrado — {ticket.messages?.length || 0} mensajes en total
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

export default function AdminSupport() {
  const qc = useQueryClient();
  const [filter, setFilter] = useState('pending');

  const { data: tickets = [], isLoading } = useQuery({
    queryKey: ['admin-tickets'],
    queryFn: () => api.entities.SupportTicket.list('-created_date'),
    refetchInterval: 30000,
  });

  const { data: unreadCount = 0 } = useQuery({
    queryKey: ['admin-support-unread'],
    queryFn: () => db.supportTickets.adminUnreadCount(),
    refetchInterval: 15000,
  });

  const sendMessageMutation = useMutation({
    mutationFn: ({ id, text }) => {
      db.supportTickets.addMessage(id, 'admin', text);
      return { id, text };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-tickets'] });
      toast.success('Respuesta enviada');
    },
    onError: (err) => {
      toast.error('Error al enviar: ' + (err?.message || err));
    },
  });

  const closeMutation = useMutation({
    mutationFn: (id) => api.entities.SupportTicket.update(id, { status: 'closed' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-tickets'] });
      qc.invalidateQueries({ queryKey: ['admin-support-unread'] });
      toast.success('Ticket cerrado');
    },
    onError: (err) => {
      toast.error('Error al cerrar: ' + (err?.message || err));
    },
  });

  const filtered = filter === 'all' ? tickets : tickets.filter(t => t.status === filter);
  const pendingCount = tickets.filter(t => t.status === 'pending').length;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-4xl tracking-wide">SOPORTE</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {tickets.length} ticket{tickets.length !== 1 ? 's' : ''}
            {pendingCount > 0 && <span className="ml-1">· {pendingCount} pendiente{pendingCount !== 1 ? 's' : ''}</span>}
            {unreadCount > 0 && (
              <span className="ml-2 text-primary font-semibold">
                · {unreadCount} no leído{unreadCount !== 1 ? 's' : ''}
              </span>
            )}
          </p>
        </div>
      </div>

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
            className={filter === f.key ? '' : ''}
          >
            {f.label}
          </Button>
        ))}
      </div>

      {/* List */}
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
        <div className="space-y-2">
          {filtered.map(ticket => (
            <TicketCard
              key={ticket.id}
              ticket={ticket}
              onSendMessage={(id, text) => sendMessageMutation.mutate({ id, text })}
              onCloseTicket={(id) => closeMutation.mutate(id)}
              sending={sendMessageMutation.isPending}
            />
          ))}
        </div>
      )}
    </div>
  );
}
