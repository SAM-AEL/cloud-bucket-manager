import { BrowserWindow, clipboard, dialog, ipcMain, shell, type IpcMainInvokeEvent } from 'electron'
import { randomUUID } from 'node:crypto'
import { readdir, stat } from 'node:fs/promises'
import { join, relative, sep } from 'node:path'
import { HeadBucketCommand, ListBucketsCommand } from '@aws-sdk/client-s3'
import type {
  Bucket,
  ConnectionTest,
  CopyReq,
  CreateBucketReq,
  DeleteReq,
  HeadReq,
  ListObjectsReq,
  ObjectMeta,
  ObjectItem,
  Page,
  PresignReq,
  ProfileInput,
  ProfileMeta,
  ProviderCaps,
  ProviderId,
  RenameReq,
  TransferSnapshot,
  UploadReq,
  DownloadReq
} from '@shared/types'
import type { PickedFile, SecurityInfo } from '@shared/ipc'
import { ERROR_MARKER, ERROR_PAYLOAD_SEP, IPC } from '@shared/ipc'
import { profileStore, settings } from '../store'
import { secrets } from '../secrets'
import { buildDraftClient, invalidateClient, toProfileMeta } from '../s3/client'
import { CAPS, normalizeEndpoint, normalizePrefix, validateBucketName, validateEndpoint, validateKey } from '../s3/provider'
import { fail, IpcError, isAccessDeniedError, toErrorInfo } from '../s3/errors'
import * as ops from '../s3/ops'
import {
  cancelTransfer,
  clearFinished,
  listTransfers,
  onTransferEvent,
  pauseTransfer,
  queueDownloads,
  queueUploads,
  resumeTransfer
} from '../s3/transfer'

/**
 * Only our own renderer may call these channels. Without this check, any frame
 * loaded into the window could drive S3 operations using stored credentials.
 */
function assertTrustedSender(event: IpcMainInvokeEvent): void {
  const frame = event.senderFrame
  if (!frame || frame.parent !== null) fail(new Error('Blocked IPC from a nested frame.'))
  const url = event.sender.getURL()
  const devServer = process.env.ELECTRON_RENDERER_URL
  const allowed = url.startsWith('file://') || (devServer ? url.startsWith(devServer) : false)
  if (!allowed) fail(new Error('Blocked IPC from an unexpected origin.'))
}

/**
 * Encode a structured error into a message string that survives IPC.
 *
 * Electron's structured clone drops custom properties on Errors, so the
 * S3ErrorInfo (including the actionable `hint`) is base64-encoded into the
 * message behind a marker and decoded again on the renderer side.
 */
function toTransport(error: unknown): Error {
  const info = error instanceof IpcError ? error.info : toErrorInfo(error)
  const payload = Buffer.from(JSON.stringify(info), 'utf8').toString('base64')
  return new Error(`${ERROR_MARKER}${info.message}${ERROR_PAYLOAD_SEP}${payload}`)
}

/** Wrap a handler so trusted-sender checks and error normalization are uniform. */
function handle<TArgs extends unknown[], TResult>(
  channel: string,
  fn: (...args: TArgs) => Promise<TResult> | TResult
): void {
  ipcMain.handle(channel, async (event, ...args) => {
    assertTrustedSender(event)
    try {
      return await fn(...(args as TArgs))
    } catch (error) {
      throw toTransport(error)
    }
  })
}

/** Rehydrate an S3 error that came from a nested main-side call. */
function rethrow(error: unknown): never {
  // ops.* already raises IpcError, so this is normally a pass-through; the
  // fallback covers anything that arrived from deeper as a plain Error.
  fail(error instanceof IpcError ? error.info : error)
}

function validateProfileInput(input: ProfileInput): void {
  const endpointError = validateEndpoint(input.endpoint)
  if (endpointError) fail(new Error(endpointError))
  if (!input.label?.trim()) fail(new Error('Give this profile a name.'))
  if (!input.accessKeyId?.trim()) fail(new Error('An access key id is required.'))
  if (!input.secretAccessKey) fail(new Error('A secret access key is required.'))
}

