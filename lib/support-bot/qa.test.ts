import {
  findBestMatches,
  scoreQaMatch,
  type SupportBotQa,
} from '@/lib/support-bot/qa'

function qa(partial: Partial<SupportBotQa> & Pick<SupportBotQa, 'question' | 'answer'>): SupportBotQa {
  return {
    id: partial.id ?? '1',
    question: partial.question,
    answer: partial.answer,
    keywords: partial.keywords ?? [],
    category: partial.category ?? 'general',
    isSuggested: partial.isSuggested ?? false,
    isActive: partial.isActive ?? true,
    sortOrder: partial.sortOrder ?? 0,
    createdAt: '',
    updatedAt: '',
  }
}

describe('support-bot matching', () => {
  const items = [
    qa({
      id: 'a',
      question: 'Why is my recharge still pending?',
      answer: 'Wait 30 minutes then raise a ticket.',
      keywords: ['pending', 'recharge', 'status'],
      category: 'recharge',
    }),
    qa({
      id: 'b',
      question: 'When will I get my refund?',
      answer: 'Refunds take 3-7 days.',
      keywords: ['refund', 'money'],
      category: 'payment',
    }),
  ]

  it('scores exact question highly', () => {
    expect(scoreQaMatch('Why is my recharge still pending?', items[0]!)).toBeGreaterThan(0.5)
  })

  it('matches keyword-heavy transaction queries', () => {
    const matches = findBestMatches('refund for failed payment money back', items, 2)
    expect(matches[0]?.id).toBe('b')
  })

  it('ignores inactive entries', () => {
    const withInactive = [
      ...items,
      qa({
        id: 'c',
        question: 'refund pending',
        answer: 'x',
        keywords: ['refund'],
        isActive: false,
      }),
    ]
    const matches = findBestMatches('refund pending', withInactive, 5)
    expect(matches.every((m) => m.id !== 'c')).toBe(true)
  })
})
