import { app } from 'electron'
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { AppSettings, ProfileMeta, WindowState } from '@shared/types'

/** userData is only available after the app is ready. */
let dataDir: string | null = null

export function initDataPaths(): void {
  dataDir = app.getPath('userData')
  mkdirSync(dataDir, { recursive: true })
}

export function getDataDir(): string {
  if (!dataDir) initDataPaths()
  return dataDir as string
}

function settingsPath(): string {
  return join(getDataDir(), 'settings.json')
}

function profilesPath(): string {
  return join(getDataDir(), 'profiles.json')
}

export const DEFAULT_SETTINGS: AppSettings = {
  theme: 'dark',
  density: 'comfortable',
  showHiddenFiles: false,
  confirmDeletes: true,
  maxParallelTransfers: 3,
  window: { width: 1440, height: 900, maximized: false }
}

/**
 * Atomic JSON write: write to a sibling temp file then rename. Renames are
 * atomic on the same filesystem, so a crash mid-write cannot corrupt the file.
 */
function writeJsonAtomic(path: string, value: unknown): void {
  const tmp = `${path}.${process.pid}.tmp`
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(tmp, JSON.stringify(value, null, 2), 'utf8')
  renameSync(tmp, path)
}

function readJson<T>(path: string, fallback: T): T {
  try {
    if (!existsSync(path)) return fallback
    const raw = readFileSync(path, 'utf8')
    if (!raw.trim()) return fallback
    return JSON.parse(raw) as T
  } catch {
    // Corrupt file: keep a copy for the user to inspect rather than silently
    // overwriting whatever was there.
    try {
      renameSync(path, `${path}.corrupt-${Date.now()}`)
    } catch {
      /* best effort */
    }
    return fallback
  }
}

export const settings = {
  get(): AppSettings {
    const stored = readJson<Partial<AppSettings>>(settingsPath(), {})
    // Build explicitly rather than spreading, so a partially-written settings
    // file can never produce an undefined width/height.
    const saved = stored.window
    const window: WindowState = {
      width: saved?.width ?? DEFAULT_SETTINGS.window!.width,
      height: saved?.height ?? DEFAULT_SETTINGS.window!.height,
      x: saved?.x,
      y: saved?.y,
      maximized: saved?.maximized ?? false
    }
    return { ...DEFAULT_SETTINGS, ...stored, window }
  },
  patch(patch: Partial<AppSettings>): AppSettings {
    const current = this.get()
    const merged: AppSettings = { ...current, ...patch }
    if (patch.window) {
      const base = current.window ?? DEFAULT_SETTINGS.window
      merged.window = { ...base, ...patch.window }
    }
    writeJsonAtomic(settingsPath(), merged)
    return merged
  }
}

export const profileStore = {
  list(): ProfileMeta[] {
    return readJson<ProfileMeta[]>(profilesPath(), [])
  },
  find(id: string): ProfileMeta | undefined {
    return this.list().find((p) => p.id === id)
  },
  insert(profile: ProfileMeta): ProfileMeta {
    const all = this.list()
    all.push(profile)
    writeJsonAtomic(profilesPath(), all)
    return profile
  },
  update(id: string, patch: Partial<ProfileMeta>): ProfileMeta {
    const all = this.list()
    const index = all.findIndex((p) => p.id === id)
    if (index === -1) throw new Error(`Profile ${id} not found`)
    all[index] = { ...all[index], ...patch, id }
    writeJsonAtomic(profilesPath(), all)
    return all[index]
  },
  remove(id: string): void {
    writeJsonAtomic(
      profilesPath(),
      this.list().filter((p) => p.id !== id)
    )
  }
}
