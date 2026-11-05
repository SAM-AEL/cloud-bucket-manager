import { AnimatePresence, motion } from 'framer-motion'
import {
  ArrowUpFromLine,
  Folder,
  HardDrive,
  Moon,
  PanelLeft,
  Plus,
  Search,
  Sun
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useAppStore } from '@/store/app'
import { useObjectStore } from '@/store/objects'
import { useProfileStore } from '@/store/profiles'
import { cn } from '@/lib/format'

interface Command {
  id: string
  label: string
  hint?: string
  icon: ReactNode
  run: () => void
  keywords?: string
}
/** ⌘K palette for the actions you actually repeat while browsing. */
export function CommandPalette({
  open,
  onClose,
  onConnect,
  onUpload
}: {
  open: boolean
  onClose: () => void
  onConnect: () => void
  onUpload: () => void
}): ReactNode {
  const [query, setQuery] = useState('')
  const [index, setIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  const profiles = useProfileStore((s) => s.profiles)
  const selectProfile = useProfileStore((s) => s.select)
  const buckets = useObjectStore((s) => s.buckets)
  const openBucket = useObjectStore((s) => s.open)
  const navigate = useObjectStore((s) => s.navigate)
  const profileId = useObjectStore((s) => s.profileId)

  const theme = useAppStore((s) => s.settings.theme)
  const setTheme = useAppStore((s) => s.setTheme)
  const toggleSidebar = useAppStore((s) => s.toggleSidebar)

  const commands = useMemo<Command[]>(() => {
    const list: Command[] = [
      {
        id: 'connect',
        label: 'Connect an account',
        icon: <Plus className="size-3.5" />,
        run: onConnect,
        keywords: 'add account profile provider'
      },
      {
        id: 'upload',
        label: 'Upload files here',
        icon: <ArrowUpFromLine className="size-3.5" />,
        run: onUpload,
        keywords: 'put send add files'
      },
      {
        id: 'root',
        label: 'Go to bucket root',
        icon: <Folder className="size-3.5" />,
        run: () => void navigate(''),
        keywords: 'top home'
      },
      {
        id: 'theme',
        label: theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme',
        icon: theme === 'dark' ? <Sun className="size-3.5" /> : <Moon className="size-3.5" />,
        run: () => void setTheme(theme === 'dark' ? 'light' : 'dark'),
        keywords: 'appearance colour color'
      },
      {
        id: 'sidebar',
        label: 'Toggle sidebar',
        icon: <PanelLeft className="size-3.5" />,
        run: toggleSidebar,
        keywords: 'hide show panel'
      }
    ]

    for (const profile of profiles) {
      list.push({
        id: `profile-${profile.id}`,
        label: `Switch to ${profile.label}`,
        hint: profile.provider,
        icon: <HardDrive className="size-3.5" />,
        run: () => void selectProfile(profile.id),
        keywords: `account ${profile.provider}`
      })
    }

    for (const bucket of buckets) {
      list.push({
        id: `bucket-${bucket.name}`,
        label: bucket.name,
        hint: 'bucket',
        icon: <Folder className="size-3.5" />,
        run: () => {
          if (profileId) void openBucket(profileId, bucket.name)
        },
        keywords: 'bucket open'
      })
    }

    return list
  }, [
    profiles,
    buckets,
    profileId,
    theme,
    onConnect,
    onUpload,
    navigate,
    setTheme,
    toggleSidebar,
    selectProfile,
    openBucket
  ])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return commands
    return commands.filter((c) => c.label.toLowerCase().includes(q) || c.keywords?.includes(q))
  }, [commands, query])

  useEffect(() => {
    if (!open) return
    setQuery('')
    setIndex(0)
    // Focus after the enter animation so the caret lands correctly.
    const timer = window.setTimeout(() => inputRef.current?.focus(), 30)
    return () => window.clearTimeout(timer)
  }, [open])

  useEffect(() => setIndex(0), [query])

  const onKeyDown = (e: React.KeyboardEvent): void => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setIndex((i) => Math.min(i + 1, filtered.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setIndex((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const command = filtered[index]
      if (command) {
        command.run()
        onClose()
      }
    }
  }

  return createPortal(
    <AnimatePresence>
      {open ? (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-[14vh]">
          <motion.div
            className="absolute inset-0 bg-black/55 backdrop-blur-[2px]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            onClick={onClose}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.98, y: -8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.98, y: -4 }}
            transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
            className="panel shadow-2xl shadow-black/50 relative w-full max-w-xl overflow-hidden"
          >
            <div className="border-line flex items-center gap-2.5 border-b px-4">
              <Search className="text-ink-faint size-4 shrink-0" />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={onKeyDown}
                placeholder="Search commands, buckets and accounts…"
                className="text-ink placeholder:text-ink-faint flex-1 bg-transparent py-3.5 text-sm outline-none"
              />
            </div>

            <div className="max-h-[320px] overflow-y-auto p-1.5">
              {filtered.length === 0 ? (
                <p className="text-ink-faint px-3 py-6 text-center text-xs">No matches.</p>
              ) : (
                filtered.map((command, i) => (
                  <button
                    key={command.id}
                    onMouseEnter={() => setIndex(i)}
                    onClick={() => {
                      command.run()
                      onClose()
                    }}
                    className={cn(
                      'flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13px] transition-colors',
                      i === index ? 'bg-brand-dim text-brand' : 'text-ink-muted'
                    )}
                  >
                    <span className="shrink-0">{command.icon}</span>
                    <span className="min-w-0 flex-1 truncate">{command.label}</span>
                    {command.hint ? (
                      <span className="text-ink-faint shrink-0 text-[11px]">{command.hint}</span>
                    ) : null}
                  </button>
                ))
              )}
            </div>

            <div className="border-line text-ink-faint flex items-center gap-3 border-t px-4 py-2 text-[10px]">
              <span>
                <kbd className="font-mono">↑↓</kbd> navigate
              </span>
              <span>
                <kbd className="font-mono">↵</kbd> run
              </span>
              <span>
                <kbd className="font-mono">esc</kbd> close
              </span>
            </div>
          </motion.div>
        </div>
      ) : null}
    </AnimatePresence>,
    document.body
  )
}

