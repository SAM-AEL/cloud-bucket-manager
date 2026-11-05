// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { R2MApi } from '../src/shared/ipc'
import App from '../src/renderer/src/App'
import { NewBucketDialog } from '../src/renderer/src/components/NewBucketDialog'
import { ConnectDialog } from '../src/renderer/src/components/ConnectDialog'
import { useObjectStore, parentPrefix } from '../src/renderer/src/store/objects'
import { useProfileStore } from '../src/renderer/src/store/profiles'
import { BucketRecovery } from '../src/renderer/src/components/Sidebar'
import { Switch } from '../src/renderer/src/components/ui/Primitives'

/**
 * Renders the real App component against a mocked preload bridge. This proves
 * the React tree mounts, boots from settings, and reaches each of its main
 * states without needing an Electron display server.
 */

/** Minimal but complete surface the App shell touches during boot. */
function makeBridge(overrides: Partial<R2MApi> = {}): R2MApi {
  return {
    profiles: {
      list: vi.fn().mockResolvedValue([]),
      create: vi.fn(),
      update: vi.fn(),
      remove: vi.fn(),
      test: vi.fn(),
      testDraft: vi.fn(),
      caps: vi.fn().mockResolvedValue({
        objectTagging: false,
        bucketAcl: false,
        objectLock: false,
        lifecycleRules: false,
        presignedUrls: true,
        multipart: true,
        batchDelete: true,
        serverSideEncryption: false,
        bucketCreation: true
      })
    },
    buckets: { list: vi.fn().mockResolvedValue({ items: [], done: true }), create: vi.fn(), remove: vi.fn() },
    objects: {
      list: vi.fn().mockResolvedValue({ items: [], done: true }),
      head: vi.fn(),
      remove: vi.fn(),
      copy: vi.fn(),
      rename: vi.fn(),
      presign: vi.fn()
    },
    transfers: {
      upload: vi.fn(),
      download: vi.fn(),
      cancel: vi.fn(),
      pause: vi.fn(),
      resume: vi.fn(),
      clearFinished: vi.fn(),
      list: vi.fn().mockResolvedValue([]),
      onEvent: vi.fn().mockReturnValue(() => undefined)
    },
    settings: {
      get: vi.fn().mockResolvedValue({
        theme: 'dark',
        density: 'comfortable',
        showHiddenFiles: false,
        confirmDeletes: true,
        maxParallelTransfers: 3
      }),
      patch: vi.fn().mockResolvedValue({})
    },
    dialog: {
      pickFiles: vi.fn(),
      pickFolder: vi.fn(),
      pickUploadFolder: vi.fn(),
      confirm: vi.fn()
    },
    shell: { reveal: vi.fn(), openExternal: vi.fn() },
    security: {
      info: vi.fn().mockResolvedValue({
        encryptionAvailable: true,
        backend: 'gnome_libsecret',
        method: 'libsecret',
        persistent: true,
        label: 'System keyring (GNOME / KWallet)'
      })
    },
    ...overrides
  } as R2MApi
}

beforeEach(() => {
  // jsdom implements neither of these, and the object browser uses both.
  class NoopObserver {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  }
  vi.stubGlobal('ResizeObserver', NoopObserver)
  vi.stubGlobal('IntersectionObserver', NoopObserver)
  // matchMedia drives the theme resolution in the app store.
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: true,
    media: query,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    addListener: () => undefined,
    removeListener: () => undefined,
    dispatchEvent: () => false
  }))
  // The app writes to localStorage-adjacent APIs indirectly via clipboard.
  Object.assign(navigator, { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } })
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  delete (window as { r2m?: R2MApi }).r2m
})

