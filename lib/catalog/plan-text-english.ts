/**
 * Converts provider/catalog plan names and descriptions to English for the public website.
 * Uses phrase dictionaries for common telecom terms (ES/PT/FR/AR) from DT One and similar feeds.
 */

const PHRASE_REPLACEMENTS: Array<[RegExp, string]> = [
  // ---- Spanish (longest phrases first) ----
  [/llamadas?\s+y\s+sms\s+ilimitados?/gi, 'unlimited calls and SMS'],
  [/llamadas?\s+(?:y\s+)?sms\s+ilimitados?/gi, 'unlimited calls and SMS'],
  [/llamadas?\s+(?:locales?\s+)?ilimitadas?/gi, 'unlimited local calls'],
  [/minutos\s+(?:de\s+voz\s+)?ilimitados?/gi, 'unlimited voice minutes'],
  [/minutos\s+ilimitados?/gi, 'unlimited minutes'],
  [/ilimitados?\s+minutos?/gi, 'unlimited minutes'],
  [/ilimitad[ao]\s+llamadas?/gi, 'unlimited calls'],
  [/habla\s+ilimitad[ao]/gi, 'unlimited talk'],
  [/roaming\s+ilimitado/gi, 'unlimited roaming'],
  [/datos?\s+ilimitados?/gi, 'unlimited data'],
  [/sms\s+ilimitados?/gi, 'unlimited SMS'],
  [/internet\s+m[oó]vil/gi, 'mobile internet'],
  [/tiempo\s+de\s+conversaci[oó]n/gi, 'talktime'],
  [/redes\s+sociales/gi, 'social media'],
  [/navegaci[oó]n\s+m[oó]vil/gi, 'mobile browsing'],
  [/navegaci[oó]n/gi, 'browsing'],
  [/v[aá]lid[ao]?\s+por/gi, 'valid for'],
  [/v[aá]lidez/gi, 'validity'],
  [/despu[eé]s\s+de\s+usar/gi, 'after using'],
  [/velocidad\s+reducida/gi, 'reduced speed'],
  [/recarga\s+de\s+saldo/gi, 'balance top-up'],
  [/paquete\s+de\s+datos/gi, 'data pack'],
  [/paquete\s+combo/gi, 'combo pack'],
  [/llamadas?\s+locales?/gi, 'local calls'],
  [/llamadas?/gi, 'calls'],
  [/minutos?/gi, 'minutes'],
  [/mensajes?/gi, 'messages'],
  [/incluye/gi, 'includes'],
  [/recarga/gi, 'top-up'],
  [/paquete/gi, 'pack'],
  [/datos/gi, 'data'],
  [/saldo/gi, 'balance'],
  [/d[ií]a/gi, 'day'],
  [/d[ií]as/gi, 'days'],
  [/por\s+d[ií]a/gi, 'per day'],
  [/al\s+d[ií]a/gi, 'per day'],
  [/ilimitad[ao]/gi, 'unlimited'],
  [/navegar/gi, 'browse'],

  // ---- Portuguese ----
  [/chamadas?\s+ilimitadas?/gi, 'unlimited calls'],
  [/dados\s+ilimitados?/gi, 'unlimited data'],
  [/liga[cç][oõ]es\s+ilimitadas?/gi, 'unlimited calls'],
  [/minutos\s+ilimitados?/gi, 'unlimited minutes'],
  [/v[aá]lido\s+por/gi, 'valid for'],
  [/pacote\s+de\s+dados/gi, 'data pack'],
  [/recarga/gi, 'top-up'],
  [/pacote/gi, 'pack'],
  [/dados/gi, 'data'],
  [/chamadas?/gi, 'calls'],
  [/dias/gi, 'days'],
  [/dia/gi, 'day'],

  // ---- French ----
  [/appels?\s+illimit[eé]s?/gi, 'unlimited calls'],
  [/donn[eé]es\s+illimit[eé]es/gi, 'unlimited data'],
  [/forfait\s+illimit[eé]/gi, 'unlimited plan'],
  [/validit[eé]/gi, 'validity'],
  [/valable\s+pendant/gi, 'valid for'],
  [/jours?/gi, 'days'],
  [/jour/gi, 'day'],
  [/forfait/gi, 'plan'],
  [/donn[eé]es/gi, 'data'],
  [/appels?/gi, 'calls'],
  [/illimit[eé]/gi, 'unlimited'],

  // ---- Arabic (transliterated common in catalogs) ----
  [/بيانات\s+غير\s+محدودة/g, 'unlimited data'],
  [/غير\s+محدود/g, 'unlimited'],
  [/بيانات/g, 'data'],
  [/دقائق/g, 'minutes'],
  [/أيام/g, 'days'],
  [/يوم/g, 'day'],

  // ---- Generic / connectors ----
  [/\s+y\s+/gi, ' and '],
  [/\s+o\s+/gi, ' or '],
  [/\s+de\s+/gi, ' of '],
  [/\s+con\s+/gi, ' with '],
  [/\s+para\s+/gi, ' for '],
  [/\s+por\s+/gi, ' for '],
]

