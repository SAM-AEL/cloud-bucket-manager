import { create } from 'zustand'
import type { Bucket, ObjectItem } from '@shared/types'
import { bridge, call, errorHint, errorMessage } from '@/lib/bridge'

export type SortKey = 'name' | 'size' | 'modified'
export type SortDir = 'asc' | 'desc'
export type ViewMode = 'list' | 'grid'

interface ObjectState {
  /** Current location: which profile + bucket + prefix is being viewed. */
  profileId?: string
  bucket?: string
  prefix: string

  buckets: Bucket[]
  bucketsLoading: boolean
  bucketsError?: string
  /** Actionable explanation for bucketsError, when the main process gave one. */
  bucketsErrorHint?: string

  items: ObjectItem[]
  cursor?: string
  loading: boolean
  loadingMore: boolean
  error?: string
  /** Distinguishes a first load (show skeletons) from a refresh. */
  loadedOnce: boolean

  /**
   * Sub-path that buckets open at for the active profile. Set from the
   * profile's `pathPrefix` so a scoped profile always lands in the same place.
   */
  scopedPrefix: string

  selected: Set<string>
  /** Object key whose metadata is shown in the inspector. */
  focused?: string

  query: string
  sortKey: SortKey
  sortDir: SortDir
  view: ViewMode
  showHidden: boolean

  loadBuckets: (profileId: string) => Promise<void>
  refreshBuckets: () => Promise<void>
  createBucket: (bucket: string) => Promise<void>
  deleteBucket: (bucket: string) => Promise<void>

  open: (profileId: string, bucket: string, prefix?: string) => Promise<void>
  setScopedPrefix: (prefix: string) => void
  navigate: (prefix: string) => Promise<void>
  up: () => Promise<void>
  reload: () => Promise<void>
  loadMore: () => Promise<void>

  toggleSelect: (key: string, additive: boolean) => void
  selectRange: (keys: string[]) => void
  clearSelection: () => void
  focus: (key?: string) => void

  setQuery: (query: string) => void
  setSort: (key: SortKey) => void
  setView: (view: ViewMode) => void
  setShowHidden: (show: boolean) => void

  /** Remove keys locally after a successful delete, avoiding a full reload. */
  forgetKeys: (keys: string[]) => void
}

/** Where a delete/download should land: the parent folder of `prefix`. */
export function parentPrefix(prefix: string): string {
  if (!prefix) return ''
  const trimmed = prefix.replace(/\/+$/, '')
  const index = trimmed.lastIndexOf('/')
  return index === -1 ? '' : `${trimmed.slice(0, index)}/`
}