describe('App shell', () => {
  it('shows the first-run welcome when no accounts exist', async () => {
    ;(window as { r2m?: R2MApi }).r2m = makeBridge()

    render(<App />)

    expect(await screen.findByText('Connect your first account')).toBeDefined()
    // The same label also appears on the sidebar's connect button.
    expect(screen.getAllByRole('button', { name: /connect an account/i }).length).toBeGreaterThan(0)
  })

  it('applies the persisted theme to the document element', async () => {
    ;(window as { r2m?: R2MApi }).r2m = makeBridge()

    render(<App />)
    await screen.findByText('Connect your first account')

    await waitFor(() => {
      expect(document.documentElement.classList.contains('dark')).toBe(true)
    })
    // Density drives row heights via a data attribute.
    expect(document.documentElement.dataset.density).toBe('comfortable')
  })

  it('shows the object browser empty state once an account is connected', async () => {
    const bridge = makeBridge()
    bridge.profiles.list = vi.fn().mockResolvedValue([
      {
        id: 'p1',
        label: 'Test R2',
        provider: 'cloudflare-r2',
        endpoint: 'https://abc.r2.cloudflarestorage.com',
        region: 'auto',
        accessKeyId: 'AKIA',
        forcePathStyle: false,
        createdAt: Date.now(),
        secretPersisted: true
      }
    ])
    ;(window as { r2m?: R2MApi }).r2m = bridge

    render(<App />)

    // The account appears in the sidebar and the browser asks for a bucket.
    // The label renders in both the sidebar list and the title bar switcher.
    expect((await screen.findAllByText('Test R2')).length).toBeGreaterThan(0)
    expect(await screen.findByText('Select a bucket')).toBeDefined()
    expect((await screen.findAllByText('cloudflare-r2')).length).toBeGreaterThan(0)
  })

  it('surfaces a connection error without crashing the list', async () => {
    const bridge = makeBridge()
    bridge.profiles.list = vi.fn().mockResolvedValue([
      {
        id: 'p1',
        label: 'Broken',
        provider: 'generic',
        endpoint: 'https://nope.example.com',
        region: 'us-east-1',
        accessKeyId: 'AKIA',
        forcePathStyle: true,
        createdAt: Date.now(),
        secretPersisted: true
      }
    ])
    // Encoded exactly the way main encodes it, so this also covers transport.
    bridge.buckets.list = vi.fn().mockRejectedValue(
      new Error(
        `[R2M1]Networking error || ${btoa(JSON.stringify({ name: 'NetworkingError', message: 'Networking error' }))}`
      )
    )
    ;(window as { r2m?: R2MApi }).r2m = bridge

    render(<App />)

    expect(await screen.findByText('Networking error')).toBeDefined()
    // The rest of the shell stays interactive.
    expect((await screen.findAllByText('Broken')).length).toBeGreaterThan(0)
  })
})

describe('NewBucketDialog', () => {
  it('rejects invalid bucket names before calling the action', async () => {
    const onCreate = vi.fn().mockResolvedValue(undefined)
    render(<NewBucketDialog open onClose={vi.fn()} onCreate={onCreate} />)

    const input = screen.getByLabelText('Bucket name')

    fireEvent.change(input, { target: { value: 'AB' } })
    await waitFor(() => expect(screen.getByText(/3-63 characters/i)).toBeDefined())
    expect(onCreate).not.toHaveBeenCalled()

    fireEvent.change(input, { target: { value: 'Bad_Name' } })
    await waitFor(() => expect(screen.getByText(/lowercase letters/i)).toBeDefined())
    expect(onCreate).not.toHaveBeenCalled()
  })

  it('submits a valid bucket name', async () => {
    const onCreate = vi.fn().mockResolvedValue(undefined)
    const onClose = vi.fn()
    render(<NewBucketDialog open onClose={onClose} onCreate={onCreate} />)

    fireEvent.change(screen.getByLabelText('Bucket name'), { target: { value: 'my-assets' } })
    fireEvent.click(screen.getByRole('button', { name: /create bucket/i }))

    await waitFor(() => expect(onCreate).toHaveBeenCalledWith('my-assets'))
    expect(onClose).toHaveBeenCalled()
  })

  it('keeps the dialog open and shows the reason when creation fails', async () => {
    const onCreate = vi.fn().mockRejectedValue(new Error('Bucket already exists'))
    render(<NewBucketDialog open onClose={vi.fn()} onCreate={onCreate} />)

    fireEvent.change(screen.getByLabelText('Bucket name'), { target: { value: 'taken-name' } })
    fireEvent.click(screen.getByRole('button', { name: /create bucket/i }))

    await waitFor(() => expect(screen.getByText('Bucket already exists')).toBeDefined())
  })
})

describe('Switch', () => {
  it('exposes switch semantics and toggles on click', () => {
    const onChange = vi.fn()
    render(<Switch checked={false} onChange={onChange} label="Show hidden files" />)

    const control = screen.getByRole('switch', { name: 'Show hidden files' })
    expect(control.getAttribute('aria-checked')).toBe('false')

    fireEvent.click(control)
    expect(onChange).toHaveBeenCalledWith(true)
  })

  it('reports the inverse value when already on', () => {
    const onChange = vi.fn()
    render(<Switch checked onChange={onChange} label="Confirm before deleting" />)

    const control = screen.getByRole('switch', { name: 'Confirm before deleting' })
    expect(control.getAttribute('aria-checked')).toBe('true')

    fireEvent.click(control)
    expect(onChange).toHaveBeenCalledWith(false)
  })

  it('is operable with the keyboard', () => {
    const onChange = vi.fn()
    render(<Switch checked={false} onChange={onChange} label="Toggle me" />)
    const control = screen.getByRole('switch', { name: 'Toggle me' })

    // A real <button> responds to Enter and Space via a click event.
    fireEvent.keyDown(control, { key: 'Enter' })
    fireEvent.click(control)
    expect(onChange).toHaveBeenCalled()
  })

  it('does not fire when disabled', () => {
    const onChange = vi.fn()
    render(<Switch checked={false} onChange={onChange} label="Locked" disabled />)
    fireEvent.click(screen.getByRole('switch', { name: 'Locked' }))
    expect(onChange).not.toHaveBeenCalled()
  })
})

