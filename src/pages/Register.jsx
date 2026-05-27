import React, { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { api } from '@/api/client';
import { db } from '@/lib/db';
import { supabase, isSupabaseAvailable } from '@/lib/supabase';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { UserPlus, ArrowLeft, Shield } from 'lucide-react';

const normalizeCedula = (v) => (v || '').replace(/[\s-]/g, '').trim().toLowerCase();

export default function Register() {
  const [searchParams] = useSearchParams();
  const redirect = searchParams.get('redirect') || '/';

  const [isLoading, setIsLoading] = useState(false);
  const [fieldErrors, setFieldErrors] = useState({});
  const [form, setForm] = useState({
    full_name: '',
    email: '',
    phone: '',
    cedula: '',
    instagram_user: '',
    tiktok_user: '',
    password: '',
  });

  const handleChange = (e) => {
    setForm(prev => ({ ...prev, [e.target.name]: e.target.value }));
    setFieldErrors(prev => ({ ...prev, [e.target.name]: '' }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const errors = {};

    if (!form.full_name) errors.full_name = 'Campo obligatorio';
    else if (form.full_name.trim().split(/\s+/).length < 2) errors.full_name = 'Debe incluir nombre y apellido';

if (!form.email) errors.email = 'Campo obligatorio';
    else {
      // Verificar email duplicado
      if (db._init().users.some(u => u.email === form.email)) {
        errors.email = 'Este correo ya está registrado';
      } else {
        const domain = form.email.split('@').pop()?.toLowerCase();
        const disposableDomains = ['mailinator.com','guerrillamail.com','temp-mail.org','10minutemail.com','yopmail.com','trashmail.com','throwaway.email','sharklasers.com','grr.la','mailnator.com','dispostable.com','maildrop.cc','getairmail.com','fakemailgenerator.com','tempmailadrese.com','sogetthis.com','trashmail.me','wegwerfmail.de','spamgourmet.com','mailexpire.com','spambox.us','nowmymail.com','spambox.info','spam4.me','emailondeck.com','inboxbear.com','sneakemail.com','thisisnotmyrealemail.com','xagloo.com','combroteam.com','inboxes.com','receivemail.org','receivesmsonline.com','freesmscode.com','z8z.org','0clickemail.com','33mail.com','4warding.com','abcmail.cc','anonbox.net','anonymail.dk','boun.cr','burnermail.io','bypasswith.me','cheaphub.net','chogmail.com','cliptik.net','cloudmail99.com','courrieltemporaire.com','cuvox.de','deadaddress.com','deadfake.info','discard.email','disposable-email.ml','disposableinbox.com','dispose.it','dm.w3internet.co.uk','dodgeit.com','dontreg.com','drdrb.net','dump-email.info','dumpmail.de','e4ward.com','easytrashmail.com','email-fake.com','email-generator.com','email-filter.com','email-temp.com','email.nafko.com','emailgo.de','emailias.com','emailinfive.com','emaillime.com','emails.ga','emailsilo.com','emailto.de','emailwarden.com','emkei.cz','fake-email.pp.ua','fakeinbox.info','fakemail.com','fakemail.net','fakemail.org','fastmailnow.com','filzmail.com','fivemail.de','flashbox.5gbfree.com','fleckens.hu','freemail.tweakly.net','friendlymail.co.uk','fuckingduh.com','greenst.info','haltospam.com','hatespam.org','hotpop.com','hubii-network.com','icx.in','ignoremail.com','inkl.de','ip6.li','jetable.com','jnxjn.com','junk.to','kaspop.com','killmail.net','klipschx12.com','knowledgemanager.net','koszmail.pl','letterboxes.org','litedrop.com','lookugly.com','lopl.co.cc','lukecarriere.com','mail-filter.com','mail-temp.com','mail.by','mail.mezimages.net','mail4trash.com','mailbidon.com','mailcatch.com','maildrop.com','maileater.com','mailinator.net','mailinator2.com','mailmetrash.com','mailmoat.com','mailnator.com','mailnull.com','mailoven.com','mailpickle.com','mailquack.com','mailrocket.biz','mailsac.com','mailshell.com','mailslapping.com','mailtemp.net','mailtothis.com','mailtrash.net','mailzilla.org','malahov.de','meinspamschutz.de','messagebeamer.de','mierdamail.com','mintemail.com','moakt.com','msa.minsmail.com','mytrashmail.com','neverbox.com','nervmich.net','netmails.com','no-spam.ws','nobulk.com','noclickemail.com','nomail.xl.cx','nospam.ze.tc','nospamfor.us','nothingtoseehere.ca','nowmymail.com','nwldx.com','ny7.me','oneoffemail.com','oopi.org','opentrash.com','poutine.uk','privacy.net','privy-mail.com','proxymail.eu','punkass.com','put2.net','quickinbox.com','rainbowly.net','receiveee.com','recursor.net','regbypass.com','remail.ga','rfc822.org','royal.net','sandelf.de','saynotospams.com','schafmail.de','schrott-email.de','secretemail.de','secure-mail.biz','selfdestructingmail.com','sendfree.org','sendspamhere.com','sibmail.com','simplemail.in','skeefmail.com','slaskpost.se','slopsbox.com','smarttalent.tech','smellfear.com','snakware.com','sneakemail.com','sogetthis.com','spam4.me','spamail.de','spamarrest.com','spamcero.com','spamcon.org','spamcowboy.com','spamday.com','spamdecoy.net','spamex.com','spamfighter.com','spamflood.net','spamfree24.com','spamhole.com','spamify.com','spamkill.info','spaml.com','spamlot.net','spamoff.xyz','spamomail.com','spamspot.com','spamthisplease.com','spamtrail.com','spamtroll.net','spoofmail.de','stuffmail.de','suremail.info','teewars.org','teledomain.com','teleworm.com','temp-mail.com','temp-mail.de','temp-mail.info','temp-mail.org','tempaddress.net','tempail.com','tempemail.biz','tempemail.net','tempinbox.com','tempmail.co','tempmail.de','tempmail.eu','tempmail.net','tempmail.org','tempmail.us','tempomail.fr','temporary-email.com','temporary-email.net','temporaryemail.us','temporarymailaddress.com','throwaway.email','throwaway.io','trandor.com','trash-2009.com','trash-me.com','trash2009.com','trash247.com','trashbox.eu','trashcanmail.com','trashdevil.de','trashemail.de','trashinbox.net','trashmail.at','trashmail.com','trashmail.de','trashmail.info','trashmail.me','trashmail.net','trashmail.org','trashmailer.com','trashmailinator.com','trashmails.com','trashymail.com','trashymail.net','trbvm.com','uggsrock.com','ultra.fyi','unit7lahaina.com','upliftnow.com','uprival.com','vfemail.net','voidbay.com','vpsemail.com','walala.org','walkmail.net','wegwerfmail.de','wegwerfmail.info','wegwerfmail.net','wegwerfmail.org','wh4f.org','whopy.com','wilemail.com','willselfdestruct.com','xagloo.com','xcode.ro','xcompress.com','xoxy.net','xsmail.com','xrho.com','xzapmail.com','yaboo.xyz','yahub.net','yamail.info','yapped.net','yassu.com','yep.it','yopmail.com','yopmail.fr','yopmail.net','yopmail.org','yopmailer.info','yourdomain.com','yourinbox.com','you-spam.com','z0d.eu','z1p.biz','zebby.com','zehn.org','zellwolle.net','zero.e4ward.com','zipido.com','zipzap.ca','zoaxe.com','zoemail.com','zoemail.net','zoemail.org','zombie-hive.com','zomg.info','zuvio.com','zzz.com','zzzmail.com'];
        if (disposableDomains.includes(domain)) errors.email = 'No se permiten correos temporales';
      }
    }
    if (!form.phone) errors.phone = 'Campo obligatorio';
    if (!form.cedula) errors.cedula = 'Campo obligatorio';
    if (!form.instagram_user) errors.instagram_user = 'Campo obligatorio';
    if (!form.tiktok_user) errors.tiktok_user = 'Campo obligatorio';
    if (!form.password) errors.password = 'Campo obligatorio';
    else if (form.password.length < 6) errors.password = 'Mínimo 6 caracteres';

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }

    // Validar cédula duplicada
    const cleanCedula = normalizeCedula(form.cedula);
    if (cleanCedula) {
      const existing = db._init().users.find(u => normalizeCedula(u.cedula) === cleanCedula);
      if (existing) {
        setFieldErrors({ cedula: 'Esta cédula/pasaporte ya está registrado' });
        return;
      }
    }

    setIsLoading(true);
    try {
      // Generar ID primero para que coincida en Supabase y local
      const recordId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const userData = {
        id: recordId,
        email: form.email,
        role: 'user',
        full_name: form.full_name,
        phone: form.phone,
        cedula: form.cedula,
        instagram: form.instagram_user.replace('@', ''),
        tiktok: form.tiktok_user.replace('@', ''),
        password: form.password,
        total_points: 0,
        prediction_points: 0,
        bonus_points: 0,
        profile_complete: false,
      };

      // Escribir a Supabase PRIMERO (sin locks de por medio)
      if (isSupabaseAvailable()) {
        const { error } = await supabase.from('users').upsert(userData, { onConflict: 'id' });
        if (error) throw new Error(error.message);
      }

      // Escribir a localStorage directamente (evitar locks del motor de sync)
      const d = db._init();
      d.users.push(userData);
      localStorage.setItem('chessking_db', JSON.stringify(d));

      // Iniciar sesión automáticamente
      db.setCurrentUserEmail(form.email);

      toast.success('¡Cuenta creada exitosamente!');
      // Recargar para que AuthContext detecte el usuario
      window.location.href = redirect;
    } catch (err) {
      toast.error(err?.message || 'Error al crear la cuenta. Intenta de nuevo.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <motion.div
        className="w-full max-w-md"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: 'easeOut' }}
      >
        <motion.div
          className="text-center mb-8 space-y-2"
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1, duration: 0.3 }}
        >
          <motion.div
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 200, delay: 0.2 }}
          >
            <Link to="/" className="inline-block">
              <img
                src="/LOGOSCHESSKING_N2.png"
                alt="ChessKing"
                className="h-auto max-h-20 w-auto mx-auto mb-3 drop-shadow-lg transition-transform duration-300 hover:scale-105 cursor-pointer"
              />
            </Link>
          </motion.div>
          <h1 className="font-display text-4xl md:text-5xl tracking-wide">
            MUNDIAL DE{' '}
            <span className="text-foreground">KINGS</span>
          </h1>
          <p className="text-muted-foreground">Crea tu cuenta y empieza a pronosticar</p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2, duration: 0.3 }}
        >
          <Card className="gradient-border">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <UserPlus className="w-5 h-5" />
                Crear cuenta
              </CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="full_name">Nombre completo *</Label>
                  <Input
                    id="full_name"
                    name="full_name"
                    placeholder="Tu nombre completo"
                    value={form.full_name}
                    onChange={handleChange}
                    className={`transition-all duration-200 focus:ring-2 focus:ring-secondary/30 ${fieldErrors.full_name ? 'border-destructive' : ''}`}
                  />
                  {fieldErrors.full_name && <p className="text-[11px] text-destructive">{fieldErrors.full_name}</p>}
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="email">Correo electrónico *</Label>
                  <Input
                    id="email"
                    name="email"
                    type="email"
                    placeholder="tu@correo.com"
                    value={form.email}
                    onChange={handleChange}
                    className={`transition-all duration-200 focus:ring-2 focus:ring-secondary/30 ${fieldErrors.email ? 'border-destructive' : ''}`}
                  />
                  {fieldErrors.email && <p className="text-[11px] text-destructive">{fieldErrors.email}</p>}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="phone">Teléfono *</Label>
                    <Input
                      id="phone"
                      name="phone"
                      type="tel"
                      placeholder="+507 6000-0000"
                      value={form.phone}
                      onChange={handleChange}
                      className={fieldErrors.phone ? 'border-destructive' : ''}
                    />
                    {fieldErrors.phone && <p className="text-[11px] text-destructive">{fieldErrors.phone}</p>}
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="cedula">Cédula o Pasaporte *</Label>
                    <Input
                      id="cedula"
                      name="cedula"
                      placeholder="8-000-0000"
                      value={form.cedula}
                      onChange={handleChange}
                      className={fieldErrors.cedula ? 'border-destructive' : ''}
                    />
                    {fieldErrors.cedula && <p className="text-[11px] text-destructive">{fieldErrors.cedula}</p>}
                    <p className="text-[10px] text-muted-foreground/60 leading-tight">
                      Escríbela exactamente como aparece en tu documento. Se usará para validar tu identidad al reclamar premios.
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="instagram_user">Instagram *</Label>
                    <Input
                      id="instagram_user"
                      name="instagram_user"
                      placeholder="@tuusuario"
                      value={form.instagram_user}
                      onChange={handleChange}
                      className={fieldErrors.instagram_user ? 'border-destructive' : ''}
                    />
                    {fieldErrors.instagram_user && <p className="text-[11px] text-destructive">{fieldErrors.instagram_user}</p>}
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="tiktok_user">TikTok *</Label>
                    <Input
                      id="tiktok_user"
                      name="tiktok_user"
                      placeholder="@tuusuario"
                      value={form.tiktok_user}
                      onChange={handleChange}
                      className={fieldErrors.tiktok_user ? 'border-destructive' : ''}
                    />
                    {fieldErrors.tiktok_user && <p className="text-[11px] text-destructive">{fieldErrors.tiktok_user}</p>}
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="password">Contraseña *</Label>
                  <Input
                    id="password"
                    name="password"
                    type="password"
                    placeholder="Mínimo 6 caracteres"
                    value={form.password}
                    onChange={handleChange}
                    className={`transition-all duration-200 focus:ring-2 focus:ring-secondary/30 ${fieldErrors.password ? 'border-destructive' : ''}`}
                  />
                  {fieldErrors.password && <p className="text-[11px] text-destructive">{fieldErrors.password}</p>}
                </div>

                <motion.div whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.99 }}>
                  <Button type="submit" className="w-full glow-sm" disabled={isLoading}>
                    {isLoading ? (
                      <span className="flex items-center gap-2">
                        <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        Creando cuenta...
                      </span>
                    ) : 'Crear cuenta'}
                  </Button>
                </motion.div>

                <div className="p-3 rounded-xl bg-muted/50 text-[11px] sm:text-xs text-muted-foreground text-center leading-relaxed">
                  <Shield className="w-4 h-4 inline-block mr-1 text-foreground align-text-bottom" />
                  Tus datos están protegidos. No serán compartidos sin autorización (Ley 81 de Protección de Datos de Panamá).
                </div>

                <p className="text-center text-sm text-muted-foreground">
                  ¿Ya tienes cuenta?{' '}
                  <Link
                    to={`/login${redirect !== '/' ? `?redirect=${encodeURIComponent(redirect)}` : ''}`}
                    className="underline text-foreground hover:text-secondary transition font-medium"
                  >
                    Inicia sesión
                  </Link>
                </p>

                <div className="text-center">
                  <Link to="/" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition group">
                    <ArrowLeft className="w-3.5 h-3.5 transition-transform group-hover:-translate-x-0.5" />
                    Volver al inicio
                  </Link>
                </div>
              </form>
            </CardContent>
          </Card>
        </motion.div>
      </motion.div>
    </div>
  );
}
