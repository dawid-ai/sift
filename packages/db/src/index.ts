export { openDatabase } from "./database";
export type { SiftDatabase, Statement } from "./database";
export { runMigrations } from "./migrations";
export { upsertAsset, getAsset, listAssets, touchAssetChecked } from "./assets";
export type { AssetKind, AssetRow } from "./assets";
export {
  insertDocument,
  getDocumentsByMediaId,
  deleteDocument,
} from "./documents";
export type { DocumentRow, NewDocument } from "./documents";
export {
  insertMedia,
  setMediaDownload,
  getMediaById,
  listMedia,
  deleteMedia,
  getMediaBySourceUrl,
  setMediaThumbnail,
  mediaExistsByThumbnailPath,
  backfillMediaChannelIds,
  listMediaByChannelId,
  listMediaPage,
  listMediaIds,
  listMediaChannels,
  listMediaPlatforms,
  findDuplicates,
} from "./media";
export type {
  DownloadStatus,
  MediaRow,
  NewMedia,
  MediaFilter,
  DuplicateGroup,
} from "./media";
export {
  createCollection,
  renameCollection,
  deleteCollection,
  listCollections,
  addToCollection,
  removeFromCollection,
  collectionsForMedia,
  setFavourite,
  setPinned,
} from "./collection";
export type { CollectionRow, CollectionCount } from "./collection";
export {
  upsertChannelRule,
  getChannelRule,
  listChannelRules,
  listEnabledChannelRules,
  setChannelRuleWatermark,
  deleteChannelRule,
} from "./channel-rule";
export type { ChannelRuleRow, ChannelRuleInput } from "./channel-rule";
export {
  saveSearch,
  getSavedSearchByName,
  listSavedSearches,
  deleteSavedSearch,
  parseSavedFilter,
} from "./saved-search";
export type { SavedSearchRow } from "./saved-search";
export {
  insertTranscript,
  getTranscriptById,
  getTranscriptsByMediaId,
  setTranscriptFilePath,
  updateTranscriptContent,
  deleteTranscript,
} from "./transcript";
export type { TranscriptRow, NewTranscript } from "./transcript";
export {
  insertSummary,
  getSummaryById,
  getSummariesByMediaId,
  setSummaryFilePath,
  deleteSummary,
} from "./summary";
export type { SummaryRow, NewSummary } from "./summary";
export {
  insertFrame,
  getFramesByMediaId,
  deleteFramesByMediaId,
  deleteAutoFramesByMediaId,
  setFrameIncluded,
  frameExistsByImagePath,
} from "./frames";
export type { FrameRow, NewFrame } from "./frames";
export { getFrameCrop, setFrameCrop, clearFrameCrop } from "./frame-crop";
export type { FrameCrop } from "./frame-crop";
export {
  insertDownload,
  getDownloadById,
  getDownloadByMediaAndFormat,
  listDownloadsByMediaId,
  upsertDownload,
  setDownloadStatus,
  deleteDownload,
  resetDownloadingToError,
  listDownloadedSourceUrls,
  downloadExistsByFilePath,
  setDownloadFormat,
} from "./download";
export type { DownloadRow, NewDownload } from "./download";
export {
  listPrompts,
  getPromptById,
  createPrompt,
  updatePrompt,
  deletePrompt,
  upsertPromptByName,
} from "./prompt";
export type { PromptRow } from "./prompt";
export {
  insertQueueItem,
  getQueueItem,
  listQueueItems,
  listQueueItemsWithMedia,
  updateQueueItem,
  deleteQueueItem,
  setQueueOrder,
  maxQueueOrder,
  resetRunningToQueued,
} from "./queue";
export type { QueueItemRow, QueueItemWithMedia, NewQueueItem } from "./queue";
export {
  addTag,
  removeTag,
  tagsForMedia,
  tagsForMediaIds,
  listAllTags,
  backfillPlatformTag,
} from "./tag";
export {
  insertChannel,
  getChannelById,
  getChannelByChannelId,
  listChannels,
  upsertChannel,
  updateChannelRefresh,
  deleteChannel,
} from "./channel";
export type { ChannelRow, NewChannel } from "./channel";
export {
  upsertSubscription,
  listSubscriptions,
  replaceSubscriptions,
  clearSubscriptions,
} from "./subscription";
export type { SubscriptionRow, NewSubscription } from "./subscription";
export { searchMedia } from "./search";
export type { SearchHit } from "./search";
export { listPlaylistEntries } from "./playlist";
export type { PlaylistEntry } from "./playlist";
