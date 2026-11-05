import { create } from 'zustand'
import type { TransferEvent, TransferSnapshot } from '@shared/types'
import { bridge, call } from '@/lib/bridge'

interface TransferState {
  items: TransferSnapshot[]
  /** Total bytes currently moving and overall completion, for the tray header. */
  subscribed: boolean

  subscribe: () => () => void
  refresh: () => Promise<void>
  upsert: (snapshot: TransferSnapshot) => void
  clearFinished: () => Promise<void>
  cancel: (id: string) => Promise<void>
  pause: (id: string) => Promise<void>
  resume: (id: string) => Promise<void>
  activeCount: () => number
}

export const useTransferStore = create<TransferState>((set, get) => ({
  items: [],
  subscribed: false,

  subscribe: () => {
    if (get().subscribed) return () => undefined
    set({ subscribed: true })
    void get().refresh()
    const api = bridge()
    // Live progress arrives as patches; new transfers as full snapshots.
    const unsubscribe = api.transfers.onEvent((event: TransferEvent) => {
      if (event.type === 'snapshot') {
        get().upsert(event.transfer)
      } else {
        set((s) => ({
          items: s.items.map((t) => (t.id === event.id ? { ...t, ...event.patch } : t))
        }))
      }
    })
    return () => {
      unsubscribe()
      set({ subscribed: false })
    }
  },

  refresh: async () => {
    const items = await call(() => bridge().transfers.list()).catch(() => [] as TransferSnapshot[])
    set({ items })
  },

  upsert: (snapshot) =>
    set((s) => {
      const index = s.items.findIndex((t) => t.id === snapshot.id)
      if (index === -1) return { items: [snapshot, ...s.items] }
      const items = [...s.items]
      items[index] = snapshot
      return { items }
    }),

  clearFinished: async () => {
    const items = await call(() => bridge().transfers.clearFinished())
    set({ items })
  },

  cancel: async (id) => {
    await call(() => bridge().transfers.cancel(id))
    set((s) => ({
      items: s.items.map((t) => (t.id === id ? { ...t, state: 'canceled' as const } : t))
    }))
  },

  pause: async (id) => {
    await call(() => bridge().transfers.pause(id))
    set((s) => ({
      items: s.items.map((t) => (t.id === id ? { ...t, state: 'paused' as const } : t))
    }))
  },

  resume: async (id) => {
    await call(() => bridge().transfers.resume(id))
    set((s) => ({
      items: s.items.map((t) => (t.id === id ? { ...t, state: 'running' as const } : t))
    }))
  },

  activeCount: () => get().items.filter((t) => t.state === 'running' || t.state === 'queued').length
}))

/** Aggregate progress across everything currently transferring. */
export function transferSummary(items: TransferSnapshot[]): {
  active: number
  loaded: number
  total: number
  progress: number | null
  failed: number
} {
  const live = items.filter((t) => t.state === 'running' || t.state === 'queued' || t.state === 'paused')
  const loaded = live.reduce((sum, t) => sum + t.loaded, 0)
  const total = live.reduce((sum, t) => sum + t.total, 0)
  return {
    active: live.length,
    loaded,
    total,
    progress: total > 0 ? loaded / total : live.length ? 0 : null,
    failed: items.filter((t) => t.state === 'error').length
  }
}
