import { AlertTriangle, FolderTree, HardDrive, Loader2, Plus, RefreshCw, Settings2 } from 'lucide-react'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useAppStore } from '@/store/app'
import { useObjectStore } from '@/store/objects'
import { useProfileStore } from '@/store/profiles'
import { Button } from './ui/Primitives'
import { IconButton } from './ui/Chrome'
import { BucketList } from './BucketList'
import { errorMessage } from '@/lib/bridge'
import { cn } from '@/lib/format'

/**
 * Account + bucket navigation. Collapses to an icon rail so the object
 * browser can take the full width on narrow windows.
 */
export function Sidebar({
  onConnect,
  onSettings
}: {
  onConnect: () => void
  onSettings: () => void
}): ReactNode {
  const collapsed = useAppStore((s) => s.sidebarCollapsed)

  const profiles = useProfileStore((s) => s.profiles)
  const activeId = useProfileStore((s) => s.activeId)
  const select = useProfileStore((s) => s.select)

  const buckets = useObjectStore((s) => s.buckets)
  const loading = useObjectStore((s) => s.bucketsLoading)
  const error = useObjectStore((s) => s.bucketsError)
  const errorHintText = useObjectStore((s) => s.bucketsErrorHint)
  const loadBuckets = useObjectStore((s) => s.loadBuckets)

  const [filter, setFilter] = useState('')

  // Fetch buckets whenever the active account changes.
  useEffect(() => {
    if (activeId) void loadBuckets(activeId)
  }, [activeId, loadBuckets])

  const active = useMemo(() => profiles.find((p) => p.id === activeId), [profiles, activeId])

  if (collapsed) {
    return (
      <aside className="border-line bg-surface flex w-12 shrink-0 flex-col items-center gap-2 border-r py-3">
        {profiles.map((profile) => (
          <button
            key={profile.id}
            title={profile.label}
            onClick={() => void select(profile.id)}
            className={cn(
              'grid size-8 place-items-center rounded-lg transition-colors',
              profile.id === activeId
                ? 'bg-brand-dim text-brand'
                : 'text-ink-faint hover:bg-raised hover:text-ink'
            )}
          >
            <HardDrive className="size-4" />
          </button>
        ))}
        <IconButton label="Settings" onClick={onSettings} icon={<Settings2 className="size-4" />} />
      </aside>
    )
  }

  return (
    <aside className="border-line bg-surface flex w-[248px] shrink-0 flex-col border-r">
      <div className="border-line flex items-center justify-between border-b px-3 py-2.5">
        <span className="text-ink-faint text-[11px] font-semibold tracking-wider uppercase">
          Accounts
        </span>
        <IconButton
          label="Connect an account"
          size="sm"
          onClick={onConnect}
          icon={<Plus className="size-3.5" />}
        />
      </div>

      <div className="max-h-[28%] shrink-0 overflow-y-auto py-1.5">
        {profiles.length === 0 ? (
          <p className="text-ink-faint px-3 py-2 text-xs">No accounts connected yet.</p>
        ) : (
          profiles.map((profile) => (
            <button
              key={profile.id}
              onClick={() => void select(profile.id)}
              className={cn(
                'flex w-full items-center gap-2.5 px-3 py-2 text-left transition-colors',
                profile.id === activeId ? 'bg-brand-dim' : 'hover:bg-raised'
              )}
            >
              <HardDrive
                className={cn(
                  'size-4 shrink-0',
                  profile.id === activeId ? 'text-brand' : 'text-ink-faint'
                )}
              />
              <div className="min-w-0 flex-1">
                <p
                  className={cn(
                    'truncate text-sm leading-5 font-medium',
                    profile.id === activeId ? 'text-brand' : 'text-ink'
                  )}
                >
                  {profile.label}
                </p>
                <p className="text-ink-faint mt-0.5 flex items-center gap-1 truncate text-[11px]">
                  <span>{profile.provider}</span>
                  {profile.pathPrefix ? (
                    <>
                      <span aria-hidden="true">·</span>
                      {/* Scoped profile: show the sub-path it opens at. */}
                      <span
                        className="text-ink-faint flex min-w-0 items-center gap-1"
                        title={`Opens at ${profile.pathPrefix}`}
                      >
                        <FolderTree className="size-3 shrink-0" />
                        <span className="truncate">{profile.pathPrefix}</span>
                      </span>
                    </>
                  ) : null}
                </p>
              </div>
            </button>
          ))
        )}
      </div>

      <div className="border-line mt-1 flex items-center justify-between border-t px-3 pt-2.5">
        <span className="text-ink-faint text-[11px] font-semibold tracking-wider uppercase">
          Buckets
        </span>
        <IconButton
          label="Refresh buckets"
          size="sm"
          onClick={() => activeId && void loadBuckets(activeId)}
          icon={
            loading ? (
              <Loader2 className="text-ink-faint size-3.5 animate-spin" />
            ) : (
              <RefreshCw className="size-3.5" />
            )
          }
        />
      </div>

      <div className="px-3 py-2">
        <input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filter buckets"
          className="border-line bg-raised/60 text-ink placeholder:text-ink-faint focus:border-brand w-full rounded-md border px-2 py-1.5 text-xs outline-none"
        />
      </div>

      {error ? (
        <BucketRecovery
          message={error}
          hint={errorHintText}
          activeProfileId={activeId}
          onRetry={() => activeId && void loadBuckets(activeId)}
        />
      ) : null}

      <BucketList
        buckets={buckets}
        loading={loading}
        filter={filter}
        activeProfileId={activeId}
      />

      <div className="border-line border-t p-2">
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start"
          icon={<Settings2 className="size-3.5" />}
          onClick={onSettings}
        >
          Settings
        </Button>
        {active ? (
          <p className="text-ink-faint truncate px-2 pt-1 text-[10px]">{active.endpoint}</p>
        ) : null}
      </div>
    </aside>
  )
}

