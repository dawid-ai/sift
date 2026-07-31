import type { AiModelInfo, AiProvider } from "@sift/core";

export const OLLAMA_ID = "ollama";

export const DEFAULT_OLLAMA_BASE_URL = "http://localhost:11434";

// MVP: a small static fallback so the model dropdown isn't empty. A live `/api/tags`
// fetch (to list whatever the daemon actually has pulled) is a later nicety.
export const OLLAMA_MODELS: AiModelInfo[] = [
  { id: "llama3.1", label: "Llama 3.1" },
  { id: "mistral", label: "Mistral" },
];

/**
 * Parses the COMPLETE newline-terminated NDJSON lines in `text`. Blank lines are
 * ignored. A trailing partial line (no terminating `\n`) is NOT parsed — the caller
 * is responsible for carrying it into the next read and re-parsing once complete.
 */
export function parseOllamaChunks(text: string): { content: string; done: boolean }[] {
  const endsWithNewline = text.endsWith("\n");
  const lines = text.split("\n");
  if (!endsWithNewline) lines.pop(); // drop trailing partial line

  const results: { content: string; done: boolean }[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const parsed = JSON.parse(trimmed) as { message?: { content?: string }; done?: boolean };
    results.push({ content: parsed.message?.content ?? "", done: parsed.done === true });
  }
  return results;
}

/**
 * Ollama is local + keyless (`needsKey=false`); the model list is a static fallback
 * (or an injected override) rather than a live daemon round-trip.
 */
export function createOllamaProvider(deps: {
  baseUrl?: string; // default "http://localhost:11434"
  fetchImpl?: typeof fetch; // injectable for tests
  models?: AiModelInfo[]; // optional static fallback list
}): AiProvider {
  const baseUrl = deps.baseUrl ?? DEFAULT_OLLAMA_BASE_URL;
  const fetchImpl = deps.fetchImpl ?? fetch;
  const models = deps.models ?? OLLAMA_MODELS;
  const unreachableError = () => new Error(`Could not reach Ollama at ${baseUrl}. Is it running?`);

  return {
    id: OLLAMA_ID,
    label: "Ollama (local)",
    needsKey: false,
    models() {
      return models;
    },
    // NDJSON hand-parse over the raw fetch stream — no ollama SDK dependency
    // for one endpoint; a static model list avoids a second round-trip just to fill a dropdown.
    async summarize(input, onToken) {
      let response: Response;
      try {
        response = await fetchImpl(`${baseUrl}/api/chat`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            model: input.model,
            stream: true,
            messages: [
              { role: "system", content: input.systemPrompt },
              { role: "user", content: input.content },
            ],
          }),
        });
      } catch {
        throw unreachableError();
      }

      if (!response.ok || !response.body) {
        throw unreachableError();
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let acc = "";

      const consume = (parsedChunks: { content: string; done: boolean }[]): boolean => {
        for (const chunk of parsedChunks) {
          if (chunk.content) {
            onToken(chunk.content);
            acc += chunk.content;
          }
          if (chunk.done) return true;
        }
        return false;
      };

      for (let read = await reader.read(); !read.done; read = await reader.read()) {
        buffer += decoder.decode(read.value, { stream: true });
        const lastNewline = buffer.lastIndexOf("\n");
        if (lastNewline === -1) continue; // no complete line yet; keep buffering

        const completePart = buffer.slice(0, lastNewline + 1);
        buffer = buffer.slice(lastNewline + 1);
        if (consume(parseOllamaChunks(completePart))) return acc;
      }

      // Stream ended: flush a final line that lacked a trailing newline, if any.
      if (buffer.trim()) {
        consume(parseOllamaChunks(`${buffer}\n`));
      }
      return acc;
    },
  };
}
