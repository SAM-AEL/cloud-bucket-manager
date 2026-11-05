import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import { IPC, type PickedFile, type R2MApi, type SecurityInfo } from '@shared/ipc'
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
  ObjectItem,
  ObjectMeta,
  Page,
  PresignReq,
  ProfileInput,
  ProviderCaps,
  ProviderId,
  RenameReq,
  TransferEvent,
  TransferSnapshot,
  UploadReq
} from '@shared/types'

/**
 * The preload is the only bridge between the sandboxed renderer and the main
 * process. It exposes named functions with explicit arguments — never
 * `ipcRenderer` itself, and never a raw event object — so the renderer cannot
 * reach channels we did not intend to open up.
 */

const api: R2MApi = {
  profiles: {
    list: () => ipcRenderer.invoke(IPC.profilesList),
    create: (input: ProfileInput) => ipcRenderer.invoke(IPC.profilesCreate, input),
    update: (id: string, patch: Partial<ProfileInput>) =>
      ipcRenderer.invoke(IPC.profilesUpdate, id, patch),
    remove: (id: string) => ipcRenderer.invoke(IPC.profilesRemove, id),
    test: (id: string) => ipcRenderer.invoke(IPC.profilesTest, id),
    testDraft: (input: ProfileInput) => ipcRenderer.invoke(IPC.profilesTestDraft, input),
    caps: (provider: ProviderId) => ipcRenderer.invoke(IPC.capsFor, provider)
  },
  buckets: {
    list: (profileId: string) => ipcRenderer.invoke(IPC.bucketsList, profileId),
    create: (req: CreateBucketReq) => ipcRenderer.invoke(IPC.bucketsCreate, req),
    remove: (profileId: string, bucket: string) =>
      ipcRenderer.invoke(IPC.bucketsDelete, profileId, bucket)
  },
  objects: {
    list: (req: ListObjectsReq): Promise<Page<ObjectItem>> => ipcRenderer.invoke(IPC.objectsList, req),
    head: (req: HeadReq): Promise<ObjectMeta | null> => ipcRenderer.invoke(IPC.objectsHead, req),
    remove: (req: DeleteReq) => ipcRenderer.invoke(IPC.objectsDelete, req),
    copy: (req: CopyReq) => ipcRenderer.invoke(IPC.objectsCopy, req),
    rename: (req: RenameReq) => ipcRenderer.invoke(IPC.objectsRename, req),
    presign: (req: PresignReq) => ipcRenderer.invoke(IPC.objectsPresign, req)
  },
  transfers: {
    upload: (req: UploadReq): Promise<string[]> => ipcRenderer.invoke(IPC.transfersUpload, req),
    download: (req: DownloadReq): Promise<string[]> => ipcRenderer.invoke(IPC.transfersDownload, req),
    cancel: (id: string) => ipcRenderer.invoke(IPC.transfersCancel, id),
    pause: (id: string) => ipcRenderer.invoke(IPC.transfersPause, id),
    resume: (id: string) => ipcRenderer.invoke(IPC.transfersResume, id),
    clearFinished: (): Promise<TransferSnapshot[]> => ipcRenderer.invoke(IPC.transfersClear),
    list: (): Promise<TransferSnapshot[]> => ipcRenderer.invoke(IPC.transfersList),
    onEvent: (cb: (event: TransferEvent) => void): (() => void) => {
      // Strip the IpcRendererEvent before handing anything to the renderer so
      // the callback cannot reach `sender` and the wider IPC surface.
      const listener = (_event: IpcRendererEvent, payload: TransferEvent): void => cb(payload)
      ipcRenderer.on(IPC.transfersEvent, listener)
      return () => {
        ipcRenderer.removeListener(IPC.transfersEvent, listener)
      }
    }
  },
  settings: {
    get: (): Promise<AppSettings> => ipcRenderer.invoke(IPC.settingsGet),
    patch: (patch: Partial<AppSettings>) => ipcRenderer.invoke(IPC.settingsPatch, patch)
  },
  dialog: {
    pickFiles: (multi = true): Promise<PickedFile[]> => ipcRenderer.invoke(IPC.dialogPickFiles, multi),
    pickFolder: (): Promise<string | null> => ipcRenderer.invoke(IPC.dialogPickFolder),
    pickUploadFolder: (): Promise<PickedFile[]> => ipcRenderer.invoke(IPC.dialogUploadFolder),
    confirm: (message: string, detail?: string) =>
      ipcRenderer.invoke(IPC.dialogConfirm, message, detail)
  },
  shell: {
    reveal: (path: string) => ipcRenderer.invoke(IPC.shellReveal, path),
    openExternal: (url: string) => ipcRenderer.invoke(IPC.shellOpenExternal, url),
    copy: (text: string) => ipcRenderer.invoke(IPC.clipboardWrite, text)
  },
  security: {
    info: (): Promise<SecurityInfo> => ipcRenderer.invoke(IPC.securityInfo)
  }
}

// Types used only for documentation above; kept as type-only re-exports so the
// bridge's public shape is verifiable from one place.
export type { ConnectionTest, ProviderCaps, Bucket }

contextBridge.exposeInMainWorld('r2m', api)
