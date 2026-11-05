// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { ERROR_MARKER, ERROR_PAYLOAD_SEP } from '../src/shared/ipc'
import type { S3ErrorInfo } from '../src/shared/types'
import { errorHint, errorMessage, unwrapError } from '../src/renderer/src/lib/bridge'

/**
 * Mirrors toTransport() in src/main/ipc/handlers.ts.
 *
 * Electron serializes an ipcMain rejection with the structured clone algorithm,
 * which keeps only `message` and `stack` on an Error. Attaching the S3ErrorInfo
 * as a custom property therefore silently loses it, which is why the payload is
 * encoded into the message instead. These tests pin both halves of that round
 * trip, and guard against Electron's wrapper leaking into the UI.
 */
function encode(info: S3ErrorInfo): Error {
  const payload = btoa(
    new TextEncoder().encode(JSON.stringify(info)).reduce((binary, byte) => {
      return binary + String.fromCharCode(byte)
    }, '')
  )
  return new Error(`${ERROR_MARKER}${info.message}${ERROR_PAYLOAD_SEP}${payload}`)
}

describe('IPC error transport', () => {
  const info: S3ErrorInfo = {
    name: 'AccessDenied',
    message: 'Access Denied',
    code: 'AccessDenied',
    status: 403,
    hint: 'These credentials can read and write objects but cannot list buckets.'
  }

  it('recovers the message and hint across the process boundary', () => {
    const result = unwrapError(encode(info))
    expect(result.message).toBe('Access Denied')
    expect(result.hint).toBe(info.hint)
    expect(result.code).toBe('AccessDenied')
  })

  it('preserves non-ASCII hints, which a naive latin-1 decode would mangle', () => {
    const unicode: S3ErrorInfo = { name: 'X', message: 'No — café ☕' }
    expect(unwrapError(encode(unicode)).message).toBe('No — café ☕')
  })

  it('strips Electron’s "Error invoking remote method" wrapper', () => {
    // The exact shape a user reported before the transport was fixed.
    const wrapped = new Error(`Error invoking remote method 'buckets:list': Error: Access Denied`)
    expect(errorMessage(wrapped)).toBe('Access Denied')
  })

  it('never leaks the marker or payload into user-facing text', () => {
    const message = errorMessage(encode(info))
    expect(message).not.toContain(ERROR_MARKER)
    expect(message).not.toContain(ERROR_PAYLOAD_SEP)
  })

  it('falls back cleanly for unknown or corrupt payloads', () => {
    expect(errorMessage(new Error(`${ERROR_MARKER}broken`))).toBe('broken')
    expect(errorMessage(new Error(`${ERROR_MARKER}x || not-base64!!`))).toContain('not-base64')
    expect(errorMessage(undefined)).toBe('Something went wrong.')
  })

  it('exposes the hint through the convenience accessor', () => {
    const thrown = new Error('wrapped')
    void thrown
    // hint is read straight off the unwrapped result
    expect(errorHint(encode(info))).toBe(info.hint)
    expect(errorHint(new Error('plain'))).toBeUndefined()
  })
})
