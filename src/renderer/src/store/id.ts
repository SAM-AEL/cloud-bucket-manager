/**
 * Short unique id for toasts and list keys. Uses crypto.randomUUID when
 * available and falls back to a counter so the renderer also works in tests.
 */
export function nanoid(): string {
  const cryptoRef = globalThis.crypto
  if (cryptoRef?.randomUUID) return cryptoRef.randomUUID().slice(0, 8)
  counter += 1
  return `id_${Date.now().toString(36)}_${counter.toString(36)}`
}

let counter = 0
