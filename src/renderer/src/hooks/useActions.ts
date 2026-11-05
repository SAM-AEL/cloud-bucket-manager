import { useCallback } from 'react'
import type { PickedFile } from '@shared/ipc'
import { useObjectStore } from '@/store/objects'
import { useAppStore } from '@/store/app'
import { useTransferStore } from '@/store/transfers'
import { toast } from '@/store/toasts'
import { bridge, call, copyToClipboard, errorMessage } from '@/lib/bridge'

/**
 * User-initiated operations that combine UI state with main-process calls.
 * Kept in one hook so the components stay declarative and every destructive
 * action funnels through the same confirmation rules.
 */
export function useActions() {
  const upload = useCallback(async () => {
    const { profileId, bucket, prefix } = useObjectStore.getState()
    if (!profileId || !bucket) {
      toast.error('Select a bucket first')
      return
    }

    const api = bridge()
    let files: PickedFile[]
    try {
      files = await call(() => api.dialog.pickFiles(true))
      if (files.length === 0) return
    } catch (error) {
      toast.error('Could not open the file picker', errorMessage(error))
      return
    }

    // Preserve relative paths from a folder upload; flatten single files.
    const items = files.map((f) => ({
      path: f.path,
      name: f.relativePath ?? f.name,
      size: f.size
    }))

    try {
      await call(() => api.transfers.upload({ profileId, bucket, prefix, items }))
      toast.success(
        `Uploading ${items.length} file${items.length === 1 ? '' : 's'}`,
        'Track progress in the transfers panel.'
      )
      // Refresh shortly after so finished uploads appear without a manual reload.
      window.setTimeout(() => void useObjectStore.getState().reload(), 1500)
    } catch (error) {
      toast.error('Upload failed', errorMessage(error))
    }
  }, [])

  const uploadFolder = useCallback(async () => {
    const { profileId, bucket, prefix } = useObjectStore.getState()
    if (!profileId || !bucket) {
      toast.error('Select a bucket first')
      return
    }
    const files = await call(() => bridge().dialog.pickUploadFolder()).catch(() => [])
    if (files.length === 0) return
    try {
      await call(() =>
        bridge().transfers.upload({
          profileId,
          bucket,
          prefix,
          items: files.map((f) => ({ path: f.path, name: f.relativePath ?? f.name, size: f.size }))
        })
      )
      toast.success(`Uploading ${files.length} files from the folder`)
    } catch (error) {
      toast.error('Folder upload failed', errorMessage(error))
    }
  }, [])

  const download = useCallback(async () => {
    const { profileId, bucket, selected } = useObjectStore.getState()
    if (!profileId || !bucket || selected.size === 0) return

    const destDir = await call(() => bridge().dialog.pickFolder()).catch(() => null)
    if (!destDir) return

    try {
      await call(() =>
        bridge().transfers.download({ profileId, bucket, keys: [...selected], destDir })
      )
      toast.success(`Downloading ${selected.size} object${selected.size === 1 ? '' : 's'}`)
      useObjectStore.getState().clearSelection()
    } catch (error) {
      toast.error('Download failed', errorMessage(error))
    }
  }, [])

  const deleteSelected = useCallback(async () => {
    const { profileId, bucket, selected, prefix, forgetKeys } = useObjectStore.getState()
    if (!profileId || !bucket || selected.size === 0) return

    const keys = [...selected]
    const { confirmDeletes } = useAppStore.getState().settings
    if (confirmDeletes) {
      const ok = await call(() =>
        bridge().dialog.confirm(
          keys.length === 1
            ? 'Delete this object?'
            : `Delete ${keys.length} objects?`,
          'This permanently removes them from the bucket. It cannot be undone.'
        )
      )
      if (!ok) return
    }

    try {
      await call(() => bridge().objects.remove({ profileId, bucket, keys }))
      // Local removal keeps the list stable and avoids a refetch flicker.
      forgetKeys(keys)
      toast.success(`Deleted ${keys.length} object${keys.length === 1 ? '' : 's'}`, prefix || 'bucket root')
    } catch (error) {
      toast.error('Delete failed', errorMessage(error))
      void useObjectStore.getState().reload()
    }
  }, [])

  /**
   * Create a bucket from a name the UI collected. Electron does not implement
   * `window.prompt`, so the name always comes from our own dialog component.
   */
  const createBucket = useCallback(async (name: string) => {
    const trimmed = name.trim()
    if (!trimmed) return
    const { createBucket: storeCreate } = useObjectStore.getState()
    try {
      await storeCreate(trimmed)
      toast.success(`Bucket “${trimmed}” created`)
    } catch (error) {
      toast.error('Could not create the bucket', errorMessage(error))
      throw error
    }
  }, [])

  const copyKey = useCallback(async (key: string) => {
    try {
      await copyToClipboard(key)
      toast.success('Key copied')
    } catch {
      toast.error('Could not copy the key')
    }
  }, [])

  const pauseAll = useCallback(async () => {
    const { items, pause } = useTransferStore.getState()
    for (const t of items.filter((x) => x.state === 'running')) void pause(t.id)
  }, [])

  return { upload, uploadFolder, download, deleteSelected, createBucket, copyKey, pauseAll }
}
