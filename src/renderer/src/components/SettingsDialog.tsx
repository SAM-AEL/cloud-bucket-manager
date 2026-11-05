import { KeyRound, Monitor, Moon, Sun, Trash2 } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { useAppStore } from '@/store/app'
import { useObjectStore } from '@/store/objects'
import { useProfileStore } from '@/store/profiles'
import { toast } from '@/store/toasts'
import { Dialog } from './ui/Dialog'
import { Button, Switch } from './ui/Primitives'
import { Badge } from './ui/Chrome'
import { cn, formatDate } from '@/lib/format'

function Section({ title, children }: { title: string; children: ReactNode }): ReactNode {
  return (
    <section>
      <h3 className="text-ink-faint mb-2.5 text-[11px] font-semibold tracking-wider uppercase">
        {title}
      </h3>
      <div className="space-y-3">{children}</div>
    </section>
  )
}

function Row({ label, children }: { label: string; children: ReactNode }): ReactNode {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-ink text-[13px]">{label}</span>
      {children}
    </div>
  )
}

type VaultMethod = 'keychain' | 'dpapi' | 'libsecret' | 'machine' | 'memory'

/** One-line explanation of what the active protection tier actually does. */
function securityMethodBlurb(method: VaultMethod | undefined): string {
  switch (method) {
    case 'keychain':
      return 'Secrets are stored in your macOS login keychain and released only to this app.'
    case 'dpapi':
      return 'Secrets are sealed with Windows DPAPI and can only be read by your user account.'
    case 'libsecret':
      return 'Secrets are stored in your desktop keyring (GNOME Keyring or KWallet).'
    case 'machine':
      return 'Secrets are encrypted on disk and restored automatically next time you open the app.'
    case 'memory':
      return 'No encryption backend was available, so secrets are kept in memory for this session only.'
    default:
      return 'Checking credential storage…'
  }
}

