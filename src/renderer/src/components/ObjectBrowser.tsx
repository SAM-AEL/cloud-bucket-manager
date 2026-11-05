import {
  ArrowDownToLine,
  ArrowUpFromLine,
  ChevronRight,
  CloudOff,
  File,
  Folder,
  FolderOpen,
  Grid2x2,
  House,
  List,
  MoreHorizontal,
  RefreshCw,
  Search,
  Trash2
} from 'lucide-react'
import { useShallow } from 'zustand/react/shallow'
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useObjectStore, visibleItems } from '@/store/objects'
import { IconButton } from './ui/Chrome'
import { Button } from './ui/Primitives'
import { Dropdown, MenuItem, MenuSeparator } from './ui/Menu'
import { EmptyState, NoResults, SkeletonRow } from './ui/Feedback'
import { baseName, cn, formatBytesShort, formatRelative, guessContentType } from '@/lib/format'

const ROW_HEIGHT = 48

/** Icon tinted by file type so mixed folders stay scannable. */
function FileIcon({ name }: { name: string }): ReactNode {
  const type = guessContentType(name)
  const tone =
    type.startsWith('image/')
      ? 'text-violet-400'
      : type.startsWith('video/')
        ? 'text-rose-400'
        : type.startsWith('audio/')
          ? 'text-amber-400'
          : type.startsWith('text/') || type === 'application/json'
            ? 'text-emerald-400'
            : type === 'application/pdf'
              ? 'text-red-400'
              : type === 'application/zip'
                ? 'text-yellow-400'
                : 'text-ink-faint'
  return <File className={cn('size-4 shrink-0', tone)} />
}

/** Breadcrumb trail derived from the current prefix. */
function Breadcrumbs(): ReactNode {
  const prefix = useObjectStore((s) => s.prefix)
  const bucket = useObjectStore((s) => s.bucket)
  const navigate = useObjectStore((s) => s.navigate)

  const segments = prefix.split('/').filter(Boolean)

  const go = (index: number): void => {
    const next = segments.slice(0, index).join('/')
    void navigate(next ? `${next}/` : '')
  }

  return (
    <nav className="flex min-w-0 flex-1 items-center gap-0.5 overflow-hidden">
      <button
        onClick={() => void navigate('')}
        className="text-ink-faint hover:text-ink hover:bg-raised grid size-6 shrink-0 place-items-center rounded-md transition-colors"
        aria-label="Bucket root"
      >
        <House className="size-3.5" />
      </button>
      <ChevronRight className="text-ink-faint size-3 shrink-0" />
      <span className="text-ink max-w-[180px] shrink-0 truncate text-[13px] font-medium">
        {bucket ?? 'No bucket'}
      </span>
      {segments.map((segment, index) => (
        <span key={`${segment}-${index}`} className="flex min-w-0 items-center">
          <ChevronRight className="text-ink-faint size-3 shrink-0" />
          <button
            onClick={() => go(index + 1)}
            className={cn(
              'hover:bg-raised hover:text-ink max-w-[160px] shrink-0 truncate rounded-md px-1.5 py-0.5 text-[13px] transition-colors',
              index === segments.length - 1 ? 'text-ink font-medium' : 'text-ink-muted'
            )}
          >
            {segment}
          </button>
        </span>
      ))}
    </nav>
  )
}

/** Toolbar: search, selection count, primary actions and view toggle. */
function Toolbar({
  onUpload,
  onDownload,
  onDelete,
  onNewBucket
}: {
  onUpload: () => void
  onDownload: () => void
  onDelete: () => void
  onNewBucket: () => void
}): ReactNode {
  const query = useObjectStore((s) => s.query)
  const setQuery = useObjectStore((s) => s.setQuery)
  const view = useObjectStore((s) => s.view)
  const setView = useObjectStore((s) => s.setView)
  const reload = useObjectStore((s) => s.reload)
  const loading = useObjectStore((s) => s.loading)
  const selectedCount = useObjectStore((s) => s.selected.size)

  return (
    <div className="border-line flex items-center gap-2 border-b px-6 py-3">
      <div className="relative w-full max-w-[320px]">
        <Search className="text-ink-faint pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Filter this folder"
          className="border-line bg-raised/50 text-ink placeholder:text-ink-faint focus:border-brand w-full rounded-lg border py-1.5 pr-2 pl-8 text-xs outline-none"
        />
      </div>

      <div className="flex-1" />

      {selectedCount > 0 ? (
        <span className="text-brand bg-brand-dim rounded-full px-2 py-0.5 text-[11px] font-medium">
          {selectedCount} selected
        </span>
      ) : null}

      <Button size="sm" variant="ghost" icon={<ArrowUpFromLine className="size-3.5" />} onClick={onUpload}>
        Upload
      </Button>
      <Button
        size="sm"
        variant="ghost"
        icon={<ArrowDownToLine className="size-3.5" />}
        onClick={onDownload}
        disabled={selectedCount === 0}
      >
        Download
      </Button>
      <Button
        size="sm"
        variant="ghost"
        icon={<Trash2 className="size-3.5" />}
        onClick={onDelete}
        disabled={selectedCount === 0}
      >
        Delete
      </Button>

      <IconButton
        label="Refresh"
        onClick={() => void reload()}
        icon={<RefreshCw className={cn('size-4', loading && 'animate-spin')} />}
      />

      <div className="border-line bg-raised/60 flex items-center gap-0.5 rounded-lg border p-0.5">
        <IconButton
          size="sm"
          label="List view"
          onClick={() => setView('list')}
          icon={<List className="size-3.5" />}
          active={view === 'list'}
        />
        <IconButton
          size="sm"
          label="Grid view"
          onClick={() => setView('grid')}
          icon={<Grid2x2 className="size-3.5" />}
          active={view === 'grid'}
        />
      </div>

      <Dropdown
        trigger={({ toggle }) => (
          <IconButton
            label="More actions"
            onClick={toggle}
            icon={<MoreHorizontal className="size-4" />}
/>
        )}
      >
        <MenuItem icon={<Folder className="size-3.5" />} onClick={onNewBucket}>
          New bucket
        </MenuItem>
        <MenuSeparator />
        <MenuItem icon={<RefreshCw className="size-3.5" />} onClick={() => void reload()}>
          Refresh listing
        </MenuItem>
      </Dropdown>
    </div>
  )
}


