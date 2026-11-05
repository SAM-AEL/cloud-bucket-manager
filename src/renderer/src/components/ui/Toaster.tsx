import { AnimatePresence, motion } from 'framer-motion'
import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react'
import { useEffect, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useToastStore, type Toast, type ToastKind } from '@/store/toasts'

const ICONS: Record<ToastKind, ReactNode> = {
  success: <CheckCircle2 className="text-positive size-4" />,
  error: <AlertCircle className="text-danger size-4" />,
  info: <Info className="text-brand size-4" />
}

function ToastCard({ id, kind, title, description, action, duration }: Toast): ReactNode {
  const dismiss = useToastStore((s) => s.dismiss)

  useEffect(() => {
    if (duration <= 0) return
    const timer = window.setTimeout(() => dismiss(id), duration)
    return () => window.clearTimeout(timer)
  }, [id, duration, dismiss])

  return (
    <motion.div
      layout
      role="status"
      initial={{ opacity: 0, y: 12, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, x: 24, scale: 0.97 }}
      transition={{ type: 'spring', stiffness: 380, damping: 32 }}
      className="panel shadow-xl shadow-black/40 pointer-events-auto flex w-[360px] items-start gap-3 p-3.5"
    >
      <span className="mt-0.5 shrink-0">{ICONS[kind]}</span>
      <div className="min-w-0 flex-1">
        <p className="text-ink text-[13px] leading-5 font-medium">{title}</p>
        {description ? (
          <p className="text-ink-muted mt-0.5 text-xs leading-5 break-words">{description}</p>
        ) : null}
        {action ? (
          <button
            onClick={() => {
              action.run()
              dismiss(id)
            }}
            className="text-brand hover:text-brand-strong mt-2 text-xs font-medium"
          >
            {action.label}
          </button>
        ) : null}
      </div>
      <button
        onClick={() => dismiss(id)}
        aria-label="Dismiss notification"
        className="text-ink-faint hover:text-ink -mt-0.5 -mr-0.5 shrink-0 rounded p-1 transition-colors"
      >
        <X className="size-3.5" />
      </button>
    </motion.div>
  )
}

/** Toast host. Mounted once at the app root. */
export function Toaster(): ReactNode {
  const toasts = useToastStore((s) => s.toasts)

  return createPortal(
    <div className="pointer-events-none fixed right-4 bottom-4 z-[60] flex flex-col items-end gap-2.5">
      <AnimatePresence mode="popLayout" initial={false}>
        {toasts.map((toast) => (
          <ToastCard key={toast.id} {...toast} />
        ))}
      </AnimatePresence>
    </div>,
    document.body
  )
}
