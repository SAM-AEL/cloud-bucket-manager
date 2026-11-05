/**
 * Shared domain types. Imported by main, preload and renderer — must stay
 * free of any Electron or Node imports so it can cross the process boundary.
 */

export type ProviderId =
  | 'cloudflare-r2'
  | 'aws'
  | 'minio'
  | 'backblaze-b2'
  | 'wasabi'
  | 'digitalocean'
  | 'generic'

export interface ProfileInput {
  label: string
  provider: ProviderId
  /** Full endpoint URL, e.g. https://<accountId>.r2.cloudflarestorage.com */
  endpoint: string
  region: string
  accessKeyId: string
  /** Secret key. Only ever travels renderer -> main; never sent back. */
  secretAccessKey: string
  /** R2 and some S3-compat services require a bucket-less endpoint. */
  forcePathStyle?: boolean
  /** Optional default bucket to open when the profile is selected. */
  defaultBucket?: string
  /**
   * Sub-path inside a bucket that this profile is scoped to, e.g.
   * "assets/images". Every time you open a bucket through this profile the
   * browser starts here instead of at the bucket root.
   */
  pathPrefix?: string
}

export interface ProfileMeta {
  id: string
  label: string
  provider: ProviderId
  endpoint: string
  region: string
  accessKeyId: string
  forcePathStyle: boolean
  pathPrefix?: string
  defaultBucket?: string
  createdAt: number
  /** False when the secret could not be encrypted and lives in memory only. */
  secretPersisted: boolean
}

/** What a given provider actually implements. Drives UI affordances. */
export interface ProviderCaps {
  objectTagging: boolean
  bucketAcl: boolean
  objectLock: boolean
  lifecycleRules: boolean
  presignedUrls: boolean
  multipart: boolean
  batchDelete: boolean
  serverSideEncryption: boolean
  bucketCreation: boolean
}

export interface Bucket {
  name: string
  createdAt?: number
  region?: string
}

export interface ObjectItem {
  key: string
  size: number
  lastModified?: number
  etag?: string
  storageClass?: string
  contentType?: string
  /** Present for CommonPrefixes entries returned by ListObjectsV2. */
  isPrefix?: boolean
}

export interface ObjectMeta extends ObjectItem {
  contentLength?: number
  metadata?: Record<string, string>
  cacheControl?: string
  contentDisposition?: string
  contentEncoding?: string
}

export interface Page<T> {
  items: T[]
  cursor?: string
  /** True when the provider reported no more results. */
  done: boolean
}

export interface ListObjectsReq {
  profileId: string
  bucket: string
  prefix: string
  cursor?: string
  limit?: number
  signalToken?: string
}

export interface HeadReq {
  profileId: string
  bucket: string
  key: string
  signalToken?: string
}

export interface DeleteReq {
  profileId: string
  bucket: string
  keys: string[]
}

export interface CopyReq {
  profileId: string
  bucket: string
  keys: string[]
  destBucket: string
  destPrefix: string
}

export interface RenameReq {
  profileId: string
  bucket: string
  from: string
  to: string
}

export interface CreateBucketReq {
  profileId: string
  bucket: string
  region?: string
}

export interface PresignReq {
  profileId: string
  bucket: string
  key: string
  /** Seconds. */
  expiresIn?: number
  download?: boolean
}

export interface UploadReq {
  profileId: string
  bucket: string
  /** S3 key prefix (folder) the files land in. */
  prefix: string
  items: Array<{ path: string; name: string; size: number }>
  overwrite?: boolean
}

export interface DownloadReq {
  profileId: string
  bucket: string
  keys: string[]
  /** Absolute directory chosen by the user. */
  destDir: string
  overwrite?: boolean
}

export interface ConnectionTest {
  ok: boolean
  ms: number
  bucketCount?: number
  /**
   * True when the credentials cannot list buckets but can still use specific
   * ones — the signature of a bucket-scoped Cloudflare R2 token.
   */
  bucketScoped?: boolean
  /** Buckets that were reachable despite the listing being denied. */
  accessibleBuckets?: string[]
  error?: S3ErrorInfo
}

export interface S3ErrorInfo {
  name: string
  message: string
  /** AWS SDK error code, e.g. AccessDenied, NoSuchBucket, SignatureDoesNotMatch. */
  code?: string
  status?: number
  hint?: string
}

export type TransferState =
  | 'queued'
  | 'running'
  | 'paused'
  | 'done'
  | 'error'
  | 'canceled'

export type TransferKind = 'upload' | 'download'

export interface TransferSnapshot {
  id: string
  kind: TransferKind
  profileId: string
  profileLabel: string
  bucket: string
  /** Display name, usually the object key or local file name. */
  name: string
  state: TransferState
  /** Bytes moved so far. */
  loaded: number
  /** Total bytes, 0 when the server does not report a size. */
  total: number
  /** 0..1, or null when total is unknown (indeterminate). */
  progress: number | null
  startedAt: number
  finishedAt?: number
  error?: string
}

export type TransferEvent =
  | { type: 'snapshot'; transfer: TransferSnapshot }
  | { type: 'patch'; id: string; patch: Partial<TransferSnapshot> }

export interface WindowState {
  width: number
  height: number
  x?: number
  y?: number
  maximized: boolean
}

export interface AppSettings {
  theme: 'dark' | 'light' | 'system'
  density: 'comfortable' | 'compact'
  showHiddenFiles: boolean
  confirmDeletes: boolean
  maxParallelTransfers: number
  lastProfileId?: string
  /** Last browsed location, per profile. */
  lastLocation?: Record<string, { bucket: string; prefix: string }>
  window?: WindowState
}
