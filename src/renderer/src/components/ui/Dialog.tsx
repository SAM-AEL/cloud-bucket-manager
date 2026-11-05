import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { X } from 'lucide-react'
import { useEffect, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { cn } from '@/lib/format'
import { IconButton } from './Chrome'

interface DialogProps {
  open: boolean
  onClose: () => void
  title: string
  description?: string
  children: ReactNode
  footer?: ReactNode
  /** Wider variant for the connect-profile form. */
  size?: 'sm' | 'md' | 'lg'
}

export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = 'md'
}: DialogProps): ReactNode {
  const reduce = useReducedMotion()

  // Escape to close, and lock background scroll while modal.
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  const widths = { sm: 'max-w-sm', md: 'max-w-lg', lg: 'max-w-2xl' }

  return createPortal(
    <AnimatePresence>
      {open ? (
        <div className="fixed inset-0 z-50 grid place-items-center p-6">
          <motion.div
            className="absolute inset-0 bg-black/55 backdrop-blur-[2px]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: reduce ? 0 : 0.16 }}
            onClick={onClose}
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label={title}
            className={cn(
              'panel shadow-2xl shadow-black/50 relative w-full overflow-hidden',
              widths[size]
            )}
            initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.97, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.98, y: 4 }}
            transition={{ duration: reduce ? 0 : 0.18, ease: [0.22, 1, 0.36, 1] }}
          >
            <header className="border-line flex items-start justify-between gap-5 border-b px-7 py-5">
              <div className="min-w-0">
                <h2 className="text-ink text-base font-semibold">{title}</h2>
                {description ? (
                  <p className="text-ink-muted mt-1 text-sm">{description}</p>
                ) : null}
              </div>
              <IconButton label="Close" onClick={onClose} icon={<X className="size-4" />} />
            </header>

            <div className="max-h-[68vh] overflow-y-auto px-7 py-6">{children}</div>

            {footer ? (
              <footer className="border-line bg-raised/40 flex items-center justify-end gap-3 border-t px-7 py-4">
                {footer}
              </footer>
            ) : null}
          </motion.div>
        </div>
      ) : null}
    </AnimatePresence>,
    document.body
  )
}

interface ConfirmDialogProps {
  open: boolean
  title: string
  message: string
  confirmLabel?: string
  destructive?: boolean
  onConfirm: () => void
  onCancel: () => void
}

/** In-app confirmation, used when the OS dialog would be too heavy-handed. */
export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Confirm',
  destructive,
  onConfirm,
  onCancel
}: ConfirmDialogProps): ReactNode {
  return (
    <Dialog
      open={open}
      onClose={onCancel}
      title={title}
      size="sm"
      footer={
        <>
          <button
            onClick={onCancel}
            className="text-ink-muted hover:text-ink hover:bg-raised h-9 rounded-lg px-3.5 text-sm font-medium transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className={cn(
              'h-9 rounded-lg px-3.5 text-sm font-medium transition-colors',
              destructive
                ? 'bg-danger text-white hover:brightness-110'
                : 'bg-brand text-brand-ink hover:bg-brand-strong'
            )}
          >
            {confirmLabel}
          </button>
        </>
      }
    >
      <p className="text-ink-muted text-sm">{message}</p>
    </Dialog>
  )
}
