import { describe, expect, it } from 'vitest'
import { isAccessDeniedError } from '../src/main/s3/errors'
import { knownBucketsFor } from '../src/main/s3/ops'

/**
 * Cloudflare R2 lets you scope an API token to specific buckets. Those tokens
 * carry the "Bucket Item Read/Write" permission groups, which allow object
 * operations but NOT the account-level ListBuckets call — so listing returns
 * AccessDenied even though the credentials are perfectly valid.
 *
 * These tests pin the detection and the fallback candidate selection.
 */

describe('access denied detection', () => {
  it('recognises the error spellings different providers use', () => {
    expect(isAccessDeniedError({ name: 'AccessDenied' })).toBe(true)
    expect(isAccessDeniedError({ Code: 'AccessDenied' })).toBe(true)
    expect(isAccessDeniedError({ code: 'Forbidden' })).toBe(true)
    expect(isAccessDeniedError({ $metadata: { httpStatusCode: 403 } })).toBe(true)
  })

  it('does not misclassify other failures', () => {
    expect(isAccessDeniedError({ name: 'SignatureDoesNotMatch' })).toBe(false)
    expect(isAccessDeniedError({ name: 'NetworkingError' })).toBe(false)
    expect(isAccessDeniedError({ $metadata: { httpStatusCode: 404 } })).toBe(false)
    expect(isAccessDeniedError(undefined)).toBe(false)
  })
})

describe('bucket-scoped fallback candidates', () => {
  it('uses the pinned bucket when there is one', () => {
    expect(knownBucketsFor({ defaultBucket: 'my-bucket' })).toEqual(['my-bucket'])
  })

  it('trims whitespace from a pasted bucket name', () => {
    expect(knownBucketsFor({ defaultBucket: '  my-bucket \n' })).toEqual(['my-bucket'])
  })

  it('has nothing to probe when no bucket is pinned', () => {
    expect(knownBucketsFor({})).toEqual([])
    expect(knownBucketsFor({ defaultBucket: '' })).toEqual([])
    expect(knownBucketsFor({ defaultBucket: '   ' })).toEqual([])
  })
})