/**
 * Windowed list. Only rows in view (plus overscan) are mounted, so a 50k-object
 * folder scrolls without mounting 50k DOM nodes.
 */
function VirtualRows({ items }: { items: ReturnType<typeof visibleItems> }): ReactNode {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [range, setRange] = useState({ start: 0, end: 40 })

  const focused = useObjectStore((s) => s.focused)
  const focus = useObjectStore((s) => s.focus)
  const selected = useObjectStore((s) => s.selected)
  const toggleSelect = useObjectStore((s) => s.toggleSelect)
  const navigate = useObjectStore((s) => s.navigate)

  // Derive the visible window from scrollTop and container height.
  useEffect(() => {
    const node = scrollRef.current
    if (!node) return
    const update = (): void => {
      const top = node.scrollTop
      const height = node.clientHeight
      setRange({
        start: Math.max(0, Math.floor(top / ROW_HEIGHT) - 8),
        end: Math.min(items.length, Math.ceil((top + height) / ROW_HEIGHT) + 8)
      })
    }
    update()
    const observer = new ResizeObserver(update)
    observer.observe(node)
    node.addEventListener('scroll', update, { passive: true })
    return () => {
      observer.disconnect()
      node.removeEventListener('scroll', update)
    }
  }, [items.length])

  return (
    <div
      ref={scrollRef}
      className="min-h-0 flex-1 overflow-y-auto"
      role="grid"
      aria-rowcount={items.length}
    >
      <div style={{ height: items.length * ROW_HEIGHT, position: 'relative' }}>
        <div style={{ transform: `translateY(${range.start * ROW_HEIGHT}px)` }}>
          {items.slice(range.start, range.end).map((item) => {
            const name = baseName(item.key)
            const isSelected = selected.has(item.key)
            const isFocused = focused === item.key
            return (
              <div
                key={item.key}
                role="row"
                aria-selected={isSelected}
                tabIndex={0}
                style={{ height: ROW_HEIGHT }}
                onClick={(e) => {
                  if (item.isPrefix) {
                    void navigate(item.key)
                  } else {
                    focus(item.key)
                    toggleSelect(item.key, e.metaKey || e.ctrlKey || e.shiftKey)
                  }
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && item.isPrefix) void navigate(item.key)
                  if (e.key === ' ' && !item.isPrefix) {
                    e.preventDefault()
                    toggleSelect(item.key, e.metaKey || e.ctrlKey)
                  }
                }}
                className={cn(
                  'group border-line flex cursor-default items-center gap-4 border-b px-6 outline-none transition-colors',
                  'focus-visible:ring-brand focus-visible:ring-2 focus-visible:ring-inset',
                  isSelected ? 'bg-brand-dim' : isFocused ? 'bg-raised' : 'hover:bg-raised/60'
                )}
              >
                {item.isPrefix ? (
                  <Folder className="text-brand size-4 shrink-0" />
                ) : (
                  <FileIcon name={name} />
                )}
                <span
                  className={cn(
                    'min-w-0 flex-1 truncate text-[13px]',
                    isSelected ? 'text-brand font-medium' : 'text-ink'
                  )}
                  title={name}
                >
                  {name}
                </span>
                <span className="text-ink-faint hidden w-16 shrink-0 text-right font-mono text-[11px] sm:block">
                  {item.isPrefix ? '—' : formatBytesShort(item.size)}
                </span>
                <span className="text-ink-faint hidden w-28 shrink-0 text-right text-[11px] md:block">
                  {item.isPrefix ? '—' : formatRelative(item.lastModified)}
                </span>
                <ChevronRight className="text-ink-faint size-3.5 shrink-0 opacity-0 transition-opacity group-hover:opacity-100" />
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
/** Grid rendering for the same data. */
function GridView({ items }: { items: ReturnType<typeof visibleItems> }): ReactNode {
  const navigate = useObjectStore((s) => s.navigate)
  const selected = useObjectStore((s) => s.selected)
  const toggleSelect = useObjectStore((s) => s.toggleSelect)
  const focus = useObjectStore((s) => s.focus)

  return (
    <div className="grid min-h-0 flex-1 grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-2 overflow-y-auto p-3">
      {items.map((item) => {
        const name = baseName(item.key)
        const isSelected = selected.has(item.key)
        return (
          <button
            key={item.key}
            onClick={(e) => {
              if (item.isPrefix) void navigate(item.key)
              else {
                focus(item.key)
                toggleSelect(item.key, e.metaKey || e.ctrlKey)
              }
            }}
            className={cn(
              'panel hover:border-line-strong flex flex-col items-start gap-2 p-3 text-left transition-colors',
              isSelected && 'border-brand bg-brand-dim'
            )}
          >
            <div className="flex w-full items-center gap-2">
              {item.isPrefix ? (
                <Folder className="text-brand size-4 shrink-0" />
              ) : (
                <FileIcon name={name} />
              )}
              <span
                className={cn(
                  'min-w-0 flex-1 truncate text-[13px]',
                  isSelected ? 'text-brand' : 'text-ink'
                )}
                title={name}
              >
                {name}
              </span>
            </div>
            <span className="text-ink-faint w-full truncate text-[11px]">
              {item.isPrefix ? 'Folder' : formatBytesShort(item.size)}
            </span>
          </button>
        )
      })}
    </div>
  )
}

/** Main content area: toolbar plus either a folder view or an empty state. */
export function ObjectBrowser({
  onUpload,
  onDownload,
  onDelete,
  onNewBucket
}: {
  onUpload: () => void
  onDownload: () => void
  onDelete: () => void
  onNewBucket: () => void
}): ReactNode {
  // visibleItems() builds a new array on every call, so the selector result
  // must be shallow-compared or useSyncExternalStore loops forever.
  const items = useObjectStore(useShallow(visibleItems))
  const loading = useObjectStore((s) => s.loading)
  const loadedOnce = useObjectStore((s) => s.loadedOnce)
  const error = useObjectStore((s) => s.error)
  const query = useObjectStore((s) => s.query)
  const bucket = useObjectStore((s) => s.bucket)
  const view = useObjectStore((s) => s.view)
  const reload = useObjectStore((s) => s.reload)
  const cursor = useObjectStore((s) => s.cursor)
  const loadMore = useObjectStore((s) => s.loadMore)

  const totalBytes = useMemo(
    () => items.reduce((sum, item) => sum + (item.isPrefix ? 0 : item.size), 0),
    [items]
  )

  // Infinite scroll: fetch the next page when the sentinel comes into view.
  const sentinelRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const node = sentinelRef.current
    if (!node || !cursor) return
    const observer = new IntersectionObserver((entries) => {
      if (entries[0]?.isIntersecting) void loadMore()
    })
    observer.observe(node)
    return () => observer.disconnect()
  }, [cursor, loadMore])

  return (
    <div className="flex min-w-0 flex-1 flex-col">
      <div className="border-line flex items-center gap-2 border-b px-6 py-3">
        <Breadcrumbs />
      </div>

      <Toolbar
        onUpload={onUpload}
        onDownload={onDownload}
        onDelete={onDelete}
        onNewBucket={onNewBucket}
      />

      {!bucket ? (
        <EmptyState
          icon={<FolderOpen className="size-6" />}
          title="Select a bucket"
          description="Pick a bucket from the sidebar to browse its objects."
        />
      ) : error ? (
        <EmptyState
          icon={<CloudOff className="size-6" />}
          title="Could not load this folder"
          description={error}
          action={
            <Button size="sm" variant="secondary" onClick={() => void reload()}>
              Try again
            </Button>
          }
        />
      ) : loading && !loadedOnce ? (
        // Skeletons mirror real row geometry so nothing jumps when data lands.
        <div className="min-h-0 flex-1 overflow-hidden">
          {Array.from({ length: 18 }, (_, i) => (
            <SkeletonRow key={i} columns={4} />
          ))}
        </div>
      ) : items.length === 0 ? (
        <NoResults query={query} />
      ) : view === 'grid' ? (
        <GridView items={items} />
      ) : (
        <>
          <div className="border-line text-ink-faint flex items-center justify-between border-b px-6 py-2.5 text-[11px]">
            <span>
              {items.length} {items.length === 1 ? 'item' : 'items'}
            </span>
            <span className="font-mono">{formatBytesShort(totalBytes)}</span>
          </div>
          <VirtualRows items={items} />
        </>
      )}

      {cursor ? (
        <div ref={sentinelRef} className="text-ink-faint py-2 text-center text-[11px]">
          Loading more…
        </div>
      ) : null}
    </div>
  )
}
