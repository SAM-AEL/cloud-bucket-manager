import { AnimatePresence, motion } from 'framer-motion'
import {
  AlertCircle,
  ArrowDownToLine,
  ArrowUpFromLine,
  CheckCircle2,
  ChevronUp,
  Pause,
  Play,
  X
} from 'lucide-react'
import { useState, type ReactNode } from 'react'
import type { TransferSnapshot } from '@shared/types'
import { transferSummary, useTransferStore } from '@/store/transfers'
import { IconButton } from './ui/Chrome'
import { ProgressBar } from './ui/Feedback'
import { cn, formatBytes, formatSpeed } from '@/lib/format'

/**
 * Bottom dock listing every upload and download. Collapsed it shows a single
 * summary bar so it never competes with the object browser for attention.
 */
export function TransferTray(): ReactNode {
  const [open, setOpen] = useState(false)
  const items = useTransferStore((s) => s.items)
  const clearFinished = useTransferStore((s) => s.clearFinished)

  const summary = transferSummary(items)
  if (items.length === 0) return null

  return (
    <div className="border-line bg-surface shrink-0 border-t">
      <AnimatePresence initial={false}>
        {open ? (
          <motion.div
            key="list"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden"
          >
            <div className="max-h-[240px] overflow-y-auto">
              {items.map((transfer) => (
                <TransferRow key={transfer.id} transfer={transfer} />
              ))}
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <button
        onClick={() => setOpen((v) => !v)}
        className="hover:bg-raised/50 flex w-full items-center gap-3 px-6 py-3 text-left transition-colors"
      >
        <ChevronUp
          className={cn(
            'text-ink-faint size-3.5 shrink-0 transition-transform duration-200',
            !open && 'rotate-180'
          )}
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <span className="text-ink text-[12px] font-medium">
              {summary.active > 0
                ? `${summary.active} in progress`
                : `${items.length} transfer${items.length === 1 ? '' : 's'}`}
            </span>
            {summary.total > 0 ? (
              <span className="text-ink-faint font-mono text-[11px]">
                {formatBytes(summary.loaded)} / {formatBytes(summary.total)}
              </span>
            ) : null}
            {summary.failed > 0 ? (
              <span className="text-danger text-[11px]">{summary.failed} failed</span>
            ) : null}
          </div>
          {summary.active > 0 ? <ProgressBar value={summary.progress} className="mt-1.5" /> : null}
        </div>
        <IconButton
          label="Clear finished transfers"
          size="sm"
          onClick={(e) => {
            e.stopPropagation()
            void clearFinished()
          }}
          icon={<X className="size-3.5" />}
        />
      </button>
    </div>
  )
}

function TransferRow({ transfer }: { transfer: TransferSnapshot }): ReactNode {
  const pause = useTransferStore((s) => s.pause)
  const resume = useTransferStore((s) => s.resume)
  const cancel = useTransferStore((s) => s.cancel)

  const Icon = transfer.kind === 'upload' ? ArrowUpFromLine : ArrowDownToLine

  // Rough throughput from elapsed time since the transfer started.
  const elapsed = (transfer.finishedAt ?? Date.now()) - transfer.startedAt
  const speed = elapsed > 250 ? transfer.loaded / (elapsed / 1000) : 0
  const live = transfer.state === 'running' || transfer.state === 'paused'

  return (
    <motion.div
      layout
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto' }}
      exit={{ opacity: 0, height: 0 }}
      className="border-line flex items-center gap-4 border-t px-6 py-3"
    >
      <Icon
        className={cn(
          'size-3.5 shrink-0',
          transfer.state === 'error'
            ? 'text-danger'
            : transfer.state === 'done'
              ? 'text-positive'
              : 'text-ink-faint'
        )}
      />

      <div className="min-w-0 flex-1">
        <p className="text-ink truncate text-[12px]" title={transfer.name}>
          {transfer.name}
        </p>
        <div className="text-ink-faint flex items-center gap-1.5 text-[10px]">
          <span className="truncate">{transfer.bucket}</span>
          {transfer.total > 0 ? (
            <>
              <span>·</span>
              <span className="font-mono">
                {formatBytes(transfer.loaded)} / {formatBytes(transfer.total)}
              </span>
            </>
          ) : null}
          {transfer.state === 'running' && speed > 0 ? (
            <>
              <span>·</span>
              <span className="font-mono">{formatSpeed(speed)}</span>
            </>
          ) : null}
          {transfer.state === 'error' && transfer.error ? (
            <span className="text-danger truncate">{transfer.error}</span>
          ) : null}
        </div>
        {live ? <ProgressBar value={transfer.progress} className="mt-1.5" /> : null}
      </div>

      {transfer.state === 'done' ? (
        <CheckCircle2 className="text-positive size-4 shrink-0" />
      ) : null}
      {transfer.state === 'error' ? <AlertCircle className="text-danger size-4 shrink-0" /> : null}
      {transfer.state === 'paused' ? (
        <IconButton
          label="Resume"
          size="sm"
          onClick={() => void resume(transfer.id)}
          icon={<Play className="size-3.5" />}
        />
      ) : null}
      {transfer.state === 'running' ? (
        <IconButton
          label="Pause"
          size="sm"
          onClick={() => void pause(transfer.id)}
          icon={<Pause className="size-3.5" />}
        />
      ) : null}
      {(live || transfer.state === 'queued') && (
        <IconButton
          label="Cancel"
          size="sm"
          tone="danger"
          onClick={() => void cancel(transfer.id)}
          icon={<X className="size-3.5" />}
        />
      )}
    </motion.div>
  )
}
