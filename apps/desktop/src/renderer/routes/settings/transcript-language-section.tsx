import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

const LANG_NAMES: Record<string, string> = {
  en: "English", pl: "Polish", es: "Spanish", de: "German", fr: "French",
  it: "Italian", pt: "Portuguese", nl: "Dutch", ru: "Russian", uk: "Ukrainian",
  ja: "Japanese", ko: "Korean", zh: "Chinese",
};

const langName = (code: string) => LANG_NAMES[code] ?? code;

/** Ordered preferred transcript languages (first = default). Persists on every change. */
export function TranscriptLanguageSection() {
  const [langs, setLangs] = useState<string[]>([]);
  const [input, setInput] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    window.sift.settings.getTranscriptLanguages().then(setLangs).catch(() => setLangs(["en"]));
  }, []);

  async function persist(next: string[]) {
    setLangs(next);
    setError(null);
    try {
      await window.sift.settings.setTranscriptLanguages(next);
      const saved = await window.sift.settings.getTranscriptLanguages();
      setLangs(saved);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  function add() {
    const code = input.trim().toLowerCase().split("-")[0] ?? "";
    if (!code || langs.includes(code)) { setInput(""); return; }
    void persist([...langs, code]);
    setInput("");
  }

  function remove(code: string) {
    void persist(langs.filter((l) => l !== code));
  }

  function move(i: number, dir: -1 | 1) {
    const j = i + dir;
    if (j < 0 || j >= langs.length) return;
    const next = [...langs];
    [next[i], next[j]] = [next[j]!, next[i]!];
    void persist(next);
  }

  return (
    <div className="flex flex-col gap-3" data-testid="transcript-language-section">
      <p className="text-sm text-foreground/60">
        Preferred transcript languages. The first is the default; a transcript is fetched
        in the video&apos;s own language when available, otherwise the first of these that exists.
      </p>
      <ul className="flex flex-col gap-2">
        {langs.map((code, i) => (
          <li
            key={code}
            data-testid="transcript-language-row"
            className="flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm"
          >
            <span className="font-medium">{langName(code)}</span>
            <span className="text-foreground/50">{code}</span>
            {i === 0 && <span className="text-xs text-foreground/50">· default</span>}
            <div className="ml-auto flex gap-1">
              <Button size="sm" variant="outline" disabled={i === 0} onClick={() => move(i, -1)}>↑</Button>
              <Button size="sm" variant="outline" disabled={i === langs.length - 1} onClick={() => move(i, 1)}>↓</Button>
              <Button
                size="sm"
                variant="outline"
                data-testid="transcript-language-remove"
                disabled={langs.length === 1}
                onClick={() => remove(code)}
              >
                Remove
              </Button>
            </div>
          </li>
        ))}
      </ul>
      <div className="flex items-center gap-2">
        <input
          data-testid="transcript-language-input"
          value={input}
          aria-label="Language code"
          placeholder="Language code, e.g. pl"
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") add(); }}
          className="flex h-10 min-w-0 flex-1 rounded-md border border-border bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        />
        <Button data-testid="transcript-language-add" variant="outline" onClick={add}>
          Add
        </Button>
      </div>
      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
    </div>
  );
}
