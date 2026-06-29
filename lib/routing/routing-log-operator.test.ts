import { describe, expect, it } from '@jest/globals'
import { parseRoutingLogOperatorRef } from '@/lib/routing/repository'

describe('parseRoutingLogOperatorRef', () => {
  it('parses system:uuid prefix', () => {
    const id = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'
    expect(parseRoutingLogOperatorRef(`system:${id}`)).toEqual({
      uuid: id,
      raw: `system:${id}`,
    })
  })

  it('parses bare uuid', () => {
    const id = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'
    expect(parseRoutingLogOperatorRef(id)).toEqual({ uuid: id, raw: id })
  })

  it('treats slug as non-uuid raw', () => {
    expect(parseRoutingLogOperatorRef('airtel')).toEqual({ uuid: null, raw: 'airtel' })
  })
})
