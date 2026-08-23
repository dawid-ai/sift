import {
  contextBridge,
  ipcRenderer,
  webUtils,
  type IpcRendererEvent,
} from "electron";
import {
  IPC,
  type BinaryProgress,
  type BinaryUpdateEvent,
  type ChannelVideosQuery,
  type DownloadProgress,
  type MediaFilter,
  type QueueConfig,
  type QueueItem,
  type QueueSpec,
  type SiftApi,
  type SummaryToken,
  type FrameProgress,
  type FrameExportProgress,
  type FrameCrop,
  type TranscriptProgress,
  type UpdateEvent,
  type WhisperProgress,
} from "@sift/ipc-contract";

const api: SiftApi = {
  app: {
    getVersion: () => ipcRenderer.invoke(IPC.appGetVersion),
    quit: () => ipcRenderer.invoke(IPC.appQuit),
    readClipboardText: () => ipcRenderer.invoke(IPC.appReadClipboardText),
  },
  diagnostics: {
    get: () => ipcRenderer.invoke(IPC.diagnosticsGet),
    export: () => ipcRenderer.invoke(IPC.diagnosticsExport),
  },
  updates: {
    check: () => ipcRenderer.invoke(IPC.updateCheck),
    download: () => ipcRenderer.invoke(IPC.updateDownload),
    install: () => ipcRenderer.invoke(IPC.updateInstall),
    current: () => ipcRenderer.invoke(IPC.updateCurrent),
    onEvent: (cb: (e: UpdateEvent) => void) => {
      const listener = (_event: IpcRendererEvent, e: UpdateEvent) => cb(e);
      ipcRenderer.on(IPC.updateEvent, listener);
      return () => ipcRenderer.removeListener(IPC.updateEvent, listener);
    },
    simulate: (e: UpdateEvent) => ipcRenderer.invoke(IPC.updateSimulate, e),
  },
  db: {
    isReady: () => ipcRenderer.invoke(IPC.dbIsReady),
  },
  binaries: {
    list: () => ipcRenderer.invoke(IPC.binariesList),
    check: (kind) => ipcRenderer.invoke(IPC.binariesCheck, kind),
    install: (kind) => ipcRenderer.invoke(IPC.binariesInstall, kind),
    onProgress: (cb: (p: BinaryProgress) => void) => {
      const listener = (_event: IpcRendererEvent, p: BinaryProgress) => cb(p);
      ipcRenderer.on(IPC.binariesProgress, listener);
      return () => ipcRenderer.removeListener(IPC.binariesProgress, listener);
    },
    getPolicy: () => ipcRenderer.invoke(IPC.binariesGetPolicy),
    setPolicy: (mode) => ipcRenderer.invoke(IPC.binariesSetPolicy, mode),
    onUpdateEvent: (cb: (e: BinaryUpdateEvent) => void) => {
      const listener = (_: unknown, e: BinaryUpdateEvent) => cb(e);
      ipcRenderer.on(IPC.binariesUpdateEvent, listener);
      return () =>
        ipcRenderer.removeListener(IPC.binariesUpdateEvent, listener);
    },
    currentUpdateEvents: () =>
      ipcRenderer.invoke(IPC.binariesCurrentUpdateEvent),
  },
  whisper: {
    status: () => ipcRenderer.invoke(IPC.whisperStatus),
    install: () => ipcRenderer.invoke(IPC.whisperInstall),
    onProgress: (cb: (p: WhisperProgress) => void) => {
      const listener = (_event: IpcRendererEvent, p: WhisperProgress) => cb(p);
      ipcRenderer.on(IPC.whisperProgress, listener);
      return () => ipcRenderer.removeListener(IPC.whisperProgress, listener);
    },
  },
  metadata: {
    fetch: (url: string) => ipcRenderer.invoke(IPC.metadataFetch, url),
    listExtractors: () => ipcRenderer.invoke(IPC.metadataListExtractors),
  },
  download: {
    start: (input) => ipcRenderer.invoke(IPC.downloadStart, input),
    onProgress: (cb: (p: DownloadProgress) => void) => {
      const listener = (_event: IpcRendererEvent, p: DownloadProgress) => cb(p);
      ipcRenderer.on(IPC.downloadProgress, listener);
      return () => ipcRenderer.removeListener(IPC.downloadProgress, listener);
    },
  },
  import: {
    local: (input) => ipcRenderer.invoke(IPC.importLocal, input),
    pick: () => ipcRenderer.invoke(IPC.importPick),
    // `webUtils` lives in the preload only; the renderer has no access to it, which is
    // why this is exposed rather than read off the `File` in the drop handler.
    pathForFile: (file) => {
      try {
        return webUtils.getPathForFile(file);
      } catch {
        return "";
      }
    },
  },
  ollama: {
    health: () => ipcRenderer.invoke(IPC.ollamaHealth),
    start: () => ipcRenderer.invoke(IPC.ollamaStart),
  },
  library: {
    list: () => ipcRenderer.invoke(IPC.libraryList),
    listPage: (filter: MediaFilter, page: number, pageSize: number) =>
      ipcRenderer.invoke(IPC.libraryListPage, filter, page, pageSize),
    facets: () => ipcRenderer.invoke(IPC.libraryFacets),
    listIds: (filter: MediaFilter) =>
      ipcRenderer.invoke(IPC.libraryListIds, filter),
    reveal: (path: string) => ipcRenderer.invoke(IPC.libraryReveal, path),
    remove: (id: number) => ipcRenderer.invoke(IPC.libraryRemove, id),
    detail: (id: number) => ipcRenderer.invoke(IPC.libraryDetail, id),
    removeDownload: (id: number) =>
      ipcRenderer.invoke(IPC.libraryRemoveDownload, id),
    removeTranscript: (id: number) =>
      ipcRenderer.invoke(IPC.libraryRemoveTranscript, id),
    removeSummary: (id: number) =>
      ipcRenderer.invoke(IPC.libraryRemoveSummary, id),
    openExternal: (url: string) =>
      ipcRenderer.invoke(IPC.libraryOpenExternal, url),
    search: (query: string, includeText?: boolean) =>
      ipcRenderer.invoke(IPC.librarySearch, query, includeText),
    exportPlaylist: (mediaIds: number[], name: string) =>
      ipcRenderer.invoke(IPC.libraryExportPlaylist, mediaIds, name),
  },
  tags: {
    add: (mediaId: number, name: string) =>
      ipcRenderer.invoke(IPC.tagsAdd, mediaId, name),
    remove: (mediaId: number, name: string) =>
      ipcRenderer.invoke(IPC.tagsRemove, mediaId, name),
    listAll: () => ipcRenderer.invoke(IPC.tagsListAll),
  },
  settings: {
    getTranscriptLanguages: () =>
      ipcRenderer.invoke(IPC.settingsGetTranscriptLanguages),
    setTranscriptLanguages: (langs: string[]) =>
      ipcRenderer.invoke(IPC.settingsSetTranscriptLanguages, langs),
  },
  downloads: {
    getPath: () => ipcRenderer.invoke(IPC.downloadsGetPath),
    setPath: (path: string) => ipcRenderer.invoke(IPC.downloadsSetPath, path),
    pickPath: () => ipcRenderer.invoke(IPC.downloadsPickPath),
  },
  auth: {
    openBrowser: () => ipcRenderer.invoke(IPC.authOpenBrowser),
    listSites: () => ipcRenderer.invoke(IPC.authListSites),
    removeSite: (domain: string) =>
      ipcRenderer.invoke(IPC.authRemoveSite, domain),
  },
  queue: {
    add: (urls: string[], spec: QueueSpec) =>
      ipcRenderer.invoke(IPC.queueAdd, urls, spec),
    list: () => ipcRenderer.invoke(IPC.queueList),
    remove: (id: number) => ipcRenderer.invoke(IPC.queueRemove, id),
    reorder: (id: number, dir: "up" | "down") =>
      ipcRenderer.invoke(IPC.queueReorder, id, dir),
    retry: (id: number) => ipcRenderer.invoke(IPC.queueRetry, id),
    cancel: (id: number) => ipcRenderer.invoke(IPC.queueCancel, id),
    retryFailed: () => ipcRenderer.invoke(IPC.queueRetryFailed),
    getConfig: () => ipcRenderer.invoke(IPC.queueGetConfig),
    setConfig: (config: QueueConfig) =>
      ipcRenderer.invoke(IPC.queueSetConfig, config),
    pause: () => ipcRenderer.invoke(IPC.queuePause),
    resume: () => ipcRenderer.invoke(IPC.queueResume),
    isPaused: () => ipcRenderer.invoke(IPC.queueIsPaused),
    onUpdate: (cb: (items: QueueItem[]) => void) => {
      const listener = (_event: IpcRendererEvent, items: QueueItem[]) =>
        cb(items);
      ipcRenderer.on(IPC.queueUpdate, listener);
      return () => ipcRenderer.removeListener(IPC.queueUpdate, listener);
    },
  },
  channels: {
    add: (url: string) => ipcRenderer.invoke(IPC.channelAdd, url),
    list: () => ipcRenderer.invoke(IPC.channelList),
    remove: (id: number) => ipcRenderer.invoke(IPC.channelRemove, id),
    refresh: (id: number) => ipcRenderer.invoke(IPC.channelRefresh, id),
    refreshAll: () => ipcRenderer.invoke(IPC.channelRefreshAll),
    listVideos: (id: number, query: ChannelVideosQuery) =>
      ipcRenderer.invoke(IPC.channelListVideos, id, query),
    openForMedia: (mediaId: number) =>
      ipcRenderer.invoke(IPC.channelOpenForMedia, mediaId),
    videoStatuses: (urls: string[]) =>
      ipcRenderer.invoke(IPC.channelVideoStatuses, urls),
    downloadedMedia: (channelId: string) =>
      ipcRenderer.invoke(IPC.channelDownloadedMedia, channelId),
  },
  subscriptions: {
    list: () => ipcRenderer.invoke(IPC.subscriptionList),
    sync: () => ipcRenderer.invoke(IPC.subscriptionSync),
  },
  transcript: {
    get: (input) => ipcRenderer.invoke(IPC.transcriptGet, input),
    onProgress: (cb: (p: TranscriptProgress) => void) => {
      const listener = (_event: IpcRendererEvent, p: TranscriptProgress) =>
        cb(p);
      ipcRenderer.on(IPC.transcriptProgress, listener);
      return () => ipcRenderer.removeListener(IPC.transcriptProgress, listener);
    },
    getMethod: () => ipcRenderer.invoke(IPC.transcriptGetMethod),
    setMethod: (m) => ipcRenderer.invoke(IPC.transcriptSetMethod, m),
    getAutoDownload: () => ipcRenderer.invoke(IPC.transcriptGetAutoDownload),
    setAutoDownload: (enabled: boolean) =>
      ipcRenderer.invoke(IPC.transcriptSetAutoDownload, enabled),
    exportSrt: (transcriptId: number) =>
      ipcRenderer.invoke(IPC.transcriptExportSrt, transcriptId),
  },
  summarize: {
    start: (input) => ipcRenderer.invoke(IPC.summarizeStart, input),
    onToken: (cb: (t: SummaryToken) => void) => {
      const listener = (_event: IpcRendererEvent, t: SummaryToken) => cb(t);
      ipcRenderer.on(IPC.summarizeToken, listener);
      return () => ipcRenderer.removeListener(IPC.summarizeToken, listener);
    },
    export: (summaryId: number) =>
      ipcRenderer.invoke(IPC.summarizeExport, summaryId),
  },
  frames: {
    extract: (
      mediaId: number,
      opts?: { classifierModel?: string; fullScreenOnly?: boolean },
    ) => ipcRenderer.invoke(IPC.framesExtract, mediaId, opts),
    list: (mediaId: number) => ipcRenderer.invoke(IPC.framesList, mediaId),
    capture: (mediaId: number, tsMs: number) =>
      ipcRenderer.invoke(IPC.framesCapture, mediaId, tsMs),
    setIncluded: (frameId: number, included: boolean) =>
      ipcRenderer.invoke(IPC.framesSetIncluded, frameId, included),
    getCrop: (mediaId: number) =>
      ipcRenderer.invoke(IPC.framesGetCrop, mediaId),
    setCrop: (mediaId: number, crop: FrameCrop | null) =>
      ipcRenderer.invoke(IPC.framesSetCrop, mediaId, crop),
    export: (
      mediaId: number,
      format: "md" | "pdf",
      polish?: { providerId: string; model: string },
    ) => ipcRenderer.invoke(IPC.framesExport, mediaId, format, polish),
    saveSelected: (mediaId: number) =>
      ipcRenderer.invoke(IPC.framesSaveSelected, mediaId),
    onProgress: (cb: (p: FrameProgress) => void) => {
      const listener = (_event: IpcRendererEvent, p: FrameProgress) => cb(p);
      ipcRenderer.on(IPC.framesProgress, listener);
      return () => ipcRenderer.removeListener(IPC.framesProgress, listener);
    },
    onExportProgress: (cb: (p: FrameExportProgress) => void) => {
      const listener = (_event: IpcRendererEvent, p: FrameExportProgress) =>
        cb(p);
      ipcRenderer.on(IPC.framesExportProgress, listener);
      return () =>
        ipcRenderer.removeListener(IPC.framesExportProgress, listener);
    },
  },
  prompts: {
    list: () => ipcRenderer.invoke(IPC.promptsList),
    create: (input: { name: string; body: string }) =>
      ipcRenderer.invoke(IPC.promptsCreate, input),
    update: (id: number, input: { name: string; body: string }) =>
      ipcRenderer.invoke(IPC.promptsUpdate, id, input),
    delete: (id: number) => ipcRenderer.invoke(IPC.promptsDelete, id),
    export: () => ipcRenderer.invoke(IPC.promptsExport),
    import: () => ipcRenderer.invoke(IPC.promptsImport),
  },
  aiProviders: {
    list: () => ipcRenderer.invoke(IPC.aiProvidersList),
    keyStatus: (providerId: string) =>
      ipcRenderer.invoke(IPC.aiKeyStatus, providerId),
    setKey: (providerId: string, key: string) =>
      ipcRenderer.invoke(IPC.aiKeySet, providerId, key),
    clearKey: (providerId: string) =>
      ipcRenderer.invoke(IPC.aiKeyClear, providerId),
    getCustomConfig: () => ipcRenderer.invoke(IPC.aiCustomConfigGet),
    setCustomConfig: (cfg) => ipcRenderer.invoke(IPC.aiCustomConfigSet, cfg),
    getDefault: () => ipcRenderer.invoke(IPC.aiGetDefault),
    setDefault: (cfg) => ipcRenderer.invoke(IPC.aiSetDefault, cfg),
    cliStatus: () => ipcRenderer.invoke(IPC.aiCliStatus),
    runPrompt: (input) => ipcRenderer.invoke(IPC.aiRunPrompt, input),
  },
};

contextBridge.exposeInMainWorld("sift", api);
