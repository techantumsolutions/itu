import { formatFetchError } from '@/lib/network/format-fetch-error'

describe('formatFetchError', () => {
  it('extracts ENOTFOUND from fetch failed cause', () => {
    const err = new TypeError('fetch failed', {
      cause: Object.assign(new Error('getaddrinfo ENOTFOUND preprod-dvs-api.dtone.com'), {
        errno: -3008,
        code: 'ENOTFOUND',
        syscall: 'getaddrinfo',
        hostname: 'preprod-dvs-api.dtone.com',
      }),
    })
    const formatted = formatFetchError(err)
    expect(formatted.code).toBe('ENOTFOUND')
    expect(formatted.hostname).toBe('preprod-dvs-api.dtone.com')
    expect(formatted.message).toContain('ENOTFOUND')
  })
})
