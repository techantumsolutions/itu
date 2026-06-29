import { stableOperatorSlugForRename } from '@/lib/aggregator/admin-operator-rename'
import { slugify } from '@/lib/aggregator/signature'

describe('stableOperatorSlugForRename', () => {
  it('uses slug from the original operator name', () => {
    expect(stableOperatorSlugForRename('Airtel IND')).toBe(slugify('Airtel IND'))
  })

  it('falls back to current slug when old name is empty', () => {
    expect(stableOperatorSlugForRename('', 'airtel-ind')).toBe('airtel-ind')
  })
})
