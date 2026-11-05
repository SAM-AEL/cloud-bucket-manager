import type {
  AppSettings,
  Bucket,
  ConnectionTest,
  CopyReq,
  CreateBucketReq,
  DeleteReq,
  DownloadReq,
  HeadReq,
  ListObjectsReq,
  ObjectMeta,
  Page,
  PresignReq,
  ProfileInput,
  ProfileMeta,
  ProviderCaps,
  ProviderId,
  RenameReq,
  S3ErrorInfo,
  TransferEvent,
  UploadReq
} from './types'

/**
 * Errors thrown inside an ipcMain handler are serialized by Electron's
 * structured clone, which keeps only `message` and `stack` — any custom own
 * property (such as our S3ErrorInfo) is silently dropped. So the structured
 * payload is encoded into the message behind this marker and decoded on the
 * renderer side. Without this the actionable hint never survives the trip.
 */
export const ERROR_MARKER = '[R2M1]'
/** Separates the human-readable message from the encoded payload. */
export const ERROR_PAYLOAD_SEP = ' || '

/** Channels the preload bridge is allowed to forward. Mirrored by main guards. */
export const IPC = {
  profilesList: 'profiles:list',
  profilesCreate: 'profiles:create',
  profilesUpdate: 'profiles:update',
  profilesRemove: 'profiles:remove',
  profilesTest: 'profiles:test',
  profilesTestDraft: 'profiles:testDraft',

  bucketsList: 'buckets:list',
  bucketsCreate: 'buckets:create',
  bucketsDelete: 'buckets:delete',

  objectsList: 'objects:list',
  objectsHead: 'objects:head',
  objectsDelete: 'objects:delete',
  objectsCopy: 'objects:copy',
  objectsRename: 'objects:rename',
  objectsPresign: 'objects:presign',

  transfersUpload: 'transfers:upload',
  transfersDownload: 'transfers:download',
  transfersCancel: 'transfers:cancel',
  transfersPause: 'transfers:pause',
  transfersResume: 'transfers:resume',
  transfersClear: 'transfers:clear',
  transfersList: 'transfers:list',
  transfersEvent: 'transfers:event',

  settingsGet: 'settings:get',
  settingsPatch: 'settings:patch',

  dialogPickFiles: 'dialog:pickFiles',
  dialogPickFolder: 'dialog:pickFolder',
  dialogUploadFolder: 'dialog:uploadFolder',
  dialogConfirm: 'dialog:confirm',
  shellReveal: 'shell:reveal',
  shellOpenExternal: 'shell:openExternal',
  clipboardWrite: 'clipboard:write',

  capsFor: 'caps:for',
  securityInfo: 'security:info'
} as const

export interface PickedFile {
  path: string
  name: string
  size: number
  /** Path relative to the chosen folder, preserved as the S3 key suffix. */
  relativePath?: string
}

export interface SecurityInfo {
  /** True when secrets are encrypted at rest (any tier). */
  encryptionAvailable: boolean
  /** Electron's safeStorage.getSelectedStorageBackend() where supported. */
  backend?: string
  /** Which protection tier is actually in use. */
  method: 'keychain' | 'dpapi' | 'libsecret' | 'machine' | 'memory'
  /** True when credentials survive quitting the app. */
  persistent: boolean
  /** Human-readable description of the active tier. */
  label: string
}

/**
 * The complete API exposed on `window.r2m`. Renderer code never sees
 * `ipcRenderer` itself — only these named, argument-taking functions.
 */
export interface R2MApi {
  profiles: {
    list(): Promise<ProfileMeta[]>
    create(input: ProfileInput): Promise<ProfileMeta>
    update(id: string, patch: Partial<ProfileInput>): Promise<ProfileMeta>
    remove(id: string): Promise<void>
    test(id: string): Promise<ConnectionTest>
    testDraft(input: ProfileInput): Promise<ConnectionTest>
    caps(provider: ProviderId): Promise<ProviderCaps>
  }
  buckets: {
    list(profileId: string): Promise<Page<Bucket>>
    create(req: CreateBucketReq): Promise<Bucket>
    remove(profileId: string, bucket: string): Promise<void>
  }
  objects: {
    list(req: ListObjectsReq): Promise<Page<ObjectItemLike>>
    head(req: HeadReq): Promise<ObjectMeta | null>
    remove(req: DeleteReq): Promise<{ deleted: number }>
    copy(req: CopyReq): Promise<void>
    rename(req: RenameReq): Promise<void>
    presign(req: PresignReq): Promise<{ url: string; expiresIn: number }>
  }
  transfers: {
    upload(req: UploadReq): Promise<string[]>
    download(req: DownloadReq): Promise<string[]>
    cancel(id: string): Promise<void>
    pause(id: string): Promise<void>
    resume(id: string): Promise<void>
    clearFinished(): Promise<import('./types').TransferSnapshot[]>
    list(): Promise<import('./types').TransferSnapshot[]>
    onEvent(cb: (event: TransferEvent) => void): () => void
  }
  settings: {
    get(): Promise<AppSettings>
    patch(patch: Partial<AppSettings>): Promise<AppSettings>
  }
  dialog: {
    pickFiles(multi?: boolean): Promise<PickedFile[]>
    pickFolder(): Promise<string | null>
    /** Recursively collect a folder for upload, preserving relative paths. */
    pickUploadFolder(): Promise<PickedFile[]>
    confirm(message: string, detail?: string): Promise<boolean>
  }
  shell: {
    reveal(path: string): Promise<void>
    openExternal(url: string): Promise<void>
    /** Clipboard write via the main process; works even when the renderer
     *  clipboard API is unavailable (e.g. non-secure context). */
    copy(text: string): Promise<void>
  }
  security: {
    info(): Promise<SecurityInfo>
  }
}

type ObjectItemLike = import('./types').ObjectItem

export type { S3ErrorInfo }
