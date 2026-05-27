import React, { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { api } from '@/api/client';
import { db } from '@/lib/db';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { UserPlus, ArrowLeft, Shield } from 'lucide-react';

const normalizeCedula = (v) => (v || '').replace(/[\s-]/g, '').trim().toLowerCase();

export default function Register() {
  const navigate = useNavigate();
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
      const domain = form.email.split('@').pop()?.toLowerCase();
      const disposableDomains = ['mailinator.com','guerrillamail.com','temp-mail.org','10minutemail.com','yopmail.com','trashmail.com','throwaway.email','sharklasers.com','grr.la','mailnator.com','dispostable.com','maildrop.cc','getairmail.com','fakemailgenerator.com','tempmailadrese.com','sogetthis.com','trashmail.me','wegwerfmail.de','spamgourmet.com','mailexpire.com','spambox.us','nowmymail.com','spambox.info','spam4.me','emailondeck.com','inboxbear.com','sneakemail.com','thisisnotmyrealemail.com','xagloo.com','combroteam.com','inboxes.com','receivemail.org','receivesmsonline.com','freesmscode.com','z8z.org','0clickemail.com','33mail.com','4warding.com','abcmail.cc','anonbox.net','anonymail.dk','boun.cr','burnermail.io','bypasswith.me','cheaphub.net','chogmail.com','cliptik.net','cloudmail99.com','courrieltemporaire.com','cuvox.de','deadaddress.com','deadfake.info','discard.email','disposable-email.ml','disposableinbox.com','dispose.it','dm.w3internet.co.uk','dodgeit.com','dontreg.com','drdrb.net','dump-email.info','dumpmail.de','e4ward.com','easytrashmail.com','email-fake.com','email-generator.com','email-filter.com','email-temp.com','email.nafko.com','emailgo.de','emailias.com','emailinfive.com','emaillime.com','emails.ga','emailsilo.com','emailto.de','emailwarden.com','emkei.cz','fake-email.pp.ua','fakeinbox.info','fakemail.com','fakemail.net','fakemail.org','fastmailnow.com','filzmail.com','fivemail.de','flashbox.5gbfree.com','fleckens.hu','freemail.tweakly.net','friendlymail.co.uk','fuckingduh.com','greenst.info','haltospam.com','hatespam.org','hotpop.com','hubii-network.com','icx.in','ignoremail.com','inkl.de','ip6.li','jetable.com','jnxjn.com','junk.to','kaspop.com','killmail.net','klipschx12.com','knowledgemanager.net','koszmail.pl','letterboxes.org','litedrop.com','lookugly.com','lopl.co.cc','lukecarriere.com','mail-filter.com','mail-temp.com','mail.by','mail.mezimages.net','mail4trash.com','mailbidon.com','mailcatch.com','maildrop.com','maileater.com','mailexpire.com','mailin8r.com','mailinator.net','mailinator.org','mailinator2.com','mailmetrash.com','mailmoat.com','mailnator.com','mailnull.com','mailoven.com','mailpickle.com','mailproxsy.com','mailquack.com','mailrocket.biz','mailsac.com','mailseal.de','mailshell.com','mailsiphon.com','mailslapping.com','mailtemp.net','mailtothis.com','mailtrash.net','mailzilla.org','malahov.de','mega.zik.dj','meinspamschutz.de','messagebeamer.de','mierdamail.com','mintemail.com','mobileninja.co.uk','moakt.com','mobileninja.co.uk','msa.minsmail.com','mt2009.com','muathegame.com','mycard.net.ua','myemailcleaner.com','mytrashmail.com','neverbox.com','nervmich.net','netmails.com','netmails.net','netzidiot.de','no-spam.ws','nobulk.com','noclickemail.com','nogmailspam.info','nomail.xl.cx','nomorespam.eml.cc','nonspam.eu','nonspammer.de','nopemail.com','nospam.ze.tc','nospam4.us','nospamfor.us','nothingtoseehere.ca','nowmymail.com','nowmymail.net','nwldx.com','ny7.me','oneoffemail.com','oopi.org','opentrash.com','outmail.win','outlookcom.com','poutine.uk','privacy.net','privy-mail.com','proxymail.eu','punkass.com','put2.net','quickinbox.com','rainbowly.net','re-gister.com','receiveee.com','recode.me','recursor.net','regbypass.com','regbypass.comsafe-mail.net','remail.ga','rfc822.org','rollindo.net','royal.net','sandelf.de','saynotospams.com','scay.net','schafmail.de','schrott-email.de','secretemail.de','secure-mail.biz','selfdestructingmail.com','sendfree.org','sendspamhere.com','shmer.com','sibmail.com','simplemail.in','skeefmail.com','slaskpost.se','slopsbox.com','smarttalent.tech','smellfear.com','snakware.com','sneakemail.com','snkmail.com','sogetthis.com','sohbet.net','sohus.cn','solar-impact.pro','solvemail.info','spam4.me','spamail.de','spamarrest.com','spamcero.com','spamcon.org','spamcowboy.com','spamday.com','spamdecoy.net','spamex.com','spamfighter.com','spamflood.net','spamfree24.com','spamhole.com','spamify.com','spaminator.de','spamkill.info','spaml.com','spamlot.net','spamoff.xyz','spamomail.com','spamspot.com','spamthis.co.uk','spamthisplease.com','spamtrail.com','spamtroll.net','speed.1s.fr','spoofmail.de','stuffmail.de','suremail.info','teewars.org','teledomain.com','teleworm.com','temp-mail.com','temp-mail.de','temp-mail.info','temp-mail.net','temp-mail.org','tempaddress.net','tempail.com','tempemail.biz','tempemail.co.za','tempemail.net','tempinbox.co.uk','tempinbox.com','tempmail.co','tempmail.de','tempmail.eu','tempmail.it','tempmail.net','tempmail.org','tempmail.us','tempomail.fr','temporary-email.com','temporary-email.net','temporaryemail.us','temporaryforwarding.com','temporarymailaddress.com','tempsky.com','thelightningmail.com','thismail.net','throwaway.email','throwaway.io','throwaway.mailinator.com','throwawayemail.com','topranklist.de','trandor.com','trash-2009.com','trash-me.com','trash2009.com','trash247.com','trashbox.eu','trashcanmail.com','trashdevil.de','trashemail.de','trashinbox.net','trashmail.at','trashmail.com','trashmail.de','trashmail.info','trashmail.me','trashmail.net','trashmail.org','trashmailer.com','trashmailgenerator.de','trashmailinator.com','trashmails.com','trashymail.com','trashymail.net','trash4.me','trbvm.com','tropicalbass.info','trumpmail.com','tyldd.com','uggsrock.com','uk.ve.ht','ultra.fyi','umu.my','unimark.org','unit7lahaina.com','unmail.ru','upcma.ga','upliftnow.com','uprival.com','upy.kayako.com','ureee.us','urfey.com','us.ve.ht','ushijima1125.com','utiket.us','uumail.us','uy.ve.ht','v3ft.com','v8emails.org','valemail.net','ve.ht','veanlo.com','vermutlich.net','veryrealemail.com','vfemail.net','vickaentb.com','vidchart.com','vipmail.name','vipmail.pw','vipmail.tk','vjtimail.com','vmani.com','vnavto.com','vodafone.ie','voidbay.com','voltaer.com','vorga.org','voxelcore.com','vp.yk.ht','vpsemail.com','vsimcard.com','vspider.com','vssms.com','vw.ve.ht','vwpk.com','vx.ve.ht','vxx.ve.ht','w3internet.co.uk','wakingoffice.com','walala.org','walkmail.net','walkmail.ru','warau-kadiri.com','wbml.net','webcontactform.com','webdestino.org','webemail.me','webm4il.info','webuser.in','wee.my','weg-werf-email.de','wegwerfmail.de','wegwerfmail.info','wegwerfmail.net','wegwerfmail.org','wh4f.org','whatiaas.com','whatifanalytics.com','whopy.com','whyspam.me','wibblesmith.com','widget.gg','wilemail.com','willselfdestruct.com','winemaven.biz','wiz2.site','wizkids.eu','wjjw.duckdns.org','wmail.cf','wmav.tk','wn8o.ga','wokcy.com','wolfmail.ml','wolfsmail.tk','worldspace.link','wovz.cu.cc','wqbhvt.com','wr9v.ga','wralawfirm.com','writeme.us','wrmx.net','wronghead.com','wudet.men','wuespdj.xyz','wupics.com','wuzup.net','wuzupmail.net','wwjmp.com','www.bccto.me','www.e4ward.com','www.gishpuppy.com','www.newideasforimprovinghealth.com','www20.com','wwwhonky.com','x.zoidberg.com.au','x1x.spb.ru','x4y.club','xagloo.com','xath,cy','xcode.ro','xcompress.com','xemaps.com','xents.com','xingcloud.xyz','xique.com','xl.cx','xo.pt','xoballoon.com','xoxo.4mg.com','xoxy.net','xrho.com','xsmail.com','xthaettu.com','xthost.info','xuno.com','xw9.ga','xwaretech.com','xxhamsterxx.ovh','xxi2.com','xxolocanto.us','xxti.me','xy9ce.com','xyzfree.net','xzapmail.com','yabai-oppai.xyz','yaboo.xyz','yahub.net','yamail.info','yanet.me','yapped.net','yassu.com','ycare.de','ycn.ro','ye.ve.ht','yedi.org','yeepe.com','yeeslow.com','yellow.homedns.org','yelloww.ga','yep.it','yepmail.net','yert.ye','yhg.biz','yifan.net','ynmrealty.com','yodx.com','yogamaven.com','yomail.info','yoo.email','yop.com','yop.fr','yop.net','yop.us','yopmail.com','yopmail.fr','yopmail.net','yopmail.org','yopmailer.info','yopolis.com','you-spam.com','yougotgoated.com','youmail.ga','youmailr.com','youpymail.com','yourdomain.com','yourinbox.com','yourlifesucks.ro','yourname.freeservers.com','yours.com','yourspamgoes.to','yousuck.com','yroid.com','yspend.com','ytnhy.com','yugasandokan.com','yui.it','yuirz.com','yuoia.com','yxzx.com','yyj295r31.com','yyjny.com','yytv.org','z0d.eu','z1p.biz','z4zy.co','zaffin.com','zain.site','zainmax.com','zaktouni.com','zambonigioielleria.com','zamge.com','zarabotok.ru','zavio.nl','zaym-zavod.ru','zazagames.org','zdenka.net','ze.gally.jp','zebra.email','zehn.org','zellwolle.net','zen.ci','zen188.com','zepp.dk','zepsanut.com','zero-awake.xyz','zero.e4ward.com','zerodog.net','zety.me','zeus.allmail.net','zexe.ga','zfymail.com','zhcne.com','zhewei.tv','zhorachu.com','ziggo.nl','zilmail.com','zilmail.net','zipcad.com','zipido.com','zipo.org','zippie.info','zippymail.info','zipzap.ca','ziz-2.pw','zj.moa.gov.cn','zl0.in','zl8.de','zlav.com','zmail.info','zmail.win','zmall.xyz','zn4.ga','zn8.ga','zn9.ga','zoaxe.com','zoemail.com','zoemail.net','zoemail.org','zoetropes.org','zombie-hive.com','zomg.info','zoo.mn','zoobe.dingokids.eu','zoobas.com','zoombido.com','zoopy.bid','zoopy.com','zoose.com','zorgen.xyz','zoutlook.com','zp.ua','zpvoz.com','zrmail.com','zsel.com','zsero.com','zslsz.com','zsp.com.es','ztdp.space','zubinkumar.com','zuper.info','zuvio.com','zuzzurello.com','zvmail.com','zw6.net','zwallet.com','zwoho.com','zxcv.com','zxcvbnm.com','zz.mu','zz.com','zz.fo','zz1.hk','zzz.com','zzz.mu','zzz.socal.fr','zzz.vc','zzzmail.com','zzzzzzz.com'];
      if (disposableDomains.includes(domain)) errors.email = 'No se permiten correos temporales';
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
      await api.users.inviteUser({
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
      });

      toast.success('¡Cuenta creada exitosamente!');
      navigate(`/login?redirect=${encodeURIComponent(redirect)}`);
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
