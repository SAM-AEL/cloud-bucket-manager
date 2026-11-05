import { CheckCircle2, Database, Eye, EyeOff, FolderTree, ShieldCheck, XCircle } from 'lucide-react'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import type { ConnectionTest, ProfileInput, ProviderId } from '@shared/types'
import { useProfileStore } from '@/store/profiles'
import { toast } from '@/store/toasts'
import { Dialog } from './ui/Dialog'
import { Button, Input } from './ui/Primitives'
import { cn } from '@/lib/format'

/**
 * Provider catalogue mirrored from main. Keeping a copy here avoids an IPC
 * round-trip on every keystroke in the form; the authoritative values are
 * re-validated in the main process before anything is saved.
 */
const PROVIDERS: Array<{
  id: ProviderId
  label: string
  endpointPlaceholder: string
  defaultRegion: string
  forcePathStyle: boolean
  hint: string
  docsUrl: string
}> = [
  {
    id: 'cloudflare-r2',
    label: 'Cloudflare R2',
    endpointPlaceholder: 'https://<ACCOUNT_ID>.r2.cloudflarestorage.com',
    defaultRegion: 'auto',
    forcePathStyle: false,
    hint:
      'Region is always "auto" for R2. Prefer an account-wide token so every bucket is listed — a token scoped to specific buckets cannot list them, in which case name the bucket below.',
    docsUrl: 'https://developers.cloudflare.com/r2/api/s3/tokens/'
  },
  {
    id: 'aws',
    label: 'Amazon S3',
    endpointPlaceholder: 'https://s3.<REGION>.amazonaws.com',
    defaultRegion: 'us-east-1',
    forcePathStyle: false,
    hint: 'Leave the endpoint blank to use the default AWS endpoint for the region.',
    docsUrl: 'https://docs.aws.amazon.com/cli/latest/userguide/cli-configure-files.html'
  },
  {
    id: 'minio',
    label: 'MinIO',
    endpointPlaceholder: 'https://minio.example.com:9000',
    defaultRegion: 'us-east-1',
    forcePathStyle: true,
    hint: 'Self-hosted MinIO usually works best with path-style addressing.',
    docsUrl: 'https://min.io/docs/minio/linux/integrations/aws-cli-with-minio.html'
  },
  {
    id: 'backblaze-b2',
    label: 'Backblaze B2',
    endpointPlaceholder: 'https://s3.<REGION>.backblazeb2.com',
    defaultRegion: 'us-west-004',
    forcePathStyle: false,
    hint: 'Use the S3-compatible endpoint from your B2 bucket details.',
    docsUrl: 'https://www.backblaze.com/docs/cloud-storage.html'
  },
  {
    id: 'wasabi',
    label: 'Wasabi',
    endpointPlaceholder: 'https://s3.<REGION>.wasabisys.com',
    defaultRegion: 'us-east-1',
    forcePathStyle: false,
    hint: 'Pick the endpoint that matches your bucket region.',
    docsUrl: 'https://wasabi.com/docs/'
  },
  {
    id: 'digitalocean',
    label: 'DigitalOcean Spaces',
    endpointPlaceholder: 'https://<REGION>.digitaloceanspaces.com',
    defaultRegion: 'nyc3',
    forcePathStyle: false,
    hint: 'Region is the Spaces location, e.g. nyc3, ams3, sfo3.',
    docsUrl: 'https://docs.digitalocean.com/products/spaces/'
  },
  {
    id: 'generic',
    label: 'Other S3-compatible',
    endpointPlaceholder: 'https://s3.example.com',
    defaultRegion: 'us-east-1',
    forcePathStyle: true,
    hint: 'Path-style addressing is the safest default for unknown providers.',
    docsUrl: 'https://docs.aws.amazon.com/general/latest/gr/s3.html'
  }
]

interface FormState {
  label: string
  provider: ProviderId
  endpoint: string
  region: string
  accessKeyId: string
  secretAccessKey: string
  /** Sub-path inside a bucket that this profile always opens at. */
  pathPrefix: string
  /**
   * Pin a bucket. Required for bucket-scoped R2 tokens, which are allowed to
   * use a bucket but not to list them.
   */
  defaultBucket: string
}

