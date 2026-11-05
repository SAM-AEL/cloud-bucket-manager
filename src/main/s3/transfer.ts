import { GetObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3'
import { Upload } from '@aws-sdk/lib-storage'
import { createReadStream, createWriteStream } from 'node:fs'
import { mkdir } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import type {
  DownloadReq,
  TransferEvent,
  TransferSnapshot,
  UploadReq
} from '@shared/types'
import { getClient } from './client'
import { toErrorInfo } from './errors'
import { profileStore } from '../store'

/**
 * A small, dependency-free transfer queue.
 *
 * Responsibilities:
 *  - cap concurrent transfers so a 200-file upload cannot exhaust sockets
 *  - stream progress to the renderer without flooding IPC (throttled)
 *  - support cancel (AbortController) and pause (suspending the slot)
 *  - keep snapshots in sync so a reloaded renderer can restore state
 */

const transfers = new Map<string, TransferSnapshot>()
/** Live AbortControllers, keyed by transfer id. */
const controllers = new Map<string, AbortController>()
/** Resumable gates: pause() resolves the stored waiter to release the slot. */
const pauseGates = new Map<string, () => void>()

const MAX_CONCURRENT = 4
/** Progress events are coalesced to this interval per transfer. */
const PROGRESS_INTERVAL_MS = 150

type Listener = (event: TransferEvent) => void
const listeners = new Set<Listener>()

export function onTransferEvent(listener: Listener): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function emit(event: TransferEvent): void {
  for (const listener of listeners) {
    try {
      listener(event)
    } catch {
      /* a broken listener must not break the transfer */
    }
  }
}

function patch(id: string, changes: Partial<TransferSnapshot>): void {
  const current = transfers.get(id)
  if (!current) return
  const next = { ...current, ...changes }
  transfers.set(id, next)
  emit({ type: 'patch', id, patch: changes })
}

function createTransfer(
  partial: Omit<TransferSnapshot, 'id' | 'state' | 'progress' | 'loaded'>
): string {
  const id = `t_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
  transfers.set(id, { ...partial, id, state: 'queued', progress: 0, loaded: 0 })
  emit({ type: 'snapshot', transfer: transfers.get(id) as TransferSnapshot })
  return id
}

export function listTransfers(): TransferSnapshot[] {
  return [...transfers.values()].sort((a, b) => b.startedAt - a.startedAt)
}

/** Drop finished/canceled entries. Returns the new list for the renderer. */
export function clearFinished(): TransferSnapshot[] {
  for (const [id, t] of transfers) {
    if (t.state === 'done' || t.state === 'error' || t.state === 'canceled') {
      transfers.delete(id)
      controllers.delete(id)
    }
  }
  return listTransfers()
}

// --- concurrency gate -------------------------------------------------

let active = 0
const waiting: Array<() => void> = []

async function acquire(): Promise<void> {
  if (active < MAX_CONCURRENT) {
    active++
    return
  }
  await new Promise<void>((resolve) => waiting.push(resolve))
  active++
}

function release(): void {
  active--
  const next = waiting.shift()
  if (next) next()
}

/** Wait while this transfer is paused, so it holds its slot cooperatively. */
function waitWhilePaused(id: string): Promise<void> {
  if (transfers.get(id)?.state !== 'paused') return Promise.resolve()
  return new Promise<void>((resolve) => pauseGates.set(id, resolve))
}

export function cancelTransfer(id: string): void {
  const current = transfers.get(id)
  if (!current) return
  if (current.state === 'done' || current.state === 'canceled') return
  // Release a paused gate so the runner can observe the abort.
  pauseGates.get(id)?.()
  pauseGates.delete(id)
  controllers.get(id)?.abort()
  patch(id, { state: 'canceled', finishedAt: Date.now() })
}

export function pauseTransfer(id: string): void {
  const current = transfers.get(id)
  if (!current || current.state !== 'running') return
  patch(id, { state: 'paused' })
}

export function resumeTransfer(id: string): void {
  const current = transfers.get(id)
  if (!current || current.state !== 'paused') return
  patch(id, { state: 'running' })
  const gate = pauseGates.get(id)
  if (gate) {
    pauseGates.delete(id)
    gate()
  }
}

/**
 * Throttled progress reporting. Multipart uploads fire an event per part, so
 * without coalescing a large file emits hundreds of IPC messages a second.
 */
function makeProgressReporter(id: string, total: number) {
  let lastEmit = 0
  return (loaded: number, force = false): void => {
    const now = Date.now()
    if (!force && now - lastEmit < PROGRESS_INTERVAL_MS) return
    lastEmit = now
    patch(id, { loaded, total, progress: total > 0 ? Math.min(loaded / total, 1) : null })
  }
}

async function runUpload(
  req: UploadReq,
  item: UploadReq['items'][number],
  transferId: string
): Promise<void> {
  const client = getClient(req.profileId)
  const controller = new AbortController()
  controllers.set(transferId, controller)

  const prefix = req.prefix && !req.prefix.endsWith('/') ? `${req.prefix}/` : req.prefix
  const key = `${prefix}${item.name}`
  const total = item.size
  const report = makeProgressReporter(transferId, total)

  patch(transferId, { name: key, total })

  const upload = new Upload({
    client,
    params: { Bucket: req.bucket, Key: key, Body: createReadStream(item.path) },
    // Multipart thresholds tuned for object storage over the public internet.
    queueSize: 4,
    partSize: 10 * 1024 * 1024,
    leavePartsOnError: false,
    abortController: controller
  })

  try {
    await waitWhilePaused(transferId)
    patch(transferId, { state: 'running' })
    await upload.done()
    report(total, true)
    patch(transferId, { state: 'done', finishedAt: Date.now() })
  } catch (error) {
    handleTransferError(transferId, error)
  } finally {
    controllers.delete(transferId)
  }
}

async function runDownload(req: DownloadReq, key: string, transferId: string): Promise<void> {
  const client = getClient(req.profileId)
  const controller = new AbortController()
  controllers.set(transferId, controller)

  try {
    await waitWhilePaused(transferId)
    patch(transferId, { state: 'running' })

    // HEAD first so the bar shows a real total and missing objects fail fast.
    let total = 0
    try {
      const head = await client.send(new HeadObjectCommand({ Bucket: req.bucket, Key: key }))
      total = head.ContentLength ?? 0
      patch(transferId, { total, progress: 0 })
    } catch {
      // Non-fatal: fall back to an indeterminate bar.
    }

    const destination = join(req.destDir, key.split('/').pop() || key)
    await mkdir(dirname(destination), { recursive: true })

    const response = await client.send(
      new GetObjectCommand({ Bucket: req.bucket, Key: key }),
      { abortSignal: controller.signal }
    )
    const body = response.Body
    if (!body) throw new Error('The provider returned an empty response body.')

    let loaded = 0
    let lastEmit = 0
    // The SDK body is a Readable in Node, but normalize defensively for the
    // web-stream shape some SDK builds return.
    const source = body instanceof Readable ? body : Readable.from(body as AsyncIterable<Uint8Array>)

    source.on('data', (chunk: Buffer | string) => {
      loaded += typeof chunk === 'string' ? Buffer.byteLength(chunk) : chunk.length
      const now = Date.now()
      if (now - lastEmit >= PROGRESS_INTERVAL_MS) {
        lastEmit = now
        patch(transferId, { loaded, total, progress: total ? loaded / total : null })
      }
    })

    // Streams straight to disk: never buffer an object in renderer memory.
    await pipeline(source, createWriteStream(destination), { signal: controller.signal })

    patch(transferId, { loaded: total || loaded, progress: 1, state: 'done', finishedAt: Date.now() })
  } catch (error) {
    handleTransferError(transferId, error)
  } finally {
    controllers.delete(transferId)
  }
}

function handleTransferError(id: string, error: unknown): void {
  if (transfers.get(id)?.state === 'canceled') return
  if ((error as { name?: string })?.name === 'AbortError') {
    patch(id, { state: 'canceled', finishedAt: Date.now() })
    return
  }
  const info = toErrorInfo(error)
  patch(id, {
    state: 'error',
    error: info.hint ? `${info.message} ${info.hint}` : info.message,
    finishedAt: Date.now()
  })
}

/** Queue local files for upload. Returns the new transfer ids. */
export function queueUploads(req: UploadReq): string[] {
  const profile = profileStore.find(req.profileId)
  return req.items.map((item) => {
    const id = createTransfer({
      kind: 'upload',
      profileId: req.profileId,
      profileLabel: profile?.label ?? 'Unknown profile',
      bucket: req.bucket,
      name: item.name,
      total: item.size,
      startedAt: Date.now()
    })
    void (async () => {
      await acquire()
      try {
        await runUpload(req, item, id)
      } finally {
        release()
      }
    })()
    return id
  })
}

/** Queue object keys for download. Returns the new transfer ids. */
export function queueDownloads(req: DownloadReq): string[] {
  const profile = profileStore.find(req.profileId)
  return req.keys.map((key) => {
    const id = createTransfer({
      kind: 'download',
      profileId: req.profileId,
      profileLabel: profile?.label ?? 'Unknown profile',
      bucket: req.bucket,
      name: key,
      total: 0,
      startedAt: Date.now()
    })
    void (async () => {
      await acquire()
      try {
        await runDownload(req, key, id)
      } finally {
        release()
      }
    })()
    return id
  })
}
