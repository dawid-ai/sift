export const migration004Prompt = `
CREATE TABLE IF NOT EXISTS prompt (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  body TEXT NOT NULL,
  is_builtin INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
INSERT INTO prompt (name, body, is_builtin, created_at) VALUES
  ('Key points', 'Summarize the following transcript into a concise list of the most important key points. Use short bullet points.', 1, 0),
  ('Detailed summary', 'Write a clear, well-structured prose summary of the following transcript. Cover the main arguments and conclusions in a few short paragraphs.', 1, 0),
  ('TL;DR', 'Give a one-paragraph TL;DR of the following transcript, no more than four sentences.', 1, 0);
`;