const EMPTY_FORM: FormState = {
  label: '',
  provider: 'cloudflare-r2',
  endpoint: '',
  region: 'auto',
  accessKeyId: '',
  secretAccessKey: '',
  pathPrefix: '',
  defaultBucket: ''
}

/** Connect (or edit) a storage account. */
export function ConnectDialog({
  open,
  onClose,
  editing
}: {
  open: boolean
  onClose: () => void
  editing?: string
}): ReactNode {
  const create = useProfileStore((s) => s.create)
  const update = useProfileStore((s) => s.update)
  const testDraft = useProfileStore((s) => s.testDraft)
  const test = useProfileStore((s) => s.test)
  const profiles = useProfileStore((s) => s.profiles)

  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [showSecret, setShowSecret] = useState(false)
  const [testing, setTesting] = useState(false)
  const [saving, setSaving] = useState(false)
  const [result, setResult] = useState<ConnectionTest | undefined>()

  const existing = useMemo(
    () => profiles.find((p) => p.id === editing),
    [profiles, editing]
  )
  const provider = useMemo(
    () => PROVIDERS.find((p) => p.id === form.provider) ?? PROVIDERS[0],
    [form.provider]
  )

  // Seed the form when opening, in either create or edit mode.
  useEffect(() => {
    if (!open) return
    setResult(undefined)
    setShowSecret(false)
    if (existing) {
      setForm({
        label: existing.label,
        provider: existing.provider,
        endpoint: existing.endpoint,
        region: existing.region,
        accessKeyId: existing.accessKeyId,
        secretAccessKey: '',
        pathPrefix: existing.pathPrefix ?? '',
        defaultBucket: existing.defaultBucket ?? ''
      })
    } else {
      setForm(EMPTY_FORM)
    }
  }, [open, existing])

  const set = <K extends keyof FormState>(key: K, value: FormState[K]): void => {
    setForm((f) => ({ ...f, [key]: value }))
    // Any change invalidates the previous verdict.
    setResult(undefined)
  }

  const chooseProvider = (id: ProviderId): void => {
    const preset = PROVIDERS.find((p) => p.id === id) ?? PROVIDERS[0]
    setForm((f) => ({ ...f, provider: id, region: preset.defaultRegion }))
    setResult(undefined)
  }

  const bucketProblem = (() => {
    const value = form.defaultBucket.trim()
    if (!value) return null
    if (value.length < 3 || value.length > 63) return 'A bucket name must be 3-63 characters'
    if (!/^[a-z0-9][a-z0-9.-]*[a-z0-9]$/.test(value)) {
      return 'Use lowercase letters, numbers, dots and hyphens only'
    }
    return null
  })()

  // Reject traversal-style segments before they ever reach the S3 prefix.
  const pathProblem = (() => {
    const value = form.pathPrefix.trim()
    if (!value) return null
    if (value.split('/').some((segment) => segment === '..')) {
      return 'A path cannot contain ".." segments'
    }
    return null
  })()

  const hasSecret = editing ? form.secretAccessKey !== '' || Boolean(existing) : form.secretAccessKey !== ''
  const needsEndpoint = form.provider !== 'aws'
  const complete =
    form.label.trim() !== '' &&
    form.accessKeyId.trim() !== '' &&
    hasSecret &&
    (!needsEndpoint || form.endpoint.trim() !== '')

  const buildInput = (): ProfileInput => ({
    label: form.label.trim(),
    provider: form.provider,
    endpoint: form.endpoint.trim(),
    region: form.region.trim() || provider.defaultRegion,
    accessKeyId: form.accessKeyId.trim(),
    secretAccessKey: form.secretAccessKey,
    forcePathStyle: provider.forcePathStyle,
    pathPrefix: form.pathPrefix,
    defaultBucket: form.defaultBucket.trim() || undefined
  })

  const runTest = async (): Promise<void> => {
    setTesting(true)
    try {
      const verdict =
        editing && !form.secretAccessKey ? await test(editing) : await testDraft(buildInput())
      setResult(verdict)
    } catch (error) {
      setResult({
        ok: false,
        ms: 0,
        error: {
          name: 'Error',
          message: error instanceof Error ? error.message : 'The connection test failed.'
        }
      })
    } finally {
      setTesting(false)
    }
  }

  const save = async (): Promise<void> => {
    setSaving(true)
    try {
      if (editing) {
        await update(editing, {
          label: form.label.trim(),
          provider: form.provider,
          endpoint: form.endpoint.trim(),
          region: form.region.trim(),
          accessKeyId: form.accessKeyId.trim(),
          pathPrefix: form.pathPrefix,
          defaultBucket: form.defaultBucket.trim() || undefined,
          // A blank secret means "keep the stored one".
          ...(form.secretAccessKey ? { secretAccessKey: form.secretAccessKey } : {})
        })
        toast.success('Profile updated')
      } else {
        await create(buildInput())
        toast.success('Account connected')
      }
      onClose()
    } catch (error) {
      toast.error('Could not save profile', error instanceof Error ? error.message : undefined)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={editing ? 'Edit connection' : 'Connect an account'}
      description={
        editing
          ? 'Update the endpoint or credentials for this profile.'
          : 'Add credentials for any S3-compatible object store.'
      }
      size="lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="secondary"
            loading={testing}
            disabled={!complete}
            onClick={() => void runTest()}
          >
            Test connection
          </Button>
          <Button
            variant="primary"
            loading={saving}
            disabled={!complete}
            onClick={() => void save()}
          >
            {editing ? 'Save changes' : 'Connect'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <label className="text-ink-muted mb-1.5 block text-xs font-medium">Provider</label>
          <div className="flex flex-wrap gap-1.5">
            {PROVIDERS.map((p) => (
              <button
                key={p.id}
                onClick={() => chooseProvider(p.id)}
                className={cn(
                  'rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors',
                  p.id === form.provider
                    ? 'border-brand bg-brand-dim text-brand'
                    : 'border-line text-ink-muted hover:bg-raised hover:text-ink'
                )}
              >
                {p.label}
              </button>
            ))}
          </div>
          <p className="text-ink-faint mt-2 text-[11px] leading-4">{provider.hint}</p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Profile name">
            <Input
              value={form.label}
              onChange={(e) => set('label', e.target.value)}
              placeholder="Production R2"
            />
          </Field>
          <Field label="Region">
            <Input
              value={form.region}
              onChange={(e) => set('region', e.target.value)}
              placeholder={provider.defaultRegion}
            />
          </Field>
        </div>

        <Field label="Endpoint">
          <Input
            value={form.endpoint}
            onChange={(e) => set('endpoint', e.target.value)}
            placeholder={provider.endpointPlaceholder}
            spellCheck={false}
            autoComplete="off"
            className="font-mono"
          />
        </Field>

        <Field
          label="Bucket"
          hint="Optional. Required only if your token is scoped to specific buckets — such a token can use a bucket it names but cannot list all of them."
        >
          <Input
            value={form.defaultBucket}
            onChange={(e) => set('defaultBucket', e.target.value)}
            placeholder="my-bucket"
            spellCheck={false}
            autoComplete="off"
            className="font-mono"
            icon={<Database className="size-3.5" />}
            invalid={Boolean(bucketProblem)}
          />
          {bucketProblem ? (
            <p className="text-danger mt-1.5 text-[11px]">{bucketProblem}</p>
          ) : null}
        </Field>

        <Field
          label="Default sub-path"
          hint="Optional. Opening any bucket through this profile starts here instead of at the bucket root."
        >
          <Input
            value={form.pathPrefix}
            onChange={(e) => set('pathPrefix', e.target.value)}
            placeholder="assets/images"
            spellCheck={false}
            autoComplete="off"
            className="font-mono"
            icon={<FolderTree className="size-3.5" />}
            invalid={Boolean(pathProblem)}
          />
          {pathProblem ? <p className="text-danger mt-1.5 text-[11px]">{pathProblem}</p> : null}
        </Field>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Access key ID">
            <Input
              value={form.accessKeyId}
              onChange={(e) => set('accessKeyId', e.target.value)}
              placeholder="••••••••••••"
              spellCheck={false}
              autoComplete="off"
              className="font-mono"
            />
          </Field>
          <Field label="Secret access key">
            <div className="relative">
              <Input
                type={showSecret ? 'text' : 'password'}
                value={form.secretAccessKey}
                onChange={(e) => set('secretAccessKey', e.target.value)}
                placeholder={editing ? 'Leave blank to keep current' : '••••••••••••'}
                spellCheck={false}
                autoComplete="off"
                className="pr-10 font-mono"
              />
              <button
                type="button"
                onClick={() => setShowSecret((v) => !v)}
                aria-label={showSecret ? 'Hide secret' : 'Show secret'}
                className="text-ink-faint hover:text-ink absolute top-1/2 right-2 -translate-y-1/2 p-1"
              >
                {showSecret ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
              </button>
            </div>
          </Field>
        </div>

        <div className="border-line bg-raised/40 flex items-start gap-2 rounded-lg border p-2.5">
          <ShieldCheck className="text-positive mt-px size-3.5 shrink-0" />
          <p className="text-ink-muted text-[11px] leading-4">
            Credentials are encrypted with your operating system keychain and stored only on this
            computer. They are sent nowhere except the endpoint you configure.
          </p>
        </div>

        {result ? <Verdict result={result} /> : null}

        <a
          href={provider.docsUrl}
          onClick={(e) => {
            e.preventDefault()
            void window.r2m?.shell.openExternal(provider.docsUrl)
          }}
          className="text-brand hover:text-brand-strong inline-block text-[11px]"
        >
          Where do I find these credentials? ↗
        </a>
      </div>
    </Dialog>
  )
}

function Field({
  label,
  hint,
  children
}: {
  label: string
  hint?: string
  children: ReactNode
}): ReactNode {
  return (
    <div>
      <label className="text-ink-muted mb-1.5 block text-xs font-medium">{label}</label>
      {children}
      {hint ? <p className="text-ink-faint mt-1.5 text-[11px] leading-4">{hint}</p> : null}
    </div>
  )
}

/** Success/failure panel for the "Test connection" action. */
function Verdict({ result }: { result: ConnectionTest }): ReactNode {
  // A bucket-scoped token connected fine — it simply cannot enumerate buckets.
  // Saying "0 buckets" would read like a failure, so this is called out.
  if (result.ok && result.bucketScoped) {
    return (
      <div className="flex items-start gap-2 rounded-lg bg-caution/10 p-3 text-xs text-caution">
        <CheckCircle2 className="mt-px size-3.5 shrink-0" />
        <div className="min-w-0">
          <p className="font-medium">
            Connected in {result.ms} ms — credentials are valid
          </p>
          <p className="text-ink-muted mt-1 leading-4">
            This token is scoped to specific buckets, so it cannot list them. It works with{' '}
            <span className="text-ink font-medium">
              {(result.accessibleBuckets ?? []).join(', ') || 'the bucket you named'}
            </span>
            , which is now pinned to this profile.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div
      className={cn(
        'flex items-start gap-2 rounded-lg p-3 text-xs',
        result.ok ? 'bg-positive/10 text-positive' : 'bg-danger-dim text-danger'
      )}
    >
      {result.ok ? (
        <CheckCircle2 className="mt-px size-3.5 shrink-0" />
      ) : (
        <XCircle className="mt-px size-3.5 shrink-0" />
      )}
      <div className="min-w-0">
        {result.ok ? (
          <p className="font-medium">
            Connected in {result.ms} ms · {result.bucketCount} bucket
            {result.bucketCount === 1 ? '' : 's'} visible
          </p>
        ) : (
          <>
            <p className="font-medium">{result.error?.message ?? 'Connection failed.'}</p>
            {result.error?.hint ? (
              <p className="text-ink-muted mt-1 leading-4">{result.error.hint}</p>
            ) : null}
          </>
        )}
      </div>
    </div>
  )
}

