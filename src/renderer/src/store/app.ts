import { create } from 'zustand'
import type { AppSettings, ProviderCaps } from '@shared/types'
import type { SecurityInfo } from '@shared/ipc'
import { bridge, call } from '@/lib/bridge'

export type Theme = AppSettings['theme']
export type Density = AppSettings['density']

interface AppState {
  settings: AppSettings
  security?: SecurityInfo
  sidebarCollapsed: boolean
  inspectorOpen: boolean
  commandPaletteOpen: boolean
  booted: boolean

  boot: () => Promise<void>
  patchSettings: (patch: Partial<AppSettings>) => Promise<void>
  setTheme: (theme: Theme) => Promise<void>
  toggleTheme: () => Promise<void>
  toggleSidebar: () => void
  setInspectorOpen: (open: boolean) => void
  setCommandPaletteOpen: (open: boolean) => void
  setCaps: (caps: ProviderCaps) => void
  caps: ProviderCaps
}

const DEFAULT_CAPS: ProviderCaps = {
  objectTagging: false,
  bucketAcl: false,
  objectLock: false,
  lifecycleRules: false,
  presignedUrls: true,
  multipart: true,
  batchDelete: true,
  serverSideEncryption: false,
  bucketCreation: true
}

/** Apply the theme + density to <html> so Tailwind's dark: variant tracks it. */
function applyTheme(theme: Theme): void {
  const root = document.documentElement
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
  const dark = theme === 'dark' || (theme === 'system' && prefersDark)
  root.classList.toggle('dark', dark)
  root.classList.toggle('light', !dark)
}

export const useAppStore = create<AppState>((set, get) => ({
  settings: {
    theme: 'dark',
    density: 'comfortable',
    showHiddenFiles: false,
    confirmDeletes: true,
    maxParallelTransfers: 3
  },
  sidebarCollapsed: false,
  inspectorOpen: true,
  commandPaletteOpen: false,
  booted: false,
  caps: DEFAULT_CAPS,

  boot: async () => {
    const api = bridge()
    const [settings, security] = await Promise.all([
      call(() => api.settings.get()),
      call(() => api.security.info()).catch(() => undefined)
    ])
    applyTheme(settings.theme)
    document.documentElement.dataset.density = settings.density
    set({ settings, security, booted: true })

    // Follow the OS when the user asked for "system".
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
      if (get().settings.theme === 'system') applyTheme('system')
    })
  },

  patchSettings: async (patch) => {
    const next = await call(() => bridge().settings.patch(patch))
    if (patch.theme) applyTheme(next.theme)
    if (patch.density) document.documentElement.dataset.density = next.density
    set({ settings: next })
  },

  setTheme: async (theme) => {
    applyTheme(theme)
    set({ settings: { ...get().settings, theme } })
    await get().patchSettings({ theme })
  },

  toggleTheme: async () => {
    const current = get().settings.theme
    const next: Theme = current === 'dark' ? 'light' : 'dark'
    await get().setTheme(next)
  },

  toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
  setInspectorOpen: (open) => set({ inspectorOpen: open }),
  setCommandPaletteOpen: (open) => set({ commandPaletteOpen: open }),
  setCaps: (caps) => set({ caps })
}))
