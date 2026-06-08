// Lista curada de países con código de marcación + bandera (emoji)
// Ordenados por relevancia: Panamá primero, luego Américas, luego resto
// Dígitos esperados por país (sin contar código de país)
export const PHONE_DIGITS = {
  '+507': 8,  '+52': 10, '+1': 10,  '+57': 10, '+506': 8,
  '+503': 8,  '+502': 8,  '+504': 8,  '+505': 8,  '+511': 9,
  '+595': 9,  '+598': 8,  '+54': 10,  '+56': 9,  '+591': 8,
  '+593': 9,  '+58': 10,  '+55': 11,  '+34': 9,  '+44': 10,
  '+49': 11,  '+33': 9,  '+39': 10,  '+351': 9, '+86': 11,
  '+81': 10,  '+82': 11, '+91': 10,
};

export const COUNTRY_CODES = [
  { code: '+507', iso: 'PA', name: 'Panamá', flag: '🇵🇦', digits: 8 },
  { code: '+52',  iso: 'MX', name: 'México', flag: '🇲🇽', digits: 10 },
  { code: '+1',   iso: 'US', name: 'Estados Unidos', flag: '🇺🇸', digits: 10 },
  { code: '+57',  iso: 'CO', name: 'Colombia', flag: '🇨🇴', digits: 10 },
  { code: '+506', iso: 'CR', name: 'Costa Rica', flag: '🇨🇷', digits: 8 },
  { code: '+503', iso: 'SV', name: 'El Salvador', flag: '🇸🇻', digits: 8 },
  { code: '+502', iso: 'GT', name: 'Guatemala', flag: '🇬🇹', digits: 8 },
  { code: '+504', iso: 'HN', name: 'Honduras', flag: '🇭🇳', digits: 8 },
  { code: '+505', iso: 'NI', name: 'Nicaragua', flag: '🇳🇮', digits: 8 },
  { code: '+511', iso: 'PE', name: 'Perú', flag: '🇵🇪', digits: 9 },
  { code: '+595', iso: 'PY', name: 'Paraguay', flag: '🇵🇾', digits: 9 },
  { code: '+598', iso: 'UY', name: 'Uruguay', flag: '🇺🇾', digits: 8 },
  { code: '+54',  iso: 'AR', name: 'Argentina', flag: '🇦🇷', digits: 10 },
  { code: '+56',  iso: 'CL', name: 'Chile', flag: '🇨🇱', digits: 9 },
  { code: '+591', iso: 'BO', name: 'Bolivia', flag: '🇧🇴', digits: 8 },
  { code: '+593', iso: 'EC', name: 'Ecuador', flag: '🇪🇨', digits: 9 },
  { code: '+58',  iso: 'VE', name: 'Venezuela', flag: '🇻🇪', digits: 10 },
  { code: '+55',  iso: 'BR', name: 'Brasil', flag: '🇧🇷', digits: 11 },
  { code: '+1',   iso: 'CA', name: 'Canadá', flag: '🇨🇦', digits: 10 },
  { code: '+34',  iso: 'ES', name: 'España', flag: '🇪🇸', digits: 9 },
  { code: '+44',  iso: 'GB', name: 'Reino Unido', flag: '🇬🇧', digits: 10 },
  { code: '+49',  iso: 'DE', name: 'Alemania', flag: '🇩🇪', digits: 11 },
  { code: '+33',  iso: 'FR', name: 'Francia', flag: '🇫🇷', digits: 9 },
  { code: '+39',  iso: 'IT', name: 'Italia', flag: '🇮🇹', digits: 10 },
  { code: '+351', iso: 'PT', name: 'Portugal', flag: '🇵🇹', digits: 9 },
  { code: '+86',  iso: 'CN', name: 'China', flag: '🇨🇳', digits: 11 },
  { code: '+81',  iso: 'JP', name: 'Japón', flag: '🇯🇵', digits: 10 },
  { code: '+82',  iso: 'KR', name: 'Corea del Sur', flag: '🇰🇷', digits: 11 },
  { code: '+91',  iso: 'IN', name: 'India', flag: '🇮🇳', digits: 10 },
];

// Deduplicar por code (US/CA comparten +1; se mantienen ambos con la misma key visualmente)
export const DEFAULT_DIAL_CODE = '+507';