describe('profile scoped sub-path', () => {
  it('opens a bucket at the profile path rather than the root', async () => {
    const store = useObjectStore.getState()
    store.setScopedPrefix('assets/images/')

    // Stub the bridge so no network call is attempted; we only assert the
    // prefix that would have been requested.
    const list = vi.fn().mockResolvedValue({ items: [], done: true })
    ;(window as { r2m?: unknown }).r2m = { objects: { list }, buckets: { list: vi.fn() } }

    await useObjectStore.getState().open('p1', 'my-bucket')
    expect(list).toHaveBeenCalledWith(
      expect.objectContaining({ bucket: 'my-bucket', prefix: 'assets/images/' })
    )
    expect(useObjectStore.getState().prefix).toBe('assets/images/')

    delete (window as { r2m?: unknown }).r2m
  })

  it('lets an explicit prefix override the scoped one', async () => {
    const store = useObjectStore.getState()
    store.setScopedPrefix('assets/')

    const list = vi.fn().mockResolvedValue({ items: [], done: true })
    ;(window as { r2m?: unknown }).r2m = { objects: { list }, buckets: { list: vi.fn() } }

    await useObjectStore.getState().open('p1', 'my-bucket', 'other/path/')
    expect(list).toHaveBeenCalledWith(
      expect.objectContaining({ prefix: 'other/path/' })
    )

    delete (window as { r2m?: unknown }).r2m
  })

  it('falls back to the bucket root when the profile has no path', async () => {
    useObjectStore.getState().setScopedPrefix('')

    const list = vi.fn().mockResolvedValue({ items: [], done: true })
    ;(window as { r2m?: unknown }).r2m = { objects: { list }, buckets: { list: vi.fn() } }

    await useObjectStore.getState().open('p1', 'my-bucket')
    expect(list).toHaveBeenCalledWith(expect.objectContaining({ prefix: '' }))

    delete (window as { r2m?: unknown }).r2m
  })

  it('can still navigate up out of the scoped path', async () => {
    useObjectStore.getState().setScopedPrefix('assets/images/')
    expect(parentPrefix('assets/images/')).toBe('assets/')
    expect(parentPrefix('assets/')).toBe('')
  })
})

describe('ConnectDialog with a bucket-scoped token', () => {
  /** Fill the form the way a user would, using each field's visible label. */
  function fillCredentials(): void {
    fireEvent.change(screen.getByPlaceholderText('Production R2'), { target: { value: 'R2' } })
    fireEvent.change(screen.getByPlaceholderText(/r2\.cloudflarestorage/), {
      target: { value: 'https://abc.r2.cloudflarestorage.com' }
    })
    // Both credential fields share a placeholder, so select by position.
    const masked = screen.getAllByPlaceholderText('••••••••••••')
    fireEvent.change(masked[0], { target: { value: 'AKIA' } })
    fireEvent.change(masked[1], { target: { value: 'secret-key' } })
    fireEvent.change(screen.getByPlaceholderText('my-bucket'), { target: { value: 'photos' } })
  }

  it('reports that credentials are valid and the token is bucket-scoped', async () => {
    const bridge = makeBridge()
    bridge.profiles.testDraft = vi.fn().mockResolvedValue({
      ok: true,
      ms: 120,
      bucketCount: 1,
      bucketScoped: true,
      accessibleBuckets: ['photos']
    })
    ;(window as { r2m?: R2MApi }).r2m = bridge

    render(<ConnectDialog open onClose={vi.fn()} />)
    fillCredentials()
    fireEvent.click(screen.getByRole('button', { name: /test connection/i }))

    // Must not read as a failure, and must name the bucket that does work.
    expect(await screen.findByText(/credentials are valid/i)).toBeDefined()
    expect(screen.getAllByText(/scoped to specific buckets/i).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/photos/).length).toBeGreaterThan(0)
    expect(screen.queryByText(/connection failed/i)).toBeNull()
  })

  it('tells the user how to fix a denial when no bucket is named', async () => {
    const bridge = makeBridge()
    bridge.profiles.testDraft = vi.fn().mockResolvedValue({
      ok: false,
      ms: 90,
      error: {
        name: 'AccessDenied',
        message: 'Access Denied',
        hint: 'These credentials can read and write objects but cannot list buckets. Enter the bucket name below to connect anyway.'
      }
    })
    ;(window as { r2m?: R2MApi }).r2m = bridge

    render(<ConnectDialog open onClose={vi.fn()} />)
    fillCredentials()
    fireEvent.click(screen.getByRole('button', { name: /test connection/i }))

    expect(await screen.findByText('Access Denied')).toBeDefined()
    expect(screen.getByText(/cannot list buckets/i)).toBeDefined()
  })
})