const WORD_REPLACEMENTS: Record<string, string> = {
  recarga: 'top-up',
  paquete: 'pack',
  datos: 'data',
  llamadas: 'calls',
  llamada: 'call',
  minutos: 'minutes',
  minuto: 'minute',
  ilimitado: 'unlimited',
  ilimitada: 'unlimited',
  ilimitados: 'unlimited',
  ilimitadas: 'unlimited',
  navegacion: 'browsing',
  navegación: 'browsing',
  validez: 'validity',
  válido: 'valid',
  valido: 'valid',
  incluye: 'includes',
  saldo: 'balance',
  internet: 'internet',
  mensajes: 'messages',
  mensaje: 'message',
  dias: 'days',
  día: 'day',
  dia: 'day',
  semana: 'week',
  semanas: 'weeks',
  mes: 'month',
  meses: 'months',
  recarregar: 'top-up',
  pacote: 'pack',
  chamadas: 'calls',
  chamada: 'call',
  dados: 'data',
  forfait: 'plan',
  appels: 'calls',
  appel: 'call',
  données: 'data',
  donnees: 'data',
  illimité: 'unlimited',
  illimite: 'unlimited',
  jour: 'day',
  jours: 'days',
}

function normalizeWhitespace(text: string): string {
  return text.replace(/\s+/g, ' ').trim()
}

function replaceWords(text: string): string {
  return text.replace(/\b[\p{L}]+\b/gu, (word) => {
    const lower = word.toLowerCase()
    const replacement = WORD_REPLACEMENTS[lower]
    if (!replacement) return word
    if (word === word.toUpperCase()) return replacement.toUpperCase()
    if (word[0] === word[0]?.toUpperCase()) {
      return replacement.charAt(0).toUpperCase() + replacement.slice(1)
    }
    return replacement
  })
}

/** True when text is already suitable for English display (ASCII-heavy, no obvious foreign markers). */
export function isLikelyEnglishPlanText(text: string): boolean {
  const t = text.trim()
  if (!t) return true
  if (/[\u0600-\u06FF]/.test(t)) return false
  if (/[áéíóúñü¿¡]/i.test(t)) return false
  if (/\b(datos|llamadas|ilimitad|recarga|paquete|navegaci|válid|chamadas|dados|forfait|données|appels)\b/i.test(t)) {
    return false
  }
  return true
}

/** Translate or normalize plan name / description text to English. */
export function translatePlanTextToEnglish(text: string): string {
  const input = (text ?? '').trim()
  if (!input) return ''
  if (isLikelyEnglishPlanText(input)) return input

  let out = input
  for (const [pattern, replacement] of PHRASE_REPLACEMENTS) {
    out = out.replace(pattern, replacement)
  }
  out = replaceWords(out)
  return normalizeWhitespace(out)
}

/** Normalize validity labels (e.g. "28 Días" → "28 Days"). */
export function translatePlanValidityToEnglish(validity: string): string {
  const v = (validity ?? '').trim()
  if (!v) return v
  if (isLikelyEnglishPlanText(v)) return v

  const dayMatch = v.match(/^(\d+)\s*d[ií]as?$/i)
  if (dayMatch) {
    const n = Number(dayMatch[1])
    return n === 1 ? '1 Day' : `${n} Days`
  }

  const weekMatch = v.match(/^(\d+)\s*semanas?$/i)
  if (weekMatch) {
    const n = Number(weekMatch[1])
    return n === 1 ? '1 Week' : `${n} Weeks`
  }

  return translatePlanTextToEnglish(v)
}

export function englishPlanDisplayFields(input: {
  planName?: string | null
  benefits?: string | null
  validity?: string | null
}): { planName: string; benefits: string; validity: string } {
  return {
    planName: translatePlanTextToEnglish(input.planName ?? ''),
    benefits: translatePlanTextToEnglish(input.benefits ?? ''),
    validity: translatePlanValidityToEnglish(input.validity ?? ''),
  }
}
