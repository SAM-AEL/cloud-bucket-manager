import { create } from 'zustand'
import type { ConnectionTest, ProfileInput, ProfileMeta, ProviderCaps } from '@shared/types'
import { bridge, call, errorMessage } from '@/lib/bridge'
import { useAppStore } from './app'
import { useObjectStore } from './objects'

interface ProfileState {
  profiles: ProfileMeta[]
  activeId?: string
  loading: boolean
  error?: string
  /** Per-profile health, refreshed by the connection test. */
  health: Record<string, ConnectionTest>

  load: () => Promise<void>
  create: (input: ProfileInput) => Promise<ProfileMeta>
  update: (id: string, patch: Partial<ProfileInput>) => Promise<void>
  remove: (id: string) => Promise<void>
  test: (id: string) => Promise<ConnectionTest>
  testDraft: (input: ProfileInput) => Promise<ConnectionTest>
  select: (id: string) => Promise<void>
  active: () => ProfileMeta | undefined
  capsFor: (provider: ProfileMeta['provider']) => Promise<ProviderCaps>
}

export const useProfileStore = create<ProfileState>((set, get) => ({
  profiles: [],
  loading: false,
  health: {},

  load: async () => {
    set({ loading: true, error: undefined })
    try {
      const profiles = await call(() => bridge().profiles.list())
      set({ profiles, loading: false })
      const current = get().activeId
      if (!current || !profiles.some((p) => p.id === current)) {
        const first = profiles[0]
        if (first) await get().select(first.id)
      }
    } catch (error) {
      set({ loading: false, error: errorMessage(error) })
    }
  },

  create: async (input) => {
    const profile = await call(() => bridge().profiles.create(input))
    set({ profiles: [...get().profiles, profile] })
    if (!get().activeId) await get().select(profile.id)
    return profile
  },

  update: async (id, patch) => {
    const updated = await call(() => bridge().profiles.update(id, patch))
    set({ profiles: get().profiles.map((p) => (p.id === id ? updated : p)) })
    // Credentials may have changed, so drop the cached verdict.
    set((s) => {
      const health = { ...s.health }
      delete health[id]
      return { health }
    })
  },

  remove: async (id) => {
    await call(() => bridge().profiles.remove(id))
    const remaining = get().profiles.filter((p) => p.id !== id)
    set({ profiles: remaining })
    if (get().activeId === id) {
      if (remaining[0]) await get().select(remaining[0].id)
      else set({ activeId: undefined })
    }
  },

  test: async (id) => {
    const result = await call(() => bridge().profiles.test(id))
    set({ health: { ...get().health, [id]: result } })
    return result
  },

  testDraft: (input) => call(() => bridge().profiles.testDraft(input)),

  select: async (id) => {
    set({ activeId: id })
    const profile = get().profiles.find((p) => p.id === id)
    if (profile) {
      const caps = await get().capsFor(profile.provider)
      useAppStore.getState().setCaps(caps)
      // Bucket clicks for this profile start at its configured sub-path.
      useObjectStore.getState().setScopedPrefix(profile.pathPrefix ?? '')
    }
    void useAppStore.getState().patchSettings({ lastProfileId: id })
  },

  active: () => get().profiles.find((p) => p.id === get().activeId),

  capsFor: async (provider) => call(() => bridge().profiles.caps(provider))
}))
