import { describe, expect, it, beforeEach, afterEach } from '@jest/globals'
import {
  CREDENTIALS_CIPHER_PREFIX,
  decryptProviderCredentials,
  encryptProviderCredentials,
  encryptProviderCredentialsForStorage,
  isEncryptedProviderCredentialsBlob,
  isPlaintextProviderCredentialsJson,
} from '@/lib/aggregator/credentials'

const TEST_KEY = 'test-master-key-for-provider-credentials-32chars!'

describe('provider credentials encryption', () => {
  const prevKey = process.env.MASTER_ENCRYPTION_KEY

  beforeEach(() => {
    process.env.MASTER_ENCRYPTION_KEY = TEST_KEY
  })

  afterEach(() => {
    if (prevKey === undefined) delete process.env.MASTER_ENCRYPTION_KEY
    else process.env.MASTER_ENCRYPTION_KEY = prevKey
  })

  it('encrypts and decrypts credentials round-trip', () => {
    const plain = { apiKey: 'secret-key', apiSecret: 'secret-value', token: 'tok' }
    const stored = encryptProviderCredentials(plain)
    expect(stored.startsWith(CREDENTIALS_CIPHER_PREFIX)).toBe(true)
    expect(stored).not.toContain('secret-key')

    const out = decryptProviderCredentials(stored, { providerId: 'p-1' })
    expect(out).toEqual(plain)
  })

  it('detects plaintext JSON blobs', () => {
    const plain = JSON.stringify({ apiKey: 'x' })
    expect(isPlaintextProviderCredentialsJson(plain)).toBe(true)
    expect(isEncryptedProviderCredentialsBlob(plain)).toBe(false)
  })

  it('decrypts legacy plaintext transparently', () => {
    const plain = { clientId: 'a', clientSecret: 'b' }
    const legacy = JSON.stringify(plain)
    expect(decryptProviderCredentials(legacy)).toEqual(plain)
  })

  it('encryptProviderCredentialsForStorage is idempotent on ciphertext', () => {
    const plain = { apiKey: 'k' }
    const once = encryptProviderCredentials(plain)
    const twice = encryptProviderCredentialsForStorage(once)
    expect(twice).toBe(once)
  })

  it('uses unique IV per encryption', () => {
    const plain = { apiKey: 'same' }
    const a = encryptProviderCredentials(plain)
    const b = encryptProviderCredentials(plain)
    expect(a).not.toBe(b)
    expect(decryptProviderCredentials(a)).toEqual(plain)
    expect(decryptProviderCredentials(b)).toEqual(plain)
  })
})
