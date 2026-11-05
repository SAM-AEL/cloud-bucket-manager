import { app, safeStorage } from 'electron'
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { getDataDir } from './store'
import { decryptJson, encryptJson } from './vault'

/**
 * Credential storage, tiered by how much protection the OS actually provides.
 *
 *   1. `keychain`  — macOS Keychain             (bound to the login keychain)
 *   2. `dpapi`     — Windows DPAPI              (bound to the user account)
 *   3. `libsecret` — GNOME Keyring / KWallet    (a real system keyring)
 *   4. `machine`   — AES-256-GCM, machine-bound (fallback, see vault.ts)
 *   5. `memory`    — never written to disk      (last resort, session only)
 *
 * Tier 4 is the reason this file exists. On Linux, Electron's safeStorage
 * reports `basic_text` when no keyring daemon is reachable, and that backend
 * performs NO encryption — it is a passthrough to the filesystem. Treating it
 * as "available" would silently persist plaintext. Detecting it and falling
 * back to machine-bound AES means credentials survive a restart on every
 * platform, not just where a desktop keyring happens to be installed.
 */

export type VaultMethod = 'keychain' | 'dpapi' | 'libsecret' | 'machine' | 'memory'

export interface SecurityDescription {
  encryptionAvailable: boolean
  backend?: string
  method: VaultMethod
  /** True when secrets are still present after the app is closed. */
  persistent: boolean
  /** Human-readable label for the settings panel. */
  label: string
}

let secretsPath: string | null = null
/** Last-resort store. Never touches disk. */
const memoryFallback = new Map<string, string>()
/** Cache so we do not re-read and re-decrypt on every single operation. */
let cache: Record<string, string> | null = null

function path(): string {
  if (!secretsPath) secretsPath = join(getDataDir(), 'credentials.vault')
  return secretsPath
}

/** The backend safeStorage actually selected, or undefined if it cannot say. */
function rawBackend(): string | undefined {
  const withSelection = safeStorage as unknown as {
    getSelectedStorageBackend?: () => string
  }
  try {
    return withSelection.getSelectedStorageBackend?.()
  } catch {
    return undefined
  }
}

/**
 * Map an Electron storage backend to a protection tier.
 * `basic_text` maps to 'machine': usable, but only through our own AES layer.
 */
function classify(backend: string | undefined): VaultMethod | 'none' {
  if (!backend || !safeStorage.isEncryptionAvailable()) return 'none'
  switch (backend) {
    case 'keychain':
      return 'keychain'
    case 'dpapi':
      return 'dpapi'
    case 'gnome_libsecret':
    case 'kwallet':
      return 'libsecret'
    case 'basic_text':
      return 'machine'
    default:
      return 'none'
  }
}

/** The tier we can use in principle: classify, or our own AES if none exists. */
export function activeMethod(): VaultMethod {
  const classified = classify(rawBackend())
  return classified === 'none' ? 'machine' : classified
}

/**
 * The tier actually in effect. Normally `activeMethod()`, but it degrades to
 * `memory` if the vault file cannot be written (read-only or full disk) so the
 * app keeps working for the session instead of throwing.
 */
let effective: VaultMethod | null = null

function method(): VaultMethod {
  return effective ?? activeMethod()
}

function load(): Record<string, string> {
  if (cache) return cache
  const file = path()
  if (!existsSync(file)) {
    cache = {}
    return cache
  }
  try {
    const blob = readFileSync(file, 'utf8')
    const decoded =
      activeMethod() === 'machine'
        ? decryptJson(blob)
        : safeStorage.decryptString(Buffer.from(blob, 'base64'))
    const parsed = decoded as Record<string, string> | undefined
    cache = parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    // Undecryptable: different machine, keychain reset, or corruption.
    // Start clean and let the user re-enter credentials rather than crash.
    cache = {}
  }
  return cache
}

function save(data: Record<string, string>): VaultMethod {
  const tier = method()

  const writeToMemory = (): VaultMethod => {
    memoryFallback.clear()
    for (const [key, value] of Object.entries(data)) memoryFallback.set(key, value)
    cache = { ...data }
    effective = 'memory'
    return 'memory'
  }

  try {
    mkdirSync(getDataDir(), { recursive: true })
    const file = path()
    const tmp = `${file}.${process.pid}.tmp`
    const contents =
      tier === 'machine'
        ? encryptJson(data)
        : safeStorage.encryptString(JSON.stringify(data)).toString('base64')

    // 0600: readable only by the owning user, even before encryption.
    writeFileSync(tmp, contents, { encoding: 'utf8', mode: 0o600 })
    renameSync(tmp, file)
  } catch {
    // Read-only or full disk. Stay usable for this session and say so in the
    // settings panel rather than losing the user's credentials outright.
    return writeToMemory()
  }

  cache = { ...data }
  return tier
}

export const secrets = {
  /** The tier currently in effect, including any runtime degradation. */
  method,

  isPersistent(): boolean {
    return method() !== 'memory'
  },

  set(profileId: string, secret: string): VaultMethod {
    return save({ ...load(), [profileId]: secret })
  },

  get(profileId: string): string | undefined {
    if (method() === 'memory') return memoryFallback.get(profileId)
    return load()[profileId]
  },

  remove(profileId: string): void {
    const data = { ...load() }
    delete data[profileId]
    save(data)
    memoryFallback.delete(profileId)
  },

  describe(): SecurityDescription {
    const tier = method()
    const labels: Record<VaultMethod, string> = {
      keychain: 'macOS Keychain',
      dpapi: 'Windows DPAPI (user account)',
      libsecret: 'System keyring (GNOME / KWallet)',
      machine: 'AES-256-GCM, bound to this machine',
      memory: 'Memory only — could not be written to disk'
    }
    return {
      encryptionAvailable: tier !== 'memory',
      backend: rawBackend(),
      method: tier,
      persistent: tier !== 'memory',
      label: labels[tier]
    }
  }
}

/** Best-effort call so the keyring is reachable before we use it on Linux. */
export async function warmUpKeychain(): Promise<void> {
  if (process.platform !== 'linux') return
  try {
    await app.whenReady()
    safeStorage.isEncryptionAvailable()
    rawBackend()
  } catch {
    /* reported later via security:info */
  }
}
