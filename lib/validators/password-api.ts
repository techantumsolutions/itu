import { NextResponse } from 'next/server'
import { PASSWORD_API_ERROR_MESSAGE, validatePassword } from '@/lib/validators/password'

/** Shared 400 response for invalid new passwords in API routes. */
export function passwordValidationErrorResponse() {
  return NextResponse.json(
    { ok: false, success: false, error: PASSWORD_API_ERROR_MESSAGE, message: PASSWORD_API_ERROR_MESSAGE },
    { status: 400 },
  )
}

export function assertStrongPassword(password: string): NextResponse | null {
  const result = validatePassword(password)
  if (!result.valid) return passwordValidationErrorResponse()
  return null
}
