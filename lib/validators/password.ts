/** Strong password rules for user account passwords (create / update / reset only — not login). */

export const STRONG_PASSWORD_REGEX =
  /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&^#()_\-+=])[A-Za-z\d@$!%*?&^#()_\-+=]{6,}$/

export const PASSWORD_SPECIAL_CHARS_REGEX = /[@$!%*?&^#()_\-+=]/

export const PASSWORD_API_ERROR_MESSAGE =
  'Password must contain at least one uppercase letter, one lowercase letter, one number, one special character and be at least 6 characters long.'

export const PASSWORD_REQUIREMENTS_LINES = [
  'At least one uppercase letter',
  'At least one lowercase letter',
  'At least one number',
  'At least one special character',
  'Minimum 6 characters',
] as const

export const PASSWORD_REQUIREMENTS_HEADING = 'Password must contain:'

export type PasswordRequirementKey = 'uppercase' | 'lowercase' | 'digit' | 'special' | 'minLength'

export type PasswordRequirementCheck = {
  key: PasswordRequirementKey
  label: string
  satisfied: boolean
}

export type PasswordValidationResult = {
  valid: boolean
  message?: string
}

export function getPasswordRequirementChecks(password: string): PasswordRequirementCheck[] {
  return [
    {
      key: 'uppercase',
      label: 'At least one uppercase letter',
      satisfied: /[A-Z]/.test(password),
    },
    {
      key: 'lowercase',
      label: 'At least one lowercase letter',
      satisfied: /[a-z]/.test(password),
    },
    {
      key: 'digit',
      label: 'At least one number',
      satisfied: /\d/.test(password),
    },
    {
      key: 'special',
      label: 'At least one special character',
      satisfied: PASSWORD_SPECIAL_CHARS_REGEX.test(password),
    },
    {
      key: 'minLength',
      label: 'Minimum 6 characters',
      satisfied: password.length >= 6,
    },
  ]
}

export function isStrongPassword(password: string): boolean {
  return STRONG_PASSWORD_REGEX.test(password)
}

export function validatePassword(password: string): PasswordValidationResult {
  if (!password || !isStrongPassword(password)) {
    return { valid: false, message: PASSWORD_API_ERROR_MESSAGE }
  }
  return { valid: true }
}

/** Format requirements for inline form error display. */
export function formatPasswordRequirementsError(): string {
  return `${PASSWORD_REQUIREMENTS_HEADING}\n\n${PASSWORD_REQUIREMENTS_LINES.map((line) => `• ${line}`).join('\n')}`
}
