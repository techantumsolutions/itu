import {
  englishPlanDisplayFields,
  isLikelyEnglishPlanText,
  translatePlanTextToEnglish,
  translatePlanValidityToEnglish,
} from '@/lib/catalog/plan-text-english'

describe('plan-text-english', () => {
  it('translates Spanish unlimited data pack text', () => {
    expect(translatePlanTextToEnglish('Paquete de datos ilimitados 3GB por 7 días')).toBe(
      'pack of unlimited data 3GB for 7 days',
    )
  })

  it('translates Spanish unlimited calls', () => {
    expect(translatePlanTextToEnglish('Llamadas locales ilimitadas')).toBe('unlimited local calls')
  })

  it('leaves English text unchanged', () => {
    const text = 'Unlimited data 5GB for 28 days'
    expect(translatePlanTextToEnglish(text)).toBe(text)
    expect(isLikelyEnglishPlanText(text)).toBe(true)
  })

  it('translates validity days', () => {
    expect(translatePlanValidityToEnglish('28 Días')).toBe('28 Days')
    expect(translatePlanValidityToEnglish('1 día')).toBe('1 Day')
  })

  it('normalizes plan display fields together', () => {
    expect(
      englishPlanDisplayFields({
        planName: 'Recarga $100',
        benefits: 'Tiempo de conversación de INR 7.47',
        validity: '28 Días',
      }),
    ).toEqual({
      planName: 'top-up $100',
      benefits: 'talktime of INR 7.47',
      validity: '28 Days',
    })
  })
})
