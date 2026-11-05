import { create } from 'zustand'
import { nanoid } from './id'

export type ToastKind = 'success' | 'error' | 'info'

export interface Toast {
  id: string
  kind: ToastKind
  title: string
  description?: string
  /** Optional inline action, e.g. "Retry" or "Reveal". */
  action?: { label: string; run: () => void }
  duration: number
}

interface ToastState {
  toasts: Toast[]
  push: (toast: Omit<Toast, 'id' | 'duration'> & { duration?: number }) => string
  dismiss: (id: string) => void
  clear: () => void
}

export const useToastStore = create<ToastState>((set, get) => ({
  toasts: [],

  push: (toast) => {
    const id = nanoid()
    const full: Toast = {
      id,
      kind: toast.kind,
      title: toast.title,
      description: toast.description,
      action: toast.action,
      duration: toast.duration ?? (toast.kind === 'error' ? 7000 : 4000)
    }
    // Cap the stack so a burst of errors cannot cover the whole window.
    set({ toasts: [...get().toasts, full].slice(-4) })
    return id
  },

  dismiss: (id) => set({ toasts: get().toasts.filter((t) => t.id !== id) }),

  clear: () => set({ toasts: [] })
}))

/** Convenience helpers so components do not import the store directly. */
export const toast = {
  success: (title: string, description?: string) =>
    useToastStore.getState().push({ kind: 'success', title, description }),
  error: (title: string, description?: string) =>
    useToastStore.getState().push({ kind: 'error', title, description }),
  info: (title: string, description?: string) =>
    useToastStore.getState().push({ kind: 'info', title, description })
}
