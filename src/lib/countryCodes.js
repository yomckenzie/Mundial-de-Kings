// Lista curada de países con código de marcación + bandera (emoji)
// Ordenados por relevancia: Panamá primero, luego Américas, luego resto
export const COUNTRY_CODES = [
  { code: '+507', iso: 'PA', name: 'Panamá', flag: '🇵🇦' },
  { code: '+52',  iso: 'MX', name: 'México', flag: '🇲🇽' },
  { code: '+1',   iso: 'US', name: 'Estados Unidos', flag: '🇺🇸' },
  { code: '+57',  iso: 'CO', name: 'Colombia', flag: '🇨🇴' },
  { code: '+506', iso: 'CR', name: 'Costa Rica', flag: '🇨🇷' },
  { code: '+503', iso: 'SV', name: 'El Salvador', flag: '🇸🇻' },
  { code: '+502', iso: 'GT', name: 'Guatemala', flag: '🇬🇹' },
  { code: '+504', iso: 'HN', name: 'Honduras', flag: '🇭🇳' },
  { code: '+505', iso: 'NI', name: 'Nicaragua', flag: '🇳🇮' },
  { code: '+511', iso: 'PE', name: 'Perú', flag: '🇵🇪' },
  { code: '+595', iso: 'PY', name: 'Paraguay', flag: '🇵🇾' },
  { code: '+598', iso: 'UY', name: 'Uruguay', flag: '🇺🇾' },
  { code: '+54',  iso: 'AR', name: 'Argentina', flag: '🇦🇷' },
  { code: '+56',  iso: 'CL', name: 'Chile', flag: '🇨🇱' },
  { code: '+591', iso: 'BO', name: 'Bolivia', flag: '🇧🇴' },
  { code: '+593', iso: 'EC', name: 'Ecuador', flag: '🇪🇨' },
  { code: '+58',  iso: 'VE', name: 'Venezuela', flag: '🇻🇪' },
  { code: '+55',  iso: 'BR', name: 'Brasil', flag: '🇧🇷' },
  { code: '+1',   iso: 'CA', name: 'Canadá', flag: '🇨🇦' },
  { code: '+34',  iso: 'ES', name: 'España', flag: '🇪🇸' },
  { code: '+44',  iso: 'GB', name: 'Reino Unido', flag: '🇬🇧' },
  { code: '+49',  iso: 'DE', name: 'Alemania', flag: '🇩🇪' },
  { code: '+33',  iso: 'FR', name: 'Francia', flag: '🇫🇷' },
  { code: '+39',  iso: 'IT', name: 'Italia', flag: '🇮🇹' },
  { code: '+351', iso: 'PT', name: 'Portugal', flag: '🇵🇹' },
  { code: '+86',  iso: 'CN', name: 'China', flag: '🇨🇳' },
  { code: '+81',  iso: 'JP', name: 'Japón', flag: '🇯🇵' },
  { code: '+82',  iso: 'KR', name: 'Corea del Sur', flag: '🇰🇷' },
  { code: '+91',  iso: 'IN', name: 'India', flag: '🇮🇳' },
];

// Deduplicar por code (US/CA comparten +1; se mantienen ambos con la misma key visualmente)
export const DEFAULT_DIAL_CODE = '+507';
