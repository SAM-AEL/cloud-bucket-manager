import { useCallback, useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { Cloud } from 'lucide-react'
import { TitleBar } from './components/TitleBar'
import { Sidebar } from './components/Sidebar'
import { ObjectBrowser } from './components/ObjectBrowser'
import { Inspector } from './components/Inspector'
import { TransferTray } from './components/TransferTray'
import { ConnectDialog } from './components/ConnectDialog'
import { NewBucketDialog } from './components/NewBucketDialog'
import { SettingsDialog } from './components/SettingsDialog'
import { CommandPalette } from './components/CommandPalette'
import { Toaster } from './components/ui/Toaster'
import { FullPageLoader } from './components/ui/Feedback'
import { Button } from './components/ui/Primitives'
import { useAppStore } from './store/app'
import { useObjectStore } from './store/objects'
import { useProfileStore } from './store/profiles'
import { useTransferStore } from './store/transfers'
import { hasBridge } from './lib/bridge'
import { useActions } from './hooks/useActions'

export default function App(): React.ReactNode {
  const booted = useAppStore((s) => s.booted)
  const boot = useAppStore((s) => s.boot)
  const loadProfiles = useProfileStore((s) => s.load)
  const subscribe = useTransferStore((s) => s.subscribe)
  const setShowHidden = useObjectStore((s) => s.setShowHidden)

  const [connectOpen, setConnectOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [editing, setEditing] = useState<string | undefined>()
  const [newBucketOpen, setNewBucketOpen] = useState(false)

  const { upload, download, deleteSelected, createBucket } = useActions()

  useEffect(() => {
    if (!hasBridge()) return
    void (async () => {
      await boot()
      await loadProfiles()
      return subscribe()
    })()
  }, [boot, loadProfiles, subscribe])

  // Apply the persisted hidden-file preference once settings are available.
  const showHidden = useAppStore((s) => s.settings.showHiddenFiles)
  useEffect(() => setShowHidden(showHidden), [showHidden, setShowHidden])

  const openConnect = useCallback(() => {
    setEditing(undefined)
    setConnectOpen(true)
  }, [])

  const openEdit = useCallback((id: string) => {
    setEditing(id)
    setConnectOpen(true)
  }, [])

  const openSettings = useCallback(() => setSettingsOpen(true), [])

  // Global shortcuts. Ignored while a text field has focus so typing a
  // filename never triggers a destructive command.
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const target = e.target as HTMLElement | null
      const typing =
        target?.tagName === 'INPUT' ||
        target?.tagName === 'TEXTAREA' ||
        target?.isContentEditable === true

      const mod = e.metaKey || e.ctrlKey

      if (mod && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        useAppStore.getState().setCommandPaletteOpen(true)
        return
      }
      if (typing) return

      if (mod && e.key.toLowerCase() === 'u') {
        e.preventDefault()
        void upload()
      } else if (mod && e.shiftKey && e.key.toLowerCase() === 'd') {
        e.preventDefault()
        void download()
      } else if (mod && (e.key === 'Backspace' || e.key === 'Delete')) {
        e.preventDefault()
        void deleteSelected()
      } else if (mod && e.key === '`') {
        e.preventDefault()
        useAppStore.getState().toggleSidebar()
      } else if (e.key === 'Backspace') {
        e.preventDefault()
        void useObjectStore.getState().up()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [upload, download, deleteSelected])

  const paletteOpen = useAppStore((s) => s.commandPaletteOpen)
  const setPaletteOpen = useAppStore((s) => s.setCommandPaletteOpen)
  const profiles = useProfileStore((s) => s.profiles)

  if (!hasBridge() || !booted) {
    return <FullPageLoader label="Starting R2 Manager…" />
  }

  return (
    <div className="bg-canvas flex h-full flex-col overflow-hidden">
      <TitleBar />

      <div className="flex min-h-0 flex-1">
        <Sidebar onConnect={openConnect} onSettings={openSettings} />

        {profiles.length === 0 ? (
          <Welcome onConnect={openConnect} />
        ) : (
          <>
            <ObjectBrowser
              onUpload={() => void upload()}
              onDownload={() => void download()}
              onDelete={() => void deleteSelected()}
              onNewBucket={() => setNewBucketOpen(true)}
            />
            <Inspector />
          </>
        )}
      </div>

      <TransferTray />

      <ConnectDialog
        open={connectOpen}
        onClose={() => setConnectOpen(false)}
        editing={editing}
      />
      <NewBucketDialog
        open={newBucketOpen}
        onClose={() => setNewBucketOpen(false)}
        onCreate={createBucket}
      />
      <SettingsDialog
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        onEditProfile={openEdit}
      />
      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        onConnect={openConnect}
        onUpload={() => void upload()}
      />
      <Toaster />
    </div>
  )
}

/** First-run state: explain the app and route straight to the connect flow. */
function Welcome({ onConnect }: { onConnect: () => void }): React.ReactNode {
  return (
    <div className="flex flex-1 items-center justify-center p-8">
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
        className="w-full max-w-md text-center"
      >
        <div className="bg-brand/15 text-brand mx-auto mb-5 grid size-14 place-items-center rounded-2xl">
          <Cloud className="size-6" />
        </div>
        <h1 className="text-ink text-lg font-semibold">Connect your first account</h1>
        <p className="text-ink-muted mx-auto mt-2 max-w-sm text-sm leading-6">
          R2 Manager works with Cloudflare R2, Amazon S3, MinIO, Backblaze B2, Wasabi, DigitalOcean
          Spaces and any other S3-compatible service.
        </p>
        <Button variant="primary" size="lg" className="mt-6" onClick={onConnect}>
          Connect an account
        </Button>
        <p className="text-ink-faint mt-4 text-[11px]">
          Credentials are encrypted with your OS keychain and never leave this machine.
        </p>
      </motion.div>
    </div>
  )
}

