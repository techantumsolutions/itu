import crypto from 'crypto'
import { redisExec } from '@/lib/cache/redis'

const OTP_TTL_SECONDS = 5 * 60

function otpKey(phone: string) {
  return `otp:v1:${phone}`
}
function usedKey(phone: string, otpHash: string) {
  return `otp_used:v1:${phone}:${otpHash}`
}
function hashOtp(otp: string) {
  return crypto.createHash('sha256').update(otp).digest('hex')
}

export function generateOtp(): string {
  return String(crypto.randomInt(100000, 1000000))
}

export async function storeOtp(phone: string, otp: string): Promise<void> {
  const otpHash = hashOtp(otp)
  await redisExec((redis) => redis.set(otpKey(phone), otpHash, 'EX', OTP_TTL_SECONDS))
}

export async function verifyOtp(phone: string, otp: string): Promise<{ ok: boolean; reason?: string }> {
  const providedHash = hashOtp(otp)
  const key = otpKey(phone)
  const used = usedKey(phone, providedHash)

  // Atomic:
  // - must match stored hash
  // - must not be reused
  // - delete OTP on success
  const script = `
    local current = redis.call("GET", KEYS[1])
    if not current then return 0 end
    if current ~= ARGV[1] then return -1 end
    local wasUsed = redis.call("SETNX", KEYS[2], "1")
    if wasUsed == 0 then return -2 end
    redis.call("EXPIRE", KEYS[2], ARGV[2])
    redis.call("DEL", KEYS[1])
    return 1
  `

  const reuseTtlSeconds = String(24 * 60 * 60)
  const result = (await redisExec((redis) =>
    redis.eval(script, 2, key, used, providedHash, reuseTtlSeconds),
  )) as number

  if (result === 1) return { ok: true }
  if (result === 0) return { ok: false, reason: 'expired' }
  if (result === -1) return { ok: false, reason: 'invalid' }
  if (result === -2) return { ok: false, reason: 'reused' }
  return { ok: false, reason: 'invalid' }
}

