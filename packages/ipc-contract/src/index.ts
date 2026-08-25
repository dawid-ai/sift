import type { TranscriptMethod } from "@sift/core";
export type { TranscriptMethod } from "@sift/core";

/** Canonical IPC channel names. Add new channels here as `domain:verb`. */
export const IPC = {
  appGetVersion: "app:getVersion",
  appQuit: "app:quit",
  appReadClipboardText: "app:readClipboardText",
  diagnosticsGet: "diagnostics:get",
  diagnosticsExport: "diagnostics:export",
  updateCheck: "update:check",
  updateDownload: "update:download",
  updateInstall: "update:install",
  updateEvent: "update:event",
  updateSimulate: "update:simulate",
  updateCurrent: "update:current",
  ollamaHealth: "ollama:health",
  ollamaStart: "ollama:start",
  dbIsReady: "db:isReady",
  binariesList: "binaries:list",
  binariesCheck: "binaries:check",
  binariesInstall: "binaries:install",
  binariesProgress: "binaries:progress",
  binariesGetPolicy: "binaries:getPolicy",
  binariesSetPolicy: "binaries:setPolicy",
  binariesUpdateEvent: "binaries:updateEvent",
  binariesCurrentUpdateEvent: "binaries:currentUpdateEvent",
  metadataFetch: "metadata:fetch",
  metadataListExtractors: "metadata:listExtractors",
  downloadStart: "download:start",
  downloadProgress: "download:progress",
  importLocal: "import:local",
  importPick: "import:pick",
  libraryList: "library:list",
  libraryListPage: "library:listPage",
  libraryFacets: "library:facets",
  libraryListIds: "library:listIds",
  libraryReveal: "library:reveal",
  libraryRemove: "library:remove",
  libraryDetail: "library:detail",
  libraryRemoveDownload: "library:removeDownload",
  libraryRemoveTranscript: "library:removeTranscript",
  libraryRemoveSummary: "library:removeSummary",
  libraryOpenExternal: "library:openExternal",
  librarySearch: "library:search",
  libraryExportPlaylist: "library:exportPlaylist",
  libraryFindDuplicates: "library:findDuplicates",
  librarySetFavourite: "library:setFavourite",
  librarySetPinned: "library:setPinned",
  libraryBulkRemove: "library:bulkRemove",
  collectionsList: "collections:list",
  collectionsCreate: "collections:create",
  collectionsRename: "collections:rename",
  collectionsDelete: "collections:delete",
  collectionsAdd: "collections:add",
  collectionsRemove: "collections:remove",
  collectionsForMedia: "collections:forMedia",
  tagsBulkAdd: "tags:bulkAdd",
  tagsBulkRemove: "tags:bulkRemove",
  savedSearchesList: "library:savedSearches",
  savedSearchesSave: "library:saveSearch",
  savedSearchesDelete: "library:deleteSearch",
  settingsGetTranscriptLanguages: "settings:getTranscriptLanguages",
  settingsSetTranscriptLanguages: "settings:setTranscriptLanguages",
  settingsGetProxy: "settings:getProxy",
  settingsSetProxy: "settings:setProxy",
  authOpenBrowser: "auth:openBrowser",
  authListSites: "auth:listSites",
  authRemoveSite: "auth:removeSite",
  transcriptGet: "transcript:get",
  transcriptProgress: "transcript:progress",
  transcriptGetMethod: "transcript:getMethod",
  transcriptSetMethod: "transcript:setMethod",
  transcriptGetAutoDownload: "transcript:getAutoDownload",
  transcriptSetAutoDownload: "transcript:setAutoDownload",
  transcriptExportSrt: "transcript:exportSrt",
  transcriptUpdate: "transcript:update",
  exportPreset: "export:preset",
  exportReveal: "export:reveal",
  clipLink: "clip:link",
  clipExport: "clip:export",
  summarizeStart: "summarize:start",
  summarizeToken: "summarize:token",
  summarizeExport: "summarize:export",
  promptsList: "prompts:list",
  promptsCreate: "prompts:create",
  promptsUpdate: "prompts:update",
  promptsDelete: "prompts:delete",
  promptsExport: "prompts:export",
  promptsImport: "prompts:import",
  profileExport: "profile:export",
  profileImport: "profile:import",
  storageUsage: "storage:usage",
  storageClear: "storage:clear",
  aiProvidersList: "ai:providers",
  aiKeyStatus: "ai:keyStatus",
  aiKeySet: "ai:keySet",
  aiKeyClear: "ai:keyClear",
  aiCustomConfigGet: "ai:customConfigGet",
  aiCustomConfigSet: "ai:customConfigSet",
  aiGetDefault: "ai:getDefault",
  aiSetDefault: "ai:setDefault",
  aiCliStatus: "ai:cliStatus",
  aiRunPrompt: "ai:runPrompt",
  queueAdd: "queue:add",
  queueList: "queue:list",
  queueRemove: "queue:remove",
  queueReorder: "queue:reorder",
  queueRetry: "queue:retry",
  queueCancel: "queue:cancel",
  queuePause: "queue:pause",
  queueResume: "queue:resume",
  queueIsPaused: "queue:isPaused",
  queueGetConfig: "queue:getConfig",
  queueSetConfig: "queue:setConfig",
  queueRetryFailed: "queue:retryFailed",
  queueUpdate: "queue:update",
  channelAdd: "channel:add",
  channelList: "channel:list",
  channelRemove: "channel:remove",
  channelRefresh: "channel:refresh",
  channelRefreshAll: "channel:refreshAll",
  channelListVideos: "channel:listVideos",
  channelOpenForMedia: "channel:openForMedia",
  channelDownloadedMedia: "channel:downloadedMedia",
  channelVideoStatuses: "channel:videoStatuses",
  subscriptionList: "subscription:list",
  subscriptionSync: "subscription:sync",
  whisperStatus: "whisper:status",
  whisperInstall: "whisper:install",
  whisperProgress: "whisper:progress",
  tagsAdd: "tags:add",
  tagsRemove: "tags:remove",
  tagsListAll: "tags:listAll",
  downloadsGetPath: "downloads:getPath",
  downloadsSetPath: "downloads:setPath",
  downloadsPickPath: "downloads:pickPath",
  framesExtract: "frames:extract",
  framesList: "frames:list",
  framesProgress: "frames:progress",
  framesSetIncluded: "frames:setIncluded",
  framesCapture: "frames:capture",
  framesGetCrop: "frames:getCrop",
  framesSetCrop: "frames:setCrop",
  framesExport: "frames:export",
  framesExportProgress: "frames:exportProgress",
  framesSaveSelected: "frames:saveSelected",
} as const;

