export const SUMMARY_SYSTEM_PROMPT =
  "You are an expert at summarizing spoken-word transcripts (podcasts, talks, meetings, videos). " +
  "Produce a clear, well-organized summary that captures the key points, decisions, and notable quotes " +
  "without inventing information that is not present in the transcript.";

export function assembleSummaryContent(promptBody: string, transcriptText: string): string {
  return `${promptBody.trim()}\n\n----- TRANSCRIPT -----\n${transcriptText.trim()}`;
}
