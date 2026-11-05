import { AnimatePresence, motion } from 'framer-motion'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { cn } from '@/lib/format'

interface DropdownProps {
  trigger: (props: { open: boolean; toggle: () => void }) => ReactNode
  children: ReactNode | ((close: () => void) => ReactNode)
  align?: 'start' | 'end'
  className?: string
}

/**
 * Lightweight popover menu. Closes on outside click and Escape.
 */
export function Dropdown({
  trigger,
  children,
  align = 'end',
  className
}: DropdownProps): ReactNode {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onPointer = (e: MouseEvent): void => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onPointer)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onPointer)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const close = (): void => setOpen(false)

  return (
    <div ref={rootRef} className="relative">
      {trigger({ open, toggle: () => setOpen((v) => !v) })}
      <AnimatePresence>
        {open ? (
          <motion.div
            initial={{ opacity: 0, y: -4, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.98 }}
            transition={{ duration: 0.13, ease: [0.22, 1, 0.36, 1] }}
            className={cn(
              'panel shadow-xl shadow-black/40 absolute z-40 mt-1.5 min-w-[200px] overflow-hidden p-1',
              align === 'end' ? 'right-0' : 'left-0',
              className
            )}
          >
            {typeof children === 'function' ? children(close) : children}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  )
}

export function MenuItem({
  children,
  onClick,
  icon,
  danger,
  disabled,
  shortcut
}: {
  children: ReactNode
  onClick?: () => void
  icon?: ReactNode
  danger?: boolean
  disabled?: boolean
  shortcut?: string
}): ReactNode {
  return (
    <button
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-left text-[13px]',
        'transition-colors duration-100 disabled:pointer-events-none disabled:opacity-40',
        danger
          ? 'text-danger hover:bg-danger-dim'
          : 'text-ink-muted hover:text-ink hover:bg-raised'
      )}
    >
      {icon ? <span className="shrink-0">{icon}</span> : null}
      <span className="min-w-0 flex-1 truncate">{children}</span>
      {shortcut ? (
        <kbd className="text-ink-faint shrink-0 font-mono text-[10px]">{shortcut}</kbd>
      ) : null}
    </button>
  )
}

export function MenuSeparator(): ReactNode {
  return <div className="bg-line my-1 h-px" />
}
