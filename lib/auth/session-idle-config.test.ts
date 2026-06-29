import { getSessionIdleTimeoutMinutes } from '@/lib/auth/session-idle-config'

describe('session-idle-config', () => {
  const original = process.env.SESSION_IDLE_TIMEOUT_MINUTES

  afterEach(() => {
    if (original === undefined) delete process.env.SESSION_IDLE_TIMEOUT_MINUTES
    else process.env.SESSION_IDLE_TIMEOUT_MINUTES = original
  })

  it('defaults to 20 minutes', () => {
    delete process.env.SESSION_IDLE_TIMEOUT_MINUTES
    expect(getSessionIdleTimeoutMinutes()).toBe(20)
  })

  it('reads SESSION_IDLE_TIMEOUT_MINUTES from env', () => {
    process.env.SESSION_IDLE_TIMEOUT_MINUTES = '45'
    expect(getSessionIdleTimeoutMinutes()).toBe(45)
  })

  it('falls back for invalid values', () => {
    process.env.SESSION_IDLE_TIMEOUT_MINUTES = '0'
    expect(getSessionIdleTimeoutMinutes()).toBe(20)
  })
})
