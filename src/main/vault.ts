import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { hostname, userInfo } from 'node:os'

/**
 * Machine-bound key derivation.
 *
 * Electron's safeStorage is the preferred backend, but on Linux it silently
 * falls back to the "basic_text" backend, which performs NO encryption — it is
 * just a passthrough to the filesystem. Persisting secrets through that would
 * be equivalent to storing them in plaintext.
 *
 * So when the OS keyring is genuinely unavailable we derive our own key from a
 * stable, machine-specific identity and encrypt with AES-256-GCM. The file is
 * then useless if copied to another machine or read by another user account,
 * and it is still real encryption at rest for anyone without access to those
 * identities.
 *
 * This is defence-in-depth, not a replacement for the keyring: an attacker who
 * can already read /etc/machine-id and run code as this user can also read the
 * process memory. When a real keychain is present we always use it instead.
 */

const FILE_MAGIC = 'R2MV1'
const SALT_BYTES = 16
const IV_BYTES = 12
const KEY_BYTES = 32
/**
 * N = 2^14 with r = 8 costs 128 * N * r = ~16 MB of scrypt state.
 *
 * 2^15 was the original choice but it needs ~33 MB, which exceeds Node's
 * default OpenSSL maxmem of 32 MB and throws at runtime the first time a
 * credential is saved. We pass maxmem explicitly as well, so the parameter is
 * asserted rather than left to an environment-dependent default.
 *
 * The derived key is already high-entropy (a machine identifier), so a 16k
 * iteration cost is ample here — scrypt is not stretching weak user input.
 */
const SCRYPT_N = 1 << 14
const SCRYPT_MAXMEM = 64 * 1024 * 1024

/** Namespaces the derived key to this app so one app cannot decrypt another. */
const APP_CONTEXT = 'r2-manager::credentials::v1'

let cachedIdentity: string | null = null
let cachedKey: Buffer | null = null
/** Which platform the cached identity was derived for. */
let cachedPlatform: string | null = null

function readTrimmed(paths: string[]): string | null {
  for (const path of paths) {
    try {
      const value = readFileSync(path, 'utf8').trim()
      if (value) return value
    } catch {
      /* try the next candidate */
    }
  }
  return null
}

/** Query a registry key on Windows without shelling out to a .reg file. */
function readWindowsMachineGuid(): string | null {
  try {
    const out = execFileSync(
      'reg',
      ['query', 'HKLM\\SOFTWARE\\Microsoft\\Cryptography', '/v', 'MachineGuid'],
      { encoding: 'utf8', timeout: 4000, windowsHide: true }
    )
    const match = out.match(/MachineGuid\s+REG_SZ\s+(\S+)/i)
    return match?.[1] ?? null
  } catch {
    return null
  }
}

/** The IOPlatformUUID is the closest thing macOS offers to a machine id. */
function readMacPlatformUuid(): string | null {
  try {
    const out = execFileSync('ioreg', ['-rd1', '-c', 'IOPlatformExpertDevice'], {
      encoding: 'utf8',
      timeout: 4000
    })
    const match = out.match(/"IOPlatformUUID"\s*=\s*"([^"]+)"/)
    return match?.[1] ?? null
  } catch {
    return null
  }
}

/**
 * Stable per-machine, per-user identity. Resolved once and cached; every
 * candidate is optional so this degrades rather than throwing.
 */
export function machineIdentity(platform: NodeJS.Platform = process.platform): string {
  // Keyed by platform so a caller asking about a different platform is never
  // handed a cached identity derived for another one.
  if (cachedIdentity && cachedPlatform === platform) return cachedIdentity

  let machineId: string | null = null
  if (platform === 'linux') {
    machineId = readTrimmed(['/etc/machine-id', '/var/lib/dbus/machine-id'])
  } else if (platform === 'darwin') {
    machineId = readMacPlatformUuid()
  } else if (platform === 'win32') {
    machineId = readWindowsMachineGuid()
  }

  let userName = 'unknown-user'
  try {
    userName = userInfo().username
  } catch {
    /* keep the fallback */
  }

  const parts = [machineId ?? `host:${hostname()}`, userName, platform]
  cachedIdentity = parts.join('|')
  cachedPlatform = platform
  return cachedIdentity
}

/**
 * Format: `R2MV1 | base64(salt) | base64(iv) | base64(ciphertext+tag)`
 * AAD binds the ciphertext to this app context so a blob cannot be lifted into
 * another application.
 */
export interface VaultFile {
  salt: string
  iv: string
  data: string
}

function deriveKey(salt: Buffer): Buffer {
  if (!cachedKey) {
    const identity = `${APP_CONTEXT}::${machineIdentity()}`
    cachedKey = scryptSync(identity, salt, KEY_BYTES, {
      N: SCRYPT_N,
      r: 8,
      p: 1,
      maxmem: SCRYPT_MAXMEM
    })
  }
  return cachedKey
}

export function encryptJson(payload: unknown, salt?: Buffer): string {
  const useSalt = salt ?? randomBytes(SALT_BYTES)
  const iv = randomBytes(IV_BYTES)
  const cipher = createCipheriv('aes-256-gcm', deriveKey(useSalt), iv)
  cipher.setAAD(Buffer.from(APP_CONTEXT))
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(payload), 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return [FILE_MAGIC, useSalt.toString('base64'), iv.toString('base64'), Buffer.concat([encrypted, tag]).toString('base64')].join('|')
}

/** Returns undefined when the file is absent, tampered with, or from another machine. */
export function decryptJson(blob: string): unknown | undefined {
  const parts = blob.trim().split('|')
  if (parts.length !== 4 || parts[0] !== FILE_MAGIC) return undefined
  const [, saltB64, ivB64, dataB64] = parts
  try {
    const salt = Buffer.from(saltB64, 'base64')
    const iv = Buffer.from(ivB64, 'base64')
    const raw = Buffer.from(dataB64, 'base64')
    const body = raw.subarray(0, raw.length - 16)
    const tag = raw.subarray(raw.length - 16)
    const decipher = createDecipheriv('aes-256-gcm', deriveKey(salt), iv)
    decipher.setAAD(Buffer.from(APP_CONTEXT))
    decipher.setAuthTag(tag)
    return JSON.parse(Buffer.concat([decipher.update(body), decipher.final()]).toString('utf8'))
  } catch {
    // Wrong machine, wrong user, or a tampered file.
    return undefined
  }
}

/** Test seam: allows isolating the derived key between cases. */
export function resetKeyCache(): void {
  cachedKey = null
  cachedIdentity = null
  cachedPlatform = null
}
