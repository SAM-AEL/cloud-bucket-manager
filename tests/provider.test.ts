import { describe, expect, it } from 'vitest'
import {
  normalizeEndpoint,
  validateBucketName,
  validateEndpoint,
  validateKey
} from '../src/main/s3/provider'
import { toErrorInfo } from '../src/main/s3/errors'

/**
 * Main-process validation rules. These run without a network by design —
 * every one of them guards a value before it reaches the S3 SDK.
 */

describe('endpoint handling', () => {
  it('adds a scheme and strips trailing slashes', () => {
    expect(normalizeEndpoint('abc.r2.cloudflarestorage.com')).toBe(
      'https://abc.r2.cloudflarestorage.com'
    )
    expect(normalizeEndpoint('https://x.com/')).toBe('https://x.com')
    expect(normalizeEndpoint('  ')).toBe('')
  })

  it('rejects malformed endpoints', () => {
    expect(validateEndpoint('')).toBe('Endpoint is required')
    expect(validateEndpoint('ftp://x.com')).toContain('http')
    expect(validateEndpoint('not a url')).toBe('Endpoint is not a valid URL')
    expect(validateEndpoint('https://ok.com')).toBeNull()
  })
})

describe('bucket name validation', () => {
  it('accepts valid names', () => {
    expect(validateBucketName('my-bucket')).toBeNull()
    expect(validateBucketName('bucket.with.dots')).toBeNull()
    expect(validateBucketName('bucket123')).toBeNull()
  })

  it('rejects invalid names', () => {
    expect(validateBucketName('ab')).toContain('3-63')
    expect(validateBucketName('My_Bucket')).toContain('lowercase')
    expect(validateBucketName('192.168.0.1')).toContain('IP address')
    expect(validateBucketName('a..b')).toContain('consecutive dots')
    expect(validateBucketName('')).toBe('Bucket name is required')
  })
})

describe('key validation', () => {
  it('requires a non-empty key that does not start with a slash', () => {
    expect(validateKey('path/to/file.txt')).toBeNull()
    expect(validateKey('')).toBe('Key is required')
    expect(validateKey('/leading')).toContain('slash')
  })
})

describe('error mapping', () => {
  it('attaches an actionable hint for common S3 failures', () => {
    const info = toErrorInfo({
      name: 'AccessDenied',
      message: 'Access Denied RequestId: ABC123 HostId: xyz'
    })
    expect(info.code).toBe('AccessDenied')
    expect(info.hint).toContain('lack permission')
    // The noisy request id is stripped from the user-facing message.
    expect(info.message).not.toContain('ABC123')
  })

  it('never throws on unknown input', () => {
    expect(toErrorInfo(undefined).message).toBe('Something went wrong.')
  })
})