export type IpcChannel = (typeof IPC)[keyof typeof IPC];

/** Managed binary kinds. Mirrors `@sift/db`'s `AssetKind`. */
export type BinaryKind = "ytdlp" | "ffmpeg" | "deno";

/** Point-in-time install/update status for one managed binary. */
export interface BinaryStatus {
  kind: BinaryKind;
  installed: boolean;
  installedVersion: string | null;
  latestVersion: string | null;
  updateAvailable: boolean;
  path: string | null;
}

/** Download progress for an in-flight install, keyed by binary kind. */
export interface BinaryProgress {
  kind: BinaryKind;
  received: number;
  total: number | null;
}

/** Silent auto-update vs. notify-only for managed binaries. */
export type BinaryUpdatePolicy = "auto" | "notify";

/** A managed-binary maintenance lifecycle event, forwarded main → renderer.
 * `ready.reason` distinguishes a first-run install from an update, for copy. */
export type BinaryUpdateEvent =
  | { type: "installing"; kind: BinaryKind }
  | {
      type: "ready";
      kind: BinaryKind;
      version: string;
      reason: "installed" | "updated";
    }
  | {
      type: "available";
      kind: BinaryKind;
      installedVersion: string;
      latestVersion: string;
    }
  | { type: "error"; kind: BinaryKind; message: string };

/** Point-in-time install status for the whisper.cpp binary + local model. */
export interface WhisperStatus {
  binaryInstalled: boolean;
  binaryPath: string | null;
  modelInstalled: boolean;
  modelPath: string | null;
}

/** Download progress for an in-flight whisper install (binary, then model). */
export interface WhisperProgress {
  stage: "binary" | "model";
  received: number;
  total: number | null;
}

/** A concrete, pickable download choice derived from a video's real yt-dlp formats. */
export interface DownloadOption {
  id: string; // stable slug, also used as the filename suffix (e.g. "1080p", "audio")
  label: string; // UI label (e.g. "1080p", "Audio only")
  detail: string; // container/codec hint (e.g. "MP4", "WEBM", "M4A")
  selector: string; // yt-dlp `-f` value
  approxBytes: number | null; // estimated total size (video + audio), null if unknown
  kind: "video" | "audio";
}

/** Normalized yt-dlp metadata for a single source URL. */
export interface MediaMetadata {
  sourceUrl: string;
  platform: {
    id: string;
    label: string;
    tier: "tested" | "supported" | "unknown";
  };
  externalId: string | null;
  title: string;
  uploader: string | null;
  uploaderUrl: string | null;
  channelId: string | null;
  durationSec: number | null;
  thumbnailUrl: string | null;
  viewCount: number | null;
  likeCount: number | null;
  uploadDate: string | null;
  hasCaptions: boolean;
  language: string | null; // video's spoken language, base code (e.g. "en"); null if unknown
  captionLanguages: string[]; // available caption base-codes (subtitles ∪ automatic_captions), deduped
  formats: DownloadOption[]; // real per-video download choices (resolution + size)
  raw: unknown;
}

/** Download progress for an in-flight download, keyed by media row id. */
export interface DownloadProgress {
  mediaId: number;
  downloadId: number;
  received: number;
  total: number | null;
  speed: number | null; // bytes/sec
  eta: number | null; // seconds
}

/** A persisted media row, camelCased for the renderer. */
export interface MediaRecord {
  id: number;
  sourceUrl: string;
  platformId: string;
  externalId: string | null;
  title: string;
  uploader: string | null;
  /** The uploader's page on the source platform (yt-dlp's `uploader_url`) — an X profile,
   * a Vimeo user, a YouTube channel. Null for extractors that don't report one. */
  uploaderUrl: string | null;
  durationSec: number | null;
  thumbnailUrl: string | null; // remote thumb URL (from media.thumbnail_path)
  downloadPath: string | null;
  // "none": transcript-only job created the media row without ever downloading it.
  downloadStatus: "none" | "downloading" | "done" | "error";
  createdAt: number;
}

/** A persisted download row, camelCased for the renderer. */
export interface DownloadRecord {
  id: number;
  mediaId: number;
  formatId: string;
  label: string;
  ext: string | null;
  height: number | null;
  filePath: string | null;
  fileSize: number | null;
  status: "downloading" | "done" | "error";
  error: string | null;
  createdAt: number;
}

/** One timed transcript cue. */
export interface TranscriptSegmentDto {
  start: number;
  end: number;
  text: string;
}

/** Coarse stage progress for an in-flight transcript job (e.g. Whisper). `ratio` is
 * ignored by the UI today — stages only, no stderr %-parsing. */
export interface TranscriptProgress {
  stage: string;
  ratio: number | null;
}

/** Coarse progress for a frame-extraction run (scene-select → OCR → keep-filter). */
export interface FrameProgress {
  stage: "extracting" | "reading" | "done";
  /** 0..1 scan position while `extracting` (null when the video duration is unknown). */
  ratio: number | null;
  processed: number;
  total: number;
  kept: number;
}

