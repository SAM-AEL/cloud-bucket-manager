import { motion, useReducedMotion } from 'framer-motion'
import { forwardRef, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode } from 'react'
import { cn } from '@/lib/format'

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'subtle'
type ButtonSize = 'sm' | 'md' | 'lg' | 'icon'

const VARIANTS: Record<ButtonVariant, string> = {
  primary:
    'bg-brand text-brand-ink hover:bg-brand-strong active:scale-[0.98] shadow-sm shadow-black/20',
  secondary:
    'bg-raised text-ink border border-line hover:border-line-strong hover:bg-overlay active:scale-[0.98]',
  ghost: 'text-ink-muted hover:text-ink hover:bg-raised',
  subtle: 'bg-brand-dim text-brand hover:bg-brand/25',
  danger: 'bg-danger text-white hover:brightness-110 active:scale-[0.98]'
}

const SIZES: Record<ButtonSize, string> = {
  sm: 'h-7 px-2.5 text-xs gap-1.5 rounded-md',
  md: 'h-9 px-3.5 text-sm gap-2 rounded-lg',
  lg: 'h-11 px-5 text-sm gap-2 rounded-xl',
  icon: 'h-8 w-8 rounded-lg justify-center'
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  loading?: boolean
  icon?: ReactNode
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'secondary', size = 'md', loading, icon, className, children, disabled, ...rest },
  ref
) {
  return (
    <button
      ref={ref}
      // Keep the button reachable by keyboard while it shows a spinner.
      aria-busy={loading || undefined}
      disabled={disabled || loading}
      className={cn(
        'inline-flex items-center font-medium whitespace-nowrap select-none',
        'transition-[background-color,border-color,color,transform,opacity] duration-150',
        'disabled:pointer-events-none disabled:opacity-45',
        VARIANTS[variant],
        SIZES[size],
        className
      )}
      {...rest}
    >
      {loading ? <Spinner className="size-3.5" /> : icon}
      {children}
    </button>
  )
})

/** Small inline spinner used by buttons and the busy states. */
export function Spinner({ className }: { className?: string }): ReactNode {
  return (
    <svg
      className={cn('animate-spin', className)}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2.5" opacity="0.25" />
      <path
        d="M21 12a9 9 0 0 0-9-9"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
    </svg>
  )
}

interface SwitchProps {
  checked: boolean
  onChange: (checked: boolean) => void
  label: string
  description?: string
  disabled?: boolean
}

/**
 * Animated switch built on a real <button role="switch">.
 *
 * Framer Motion drives the knob and the track colour so the state change reads
 * as a physical movement rather than an instant flip. The whole control is the
 * click target (not just the track) and it is reachable by keyboard, with the
 * label wired up for screen readers.
 */
export function Switch({
  checked,
  onChange,
  label,
  description,
  disabled
}: SwitchProps): ReactNode {
  const reduceMotion = useReducedMotion()
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        'group flex w-full items-start justify-between gap-5 rounded-xl p-3 text-left',
        'transition-colors duration-150',
        'hover:bg-raised',
        disabled && 'pointer-events-none opacity-45'
      )}
    >
      <span className="min-w-0 pt-0.5">
        <span className="text-ink block text-sm leading-5 font-medium">{label}</span>
        {description ? (
          <span className="text-ink-muted mt-1 block text-xs leading-5">{description}</span>
        ) : null}
      </span>

      <span
        // Non-interactive: the parent button owns pointer and keyboard events.
        className={cn(
          'relative mt-0.5 h-6 w-11 shrink-0 rounded-full transition-colors duration-200',
          checked ? 'bg-brand' : 'bg-hover'
        )}
      >
        <motion.span
          className="absolute top-0.5 left-0.5 block size-5 rounded-full bg-white shadow-sm"
          animate={{ x: checked ? 20 : 0 }}
          transition={
            reduceMotion
              ? { duration: 0 }
              : { type: 'spring', stiffness: 520, damping: 34, mass: 0.7 }
          }
          // A subtle press feedback when the user pushes the control.
          whileTap={{ scale: 0.88 }}
        />
        {/* Soft halo on the "on" state, so the switch reads as illuminated. */}
        <span
          className={cn(
            'pointer-events-none absolute inset-0 rounded-full transition-opacity duration-200',
            checked ? 'bg-brand/40 opacity-100 blur-md' : 'opacity-0'
          )}
        />
      </span>
    </button>
  )
}

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  invalid?: boolean
  /** Icon rendered inside the leading edge. */
  icon?: ReactNode
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { className, invalid, icon, ...rest },
  ref
) {
  const field = (
    <input
      ref={ref}
      aria-invalid={invalid || undefined}
      className={cn(
        'w-full rounded-lg border bg-surface px-3 py-2 text-sm text-ink',
        'placeholder:text-ink-faint',
        'transition-colors duration-150',
        'focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/30',
        'disabled:opacity-50',
        invalid ? 'border-danger' : 'border-line',
        icon ? 'pl-9' : undefined,
        className
      )}
      {...rest}
    />
  )

  if (!icon) return field
  return (
    <div className="relative">
      <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-ink-faint">
        {icon}
      </span>
      {field}
    </div>
  )
})