/** Appearance, behaviour and profile management. */
export function SettingsDialog({
  open,
  onClose,
  onEditProfile
}: {
  open: boolean
  onClose: () => void
  onEditProfile: (id: string) => void
}): ReactNode {
  const settings = useAppStore((s) => s.settings)
  const patch = useAppStore((s) => s.patchSettings)
  const security = useAppStore((s) => s.security)
  const setShowHidden = useObjectStore((s) => s.setShowHidden)

  const profiles = useProfileStore((s) => s.profiles)
  const remove = useProfileStore((s) => s.remove)
  const [pending, setPending] = useState<string | undefined>()

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Settings"
      description="Appearance, behaviour and connected accounts."
      size="lg"
      footer={
        <Button variant="primary" onClick={onClose}>
          Done
        </Button>
      }
    >
      <div className="space-y-6">
        <Section title="Appearance">
          <Row label="Theme">
            <div className="border-line bg-raised/50 flex gap-0.5 rounded-lg border p-0.5">
              {(
                [
                  { id: 'light', label: 'Light', icon: <Sun className="size-3.5" /> },
                  { id: 'dark', label: 'Dark', icon: <Moon className="size-3.5" /> },
                  { id: 'system', label: 'Auto', icon: <Monitor className="size-3.5" /> }
                ] as const
              ).map((option) => (
                <button
                  key={option.id}
                  onClick={() => void patch({ theme: option.id })}
                  className={cn(
                    'flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
                    settings.theme === option.id
                      ? 'bg-brand text-brand-ink'
                      : 'text-ink-muted hover:text-ink'
                  )}
                >
                  {option.icon}
                  {option.label}
                </button>
              ))}
            </div>
          </Row>

          <Row label="Row density">
            <div className="border-line bg-raised/50 flex gap-0.5 rounded-lg border p-0.5">
              {(['comfortable', 'compact'] as const).map((option) => (
                <button
                  key={option}
                  onClick={() => void patch({ density: option })}
                  className={cn(
                    'rounded-md px-2.5 py-1 text-xs font-medium capitalize transition-colors',
                    settings.density === option
                      ? 'bg-brand text-brand-ink'
                      : 'text-ink-muted hover:text-ink'
                  )}
                >
                  {option}
                </button>
              ))}
            </div>
          </Row>
        </Section>

        <Section title="Behaviour">
          <Switch
            label="Confirm before deleting"
            description="Ask for confirmation before removing objects or buckets."
            checked={settings.confirmDeletes}
            onChange={(v) => void patch({ confirmDeletes: v })}
          />
          <Switch
            label="Show hidden files"
            description="Include keys that start with a dot."
            checked={settings.showHiddenFiles}
            onChange={(v) => {
              void patch({ showHiddenFiles: v })
              setShowHidden(v)
            }}
          />
        </Section>

        <Section title="Security">
          <div className="border-line bg-raised/40 flex items-start gap-3 rounded-xl border p-4">
            <span
              className={cn(
                'mt-0.5 grid size-9 shrink-0 place-items-center rounded-lg',
                security?.persistent
                  ? 'bg-positive/12 text-positive'
                  : 'bg-caution/12 text-caution'
              )}
            >
              <KeyRound className="size-4" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-ink text-sm font-medium">
                {security?.label ?? 'Checking credential storage…'}
              </p>
              <p className="text-ink-muted mt-1.5 text-xs leading-5">
                {securityMethodBlurb(security?.method)}
              </p>
              {security?.method === 'machine' ? (
                <p className="text-ink-faint mt-2 text-[11px] leading-4">
                  Your system keyring was not reachable, so secrets are sealed with AES-256-GCM using a
                  key derived from this machine&apos;s identifier. The file cannot be opened on another
                  machine or by another user account.
                </p>
              ) : null}
              {security?.method === 'memory' ? (
                <p className="text-caution mt-2 text-[11px] leading-4">
                  Install a system keyring (GNOME Keyring or KWallet on Linux) to keep credentials
                  between sessions.
                </p>
              ) : null}
            </div>
            <Badge tone={security?.persistent ? 'positive' : 'caution'}>
              {security?.persistent ? 'Saved' : 'Session only'}
            </Badge>
          </div>
        </Section>

        <Section title={`Connected accounts (${profiles.length})`}>
          {profiles.length === 0 ? (
            <p className="text-ink-faint text-xs">No accounts connected yet.</p>
          ) : (
            <ul className="space-y-2">
              {profiles.map((profile) => (
                <li key={profile.id} className="border-line flex items-center gap-3 rounded-lg border p-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-ink truncate text-[13px] font-medium">{profile.label}</p>
                    <p className="text-ink-faint truncate text-[11px]">
                      {profile.provider} · {profile.endpoint}
                    </p>
                    <p className="text-ink-faint mt-0.5 text-[10px]">
                      Added {formatDate(profile.createdAt)}
                      {profile.secretPersisted ? '' : ' · session-only secret'}
                    </p>
                  </div>
                  <Button size="sm" variant="secondary" onClick={() => onEditProfile(profile.id)}>
                    Edit
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-danger"
                    icon={<Trash2 className="size-3.5" />}
                    onClick={() => setPending(profile.id)}
                  >
                    Remove
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </Section>
      </div>

      {pending ? (
        <div className="border-danger/30 bg-danger-dim mt-6 rounded-lg border p-3">
          <p className="text-ink text-[13px] font-medium">Remove this account?</p>
          <p className="text-ink-muted mt-1 text-[11px] leading-4">
            The stored credentials are deleted from this computer. Buckets themselves are not
            affected.
          </p>
          <div className="mt-2.5 flex gap-2">
            <Button size="sm" variant="ghost" onClick={() => setPending(undefined)}>
              Cancel
            </Button>
            <Button
              size="sm"
              variant="danger"
              onClick={() => {
                const label = profiles.find((p) => p.id === pending)?.label ?? 'Account'
                void remove(pending)
                setPending(undefined)
                toast.success(`${label} removed`)
              }}
            >
              Remove account
            </Button>
          </div>
        </div>
      ) : null}
    </Dialog>
  )
}
