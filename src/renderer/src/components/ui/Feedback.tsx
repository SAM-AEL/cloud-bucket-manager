import type { ReactNode } from 'react'
import { cn } from '@/lib/format'

/**
 * Skeleton primitives.
 *
 * These mirror the geometry of the real content so the layout does not jump
 * when data lands. Shimmer is driven by a CSS keyframe (see index.css) rather
 * than JS, so hundreds of rows cost nothing on the main thread.
 */

interface SkeletonProps {
  className?: string
  /** Rounds to a pill instead of a soft rectangle. */
  pill?: boolean
}

export function Skeleton({ className, pill }: SkeletonProps): ReactNode {
  return (
    <div
      aria-hidden="true"
      className={cn('shimmer bg-raised', pill ? 'rounded-full' : 'rounded-md', className)}
    />
  )
}

/** A row that matches the object table's column layout exactly. */
export function SkeletonRow({ columns }: { columns: number }): ReactNode {
  return (
    <div className="flex items-center gap-4 px-4" style={{ height: 'var(--row-height, 2.5rem)' }}>
      {Array.from({ length: columns }, (_, i) => (
        <Skeleton
          key={i}
          className={cn('h-3', i === 0 ? 'flex-[3]' : i === 1 ? 'w-20 flex-[1]' : 'w-16 flex-[1]')}
        />
      ))}
    </div>
  )
}

/** Bucket card skeleton matching BucketCard's size. */
export function SkeletonCard(): ReactNode {
  return (
    <div className="panel flex flex-col gap-3 p-4">
      <div className="flex items-center gap-3">
        <Skeleton className="size-9 rounded-lg" />
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <Skeleton className="h-3.5 w-2/3" />
          <Skeleton className="h-2.5 w-1/3" />
        </div>
      </div>
      <Skeleton className="h-2.5 w-full" />
    </div>
  )
}

/**
 * Determinate/indeterminate progress bar.
 * `value` of null renders the sweeping indeterminate variant.
 */
export function ProgressBar({
  value,
  className,
  tone = 'brand',
  height = 'h-1.5'
}: {
  value: number | null
  className?: string
  tone?: 'brand' | 'positive' | 'danger'
  height?: string
}): ReactNode {
  const tones = {
    brand: 'bg-brand',
    positive: 'bg-positive',
    danger: 'bg-danger'
  } as const

  const pct = value === null ? null : Math.round(Math.min(Math.max(value, 0), 1) * 100)

  return (
    <div
      role="progressbar"
      aria-valuenow={pct ?? undefined}
      aria-valuemin={0}
      aria-valuemax={100}
      className={cn('bg-line relative w-full overflow-hidden rounded-full', height, className)}
    >
      {pct === null ? (
        <div
          className={cn('absolute inset-y-0 w-1/3 rounded-full', tones[tone])}
          style={{ animation: 'shimmer 1.4s linear infinite', backgroundSize: '200% 100%' }}
        />
      ) : (
        <div
          className={cn('h-full rounded-full transition-[width] duration-200 ease-out', tones[tone])}
          style={{ width: `${pct}%` }}
        />
      )}
    </div>
  )
}

/** A tidy ring for bucket/object counts in summary tiles. */
export function ProgressRing({
  value,
  size = 44,
  children
}: {
  value: number | null
  size?: number
  children?: ReactNode
}): ReactNode {
  const pct = value === null ? 0 : Math.min(Math.max(value, 0), 1)
  const radius = (size - 6) / 2
  const circumference = 2 * Math.PI * radius

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={3}
          className="stroke-line"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={3}
          strokeLinecap="round"
          className="stroke-brand transition-[stroke-dashoffset] duration-300 ease-out"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - pct)}
        />
      </svg>
      {children ? (
        <div className="absolute inset-0 grid place-items-center text-xs font-medium">
          {children}
        </div>
      ) : null}
    </div>
  )
}

/** Full-surface loader for initial boot only. */
export function FullPageLoader({ label }: { label: string }): ReactNode {
  return (
    <div className="bg-canvas grid h-full place-items-center">
      <div className="flex flex-col items-center gap-4">
        <div className="relative size-10">
          <div className="border-brand/25 absolute inset-0 animate-ping rounded-full border-2" />
          <div className="bg-brand absolute inset-0 rounded-full opacity-90" />
        </div>
        <p className="text-ink-muted animate-pulse text-sm tracking-wide">{label}</p>
      </div>
    </div>
  )
}

export function EmptyState({
  icon,
  title,
  description,
  action
}: {
  icon?: ReactNode
  title: string
  description?: string
  action?: ReactNode
}): ReactNode {
  return (
    <div className="flex flex-col items-center justify-center gap-4 px-8 py-20 text-center">
      {icon ? (
        <div className="bg-raised text-ink-faint grid size-16 place-items-center rounded-2xl">
          {icon}
        </div>
      ) : null}
      <div className="space-y-1">
        <h3 className="text-ink text-sm font-medium">{title}</h3>
        {description ? <p className="text-ink-muted mx-auto max-w-sm text-sm">{description}</p> : null}
      </div>
      {action ? <div className="pt-1">{action}</div> : null}
    </div>
  )
}

/** Inline "nothing matched your filter" affordance. */
export function NoResults({ query }: { query: string }): ReactNode {
  return (
    <EmptyState
      title="No matches"
      description={query ? `Nothing in this folder matches “${query}”.` : 'This folder is empty.'}
    />
  )
}