/**
 * Recovery panel shown when listing buckets fails.
 *
 * The overwhelmingly common cause with Cloudflare R2 is a token scoped to
 * specific buckets: the credentials are valid but cannot call the account-level
 * listing API. Rather than showing a dead-end error, this offers the fix —
 * name the bucket, pin it to the profile, and carry on.
 */
export function BucketRecovery({
  message,
  hint,
  activeProfileId,
  onRetry
}: {
  message: string
  hint?: string
  activeProfileId?: string
  onRetry: () => void
}): React.ReactNode {
  const [bucket, setBucket] = useState('')
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState<string | undefined>()

  const profiles = useProfileStore((s) => s.profiles)
  const update = useProfileStore((s) => s.update)
  const loadBuckets = useObjectStore((s) => s.loadBuckets)
  const profile = profiles.find((p) => p.id === activeProfileId)

  const pin = async (): Promise<void> => {
    const name = bucket.trim()
    if (!name || !activeProfileId) return
    setBusy(true)
    setFailed(undefined)
    try {
      // Pinning writes the bucket onto the profile; main then probes it with
      // HeadBucket instead of listing.
      await update(activeProfileId, { defaultBucket: name })
      await loadBuckets(activeProfileId)
      setBucket('')
    } catch (error) {
      setFailed(errorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  const canPin = profile !== undefined && bucket.trim().length > 0

  return (
    <div className="border-danger/30 bg-danger-dim mx-3 mb-3 rounded-xl border p-3">
      <div className="flex gap-2">
        <AlertTriangle className="text-danger mt-px size-3.5 shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="text-ink text-[13px] leading-5 font-medium">{message}</p>
          {hint ? <p className="text-ink-muted mt-1 text-[11px] leading-4">{hint}</p> : null}
        </div>
      </div>

      <div className="mt-3">
        <label htmlFor="bucket-recovery" className="text-ink-muted mb-1.5 block text-[11px] font-medium">
          Or name the bucket directly
        </label>
        <div className="flex gap-1.5">
          <input
            id="bucket-recovery"
            value={bucket}
            disabled={busy}
            onChange={(e) => {
              setBucket(e.target.value)
              setFailed(undefined)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                void pin()
              }
            }}
            placeholder="my-bucket"
            spellCheck={false}
            autoComplete="off"
            className="border-line bg-surface text-ink placeholder:text-ink-faint focus:border-brand min-w-0 flex-1 rounded-md border px-2 py-1.5 font-mono text-xs outline-none disabled:opacity-50"
          />
          <Button size="sm" variant="secondary" loading={busy} disabled={!canPin} onClick={() => void pin()}>
            Use it
          </Button>
        </div>
        {failed ? <p className="text-danger mt-1.5 text-[11px]">{failed}</p> : null}
        <p className="text-ink-faint mt-1.5 text-[10px] leading-4">
          Saved to this profile, so it sticks next time.
        </p>
      </div>

      <button
        onClick={onRetry}
        className="text-ink-muted hover:text-ink mt-2.5 inline-flex items-center gap-1.5 text-[11px] transition-colors"
      >
        <RefreshCw className="size-3" />
        Try listing again
      </button>
    </div>
  )
}
