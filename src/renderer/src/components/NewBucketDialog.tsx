import { useEffect, useState, type ReactNode } from 'react'
import { Dialog } from './ui/Dialog'
import { Button, Input } from './ui/Primitives'

/**
 * Modal for naming a new bucket.
 *
 * Electron does not implement `window.prompt`, so this exists rather than
 * reaching for the browser primitive. Client-side validation mirrors the rules
 * enforced again in the main process — it is a convenience, not the gate.
 */
export function NewBucketDialog({
  open,
  onClose,
  onCreate
}: {
  open: boolean
  onClose: () => void
  onCreate: (name: string) => Promise<void>
}): ReactNode {
  const [name, setName] = useState('')
  const [error, setError] = useState<string | undefined>()
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (open) {
      setName('')
      setError(undefined)
      setBusy(false)
    }
  }, [open])

  const validate = (value: string): string | null => {
    if (!value.trim()) return 'Enter a bucket name'
    if (value.length < 3 || value.length > 63) return 'Must be 3-63 characters'
    if (!/^[a-z0-9][a-z0-9.-]*[a-z0-9]$/.test(value)) {
      return 'Use lowercase letters, numbers, dots and hyphens only'
    }
    return null
  }

  const problem = name ? validate(name) : null

  const submit = async (): Promise<void> => {
    const trimmed = name.trim()
    const invalid = validate(trimmed)
    if (invalid) {
      setError(invalid)
      return
    }
    setBusy(true)
    try {
      await onCreate(trimmed)
      onClose()
    } catch (e) {
      // The action hook already reported the reason; keep the dialog open.
      setError(e instanceof Error ? e.message : 'Could not create the bucket.')
      setBusy(false)
    }
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="New bucket"
      description="Bucket names must be unique across your account and cannot be changed later."
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant="primary" onClick={() => void submit()} loading={busy} disabled={!name.trim()}>
            Create bucket
          </Button>
        </>
      }
    >
      <form
        onSubmit={(e) => {
          e.preventDefault()
          void submit()
        }}
      >
        <label className="text-ink-muted mb-1.5 block text-xs font-medium" htmlFor="bucket-name">
          Bucket name
        </label>
        <Input
          id="bucket-name"
          value={name}
          autoFocus
          spellCheck={false}
          autoComplete="off"
          invalid={Boolean(problem)}
          onChange={(e) => {
            setName(e.target.value)
            setError(undefined)
          }}
          placeholder="my-assets"
          className="font-mono"
        />
        {problem || error ? (
          <p className="text-danger mt-1.5 text-[11px]">{error ?? problem}</p>
        ) : (
          <p className="text-ink-faint mt-1.5 text-[11px]">Lowercase, 3-63 characters.</p>
        )}
      </form>
    </Dialog>
  )
}
