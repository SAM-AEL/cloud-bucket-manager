import { Copy, Info, Link2 } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import type { ObjectMeta } from '@shared/types'
import { bridge, call, copyToClipboard, errorMessage } from '@/lib/bridge'
import { useObjectStore } from '@/store/objects'
import { useAppStore } from '@/store/app'
import { toast } from '@/store/toasts'
import { Badge } from './ui/Chrome'
import { Button } from './ui/Primitives'
import { Skeleton } from './ui/Feedback'
import { cleanEtag, cn, formatBytes, formatDate, formatRelative, guessContentType } from '@/lib/format'

function Header(): ReactNode {
  return (
    <div className="border-line border-b px-3 py-2.5">
      <span className="text-ink-faint text-[11px] font-semibold tracking-wider uppercase">
        Details
      </span>
    </div>
  )
}

/** Label/value pair with optional copy affordance. */
function Row({
  label,
  value,
  mono,
  onCopy
}: {
  label: string
  value: string
  mono?: boolean
  onCopy?: () => void
}): ReactNode {
  return (
    <div className="group">
      <dt className="text-ink-faint text-[10px] font-medium tracking-wide uppercase">{label}</dt>
      <dd
        className={cn(
          'text-ink-muted mt-0.5 truncate text-[12px]',
          mono && 'font-mono text-[11px]'
        )}
        title={value}
      >
        {value}
      </dd>
      {onCopy ? (
        <button
          onClick={onCopy}
          className="text-ink-faint hover:text-ink mt-0.5 inline-flex items-center gap-1 text-[10px] opacity-0 transition-opacity group-hover:opacity-100"
        >
          <Copy className="size-2.5" /> copy
        </button>
      ) : null}
    </div>
  )
}

/** Right-hand inspector showing full metadata for the focused object. */
export function Inspector(): ReactNode {
  const focused = useObjectStore((s) => s.focused)
  const bucket = useObjectStore((s) => s.bucket)
  const profileId = useObjectStore((s) => s.profileId)
  const caps = useAppStore((s) => s.caps)

  const [meta, setMeta] = useState<ObjectMeta | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | undefined>()

  // Fetch authoritative metadata; listings do not include Content-Type.
  useEffect(() => {
    if (!focused || !bucket || !profileId) {
      setMeta(null)
      return
    }
    let canceled = false
    setLoading(true)
    setError(undefined)
    call(() => bridge().objects.head({ profileId, bucket, key: focused }))
      .then((result) => {
        if (canceled) return
        setMeta(result)
        if (!result) setError('This object no longer exists.')
      })
      .catch((e) => !canceled && setError(errorMessage(e)))
      .finally(() => !canceled && setLoading(false))
    return () => {
      canceled = true
    }
  }, [focused, bucket, profileId])

  const copyValue = async (label: string, value: string): Promise<void> => {
    try {
      await copyToClipboard(value)
      toast.success(`${label} copied`)
    } catch {
      toast.error(`Could not copy ${label.toLowerCase()}`)
    }
  }

  const share = async (): Promise<void> => {
    // Narrow here so the key is a plain string inside the closure below.
    if (!profileId || !bucket || !focused) return
    if (!caps.presignedUrls) {
      toast.error('This provider does not support presigned URLs.')
      return
    }
    try {
      const { url, expiresIn } = await call(() =>
        bridge().objects.presign({ profileId, bucket, key: focused, expiresIn: 3600 })
      )
      await copyToClipboard(url)
      toast.success('Signed URL copied', `Valid for ${Math.round(expiresIn / 3600)} hour(s).`)
    } catch (e) {
      toast.error('Could not create a signed URL', errorMessage(e))
    }
  }

  if (!focused) {
    return (
      <aside className="border-line bg-surface hidden w-[320px] shrink-0 flex-col border-l xl:flex">
        <Header />
        <div className="text-ink-faint flex flex-1 flex-col items-center justify-center gap-2 px-6 text-center">
          <Info className="size-5" />
          <p className="text-xs">Select an object to see its details.</p>
        </div>
      </aside>
    )
  }

  const name = focused.split('/').pop() ?? focused
  const custom = Object.entries(meta?.metadata ?? {})

  return (
    <aside className="border-line bg-surface hidden w-[320px] shrink-0 flex-col border-l xl:flex">
      <Header />
      <div className="min-h-0 flex-1 overflow-y-auto p-5">
        <div className="mb-3 flex items-start gap-2.5">
          <div className="bg-raised text-ink-muted mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg text-[11px] font-semibold uppercase">
            {name.split('.').pop()?.slice(0, 4) ?? '—'}
          </div>
          <div className="min-w-0">
            <p className="text-ink truncate text-[13px] font-medium" title={name}>
              {name}
            </p>
            <p className="text-ink-faint truncate text-[11px]">{guessContentType(focused)}</p>
          </div>
        </div>

        {loading ? (
          <div className="space-y-2.5">
            {Array.from({ length: 7 }, (_, i) => (
              <div key={i} className="space-y-1.5">
                <Skeleton className="h-2.5 w-16" />
                <Skeleton className="h-3 w-full" />
              </div>
            ))}
          </div>
        ) : error ? (
          <p className="text-danger bg-danger-dim rounded-lg p-2.5 text-xs">{error}</p>
        ) : (
          <dl className="space-y-3">
            <Row label="Size" value={formatBytes(meta?.contentLength ?? 0)} />
            <Row label="Modified" value={formatDate(meta?.lastModified)} />
            <Row label="Relative" value={formatRelative(meta?.lastModified)} />
            <Row label="Type" value={meta?.contentType ?? guessContentType(focused)} />
            {meta?.storageClass ? <Row label="Storage class" value={meta.storageClass} /> : null}
            <Row
              label="ETag"
              value={cleanEtag(meta?.etag) ?? '—'}
              mono
              onCopy={meta?.etag ? () => void copyValue('ETag', meta.etag as string) : undefined}
            />
            {meta?.cacheControl ? <Row label="Cache-Control" value={meta.cacheControl} mono /> : null}
            {meta?.contentEncoding ? <Row label="Encoding" value={meta.contentEncoding} /> : null}
            {custom.map(([key, value]) => (
              <Row key={key} label={key} value={value} mono />
            ))}
          </dl>
        )}

        {custom.length > 0 && !loading ? (
          <div className="mt-4">
            <Badge tone="brand">{custom.length} custom headers</Badge>
          </div>
        ) : null}
      </div>

      <div className="border-line space-y-2 border-t p-4">
        <Button
          size="sm"
          variant="secondary"
          className="w-full justify-center"
          icon={<Link2 className="size-3.5" />}
          onClick={() => void share()}
        >
          Copy signed URL
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="w-full justify-center"
          icon={<Copy className="size-3.5" />}
          onClick={() => void copyValue('Key', focused)}
        >
          Copy key
        </Button>
      </div>
    </aside>
  )
}

