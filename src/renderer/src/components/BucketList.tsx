import { AnimatePresence, motion } from 'framer-motion'
import { ChevronRight, Database, Trash2 } from 'lucide-react'
import { useMemo, useState, type ReactNode } from 'react'
import type { Bucket } from '@shared/types'
import { useObjectStore } from '@/store/objects'
import { Button } from './ui/Primitives'
import { Skeleton } from './ui/Feedback'
import { cn } from '@/lib/format'

/** Scrollable bucket list with animated rows and inline delete confirmation. */
export function BucketList({
  buckets,
  loading,
  filter,
  activeProfileId
}: {
  buckets: Bucket[]
  loading: boolean
  filter: string
  activeProfileId?: string
}): ReactNode {
  const currentBucket = useObjectStore((s) => s.bucket)
  const open = useObjectStore((s) => s.open)
  const deleteBucket = useObjectStore((s) => s.deleteBucket)
  const [pending, setPending] = useState<string | undefined>()

  const visible = useMemo(() => {
    const query = filter.trim().toLowerCase()
    return query ? buckets.filter((b) => b.name.toLowerCase().includes(query)) : buckets
  }, [buckets, filter])

  // Show skeletons only on a cold load, never on a refresh over existing rows.
  if (loading && buckets.length === 0) {
    return (
      <div className="min-h-0 flex-1 space-y-2 overflow-hidden px-3 pt-2">
        {Array.from({ length: 7 }, (_, i) => (
          <Skeleton key={i} className="h-8 w-full" />
        ))}
      </div>
    )
  }

  if (visible.length === 0) {
    return (
      <div className="min-h-0 flex-1 overflow-y-auto">
        <p className="text-ink-faint px-3 py-3 text-xs">
          {buckets.length === 0 ? 'No buckets in this account.' : 'No buckets match.'}
        </p>
      </div>
    )
  }

  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-1.5 pb-2">
      <AnimatePresence initial={false}>
        {visible.map((bucket) => {
          const isCurrent = bucket.name === currentBucket
          return (
            <motion.div
              key={bucket.name}
              layout
              initial={{ opacity: 0, x: -6 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -6 }}
              transition={{ duration: 0.15 }}
              className="group relative"
            >
              <button
                onClick={() => {
                  if (activeProfileId) void open(activeProfileId, bucket.name)
                }}
                onDoubleClick={() => setPending(bucket.name)}
                title={bucket.name}
                className={cn(
                  'flex w-full items-center gap-2.5 rounded-lg py-2.5 pr-8 pl-3 text-left transition-colors',
                  isCurrent ? 'bg-brand-dim' : 'hover:bg-raised'
                )}
              >
                <ChevronRight
                  className={cn(
                    'text-ink-faint size-3 shrink-0 transition-transform duration-150',
                    isCurrent && 'text-brand rotate-90'
                  )}
                />
                <Database
                  className={cn('size-3.5 shrink-0', isCurrent ? 'text-brand' : 'text-ink-faint')}
                />
                <span
                  className={cn(
                    'truncate text-[13px]',
                    isCurrent ? 'text-brand font-medium' : 'text-ink-muted'
                  )}
                >
                  {bucket.name}
                </span>
              </button>
              <button
                onClick={() => setPending(bucket.name)}
                aria-label={`Delete bucket ${bucket.name}`}
                className="text-ink-faint hover:text-danger hover:bg-danger-dim absolute top-1/2 right-1.5 -translate-y-1/2 rounded p-1 opacity-0 transition-all group-hover:opacity-100"
              >
                <Trash2 className="size-3.5" />
              </button>
            </motion.div>
          )
        })}
      </AnimatePresence>

      {pending ? (
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          className="border-danger/30 bg-danger-dim mt-2 rounded-lg border p-2.5"
        >
          <p className="text-ink text-xs font-medium">Delete “{pending}”?</p>
          <p className="text-ink-muted mt-1 text-[11px] leading-4">
            The bucket must already be empty. This cannot be undone.
          </p>
          <div className="mt-2 flex gap-1.5">
            <Button size="sm" variant="ghost" className="flex-1" onClick={() => setPending(undefined)}>
              Cancel
            </Button>
            <Button
              size="sm"
              variant="danger"
              className="flex-1"
              onClick={() => {
                void deleteBucket(pending)
                setPending(undefined)
              }}
            >
              Delete
            </Button>
          </div>
        </motion.div>
      ) : null}
    </div>
  )
}
