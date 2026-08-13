// Creator prompt pack. Seeded with is_builtin = 0 on purpose: these are starting points
// creators will rewrite, and built-in rows can be neither edited nor deleted. The shareable
// pack file is produced by the app's own prompts export, so this stays the single source.
// Prompts that must cite times carry the {{TIMESTAMPS}} marker (see core/ai/prompt.ts).
export const migration017CreatorPrompts = `
INSERT INTO prompt (name, body, is_builtin, created_at) VALUES
  ('YouTube chapters',
   'From the transcript below, produce YouTube chapter markers. Rules: the first chapter MUST start at 00:00, produce at least 3 chapters, and each chapter must be at least 10 seconds long. Output one chapter per line as "M:SS Title" (or "H:MM:SS Title" past an hour) and nothing else — no preamble, no numbering, no markdown. Titles are 2-6 words, specific to what is actually discussed, no clickbait. {{TIMESTAMPS}}',
   0, 0),
  ('Title ideas',
   'You write YouTube titles. From the transcript below, propose 10 title options under 60 characters each. Cover a range of angles: the concrete result, the specific question answered, the surprising claim, and the plain descriptive version. Ground every title in something actually said in the transcript — never invent a claim for the hook. Output a numbered list and nothing else.',
   0, 0),
  ('Video description',
   'Write a YouTube description for the video transcribed below. Structure: one short paragraph (2-3 sentences) that says what the viewer will get, then a blank line, then 3-5 bullet points of the concrete topics covered, then a blank line, then a line of 8-12 relevant lowercase hashtags. No emoji unless the transcript itself is playful. Output the description only.',
   0, 0),
  ('Podcast show notes',
   'Write show notes for the episode transcribed below. Structure: a 2-3 sentence episode summary; a "Timestamps" section listing the main segments as "M:SS — Topic"; a "Key points" section of 4-8 bullets; and a "Mentioned" section listing every person, book, product, tool, or link named in the episode (omit the section entirely if nothing was mentioned). Use only what is in the transcript. Output markdown. {{TIMESTAMPS}}',
   0, 0),
  ('Blog post',
   'Turn the transcript below into a standalone blog post that reads as written prose, not a cleaned-up transcript. Reorganise by topic rather than following the speaking order; drop greetings, filler, tangents, and audience management. Keep every fact, number, definition, and conclusion. Use a title, "##" section headers, short paragraphs, and bullet lists where the content is genuinely a list. Do not invent examples, statistics, or sources that are not in the transcript. Output markdown, starting with the title.',
   0, 0),
  ('Newsletter issue',
   'Write a newsletter issue based on the transcript below. Open with a 2-3 sentence hook that states the single most useful idea. Then 3-5 short sections, each with a bolded one-line takeaway followed by 2-4 sentences of explanation. Close with one concrete thing the reader can try this week. Conversational but dense — no filler, no "in today''s issue" preamble. Output markdown.',
   0, 0),
  ('Short-form moments',
   'Find the 5 best standalone moments in the transcript below for short-form clips (30-60 seconds each). A good moment makes sense with no setup, contains a complete thought, and has a hook in its first sentence. For each, output: the start and end timestamp, a one-line reason it works, and the opening line verbatim from the transcript. Rank them best-first. {{TIMESTAMPS}}',
   0, 0);
`;
