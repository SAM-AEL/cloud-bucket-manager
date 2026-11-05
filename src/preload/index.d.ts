import type { R2MApi } from '@shared/ipc'

declare global {
  interface Window {
    /** Injected by the preload script. Absent in unit tests, hence optional. */
    r2m?: R2MApi
  }
}

export {}
