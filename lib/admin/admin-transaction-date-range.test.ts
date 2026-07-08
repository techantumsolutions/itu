import { resolveAdminTransactionDateRange } from '@/lib/admin/admin-transaction-date-range'

describe('resolveAdminTransactionDateRange', () => {
  const realDate = Date

  afterEach(() => {
    global.Date = realDate
  })

  it('returns null range for all', () => {
    expect(resolveAdminTransactionDateRange('all')).toEqual({ start: null, end: null })
  })

  it('uses current calendar month, not rolling 30 days', () => {
    global.Date = class extends realDate {
      constructor(...args: ConstructorParameters<typeof realDate>) {
        if (args.length === 0) {
          super(2026, 6, 15, 12, 0, 0)
          return
        }
        super(...args)
      }
    } as DateConstructor

    const { start, end } = resolveAdminTransactionDateRange('month')
    expect(start?.getFullYear()).toBe(2026)
    expect(start?.getMonth()).toBe(6)
    expect(start?.getDate()).toBe(1)
    expect(end?.getFullYear()).toBe(2026)
    expect(end?.getMonth()).toBe(6)
    expect(end?.getDate()).toBe(31)
  })

  it('uses Monday–Sunday for the current week', () => {
    global.Date = class extends realDate {
      constructor(...args: ConstructorParameters<typeof realDate>) {
        if (args.length === 0) {
          super(2026, 6, 8, 10, 0, 0)
          return
        }
        super(...args)
      }
    } as DateConstructor

    const { start, end } = resolveAdminTransactionDateRange('week')
    expect(start?.getDay()).toBe(1)
    expect(start?.getDate()).toBe(6)
    expect(end?.getDay()).toBe(0)
    expect(end?.getDate()).toBe(12)
  })

  it('uses Jan 1 – Dec 31 for the current year', () => {
    global.Date = class extends realDate {
      constructor(...args: ConstructorParameters<typeof realDate>) {
        if (args.length === 0) {
          super(2026, 5, 20, 8, 0, 0)
          return
        }
        super(...args)
      }
    } as DateConstructor

    const { start, end } = resolveAdminTransactionDateRange('year')
    expect(start?.getMonth()).toBe(0)
    expect(start?.getDate()).toBe(1)
    expect(end?.getMonth()).toBe(11)
    expect(end?.getDate()).toBe(31)
  })
})
