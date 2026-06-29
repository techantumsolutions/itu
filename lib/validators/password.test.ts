import { getPasswordRequirementChecks, isStrongPassword, validatePassword } from '@/lib/validators/password'

describe('password validator', () => {
  const valid = ['Tech@123', 'Strong#2026', 'Admin@001']

  const invalid = ['password', 'PASSWORD', 'Password', 'Password1', 'password@', 'PASS123@', 'abc12']

  it.each(valid)('accepts valid password %s', (password) => {
    expect(isStrongPassword(password)).toBe(true)
    expect(validatePassword(password).valid).toBe(true)
  })

  it.each(invalid)('rejects invalid password %s', (password) => {
    expect(isStrongPassword(password)).toBe(false)
    expect(validatePassword(password).valid).toBe(false)
    expect(validatePassword(password).message).toBeTruthy()
  })

  it('marks individual requirement checks for weak password', () => {
    const checks = getPasswordRequirementChecks('pass1')
    expect(checks.find((c) => c.key === 'uppercase')?.satisfied).toBe(false)
    expect(checks.find((c) => c.key === 'lowercase')?.satisfied).toBe(true)
    expect(checks.find((c) => c.key === 'digit')?.satisfied).toBe(true)
    expect(checks.find((c) => c.key === 'special')?.satisfied).toBe(false)
    expect(checks.find((c) => c.key === 'minLength')?.satisfied).toBe(false)
  })
})
