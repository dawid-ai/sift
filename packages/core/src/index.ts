export { branding } from "./branding";
export type { Branding } from "./branding";

export { TESTED_PLATFORMS } from "./platforms/tiers";
export { resolvePlatform, listTestedPlatforms } from "./platforms/registry";
export type { PlatformTier, PlatformInfo } from "./platforms/registry";

export { sanitizeFilename, buildOutputBaseName } from "./filename/sanitize";

export * from "./transcript/types";
export { TranscriptRegistry } from "./transcript/registry";
export { resolveTranscriptProvider } from "./transcript/resolve";
export { parseVtt, segmentsToText } from "./transcript/vtt";
export { baseLangCode, pickTranscriptLanguage } from "./transcript/language";
export { parseJson3 } from "./transcript/json3";

export * from "./channel/normalize";

export { isDataFrame, KEEP_FRAME_DEFAULTS } from "./frames/keep";
export type { FrameOcr, KeepFrameOptions } from "./frames/keep";
export { computeDHash, hammingDistance, isDuplicateHash, DUPLICATE_MAX_DISTANCE } from "./frames/dhash";
export type { RgbaImage } from "./frames/dhash";
export { brightPixelFraction, MIN_FULLSCREEN_BRIGHT_FRACTION } from "./frames/brightness";
export {
  renderMarkdownDocument,
  renderHtmlDocument,
  renderMarkdownBlocks,
  renderHtmlBlocks,
  markdownToHtml,
  buildDocumentBlocks,
  toMarkeredTranscript,
  fromMarkeredOutput,
} from "./frames/document";
export type { DocSegment, DocFrame, Block } from "./frames/document";

export * from "./ai/types";
export { AiRegistry } from "./ai/registry";
export { assembleSummaryContent, SUMMARY_SYSTEM_PROMPT, POLISH_SYSTEM_PROMPT } from "./ai/prompt";
export type { FrameNote } from "./ai/prompt";
