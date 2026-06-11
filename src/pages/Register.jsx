import React, { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { m } from 'framer-motion';
import { db } from '@/lib/db';
import { supabase, isSupabaseAvailable } from '@/lib/supabase';
import { toast } from 'sonner';
import RegisterHeader from './register/RegisterHeader';
import RegisterForm from './register/RegisterForm';
import { DEFAULT_DIAL_CODE, PHONE_DIGITS } from '@/lib/countryCodes';
import { sanitizeRedirect } from '@/lib/utils';

const normalizeCedula = (v) => (v || '').replace(/[\s-]/g, '').trim().toLowerCase();

// Quita prefijos duplicados (e.g. si el usuario tipea "+5076000-0000"
// con el code "+507" ya seleccionado, no queremos "+507+5076000-0000")
const stripDialCode = (raw, dialCode) => {
  const cleaned = (raw || '').replace(/[\s\-().]/g, '');
  if (dialCode && cleaned.startsWith(dialCode.replace(/[^\d+]/g, ''))) {
    return cleaned.slice(dialCode.replace(/[^\d+]/g, '').length);
  }
  if (cleaned.startsWith('+')) return '';
  return cleaned;
};

export default function Register() {
  const [searchParams] = useSearchParams();
  const redirect = sanitizeRedirect(searchParams.get('redirect'));

  const [isLoading, setIsLoading] = useState(false);
  const [fieldErrors, setFieldErrors] = useState({});
  const refFromUrl = searchParams.get('ref') || '';

  const [form, setForm] = useState({
    full_name: '',
    email: '',
    phone: '',
    phone_country: DEFAULT_DIAL_CODE,
    doc_type: 'cedula',
    cedula: '',
    instagram_user: '',
    tiktok_user: '',
    password: '',
    referral_code: refFromUrl.trim(),
  });

  const handleChange = (e) => {
    const { name, value } = e.target;
    let newValue = value;
    // Filtrar solo dígitos para teléfono
    if (name === 'phone') newValue = value.replace(/\D/g, '');
    // Filtrar solo dígitos para cédula (pasaporte permite letras)
    if (name === 'cedula' && form.doc_type === 'cedula') newValue = value.replace(/\D/g, '');
    setForm(prev => ({ ...prev, [name]: newValue }));
    setFieldErrors(prev => ({ ...prev, [name]: '' }));
  };

  const handleChangeField = (name, value) => {
    setForm(prev => ({ ...prev, [name]: value }));
    setFieldErrors(prev => ({ ...prev, [name]: '' }));
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
    else {
      const digitsOnly = form.phone.replace(/\D/g, '');
      if (digitsOnly.length === 0) errors.phone = 'Debe contener solo números';
      else {
        const expected = PHONE_DIGITS[form.phone_country] || 8;
        if (digitsOnly.length !== expected) errors.phone = `Debe tener ${expected} dígitos para ${form.phone_country}`;
      }
      // Verificar teléfono duplicado (número completo con código de país)
      if (!errors.phone) {
        const fullDigits = `${form.phone_country.replace(/\D/g, '')}${digitsOnly}`;
        const existing = db._init().users.find(u => {
          const existingDigits = u.phone ? u.phone.replace(/\D/g, '') : '';
          return existingDigits === fullDigits;
        });
        if (existing) errors.phone = 'Este número de teléfono ya está registrado';
      }
    }
    if (!form.cedula) errors.cedula = 'Campo obligatorio';
    else if (form.doc_type === 'cedula' && !/^\d+$/.test(form.cedula)) errors.cedula = 'La cédula solo debe contener números';
    else if (form.doc_type === 'pasaporte' && !/^[a-zA-Z0-9]+$/.test(form.cedula)) errors.cedula = 'El pasaporte solo debe contener letras y números';
    if (!form.instagram_user) errors.instagram_user = 'Campo obligatorio';
    else {
      const cleanIg = form.instagram_user.replace('@', '').trim().toLowerCase();
      if (db._init().users.some(u => u.instagram && u.instagram.toLowerCase() === cleanIg)) {
        errors.instagram_user = 'Este usuario de Instagram ya está registrado';
      }
    }
    if (!form.tiktok_user) errors.tiktok_user = 'Campo obligatorio';
    else {
      const cleanTt = form.tiktok_user.replace('@', '').trim().toLowerCase();
      if (db._init().users.some(u => u.tiktok && u.tiktok.toLowerCase() === cleanTt)) {
        errors.tiktok_user = 'Este usuario de TikTok ya está registrado';
      }
    }
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
      // Validar código de referido si se proporcionó
      let referrerData = null;
      const cleanReferralCode = (form.referral_code || '').trim();
      if (cleanReferralCode) {
        const d = db._init();
        // Búsqueda local: exacta + insensible a mayúsculas
        referrerData = d.users.find(u =>
          u.referral_code &&
          u.referral_code.toLowerCase() === cleanReferralCode.toLowerCase()
        );

        // Fallback: si no está en local (otro dispositivo), consultar Supabase directo
        if (!referrerData && isSupabaseAvailable()) {
          const { data, error } = await supabase
            .from('users')
            .select('id, email, referral_code, full_name, instagram')
            .eq('referral_code', cleanReferralCode)
            .maybeSingle();
          if (error) {
            // Error silencioso consultando Supabase
          }
          if (!error && data) {
            referrerData = data;
            // Cachear localmente para próximos registros y para el ranking
            if (!d.users.some(u => u.id === data.id)) d.users.push(data);
          }
        }

        if (!referrerData) {
          setFieldErrors(prev => ({ ...prev, referral_code: 'Código de invitación inválido' }));
          setIsLoading(false);
          return;
        }
        if (referrerData.email && referrerData.email.toLowerCase() === form.email.toLowerCase()) {
          setFieldErrors(prev => ({ ...prev, referral_code: 'No puedes autoreferirte' }));
          setIsLoading(false);
          return;
        }
      }

      // 1. Registrar el usuario en Supabase Auth
      if (!isSupabaseAvailable()) {
        throw new Error('El servicio de base de datos no está disponible.');
      }

      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: form.email,
        password: form.password,
      });

      if (authError) {
        throw authError;
      }

      const authUser = authData.user;
      if (!authUser) {
        throw new Error('No se pudo completar el registro de credenciales.');
      }

      // Generar código de referido para el nuevo usuario
      const userReferralCode = db.generateReferralCode(form.full_name, form.email);
      const fullPhone = `${form.phone_country} ${stripDialCode(form.phone, form.phone_country)}`.trim();

      // Usamos el UUID de Supabase Auth para ligar el perfil público
      const recordId = authUser.id;
      const userData = {
        id: recordId,
        email: form.email,
        role: 'user',
        full_name: form.full_name,
        phone: fullPhone,
        whatsapp: fullPhone,
        cedula: form.cedula,
        instagram: form.instagram_user.replace('@', ''),
        tiktok: form.tiktok_user.replace('@', ''),
        referral_code: userReferralCode,
        referred_by: cleanReferralCode || null,
        referral_points: 0,
        total_points: 100,
        prediction_points: 0,
        bonus_points: 100,
        profile_complete: true,
        created_date: new Date().toISOString(),
      };

      // 2. Escribir perfil en la tabla pública de Supabase
      const { error: profileError } = await supabase
        .from('users')
        .upsert(userData, { onConflict: 'id' });
      
      if (profileError) {
        throw new Error(`Error al crear perfil de usuario: ${profileError.message}`);
      }

      // Crear bono de bienvenida
      const welcomeBonus = {
        id: `welcome_${recordId}`,
        user_email: form.email,
        user_name: form.full_name,
        amount: 100,
        reason: 'Bono de bienvenida',
        type: 'welcome',
        given_by: 'system',
        created_date: new Date().toISOString(),
      };

      // Guardar bono en Supabase
      const { error: bonusError } = await supabase
        .from('points_bonuses')
        .upsert(welcomeBonus, { onConflict: 'id' });
      if (bonusError) {
        console.error("Error guardando bono:", bonusError);
      }

      // Escribir a localStorage directamente (evitar locks del motor de sync)
      const d = db._init();
      d.users.push(userData);
      if (!d.pointsBonuses) d.pointsBonuses = [];
      d.pointsBonuses.push(welcomeBonus);

      // Registrar el referido si corresponde
      if (referrerData) {
        if (!d.referrals) d.referrals = [];
        d.referrals.push({
          id: `ref_${recordId}`,
          referrer_code: referrerData.referral_code,
          referrer_email: referrerData.email,
          referred_email: form.email,
          level: 1,
          status: 'active',
          created_date: new Date().toISOString(),
        });
      }

      // Otorgar bono de referido (10 pts) al referente
      if (referrerData) {
        await db.awardReferralBonus(cleanReferralCode, form.email);
      }

      // Iniciar sesión automáticamente en el DB local
      db.setCurrentUserEmail(form.email);

      toast.success('¡Cuenta creada exitosamente!');
      window.location.href = redirect;
    } catch (err) {
      toast.error(err?.message || 'Error al crear la cuenta. Intenta de nuevo.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <m.div
        className="w-full max-w-md sm:max-w-2xl"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: 'easeOut' }}
      >
        <RegisterHeader />
        <RegisterForm
          form={form}
          fieldErrors={fieldErrors}
          isLoading={isLoading}
          handleChange={handleChange}
          handleChangeField={handleChangeField}
          handleSubmit={handleSubmit}
          redirect={redirect}
        />
      </m.div>
    </div>
  );
}
