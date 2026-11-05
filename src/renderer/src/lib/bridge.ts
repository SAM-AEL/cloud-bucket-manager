import type { R2MApi } from '@shared/ipc'
import { ERROR_MARKER, ERROR_PAYLOAD_SEP } from '@shared/ipc'
import type { S3ErrorInfo } from '@shared/types'

/**
 * Typed access to the preload bridge.
 *
 * The bridge is absent when the UI is rendered outside Electron (unit tests,
 * Storybook-style harnesses), so every call site goes through this guard and
 * gets a clear error instead of an undefined-property crash.
 */
export function bridge(): R2MApi {
  const api = window.r2m
  if (!api) {
    throw new Error('The desktop bridge is unavailable. Run this inside the app.')
  }
  return api
}

/**
 * Copy text to the clipboard via the main process. The renderer clipboard API
 * is not reliably available for file:// origins, so we always go through IPC.
 */
export async function copyToClipboard(text: string): Promise<void> {
  await bridge().shell.copy(text)
}

export function hasBridge(): boolean {
  return typeof window !== 'undefined' && Boolean(window.r2m)
}

/** Electron prefixes rejections from ipcMain handlers; strip it for display. */
function stripElectronPrefix(message: string): string {
  return message.replace(/^Error invoking remote method '[^']*':\s*/, '')
}

/**
 * Unwrap an S3 error encoded by the main process. Electron's structured clone
 * drops custom Error properties, so the payload travels base64-encoded inside
 * the message (see ERROR_MARKER). Anything unrecognised degrades to a clean
 * message rather than leaking the IPC wrapper text to the user.
 */
export function unwrapError(error: unknown): {
  message: string
  hint?: string
  code?: string
} {
  // Already normalized by call() in this process: reuse the payload directly.
  // Without this, re-wrapping an error would drop its hint, because the
  // marker has already been stripped from the message.
  const attached = (error as { s3?: S3ErrorInfo })?.s3
  if (attached && typeof attached.message === 'string') {
    return { message: attached.message, hint: attached.hint, code: attached.code }
  }

  const raw = error instanceof Error ? error.message : typeof error === 'string' ? error : ''

  const decoded = ((): { message: string; hint?: string; code?: string } | null => {
    if (!raw.startsWith(ERROR_MARKER)) return null
    const body = raw.slice(ERROR_MARKER.length)
    const index = body.indexOf(ERROR_PAYLOAD_SEP)
    if (index === -1) return null
    try {
      // atob yields latin-1, so re-decode the bytes as UTF-8 for correct hints.
      const binary = atob(body.slice(index + ERROR_PAYLOAD_SEP.length))
      const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0))
      const info = JSON.parse(new TextDecoder().decode(bytes)) as S3ErrorInfo
      return { message: info.message, hint: info.hint, code: info.code }
    } catch {
      return null
    }
  })()

  if (decoded) return decoded

  // Fallback for anything we could not decode: strip both Electron's wrapper
  // and our own marker, so neither internal detail reaches the user.
  const cleaned = raw
    ? stripElectronPrefix(raw).replace(`${ERROR_MARKER}`, '')
    : 'Something went wrong.'
  const message = cleaned.replace(/^Error:\s*/, '').trim()
  return { message: message || 'Something went wrong.' }
}

/** Run an IPC call, normalizing any transport error into a usable shape. */
export async function call<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation()
  } catch (error) {
    const { message, hint, code } = unwrapError(error)
    const info: S3ErrorInfo = { name: 'Error', message, hint, code }
    throw Object.assign(new Error(message), { s3: info })
  }
}

export function errorMessage(error: unknown): string {
  return unwrapError(error).message
}

export function errorHint(error: unknown): string | undefined {
  return unwrapError(error).hint
}