export const useObjectStore = create<ObjectState>((set, get) => ({
  prefix: '',
  buckets: [],
  bucketsLoading: false,
  items: [],
  loading: false,
  loadingMore: false,
  loadedOnce: false,
  selected: new Set(),
  query: '',
  sortKey: 'name',
  sortDir: 'asc',
  view: 'list',
  showHidden: false,
  scopedPrefix: '',

  loadBuckets: async (profileId) => {
    set({ bucketsLoading: true, bucketsError: undefined, bucketsErrorHint: undefined })
    try {
      const page = await call(() => bridge().buckets.list(profileId))
      set({ buckets: page.items, bucketsLoading: false })
    } catch (error) {
      set({
        bucketsLoading: false,
        bucketsError: errorMessage(error),
        bucketsErrorHint: errorHint(error)
      })
    }
  },

  refreshBuckets: async () => {
    const { profileId } = get()
    if (profileId) await get().loadBuckets(profileId)
  },

  createBucket: async (bucket) => {
    const { profileId } = get()
    if (!profileId) return
    await call(() => bridge().buckets.create({ profileId, bucket }))
    await get().loadBuckets(profileId)
  },

  deleteBucket: async (bucket) => {
    const { profileId } = get()
    if (!profileId) return
    await call(() => bridge().buckets.remove(profileId, bucket))
    const remaining = get().buckets.filter((b) => b.name !== bucket)
    set({ buckets: remaining })
    if (get().bucket === bucket) set({ bucket: undefined, items: [], prefix: '' })
  },

  open: async (profileId, bucket, prefix) => {
    // No explicit prefix means "open wherever this profile is scoped to".
    const start = prefix ?? get().scopedPrefix
    set({
      profileId,
      bucket,
      prefix: start,
      items: [],
      cursor: undefined,
      selected: new Set(),
      focused: undefined,
      query: '',
      error: undefined,
      loading: true,
      loadedOnce: false
    })
    await get().reload()
  },

  setScopedPrefix: (scopedPrefix) => set({ scopedPrefix }),

  navigate: async (prefix) => {
    set({ prefix, items: [], cursor: undefined, selected: new Set(), loading: true })
    await get().reload()
  },

  up: async () => {
    await get().navigate(parentPrefix(get().prefix))
  },

  reload: async () => {
    const { profileId, bucket, prefix } = get()
    if (!profileId || !bucket) {
      set({ loading: false })
      return
    }
    set({ loading: true, error: undefined })
    try {
      const page = await call(() =>
        bridge().objects.list({ profileId, bucket, prefix, limit: 500 })
      )
      // A navigate() during the request wins; discard the stale page.
      if (get().prefix !== prefix || get().bucket !== bucket) {
        set({ loading: false })
        return
      }
      set({ items: page.items, cursor: page.cursor, loading: false, loadedOnce: true })
    } catch (error) {
      set({ loading: false, loadedOnce: true, error: errorMessage(error) })
    }
  },

  loadMore: async () => {
    const { profileId, bucket, prefix, cursor, loadingMore } = get()
    if (!profileId || !bucket || !cursor || loadingMore) return
    set({ loadingMore: true })
    try {
      const page = await call(() =>
        bridge().objects.list({ profileId, bucket, prefix, cursor, limit: 500 })
      )
      if (get().bucket !== bucket || get().prefix !== prefix) {
        set({ loadingMore: false })
        return
      }
      set({
        items: [...get().items, ...page.items],
        cursor: page.cursor,
        loadingMore: false
      })
    } catch (error) {
      set({ loadingMore: false, error: errorMessage(error) })
    }
  },

  toggleSelect: (key, additive) => {
    const next = additive ? new Set(get().selected) : new Set<string>()
    if (additive && next.has(key)) next.delete(key)
    else next.add(key)
    set({ selected: next })
  },

  selectRange: (keys) => set({ selected: new Set(keys) }),

  clearSelection: () => set({ selected: new Set() }),

  focus: (key) => set({ focused: key }),

  setQuery: (query) => set({ query }),
  setView: (view) => set({ view }),

  setSort: (key) => {
    const { sortKey, sortDir } = get()
    if (key === sortKey) {
      set({ sortDir: sortDir === 'asc' ? 'desc' : 'asc' })
    } else {
      // Names read best A-Z; sizes and dates read best largest/newest first.
      set({ sortKey: key, sortDir: key === 'name' ? 'asc' : 'desc' })
    }
  },

  setShowHidden: (showHidden) => set({ showHidden }),

  forgetKeys: (keys) => {
    const removed = new Set(keys)
    set((s) => ({ items: s.items.filter((i) => !removed.has(i.key)) }))
    const selected = new Set(get().selected)
    for (const key of removed) selected.delete(key)
    set({ selected })
  }
}))

/** Apply the active filter, hidden-file rule, sort, and folders-first ordering. */
export function visibleItems(state: ObjectState): ObjectItem[] {
  const query = state.query.trim().toLowerCase()
  let items = state.items

  if (!state.showHidden) {
    items = items.filter((i) => !baseNameOf(i.key).startsWith('.'))
  }
  if (query) {
    items = items.filter((i) => i.key.toLowerCase().includes(query))
  }

  const direction = state.sortDir === 'asc' ? 1 : -1
  return [...items].sort((a, b) => {
    // Folders always float above files, regardless of sort direction.
    if (Boolean(a.isPrefix) !== Boolean(b.isPrefix)) return a.isPrefix ? -1 : 1
    let result = 0
    if (state.sortKey === 'size') result = a.size - b.size
    else if (state.sortKey === 'modified') result = (a.lastModified ?? 0) - (b.lastModified ?? 0)
    if (result === 0) {
      result = baseNameOf(a.key).localeCompare(baseNameOf(b.key), undefined, {
        numeric: true,
        sensitivity: 'base'
      })
    }
    return result * direction
  })
}

function baseNameOf(key: string): string {
  const trimmed = key.endsWith('/') ? key.slice(0, -1) : key
  const index = trimmed.lastIndexOf('/')
  return index === -1 ? trimmed : trimmed.slice(index + 1)
}