/**
 * Verify credentials with ListBuckets — the cheapest authenticated call that
 * proves both the signature and the endpoint are right.
 *
 * Bucket-scoped R2 tokens are handled explicitly: ListBuckets is denied for
 * them, so a denial triggers a HeadBucket probe against the bucket named on the
 * profile. A success there means the credentials are genuinely fine and only
 * the account-wide listing is out of scope.
 */
async function testConnection(input: ProfileInput): Promise<ConnectionTest> {
  const started = Date.now()
  const client = buildDraftClient(input)
  try {
    const response = await client.send(new ListBucketsCommand({}))
    return { ok: true, ms: Date.now() - started, bucketCount: response.Buckets?.length ?? 0 }
  } catch (error) {
    if (isAccessDeniedError(error)) {
      const bucket = input.defaultBucket?.trim()
      if (bucket) {
        try {
          await client.send(new HeadBucketCommand({ Bucket: bucket }))
          return {
            ok: true,
            ms: Date.now() - started,
            bucketCount: 1,
            bucketScoped: true,
            accessibleBuckets: [bucket]
          }
        } catch {
          /* fall through to the generic error below */
        }
      }
      // Listing was denied and we have nothing to probe: explain the cause.
      return {
        ok: false,
        ms: Date.now() - started,
        error: {
          ...toErrorInfo(error),
          hint: bucketScopedHint(input)
        }
      }
    }
    return { ok: false, ms: Date.now() - started, error: toErrorInfo(error) }
  } finally {
    client.destroy()
  }
}

