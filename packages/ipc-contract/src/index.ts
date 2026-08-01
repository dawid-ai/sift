import type { TranscriptMethod } from "@sift/core";
export type { TranscriptMethod } from "@sift/core";

/** Canonical IPC channel names. Add new channels here as `domain:verb`. */
export const IPC = {
  appGetVersion: "app:getVersion",
  appQuit: "app:quit",
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
  metadataFetch: "metadata:fetch",
  metadataListExtractors: "metadata:listExtractors",
  downloadStart: "download:start",
  downloadProgress: "download:progress",
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
  settingsGetTranscriptLanguages: "settings:getTranscriptLanguages",
  settingsSetTranscriptLanguages: "settings:setTranscriptLanguages",
  authOpenBrowser: "auth:openBrowser",
  authListSites: "auth:listSites",
  authRemoveSite: "auth:removeSite",
  transcriptGet: "transcript:get",
  transcriptProgress: "transcript:progress",
  transcriptGetMethod: "transcript:getMethod",
  transcriptSetMethod: "transcript:setMethod",
  summarizeStart: "summarize:start",
  summarizeToken: "summarize:token",
  summarizeExport: "summarize:export",
  promptsList: "prompts:list",
  promptsCreate: "prompts:create",
  promptsUpdate: "prompts:update",
  promptsDelete: "prompts:delete",
  aiProvidersList: "ai:providers",
  aiKeyStatus: "ai:keyStatus",
  aiKeySet: "ai:keySet",
  aiKeyClear: "ai:keyClear",
  aiCustomConfigGet: "ai:customConfigGet",
  aiCustomConfigSet: "ai:customConfigSet",
  queueAdd: "queue:add",
  queueList: "queue:list",
  queueRemove: "queue:remove",
  queueReorder: "queue:reorder",
  queueRetry: "queue:retry",
  queueCancel: "queue:cancel",
  queuePause: "queue:pause",
  queueResume: "queue:resume",
  queueIsPaused: "queue:isPaused",
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

/** A persisted transcript row, camelCased for the renderer. */
export interface TranscriptRecord {
  id: number;
  mediaId: number;
  providerId: string;
  language: string | null;
  text: string;
  segments: TranscriptSegmentDto[];
  model: string | null;
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
  formats: { id: string; label: string; status: "downloading" | "done" | "error" }[];
  summaryCount: number;
  tags: string[];
}

/** Filters for the paged library list (contract's own copy of `@sift/db`'s `MediaFilter` —
 * ipc-contract must not import `@sift/db`). All optional; `ids: []` matches nothing. */
export interface MediaFilter {
  tag?: string | null;
  channel?: string | null;
  platform?: string | null;
  from?: number | null; // created_at >= (inclusive ms epoch)
  to?: number | null; // created_at <= (inclusive ms epoch)
  ids?: number[] | null; // restrict to these media ids (e.g. search results)
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

/** A distinct tag name plus how many media rows carry it. */
export interface TagCount {
  name: string;
  count: number;
}

export type ChannelContentType = "videos" | "shorts" | "live";
export type ChannelOrder = "latest" | "oldest" | "most_viewed";
export interface ChannelRecord {
  id: number; channelId: string; url: string; handle: string | null;
  title: string; description: string | null; uploader: string | null;
  avatarUrl: string | null; bannerUrl: string | null;
  followerCount: number | null; videoCount: number | null;
  newCount: number; lastChecked: number | null; createdAt: number;
}
export interface ChannelVideo {
  externalId: string; url: string; title: string;
  durationSec: number | null; viewCount: number | null; isShort: boolean;
}
export interface ChannelVideosQuery { contentType: ChannelContentType; order: ChannelOrder; count: number; }
export interface ChannelVideosResult { videos: ChannelVideo[]; viewCountsAvailable: boolean; order: ChannelOrder; }
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
  id: number; channelId: string; url: string; handle: string | null;
  title: string; avatarUrl: string | null; followerCount: number | null;
  syncedAt: number; tracked: boolean;
}

/** A media row plus its transcripts and summaries, for the detail view. */
export interface MediaDetail {
  media: MediaRecord;
  transcripts: TranscriptRecord[];
  summaries: SummaryRecord[];
  downloads: DownloadRecord[];
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
    listPage(filter: MediaFilter, page: number, pageSize: number): Promise<MediaPage>;
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
    /** Substring search over title/uploader/transcript/summary; hit per media with a snippet for text hits. */
    search(query: string): Promise<SearchHit[]>;
    /** Writes an .m3u of the given media (those with an on-disk download) to the playlists folder. */
    exportPlaylist(mediaIds: number[], name: string): Promise<PlaylistExportResult>;
  };
  tags: {
    /** Adds a tag to a media row (idempotent, case-insensitive). */
    add(mediaId: number, name: string): Promise<void>;
    /** Removes a tag from a media row. */
    remove(mediaId: number, name: string): Promise<void>;
    /** All distinct tags with counts, alphabetical. */
    listAll(): Promise<TagCount[]>;
  };
  settings: {
    /** Ordered preferred transcript languages (first = default). */
    getTranscriptLanguages(): Promise<string[]>;
    /** Persists the ordered preferred transcript languages. */
    setTranscriptLanguages(langs: string[]): Promise<void>;
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
    /** Enqueues one item per URL with a shared spec. */
    add(urls: string[], spec: QueueSpec): Promise<void>;
    /** Current queue snapshot, in order. */
    list(): Promise<QueueItem[]>;
    /** Deletes a queue item (keeps any downloaded files). */
    remove(id: number): Promise<void>;
    /** Moves an item up/down one slot. */
    reorder(id: number, dir: "up" | "down"): Promise<void>;
    /** Re-queues an item, re-running only its errored ops. */
    retry(id: number): Promise<void>;
    /** Cancels a queued item (running item stops at the next op boundary). */
    cancel(id: number): Promise<void>;
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
    listVideos(id: number, query: ChannelVideosQuery): Promise<ChannelVideosResult>;
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
    get(input: { metadata: MediaMetadata; force?: "whisper" }): Promise<TranscriptRecord>;
    /** Subscribes to coarse stage progress (e.g. "extracting-audio", "transcribing") for
     * in-flight transcript jobs. Returns an unsubscribe function. */
    onProgress(cb: (p: TranscriptProgress) => void): () => void;
    /** Returns the persisted default transcript method ("auto" if never set). */
    getMethod(): Promise<TranscriptMethod>;
    /** Persists the default transcript method. */
    setMethod(m: TranscriptMethod): Promise<void>;
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
  prompts: {
    list(): Promise<PromptInfo[]>;
    create(input: { name: string; body: string }): Promise<PromptInfo>;
    update(id: number, input: { name: string; body: string }): Promise<PromptInfo>;
    delete(id: number): Promise<void>;
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
  };
}
