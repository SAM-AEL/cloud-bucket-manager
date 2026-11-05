import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { cn } from '@/lib/format'

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Required: icon-only controls must still expose an accessible name. */
  label: string
  icon: ReactNode
  size?: 'sm' | 'md'
  active?: boolean
  tone?: 'default' | 'danger'
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { label, icon, size = 'md', active, tone = 'default', className, ...rest },
  ref
) {
  const dimensions = size === 'sm' ? 'size-6' : 'size-8'
  return (
    <button
      ref={ref}
      title={label}
      aria-label={label}
      aria-pressed={active}
      className={cn(
        'inline-grid place-items-center rounded-lg transition-colors duration-150',
        'disabled:pointer-events-none disabled:opacity-40',
        dimensions,
        active
          ? 'bg-brand-dim text-brand'
          : tone === 'danger'
            ? 'text-ink-muted hover:text-danger hover:bg-danger-dim'
            : 'text-ink-muted hover:text-ink hover:bg-raised',
        className
      )}
      {...rest}
    >
      {icon}
    </button>
  )
})

type BadgeTone = 'neutral' | 'brand' | 'positive' | 'caution' | 'danger'

const TONES: Record<BadgeTone, string> = {
  neutral: 'bg-raised text-ink-muted border-line',
  brand: 'bg-brand-dim text-brand border-brand/25',
  positive: 'bg-positive/12 text-positive border-positive/25',
  caution: 'bg-caution/12 text-caution border-caution/25',
  danger: 'bg-danger-dim text-danger border-danger/25'
}

export function Badge({
  tone = 'neutral',
  children,
  className
}: {
  tone?: BadgeTone
  children: ReactNode
  className?: string
}): ReactNode {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full border px-2 py-0.5',
        'text-[11px] leading-4 font-medium whitespace-nowrap',
        TONES[tone],
        className
      )}
    >
      {children}
    </span>
  )
}

/** Section heading used inside the sidebar and inspector. */
export function SectionLabel({
  children,
  action
}: {
  children: ReactNode
  action?: ReactNode
}): ReactNode {
  return (
    <div className="flex h-6 items-center justify-between px-3">
      <span className="text-ink-faint text-[11px] font-semibold tracking-wider uppercase">
        {children}
      </span>
      {action}
    </div>
  )
}