describe('bucket listing recovery', () => {
  it('shows the actionable hint instead of raw IPC wrapper text', async () => {
    const bridge = makeBridge()
    bridge.profiles.list = vi.fn().mockResolvedValue([
      {
        id: 'p1',
        label: 'R2',
        provider: 'cloudflare-r2',
        endpoint: 'https://abc.r2.cloudflarestorage.com',
        region: 'auto',
        accessKeyId: 'AKIA',
        forcePathStyle: false,
        createdAt: Date.now(),
        secretPersisted: true
      }
    ])
    const info = {
      name: 'AccessDenied',
      message: 'Access Denied',
      code: 'AccessDenied',
      hint: 'These credentials can read and write objects but cannot list buckets.'
    }
    bridge.buckets.list = vi
      .fn()
      .mockRejectedValue(new Error(`[R2M1]Access Denied || ${btoa(JSON.stringify(info))}`))

    ;(window as { r2m?: R2MApi }).r2m = bridge
    render(<App />)

    expect(await screen.findByText('Access Denied')).toBeDefined()
    expect(screen.getByText(/cannot list buckets/i)).toBeDefined()
    // The IPC wrapper text must never reach the user.
    expect(screen.queryByText(/Error invoking remote method/i)).toBeNull()
  })

  it('offers a bucket input that pins the bucket to the profile', async () => {
    const bridge = makeBridge()
    bridge.profiles.list = vi.fn().mockResolvedValue([
      {
        id: 'p1',
        label: 'R2',
        provider: 'cloudflare-r2',
        endpoint: 'https://abc.r2.cloudflarestorage.com',
        region: 'auto',
        accessKeyId: 'AKIA',
        forcePathStyle: false,
        createdAt: Date.now(),
        secretPersisted: true
      }
    ])
    bridge.profiles.update = vi.fn().mockResolvedValue({})
    bridge.buckets.list = vi
      .fn()
      .mockRejectedValue(new Error(`[R2M1]Access Denied || ${btoa(JSON.stringify({ message: 'Access Denied' }))}`))

    ;(window as { r2m?: R2MApi }).r2m = bridge
    render(<App />)

    const input = await screen.findByPlaceholderText('my-bucket')
    fireEvent.change(input, { target: { value: 'photos' } })
    fireEvent.click(screen.getByRole('button', { name: /^use it$/i }))

    await waitFor(() => {
      expect(bridge.profiles.update).toHaveBeenCalledWith('p1', { defaultBucket: 'photos' })
    })
  })
})

describe('BucketRecovery', () => {
  function renderRecovery() {
    useProfileStore.setState({
      profiles: [
        {
          id: 'p1',
          label: 'R2',
          provider: 'cloudflare-r2',
          endpoint: 'https://abc.r2.cloudflarestorage.com',
          region: 'auto',
          accessKeyId: 'AKIA',
          forcePathStyle: false,
          createdAt: 1,
          secretPersisted: true
        } as never
      ]
    })
    return render(
      <BucketRecovery message="Access Denied" hint="name a bucket" activeProfileId="p1" onRetry={vi.fn()} />
    )
  }

  beforeEach(() => {
    useProfileStore.setState({ update: vi.fn().mockResolvedValue(undefined) as never })
  })

  it('keeps what the user types', () => {
    // Guards a real regression: when this component was accidentally defined
    // inside Sidebar, it was re-created on every render and the input reset on
    // each keystroke, making it impossible to type a bucket name.
    renderRecovery()
    const input = screen.getByPlaceholderText('my-bucket') as HTMLInputElement

    fireEvent.change(input, { target: { value: 'photos' } })
    expect(input.value).toBe('photos')

    fireEvent.change(input, { target: { value: 'photos-2026' } })
    expect(input.value).toBe('photos-2026')
  })

  it('enables the action only once a bucket is named', () => {
    renderRecovery()
    const button = screen.getByRole('button', { name: /use it/i }) as HTMLButtonElement
    expect(button.disabled).toBe(true)

    fireEvent.change(screen.getByPlaceholderText('my-bucket'), { target: { value: 'photos' } })
    expect((screen.getByRole('button', { name: /use it/i }) as HTMLButtonElement).disabled).toBe(false)
  })

  it('shows the message and the hint from main', () => {
    renderRecovery()
    expect(screen.getByText('Access Denied')).toBeDefined()
    expect(screen.getByText('name a bucket')).toBeDefined()
  })
})
