import { ChevronDown, Cloud, Moon, PanelLeft, Sun } from 'lucide-react'
import { useAppStore } from '@/store/app'
import { useProfileStore } from '@/store/profiles'
import { useObjectStore } from '@/store/objects'
import { Dropdown, MenuItem, MenuSeparator } from './ui/Menu'
import { IconButton } from './ui/Chrome'
import { cn } from '@/lib/format'

/**
 * Frameless-window header. Doubles as the drag region and hosts the app
 * identity, the active-profile switcher, and global view controls.
 */
export function TitleBar(): React.ReactNode {
  const collapsed = useAppStore((s) => s.sidebarCollapsed)
  const toggleSidebar = useAppStore((s) => s.toggleSidebar)
  const theme = useAppStore((s) => s.settings.theme)
  const toggleTheme = useAppStore((s) => s.toggleTheme)
  const setCommandPaletteOpen = useAppStore((s) => s.setCommandPaletteOpen)
  const isMac = navigator.platform.toLowerCase().includes('mac')

  const profiles = useProfileStore((s) => s.profiles)
  const activeId = useProfileStore((s) => s.activeId)
  const select = useProfileStore((s) => s.select)
  const active = profiles.find((p) => p.id === activeId)

  const view = useObjectStore((s) => s.view)
  const setView = useObjectStore((s) => s.setView)

  return (
    <header
      className={cn(
        'border-line bg-surface/80 flex h-12 shrink-0 items-center gap-2.5 border-b px-3',
        // Leave room for the macOS traffic lights under the inset title bar.
        isMac && 'pl-20'
      )}
    >
      <IconButton
        label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        onClick={toggleSidebar}
        icon={<PanelLeft className="size-4" />}
        active={!collapsed}
      />

      <div className="text-ink flex items-center gap-2 text-[13px] font-semibold">
        <span className="bg-brand/15 text-brand grid size-6 place-items-center rounded-md">
          <Cloud className="size-3.5" />
        </span>
        <span className="hidden sm:inline">R2 Manager</span>
      </div>

      <div className="flex-1" />

      <Dropdown
        align="end"
        trigger={({ toggle, open }) => (
          <button
            onClick={toggle}
            aria-expanded={open}
            className="text-ink-muted hover:text-ink hover:bg-raised flex h-7 items-center gap-1.5 rounded-lg px-2 text-[12px] font-medium transition-colors"
          >
            <span className="max-w-[160px] truncate">{active?.label ?? 'No profile'}</span>
            <ChevronDown
              className={cn('size-3.5 transition-transform duration-150', open && 'rotate-180')}
            />
          </button>
        )}
      >
        {(close) => (
          <>
            {profiles.map((profile) => (
              <MenuItem
                key={profile.id}
                icon={<Cloud className="size-3.5" />}
                onClick={() => {
                  void select(profile.id)
                  close()
                }}
              >
                {profile.label}
              </MenuItem>
            ))}
            <MenuSeparator />
            <MenuItem icon={<Moon className="size-3.5" />} onClick={() => { void toggleTheme(); close() }}>
              Switch to {theme === 'dark' ? 'light' : 'dark'}
            </MenuItem>
          </>
        )}
      </Dropdown>

      <button
        onClick={() => setCommandPaletteOpen(true)}
        className="border-line text-ink-faint hover:border-line-strong hover:text-ink-muted hidden h-7 items-center gap-2 rounded-lg border px-2.5 text-[12px] transition-colors md:flex"
      >
        <span>Search</span>
        <kbd className="text-ink-faint font-mono text-[10px]">⌘K</kbd>
      </button>

      <IconButton
        label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
        onClick={() => void toggleTheme()}
        icon={theme === 'dark' ? <Sun className="size-4" /> : <Moon className="size-4" />}
      />

      {/* Placeholder kept so the view toggle reads as a segmented control. */}
      <div className="border-line bg-raised/60 hidden items-center gap-0.5 rounded-lg border p-0.5 sm:flex">
        <IconButton
          size="sm"
          label="List view"
          onClick={() => setView('list')}
          icon={<RowsIcon />}
          active={view === 'list'}
        />
        <IconButton
          size="sm"
          label="Grid view"
          onClick={() => setView('grid')}
          icon={<GridIcon />}
          active={view === 'grid'}
        />
      </div>

      <div className={cn('h-full', !isMac && 'w-24')} />
    </header>
  )
}

function RowsIcon(): React.ReactNode {
  return (
    <svg viewBox="0 0 16 16" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M2 4h12M2 8h12M2 12h12" strokeLinecap="round" />
    </svg>
  )
}

function GridIcon(): React.ReactNode {
  return (
    <svg viewBox="0 0 16 16" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="1.5">
      <rect x="2" y="2" width="5" height="5" rx="1" />
      <rect x="9" y="2" width="5" height="5" rx="1" />
      <rect x="2" y="9" width="5" height="5" rx="1" />
      <rect x="9" y="9" width="5" height="5" rx="1" />
    </svg>
  )
}