function bucketScopedHint(input: ProfileInput): string {
  const isR2 = input.provider === 'cloudflare-r2'
  const base =
    'These credentials can read and write objects but cannot list buckets. ' +
    'Cloudflare R2 tokens can be scoped to specific buckets, which excludes the account-wide bucket listing.'
  const fix = isR2
    ? 'Enter the bucket name below to connect with this token, or create an account-wide token in the R2 dashboard.'
    : 'Enter the bucket name below, or grant this key permission to list buckets.'
  return `${base} ${fix}`
}
export function registerIpc(): void {
  // --- profiles ---------------------------------------------------------
  handle<[], ProfileMeta[]>(IPC.profilesList, () => profileStore.list().map(toProfileMeta))

  handle<[ProfileInput], ProfileMeta>(IPC.profilesCreate, (input) => {
    validateProfileInput(input)
    const id = randomUUID()
    const persisted = secrets.set(id, input.secretAccessKey)
    return toProfileMeta(
      profileStore.insert({
        id,
        label: input.label.trim(),
        provider: input.provider,
        endpoint: normalizeEndpoint(input.endpoint),
        region: input.region.trim() || 'us-east-1',
        accessKeyId: input.accessKeyId.trim(),
        forcePathStyle: input.forcePathStyle ?? false,
        pathPrefix: normalizePrefix(input.pathPrefix),
        defaultBucket: input.defaultBucket,
        createdAt: Date.now(),
        secretPersisted: persisted !== 'memory'
      })
    )
  })

  handle<[string, Partial<ProfileInput>], ProfileMeta>(IPC.profilesUpdate, (id, patch) => {
    const existing = profileStore.find(id)
    if (!existing) fail(new Error('That profile no longer exists.'))
    // Drop the cached client so the next call picks up the new credentials.
    invalidateClient(id)
    const merged = {
      label: patch.label?.trim() ?? existing.label,
      provider: patch.provider ?? existing.provider,
      endpoint: patch.endpoint ? normalizeEndpoint(patch.endpoint) : existing.endpoint,
      region: patch.region?.trim() ?? existing.region,
      accessKeyId: patch.accessKeyId?.trim() ?? existing.accessKeyId,
      forcePathStyle: patch.forcePathStyle ?? existing.forcePathStyle,
      pathPrefix:
        patch.pathPrefix !== undefined ? normalizePrefix(patch.pathPrefix) : existing.pathPrefix,
      defaultBucket: patch.defaultBucket ?? existing.defaultBucket
    }
    if (patch.secretAccessKey) {
      const method = secrets.set(id, patch.secretAccessKey)
      return toProfileMeta(profileStore.update(id, { ...merged, secretPersisted: method !== 'memory' }))
    }
    return toProfileMeta(profileStore.update(id, merged))
  })

  handle<[string], void>(IPC.profilesRemove, (id) => {
    invalidateClient(id)
    secrets.remove(id)
    profileStore.remove(id)
  })

  handle<[string], ConnectionTest>(IPC.profilesTest, async (id) => {
    const profile = profileStore.find(id)
    if (!profile) fail(new Error('That profile no longer exists.'))
    const secret = secrets.get(id)
    if (!secret) fail(new Error('No credentials stored for this profile.'))
    return testConnection({
      label: profile.label,
      provider: profile.provider,
      endpoint: profile.endpoint,
      region: profile.region,
      accessKeyId: profile.accessKeyId,
      secretAccessKey: secret,
      forcePathStyle: profile.forcePathStyle
    })
  })

  handle<[ProfileInput], ConnectionTest>(IPC.profilesTestDraft, (input) => testConnection(input))

  handle<[ProviderId], ProviderCaps>(IPC.capsFor, (provider) => CAPS[provider] ?? CAPS.generic)

  // --- buckets ----------------------------------------------------------
  handle<[string], Page<Bucket>>(IPC.bucketsList, async (profileId) =>
    ops.listBuckets(profileId).catch(rethrow)
  )

  handle<[CreateBucketReq], Bucket>(IPC.bucketsCreate, async (req) => {
    const invalid = validateBucketName(req.bucket)
    if (invalid) fail(new Error(invalid))
    return ops.createBucket(req).catch(rethrow)
  })

  handle<[string, string], void>(IPC.bucketsDelete, async (profileId, bucket) => {
    await ops.deleteBucket(profileId, bucket).catch(rethrow)
  })

  // --- objects ----------------------------------------------------------
  handle<[ListObjectsReq], Page<ObjectItem>>(IPC.objectsList, async (req) =>
    ops.listObjects(req).catch(rethrow)
  )

  handle<[HeadReq], ObjectMeta | null>(IPC.objectsHead, async (req) => {
    const invalid = validateKey(req.key)
    if (invalid) fail(new Error(invalid))
    return ops.headObject(req).catch(rethrow)
  })

  handle<[DeleteReq], { deleted: number }>(IPC.objectsDelete, async (req) => {
    if (!req.keys.length) return { deleted: 0 }
    return ops.deleteObjects(req).catch(rethrow)
  })

  handle<[CopyReq], void>(IPC.objectsCopy, async (req) => {
    await ops.copyObjects(req).catch(rethrow)
  })

  handle<[RenameReq], void>(IPC.objectsRename, async (req) => {
    const from = validateKey(req.from)
    const to = validateKey(req.to)
    if (from) fail(new Error(from))
    if (to) fail(new Error(to))
    await ops.renameObject(req).catch(rethrow)
  })

  handle<[PresignReq], { url: string; expiresIn: number }>(IPC.objectsPresign, async (req) => {
    const invalid = validateKey(req.key)
    if (invalid) fail(new Error(invalid))
    return ops.presign(req).catch(rethrow)
  })

  // --- transfers --------------------------------------------------------
  handle<[UploadReq], string[]>(IPC.transfersUpload, (req) => queueUploads(req))
  handle<[DownloadReq], string[]>(IPC.transfersDownload, (req) => queueDownloads(req))
  handle<[string], void>(IPC.transfersCancel, (id) => cancelTransfer(id))
  handle<[string], void>(IPC.transfersPause, (id) => pauseTransfer(id))
  handle<[string], void>(IPC.transfersResume, (id) => resumeTransfer(id))
  handle<[], TransferSnapshot[]>(IPC.transfersClear, () => clearFinished())
  handle<[], TransferSnapshot[]>(IPC.transfersList, () => listTransfers())

  // --- settings ---------------------------------------------------------
  handle<[], ReturnType<typeof settings.get>>(IPC.settingsGet, () => settings.get())
  handle<[Partial<ReturnType<typeof settings.get>>], ReturnType<typeof settings.get>>(
    IPC.settingsPatch,
    (patch) => settings.patch(patch)
  )

  // --- dialogs and shell ------------------------------------------------
  handle<[boolean], PickedFile[]>(IPC.dialogPickFiles, async (multi) => {
    const result = await dialog.showOpenDialog({
      properties: multi === false ? ['openFile'] : ['openFile', 'multiSelections']
    })
    if (result.canceled) return []
    const files: PickedFile[] = []
    for (const path of result.filePaths) {
      const info = await stat(path).catch(() => null)
      files.push({ path, name: path.split(sep).pop() ?? path, size: info?.size ?? 0 })
    }
    return files
  })

  /**
   * Recursively walk a chosen folder for upload. Relative paths become the S3
   * key suffix so the directory structure is preserved in the bucket, and the
   * total is capped so a mis-click on a huge tree cannot exhaust memory.
   */
  handle<[], PickedFile[]>(IPC.dialogUploadFolder, async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory', 'createDirectory']
    })
    if (result.canceled) return []
    const root = result.filePaths[0]
    if (!root) return []

    const files: PickedFile[] = []
    const walk = async (dir: string): Promise<void> => {
      if (files.length >= MAX_UPLOAD_FILES) return
      const entries = await readdir(dir, { withFileTypes: true }).catch(() => [])
      for (const entry of entries) {
        if (files.length >= MAX_UPLOAD_FILES) return
        if (entry.name === '.git' || entry.name === 'node_modules' || entry.name === '.DS_Store') {
          continue
        }
        const full = join(dir, entry.name)
        if (entry.isDirectory()) {
          await walk(full)
        } else if (entry.isFile()) {
          const info = await stat(full).catch(() => null)
          if (!info) continue
          const rel = relative(root, full).split(sep).join('/')
          files.push({ path: full, name: entry.name, size: info.size, relativePath: rel })
        }
      }
    }
    await walk(root)
    return files
  })

  handle<[], string | null>(IPC.dialogPickFolder, async () => {
    const result = await dialog.showOpenDialog({ properties: ['openDirectory', 'createDirectory'] })
    return result.canceled ? null : (result.filePaths[0] ?? null)
  })

  handle<[string, string | undefined], boolean>(IPC.dialogConfirm, async (message, detail) => {
    const result = await dialog.showMessageBox({
      type: 'warning',
      buttons: ['Cancel', 'Continue'],
      defaultId: 0,
      cancelId: 0,
      message,
      detail,
      noLink: true
    })
    return result.response === 1
  })

  handle<[string], void>(IPC.shellReveal, (path) => shell.showItemInFolder(path))
  handle<[string], void>(IPC.shellOpenExternal, (url) => shell.openExternal(url))

  // The renderer clipboard API is unavailable in some contexts (file:// is not
  // always treated as a secure context), so route copies through main.
  handle<[string], void>(IPC.clipboardWrite, (text) => clipboard.writeText(text))

  handle<[], SecurityInfo>(IPC.securityInfo, () => secrets.describe())

  // Fan transfer progress out to every renderer window.
  onTransferEvent((event) => {
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) win.webContents.send(IPC.transfersEvent, event)
    }
  })
}


/** Longest folder-selection limit that keeps memory bounded while still
 *  covering realistic upload batches. */
const MAX_UPLOAD_FILES = 5000