/** Progress of an AI-polished document export: sections rewritten so far. */
export interface FrameExportProgress {
  processed: number;
  total: number;
}

/** A crop region as fractions (0..1) of the video frame — the "slide area". */
export interface FrameCrop {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** A persisted data-frame (slide/chart), camelCased for the renderer. */
export interface FrameRecord {
  id: number;
  mediaId: number;
  tsMs: number;
  /** sift-frame://file/<encoded abs path> — renderable in an <img>. */
  imageUrl: string;
  ocrText: string | null;
  ocrConfidence: number | null;
  kind: string | null;
  /** Whether this frame feeds document generation (user-toggleable). */
  included: boolean;
}

/** A persisted transcript row, camelCased for the renderer. */
export interface TranscriptRecord {
  id: number;
  mediaId: number;
  providerId: string;
  language: string | null;
  text: string;
  segments: TranscriptSegmentDto[];
  model: string | null;
  /** Absolute path of the .txt written to disk, or null (old rows / write failed). */
  filePath: string | null;
  createdAt: number;
}

/** A persisted summary row, camelCased for the renderer. */
export interface SummaryRecord {
  id: number;
  mediaId: number;
  promptId: number | null;
  providerId: string;
  model: string;
  text: string;
  /** Absolute path of the .md written to disk, or null (old rows / write failed). */
  filePath: string | null;
  createdAt: number;
}

/** A generated document/report file (transcript + selected slides). `providerId`/`model`
 * are null for the raw (no-AI) tier, set for an AI-distilled one. */
export interface DocumentRecord {
  id: number;
  mediaId: number;
  format: string; // "md" | "pdf"
  path: string;
  providerId: string | null;
  model: string | null;
  createdAt: number;
}

/** A site the user is signed into via the app's sign-in browser (best-effort by cookie presence). */
export interface SignedInSite {
  domain: string;
  expired: boolean;
}

/** A media row plus a per-video capture summary, for the Library table (one row, no
 * detail fetch needed): transcript count/newest language, per-format status chips,
 * and summary count. */
export interface MediaListItem {
  media: MediaRecord;
  transcriptCount: number;
  transcriptLanguage: string | null; // newest transcript's language, else null
  formats: {
    id: string;
    label: string;
    status: "downloading" | "done" | "error";
  }[];
  summaryCount: number;
  tags: string[];
  favourite: boolean;
  /** When the row was pinned, or null. Pinned rows sort first. */
  pinnedAt: number | null;
}

/** Filters for the paged library list (contract's own copy of `@sift/db`'s `MediaFilter` —
 * ipc-contract must not import `@sift/db`). All optional; `ids: []` matches nothing. */
export interface MediaFilter {
  tags?: string[] | null; // rows carrying ALL of these tags, case-insensitive
  channel?: string | null;
  platform?: string | null;
  from?: number | null; // created_at >= (inclusive ms epoch)
  to?: number | null; // created_at <= (inclusive ms epoch)
  ids?: number[] | null; // restrict to these media ids (e.g. search results)
  excludeTags?: string[] | null; // hide rows carrying any of these tags, case-insensitive
  publishedFrom?: number | null; // published_at >= (inclusive ms epoch)
  publishedTo?: number | null; // published_at <= (inclusive ms epoch)
  durationMin?: number | null; // duration_s >= (inclusive seconds)
  durationMax?: number | null; // duration_s <= (inclusive seconds)
  favourite?: boolean | null; // true → favourites only
  collectionId?: number | null; // only rows in this collection
  /** Smart filter: rows still lacking one of the three artifacts. */
  missing?: "transcript" | "summary" | "download" | null;
  /** Exact download status, e.g. "error" for the failed-download filter. */
  downloadStatus?: string | null;
}

/** A named, ordered set of videos the user curates, plus its size. */
export interface CollectionCount {
  id: number;
  name: string;
  created_at: number;
  count: number;
}

/** A named library view: the free-text query plus the filter that produced it. */
export interface SavedSearchInfo {
  id: number;
  name: string;
  query: string;
  filter: MediaFilter;
  created_at: number;
}

/** Media rows that look like the same video. `reason` says how confident that is:
 * `same-source` is certain, `same-title-duration` is a guess for re-uploads. */
export interface DuplicateGroup {
  reason: "same-source" | "same-title-duration";
  key: string;
  ids: number[];
}

/** One page of the library plus the total number of rows matching the filter (for the pager). */
export interface MediaPage {
  items: MediaListItem[];
  total: number;
}

/** Distinct filter values across the whole library, for the filter dropdowns. */
export interface LibraryFacets {
  channels: string[];
  platforms: string[];
  tags: { name: string; count: number }[];
}

/** A search hit for one media row (this is the contract's own copy; `@sift/db` has an
 * identical shape — the ipc-contract must not import `@sift/db`). */
export interface SearchHit {
  mediaId: number;
  field: "title" | "uploader" | "transcript" | "summary";
  snippet: string | null;
}

/** Result of writing a Plex-style .m3u playlist file from a set of media. */
export interface PlaylistExportResult {
  path: string;
  included: number;
  skipped: number;
}

/** One export format offered by the export menu. */
export type ExportPreset =
  "markdown" | "html" | "json" | "csv" | "obsidian" | "pdf";

export interface ExportResult {
  path: string;
  preset: ExportPreset;
}

export type ClipKind = "audio" | "video" | "vertical";

export interface ClipResult {
  path: string;
  kind: ClipKind;
  startSeconds: number;
  endSeconds: number;
}

/** One transcript cue. Mirrors `@sift/core`'s TranscriptSegment. */
export interface TranscriptCue {
  start: number;
  end: number;
  text: string;
}

/** A distinct tag name plus how many media rows carry it. */
export interface TagCount {
  name: string;
  count: number;
}

export type ChannelContentType = "videos" | "shorts" | "live";
export type ChannelOrder = "latest" | "oldest" | "most_viewed";
export interface ChannelRecord {
  id: number;
  channelId: string;
  url: string;
  handle: string | null;
  title: string;
  description: string | null;
  uploader: string | null;
  avatarUrl: string | null;
  bannerUrl: string | null;
  followerCount: number | null;
  videoCount: number | null;
  newCount: number;
  lastChecked: number | null;
  createdAt: number;
}
export interface ChannelVideo {
  externalId: string;
  url: string;
  title: string;
  durationSec: number | null;
  viewCount: number | null;
  isShort: boolean;
}
export interface ChannelVideosQuery {
  contentType: ChannelContentType;
  order: ChannelOrder;
  count: number;
}
export interface ChannelVideosResult {
  videos: ChannelVideo[];
  viewCountsAvailable: boolean;
  order: ChannelOrder;
}
/** A library media item downloaded from a channel — the lightweight shape the channel
 * detail's "Downloaded from this channel" list renders and links to its in-app detail page. */
export interface DownloadedVideo {
  id: number;
  title: string;
  thumbnailUrl: string | null;
  createdAt: number;
}

/** Per-channel outcome of `refreshAll()`: successes plus a reason per failed channel. */
export interface ChannelRefreshAllResult {
  refreshed: ChannelRecord[];
  failures: { channelId: string; error: string }[];
}
/** Whether a channel video is already queued or already downloaded (so we don't re-pull it). */
export type ChannelVideoStatus = "queued" | "downloaded";

export interface SubscriptionRecord {
  id: number;
  channelId: string;
  url: string;
  handle: string | null;
  title: string;
  avatarUrl: string | null;
  followerCount: number | null;
  syncedAt: number;
  tracked: boolean;
}

/** A media row plus its transcripts and summaries, for the detail view. */
export interface MediaDetail {
  media: MediaRecord;
  transcripts: TranscriptRecord[];
  summaries: SummaryRecord[];
  downloads: DownloadRecord[];
  documents: DocumentRecord[];
  tags: string[];
}

/** A queued job's format preference; resolved to a concrete DownloadOption per-video at run time. */
export interface QueueFormatPref {
  kind: "video" | "audio";
  maxHeight: number | null; // resolution cap; null = highest available
  mp4: boolean; // prefer MP4/H.264 (already baked into computeDownloadOptions; kept for intent)
}

export interface QueueSummarizeSpec {
  providerId: string;
  model: string;
  promptId: number;
}

/** The full op set + options for one queued URL. */
export interface QueueSpec {
  format: QueueFormatPref;
  download: boolean;
  transcript: boolean;
  summarize: QueueSummarizeSpec | null;
  tags: string[];
}

/** Persisted queue behaviour. `startAt` is an absolute epoch ms so the main process never
 * does clock arithmetic; the renderer resolves "start at 02:00" to the next occurrence. */
export interface QueueConfig {
  /** How many items run at once, 1..4. */
  concurrency: number;
  startAt: number | null;
}

/** What `queue.add` did: how many went in, and which URLs were already waiting. */
export interface QueueAddResult {
  added: number;
  duplicates: string[];
}

export type QueueOpKey = "download" | "transcript" | "summarize";
export type OpOutcome = "pending" | "running" | "done" | "error" | "skipped";

/** Per-op outcome for a queue item, plus optional per-op failure messages. */
export interface QueueOps {
  download: OpOutcome;
  transcript: OpOutcome;
  summarize: OpOutcome;
  messages?: Partial<Record<QueueOpKey, string>>;
}

/** A queue row for the renderer. `progress` is the live download % of the running
 * item (transient, not persisted); null otherwise. */
export interface QueueItem {
  id: number;
  sourceUrl: string;
  spec: QueueSpec;
  status: "queued" | "running" | "done" | "canceled";
  ops: QueueOps | null;
  mediaId: number | null;
  /**
   * Title of the media this item resolved to, once it has one; `null` until the metadata
   * fetch lands (and forever for an item that never downloaded).
   *
   * The row already carried `mediaId` and threw the rest away, so a queue that had finished
   * eight real videos still printed eight opaque URL fragments — "/watch?v=Qr7dK2mVzXc" —
   * which is the least informative thing the row could say about work it has already done.
   * Read from the joined `media` row, never stored on `queue_item`.
   */
  title: string | null;
  queueOrder: number;
  error: string | null;
  progress: number | null;
  createdAt: number;
}

/** One streamed chunk of an in-flight summary, keyed by the request that started it. */
export interface SummaryToken {
  requestId: string;
  delta: string;
  done: boolean;
}

/** A persisted prompt template, camelCased for the renderer. */
export interface PromptInfo {
  id: number;
  name: string;
  body: string;
  isBuiltin: boolean;
}

/** One entry in an exported prompt pack file (`sift-prompts.json`). The file is a bare array
 * of these — deliberately the smallest shape that can be hand-edited and diffed. */
export interface PromptPackEntry {
  name: string;
  body: string;
}

/** Outcome of a prompt-pack import: how many entries were upserted vs. dropped for being
 * malformed (missing/empty/wrong-typed `name` or `body`), plus how many of the upserted
 * entries were brand new (`created`) versus replaced the body of an existing same-named
 * prompt (`replaced`, `imported = created + replaced`). Surfacing the created/replaced
 * split — not just a combined `imported` count — is what lets the renderer tell the user
 * that importing a pack silently overwrote prompts they'd edited, rather than reporting a
 * bare success. All four fields are 0 if the dialog was cancelled. */
/** One row of the storage dashboard. `clearable` marks the caches and re-downloadable
 * assets that `storage.clear()` will accept — user content is measured, never offered. */
export interface StorageEntry {
  key: string;
  label: string;
  description: string;
  bytes: number;
  clearable: boolean;
}

export interface StorageUsage {
  entries: StorageEntry[];
  totalBytes: number;
  /** Free space on the volume holding the downloads folder, or null if unreadable. */
  freeBytes: number | null;
}

/** What `profile.import()` changed. `skipped` names settings the file carried that this
 * build rejected or does not know, so a partial apply is visible rather than silent. */
export interface ProfileImportResult {
  applied: string[];
  skipped: string[];
  promptsCreated: number;
  promptsReplaced: number;
  promptsSkipped: number;
}

export interface PromptImportResult {
  imported: number;
  skipped: number;
  created: number;
  replaced: number;
}

/** A registered AI provider and the models it offers. */
export interface AiProviderInfo {
  id: string;
  label: string;
  needsKey: boolean;
  models: { id: string; label: string }[];
}

/**
 * The custom (OpenAI-compatible) provider's non-secret config: one user-defined
 * endpoint + model. The API key is NOT part of this shape — it's set/cleared via
 * `aiProviders.setKey("custom", ...)`/`clearKey("custom")` like any other provider.
 */
export interface CustomProviderConfig {
  baseUrl: string;
  model: string;
}

/** The user's default AI provider + model (seeds every provider picker). */
export interface AiDefaultConfig {
  providerId: string;
  model: string;
}

/** A single update lifecycle event forwarded from main → renderer. */
export type UpdateEvent =
  | { type: "checking" }
  | { type: "not-available" }
  | { type: "available"; version: string; releaseNotes: string }
  | { type: "downloading"; percent: number }
  | { type: "downloaded"; version: string }
  | { type: "error"; message: string };

/** The typed surface exposed on `window.sift` by the preload bridge. */
export interface SiftApi {
  app: {
    /** Returns the running app version (from package.json). */
    getVersion(): Promise<string>;
    /** Quits the app (in-app Exit button). */
    quit(): Promise<void>;
    /** The clipboard's plain text, trimmed and capped. Read in the main process because
     * `navigator.clipboard.readText()` needs a focused document and a permission the
     * renderer can be refused. Used only to offer a paste, never to act on one. */
    readClipboardText(): Promise<string>;
  };
  diagnostics: {
    /** A privacy-preserving snapshot of the install, for a bug report. Contains no keys,
     * cookies, transcript text, media titles, or source URLs. */
    get(): Promise<DiagnosticsReport>;
    /** Writes the same snapshot to a file the user picks. Returns the path, or null if
     * the save dialog was cancelled. */
    export(): Promise<string | null>;
  };
  updates: {
    check(): Promise<void>;
    download(): Promise<void>;
    install(): Promise<void>;
    /** The most recent update event the main process emitted, or null. Lets a freshly
     * mounted renderer recover an event that fired before it subscribed (startup race). */
    current(): Promise<UpdateEvent | null>;
    onEvent(cb: (e: UpdateEvent) => void): () => void;
    simulate(e: UpdateEvent): Promise<void>;
  };
  db: {
    /** Returns whether the main-process SQLite database opened successfully. */
    isReady(): Promise<boolean>;
  };
  binaries: {
    /** Reads current install status for both managed binaries. No network. */
    list(): Promise<BinaryStatus[]>;
    /** Resolves the latest upstream release and compares it to what's installed. */
    check(kind: BinaryKind): Promise<BinaryStatus>;
    /** Downloads, verifies, and installs the latest release. */
    install(kind: BinaryKind): Promise<BinaryStatus>;
    /** Subscribes to install progress events. Returns an unsubscribe function. */
    onProgress(cb: (p: BinaryProgress) => void): () => void;
    /** Current auto-update policy (default "auto"). */
    getPolicy(): Promise<BinaryUpdatePolicy>;
    /** Persists the auto-update policy. */
    setPolicy(mode: BinaryUpdatePolicy): Promise<void>;
    /** Subscribes to startup maintenance lifecycle events. Returns an unsubscribe fn. */
    onUpdateEvent(cb: (e: BinaryUpdateEvent) => void): () => void;
    /** Latest maintenance event per kind, to recover events emitted before subscribe (startup race). */
    currentUpdateEvents(): Promise<BinaryUpdateEvent[]>;
  };
  whisper: {
    /** Binary + model install status. No network. */
    status(): Promise<WhisperStatus>;
    /** Downloads + verifies the whisper binary and the model. */
    install(): Promise<WhisperStatus>;
    /** Subscribes to install progress; returns an unsubscribe fn. */
    onProgress(cb: (p: WhisperProgress) => void): () => void;
  };
  metadata: {
    /** Fetches and normalizes yt-dlp metadata for a single source URL. */
    fetch(url: string): Promise<MediaMetadata>;
    /** Lists yt-dlp's supported extractor keys. */
    listExtractors(): Promise<string[]>;
  };
  download: {
    /** Downloads `metadata` at `option`, persists a media row, returns the final record. */
    start(input: {
      metadata: MediaMetadata;
      option: DownloadOption;
      tags?: string[];
    }): Promise<MediaRecord>;
    /** Subscribes to download progress events. Returns an unsubscribe function. */
    onProgress(cb: (p: DownloadProgress) => void): () => void;
  };
  import: {
    /** Registers an existing local media file as library media — referenced in place,
     * never copied — and returns its media row. Rejects if the file is gone. */
    local(input: {
      path: string;
      durationSec?: number | null;
      /** Video height in pixels, read off the same `onloadedmetadata` as `durationSec`.
       * 0/null for audio — the row then falls back to its container for a format label. */
      height?: number | null;
      tags?: string[];
    }): Promise<MediaRecord>;
    /** Opens the native file picker filtered to supported media extensions. Returns the
     * chosen absolute paths, or `[]` when cancelled. */
    pick(): Promise<string[]>;
    /** The absolute path of a dropped `File`, or "" when it has none.
     *
     * Electron 32 removed the `File.path` property the drop handler used to read, and the
     * failure mode was silent: `path` simply became `undefined` and every drop reported
     * "couldn't read where this lives on disk". `webUtils.getPathForFile` is the
     * replacement, and it must be called from the preload. Synchronous — no IPC. */
    pathForFile(file: File): string;
  };
  ollama: {
    health(): Promise<boolean>;
    start(): Promise<{ launched: boolean; reason?: "not-installed" }>;
  };
  library: {
    /** Lists persisted media, newest first, each with a per-video capture summary
     * (transcript count/language, format chips, summary count). No network. */
    list(): Promise<MediaListItem[]>;
    /** One page of the library matching `filter`, newest first, plus the total match count.
     * Filtering runs in SQL, so only the page's rows are loaded. `page` is 0-based. */
    listPage(
      filter: MediaFilter,
      page: number,
      pageSize: number,
    ): Promise<MediaPage>;
    /** Distinct channel/platform/tag values across the whole library, for the filter dropdowns. */
    facets(): Promise<LibraryFacets>;
    /** All media ids matching `filter` (newest first) — e.g. to export the whole filtered set. */
    listIds(filter: MediaFilter): Promise<number[]>;
    /** Reveals a downloaded file in the OS file manager. */
    reveal(path: string): Promise<void>;
    /** Deletes a media row; FK cascade also removes its transcripts + summaries. */
    remove(id: number): Promise<void>;
    /** Returns a media row plus its downloads, transcripts, and summaries, newest first. */
    detail(id: number): Promise<MediaDetail>;
    /** Deletes a download row and its file. */
    removeDownload(id: number): Promise<void>;
    /** Deletes a transcript row. */
    removeTranscript(id: number): Promise<void>;
    /** Deletes a summary row. */
    removeSummary(id: number): Promise<void>;
    /** Opens a URL in the user's default browser (the original video page). */
    openExternal(url: string): Promise<void>;
    /**
     * Search the library; one hit per media, with a snippet for text hits.
     *
     * Matches title and uploader only. Pass `includeText` to widen it to
     * transcripts and summaries — off by default because the box runs on every
     * keystroke and full-text hits bury the video whose title is the answer.
     */
    search(query: string, includeText?: boolean): Promise<SearchHit[]>;
    /** Writes an .m3u of the given media (those with an on-disk download) to the playlists folder. */
    exportPlaylist(
      mediaIds: number[],
      name: string,
    ): Promise<PlaylistExportResult>;
    /** Media rows that look like the same video, newest group first. */
    findDuplicates(): Promise<DuplicateGroup[]>;
    /** Marks or unmarks a favourite. */
    setFavourite(mediaId: number, favourite: boolean): Promise<void>;
    /** Pins or unpins. Pinned rows sort first, in the order they were pinned. */
    setPinned(mediaId: number, pinned: boolean): Promise<void>;
    /** Deletes several media rows and their artifacts. Resolves how many were removed. */
    bulkRemove(mediaIds: number[]): Promise<number>;
  };
  tags: {
    /** Adds a tag to a media row (idempotent, case-insensitive). */
    add(mediaId: number, name: string): Promise<void>;
    /** Removes a tag from a media row. */
    remove(mediaId: number, name: string): Promise<void>;
    /** All distinct tags with counts, alphabetical. */
    listAll(): Promise<TagCount[]>;
    /** Adds one tag to many rows. Resolves how many rows changed. */
    bulkAdd(mediaIds: number[], name: string): Promise<number>;
    /** Removes one tag from many rows. */
    bulkRemove(mediaIds: number[], name: string): Promise<void>;
  };
  collections: {
    list(): Promise<CollectionCount[]>;
    /** Creates a collection, or returns the existing one with that name. */
    create(name: string): Promise<CollectionCount>;
    rename(id: number, name: string): Promise<void>;
    /** Deletes the collection. The videos in it are untouched. */
    delete(id: number): Promise<void>;
    /** Appends to the end. Resolves how many were added, ignoring ones already in. */
    add(id: number, mediaIds: number[]): Promise<number>;
    remove(id: number, mediaIds: number[]): Promise<void>;
    /** Collection ids one media belongs to. */
    forMedia(mediaId: number): Promise<number[]>;
  };
  savedSearches: {
    list(): Promise<SavedSearchInfo[]>;
    /** Creates or replaces by name. */
    save(
      name: string,
      query: string,
      filter: MediaFilter,
    ): Promise<SavedSearchInfo>;
    delete(id: number): Promise<void>;
  };
  settings: {
    /** Ordered preferred transcript languages (first = default). */
    getTranscriptLanguages(): Promise<string[]>;
    /** Persists the ordered preferred transcript languages. */
    setTranscriptLanguages(langs: string[]): Promise<void>;
    /** Proxy URL used for yt-dlp and the remote AI providers. `""` means connect directly. */
    getProxy(): Promise<string>;
    /** Validates and persists a proxy URL; resolves the normalized value that was stored.
     * Rejects on an unsupported scheme or a missing host. `""` clears it. */
    setProxy(proxyUrl: string): Promise<string>;
  };
  storage: {
    /** Per-category disk usage, plus free space on the downloads volume. */
    usage(): Promise<StorageUsage>;
    /** Empties one clearable category after a native confirm. Resolves the bytes freed —
     * `0` if the user cancelled or there was nothing there. Rejects for any other key. */
    clear(key: string): Promise<number>;
  };
  profile: {
    /** Writes every non-secret setting plus the user's own prompts to one JSON file.
     * Resolves the saved path, or `null` if the save dialog was cancelled. */
    export(): Promise<string | null>;
    /** Reads a profile file and applies what this build recognizes. Resolves `null` if the
     * open dialog was cancelled. Rejects if the file isn't a profile of a known version. */
    import(): Promise<ProfileImportResult | null>;
  };
  downloads: {
    /** Current downloads directory (the configured override, or the OS-default fallback). */
    getPath(): Promise<string>;
    /** Persists an override downloads directory. */
    setPath(path: string): Promise<void>;
    /** Opens a native directory picker; resolves the chosen absolute path, or `null` if cancelled. */
    pickPath(): Promise<string | null>;
  };
  auth: {
    /** Opens the app-owned sign-in browser; resolves when the window closes. */
    openBrowser(): Promise<void>;
    /** Lists sites with a saved session (grouped by registrable domain). */
    listSites(): Promise<SignedInSite[]>;
    /** Clears one site's saved cookies. */
    removeSite(domain: string): Promise<void>;
  };
  queue: {
    /** Enqueues one item per URL with a shared spec, skipping URLs already queued or
     * running. Reports what went in and what was already there. */
    add(urls: string[], spec: QueueSpec): Promise<QueueAddResult>;
    /** Current queue snapshot, in order. */
    list(): Promise<QueueItem[]>;
    /** Deletes a queue item (keeps any downloaded files). */
    remove(id: number): Promise<void>;
    /** Moves an item up/down one slot. */
    reorder(id: number, dir: "up" | "down"): Promise<void>;
    /** Re-queues an item, re-running only its errored ops. */
    retry(id: number): Promise<void>;
    /** Cancels an item. A running download is killed, not left to finish. */
    cancel(id: number): Promise<void>;
    /** Re-queues every item with a failed op. Returns how many were re-queued. */
    retryFailed(): Promise<number>;
    /** Concurrency and scheduled start. */
    getConfig(): Promise<QueueConfig>;
    setConfig(config: QueueConfig): Promise<void>;
    /** Stops picking new items (running item finishes). */
    pause(): Promise<void>;
    /** Resumes draining. */
    resume(): Promise<void>;
    /** Current pause state, for seeding UI state on mount. */
    isPaused(): Promise<boolean>;
    /** Subscribes to full-snapshot updates. Returns an unsubscribe function. */
    onUpdate(cb: (items: QueueItem[]) => void): () => void;
  };
  channels: {
    add(url: string): Promise<ChannelRecord>;
    list(): Promise<ChannelRecord[]>;
    remove(id: number): Promise<void>;
    refresh(id: number): Promise<ChannelRecord>;
    refreshAll(): Promise<ChannelRefreshAllResult>;
    listVideos(
      id: number,
      query: ChannelVideosQuery,
    ): Promise<ChannelVideosResult>;
    openForMedia(mediaId: number): Promise<ChannelRecord>;
    /** For a list of video URLs, which are already queued or already downloaded. Absent = neither. */
    videoStatuses(urls: string[]): Promise<Record<string, ChannelVideoStatus>>;
    /** Library media downloaded/transcribed from this channel (matched on channel_id), newest first. */
    downloadedMedia(channelId: string): Promise<DownloadedVideo[]>;
  };
  subscriptions: {
    list(): Promise<SubscriptionRecord[]>;
    sync(): Promise<SubscriptionRecord[]>;
  };
  transcript: {
    /** Returns the stored transcript for this URL if present, else fetches+stores one. Rejects if no provider can handle it.
     * `force: "whisper"` bypasses the cache and always re-transcribes locally via Whisper,
     * replacing any existing transcript (only after a successful re-transcribe). */
    get(input: {
      metadata: MediaMetadata;
      force?: "whisper";
    }): Promise<TranscriptRecord>;
    /** Subscribes to coarse stage progress (e.g. "extracting-audio", "transcribing") for
     * in-flight transcript jobs. Returns an unsubscribe function. */
    onProgress(cb: (p: TranscriptProgress) => void): () => void;
    /** Returns the persisted default transcript method ("auto" if never set). */
    getMethod(): Promise<TranscriptMethod>;
    /** Persists the default transcript method. */
    setMethod(m: TranscriptMethod): Promise<void>;
    /** Whether a transcript is auto-fetched after a video download (default true). */
    getAutoDownload(): Promise<boolean>;
    /** Persists the auto-fetch-after-download toggle. */
    setAutoDownload(enabled: boolean): Promise<void>;
    /** Writes a transcript's segments to a .srt file under the downloads dir; returns the
     * absolute path. Rejects if the transcript has no timestamps. */
    exportSrt(transcriptId: number): Promise<string>;
    /** Replaces a transcript's cues after an edit. The searchable text is regenerated in
     * main from the cues, so the two can never disagree. */
    update(transcriptId: number, segments: TranscriptCue[]): Promise<void>;
  };
  export: {
    /** Writes one library item in the chosen format. Obsidian resolves to a folder. */
    preset(mediaId: number, preset: ExportPreset): Promise<ExportResult>;
    /** Selects a written export in the OS file manager. */
    reveal(path: string): Promise<void>;
  };
  clip: {
    /** A link into the source at `seconds`, or null when the platform has no such parameter. */
    link(mediaId: number, seconds: number): Promise<string | null>;
    /** Cuts a span out of the downloaded file. Rejects when nothing is on disk. */
    export(
      mediaId: number,
      kind: ClipKind,
      startSeconds: number,
      endSeconds: number,
    ): Promise<ClipResult>;
  };
  summarize: {
    /** Streams a summary for the newest transcript of `metadata`'s URL; persists + returns the record. */
    start(input: {
      metadata: MediaMetadata;
      providerId: string;
      model: string;
      promptId: number;
      requestId: string;
    }): Promise<SummaryRecord>;
    onToken(cb: (t: SummaryToken) => void): () => void;
    /** Writes the summary to a .md file in Downloads/<App>; returns the absolute path. */
    export(summaryId: number): Promise<string>;
  };
  frames: {
    /** Extracts data-bearing frames (slides/charts) from the media's downloaded video,
     * persists them, and returns the kept records. Rejects if the video isn't downloaded.
     * `classifierModel` (an Ollama vision model) runs an AI slide check per frame when set.
     * `fullScreenOnly` keeps only bright full-screen slides, dropping wide room/camera shots. */
    extract(
      mediaId: number,
      opts?: { classifierModel?: string; fullScreenOnly?: boolean },
    ): Promise<FrameRecord[]>;
    /** Persisted frames for a media, in timeline order. */
    list(mediaId: number): Promise<FrameRecord[]>;
    /** Grabs a single frame at `tsMs` (manual capture while watching), OCRs + stores it. */
    capture(mediaId: number, tsMs: number): Promise<FrameRecord>;
    /** Toggles whether a frame feeds document generation. */
    setIncluded(frameId: number, included: boolean): Promise<void>;
    /** The slide-area crop for this media, or null if extraction uses the full frame. */
    getCrop(mediaId: number): Promise<FrameCrop | null>;
    /** Sets the slide-area crop (fractions), or null to extract from the full frame. */
    setCrop(mediaId: number, crop: FrameCrop | null): Promise<void>;
    /** Writes a transcript + selected-slides document to Downloads/<App>; returns the
     * absolute path. Rejects if the media has no transcript yet. When `polish` is set,
     * each transcript section is rewritten by that AI provider (slides stay put). */
    export(
      mediaId: number,
      format: "md" | "pdf",
      polish?: { providerId: string; model: string },
    ): Promise<string>;
    /** Prompts for a folder and copies every selected slide there at full resolution.
     * Returns the folder + count, or null if the user cancelled. */
    saveSelected(
      mediaId: number,
    ): Promise<{ dir: string; count: number } | null>;
    /** Subscribes to extraction progress. Returns an unsubscribe function. */
    onProgress(cb: (p: FrameProgress) => void): () => void;
    /** Subscribes to AI-polish document-export progress. Returns an unsubscribe function. */
    onExportProgress(cb: (p: FrameExportProgress) => void): () => void;
  };
  prompts: {
    list(): Promise<PromptInfo[]>;
    create(input: { name: string; body: string }): Promise<PromptInfo>;
    update(
      id: number,
      input: { name: string; body: string },
    ): Promise<PromptInfo>;
    delete(id: number): Promise<void>;
    /** Writes the user's non-builtin prompts to a chosen .json path; null if cancelled. */
    export(): Promise<string | null>;
    /** Imports a pack, upserting by name. Reports counts of imported vs. skipped-as-malformed
     * entries, and splits `imported` into `created` (new prompts) vs. `replaced` (an existing
     * same-named prompt's body was overwritten) so the caller can warn about overwritten edits
     * ({ imported: 0, skipped: 0, created: 0, replaced: 0 } if the dialog was cancelled).
     * Rejects if the file isn't valid JSON, isn't an array, or has zero usable entries — never
     * a silent no-op. */
    import(): Promise<PromptImportResult>;
  };
  aiProviders: {
    list(): Promise<AiProviderInfo[]>;
    keyStatus(providerId: string): Promise<boolean>;
    /** rejects if safeStorage unavailable */
    setKey(providerId: string, key: string): Promise<void>;
    clearKey(providerId: string): Promise<void>;
    /** Non-secret base_url/model for the custom (OpenAI-compatible) provider; null if unset. */
    getCustomConfig(): Promise<CustomProviderConfig | null>;
    /** Persists base_url/model and re-registers the custom provider if a key is already set. */
    setCustomConfig(cfg: CustomProviderConfig): Promise<void>;
    /** The persisted default provider + model, or null if the user hasn't chosen one. */
    getDefault(): Promise<AiDefaultConfig | null>;
    /** Sets (or clears, with null) the default provider + model. */
    setDefault(cfg: AiDefaultConfig | null): Promise<void>;
    /** Whether the `claude` CLI is installed and runnable (for the Settings badge). */
    cliStatus(): Promise<boolean>;
    /** Runs an arbitrary system-prompt + content through a provider and returns the text.
     * Powers the Settings prompt playground (prompt tuning); does not persist anything. */
    runPrompt(input: {
      providerId: string;
      model: string;
      systemPrompt: string;
      content: string;
    }): Promise<string>;
  };
}

/** One recorded warning/error kept for the support bundle. Never carries user content. */
export interface DiagnosticEvent {
  at: string;
  level: "warn" | "error";
  message: string;
}

/** The support-bundle payload. See `main/diagnostics.ts` for what is deliberately left out. */
export interface DiagnosticsReport {
  generatedAt: string;
  app: { version: string; packaged: boolean; locale: string };
  runtime: {
    electron: string;
    chrome: string;
    node: string;
    v8: string;
    arch: string;
  };
  os: { type: string; release: string; totalMemMb: number };
  display: { width: number; height: number; scaleFactor: number } | null;
  paths: { userData: string; downloads: string };
  storage: { databaseBytes: number | null; downloadsFreeBytes: number | null };
  binaries: { name: string; installed: boolean; version: string | null }[];
  library: {
    media: number;
    downloads: number;
    transcripts: number;
    summaries: number;
    frames: number;
  } | null;
  security: { secureStorageAvailable: boolean; keyedProviders: string[] };
  settings: Record<string, unknown>;
  recentEvents: DiagnosticEvent[];
}
