import { beforeEach, describe, expect, it } from 'vitest'
import { decryptJson, encryptJson, machineIdentity, resetKeyCache } from '../src/main/vault'
import { normalizePrefix, validateKey } from '../src/main/s3/provider'

/**
 * The vault is the last line of defence for stored credentials, so these tests
 * check both that it round-trips and that it actually refuses to decrypt data
 * it was not produced for.
 */

describe('credential vault encryption', () => {
  beforeEach(() => {
    resetKeyCache()
  })

  it('round-trips a payload', () => {
    const payload = { profileA: 'super-secret-key', profileB: 'another-secret' }
    const blob = encryptJson(payload)
    expect(decryptJson(blob)).toEqual(payload)
  })

  it('never stores the plaintext in the output', () => {
    const blob = encryptJson({ profileA: 'super-secret-key' })
    expect(blob).not.toContain('super-secret-key')
    expect(blob).not.toContain('profileA')
    expect(blob.startsWith('R2MV1|')).toBe(true)
  })

  it('produces a different ciphertext each time (random IV and salt)', () => {
    const payload = { p: 'same-input' }
    expect(encryptJson(payload)).not.toBe(encryptJson(payload))
  })

  it('rejects a tampered ciphertext', () => {
    const blob = encryptJson({ p: 'value' })
    const parts = blob.split('|')
    // Flip characters in the body; the GCM tag must reject it.
    const body = Buffer.from(parts[3], 'base64')
    body[0] = body[0] ^ 0xff
    parts[3] = body.toString('base64')
    expect(decryptJson(parts.join('|'))).toBeUndefined()
  })

  it('rejects a blob whose header is not ours', () => {
    expect(decryptJson('not-a-vault|payload')).toBeUndefined()
    expect(decryptJson('')).toBeUndefined()
  })

  it('refuses to decrypt after the machine identity changes', () => {
    const blob = encryptJson({ p: 'value' })
    // Simulate the file being copied to another machine/user.
    resetKeyCache()
    const realIdentity = machineIdentity
    // Temporarily swap the platform to force a different derived key.
    const originalPlatform = process.platform
    Object.defineProperty(process, 'platform', { value: 'win32', configurable: true })
    try {
      resetKeyCache()
      expect(decryptJson(blob)).toBeUndefined()
    } finally {
      Object.defineProperty(process, 'platform', { value: originalPlatform, configurable: true })
      resetKeyCache()
      // Sanity check: with the identity restored it decrypts again.
      expect(decryptJson(blob)).toEqual({ p: 'value' })
      expect(typeof realIdentity()).toBe('string')
    }
  })
})

describe('machine identity', () => {
  it('returns a stable, non-empty string', () => {
    resetKeyCache()
    const first = machineIdentity('linux')
    const second = machineIdentity('linux')
    expect(first).toBe(second)
    expect(first.length).toBeGreaterThan(0)
  })

  it('differs per platform', () => {
    resetKeyCache()
    expect(machineIdentity('linux')).not.toBe(machineIdentity('darwin'))
  })
})

describe('sub-path normalization', () => {
  it('normalizes equivalent inputs to one canonical form', () => {
    expect(normalizePrefix('assets/images')).toBe('assets/images/')
    expect(normalizePrefix('/assets/images/')).toBe('assets/images/')
    expect(normalizePrefix('  assets\\images  ')).toBe('assets/images/')
    expect(normalizePrefix('assets')).toBe('assets/')
  })

  it('treats empty input as bucket root', () => {
    expect(normalizePrefix('')).toBeUndefined()
    expect(normalizePrefix('   ')).toBeUndefined()
    expect(normalizePrefix('/')).toBeUndefined()
    expect(normalizePrefix(undefined)).toBeUndefined()
  })

  it('refuses traversal segments instead of silently resolving them', () => {
    expect(normalizePrefix('a/../../etc')).toBeUndefined()
    expect(normalizePrefix('../secrets')).toBeUndefined()
    // A legitimate name containing dots is still allowed.
    expect(normalizePrefix('v1.2/assets')).toBe('v1.2/assets/')
  })
})

describe('key validation', () => {
  it('requires a non-empty key that does not start with a slash', () => {
    expect(validateKey('path/to/file.txt')).toBeNull()
    expect(validateKey('')).toBe('Key is required')
    expect(validateKey('/leading')).toContain('slash')
  })
})
