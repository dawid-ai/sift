import { useEffect, useState } from "react";
import { ArrowDown, ArrowUp, Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  CountTag,
  DESTRUCTIVE_ACTION,
  FIELD,
  GroupLabel,
  NESTED_SURFACE,
  ROW_LIST,
  SettingsError,
  SettingsHint,
} from "./settings-page";

const LANG_NAMES: Record<string, string> = {
  en: "English",
  pl: "Polish",
  es: "Spanish",
  de: "German",
  fr: "French",
  it: "Italian",
  pt: "Portuguese",
  nl: "Dutch",
  ru: "Russian",
  uk: "Ukrainian",
  ja: "Japanese",
  ko: "Korean",
  zh: "Chinese",
};

const langName = (code: string) => LANG_NAMES[code] ?? code;

/** Ordered preferred transcript languages (first = default). Persists on every change. */
export function TranscriptLanguageSection() {
  const [langs, setLangs] = useState<string[]>([]);
  const [input, setInput] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    window.sift.settings
      .getTranscriptLanguages()
      .then(setLangs)
      .catch(() => setLangs(["en"]));
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
    if (!code || langs.includes(code)) {
      setInput("");
      return;
    }
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
    <div
      className="flex flex-col gap-3"
      data-testid="transcript-language-section"
    >
      {/* Ranked list: the numeral carries the order, so the arrows don't have to explain it.
          One nested block, label inside it, rows carrying nothing but a hairline. */}
      <div className={cn(NESTED_SURFACE, "px-4 py-1")}>
        <div className="flex items-center py-3">
          <GroupLabel>Preference order</GroupLabel>
          <CountTag>{langs.length}</CountTag>
        </div>
        <ul className={cn("border-t border-white/[0.05]", ROW_LIST)}>
          {langs.map((code, i) => (
            <li
              key={code}
              data-testid="transcript-language-row"
              className="flex items-center gap-3 py-2.5 text-sm"
            >
              {/* The numeral IS the ranking — it is content, not decoration, so it clears
                  4.5:1 like the nav index ordinals do. At /35 it measured 3.0:1 on this
                  nested fill; /50 lands at 4.8:1 and is the same grey `fg-subtle` reads as
                  one surface step up, so the two ordinal lists still look identical. */}
              <span className="w-5 shrink-0 font-mono text-[11px] tabular-nums text-foreground/50">
                {String(i + 1).padStart(2, "0")}
              </span>
              <span className="truncate font-medium text-foreground">
                {langName(code)}
              </span>
              <span className="font-mono text-[11px] uppercase tracking-wide text-muted-foreground">
                {code}
              </span>
              {i === 0 && <Badge>Default</Badge>}
              <div className="ml-auto flex shrink-0 items-center gap-1">
                <Button
                  size="icon"
                  variant="outline"
                  aria-label={`Move ${langName(code)} up`}
                  disabled={i === 0}
                  onClick={() => move(i, -1)}
                >
                  <ArrowUp className="h-3.5 w-3.5" />
                </Button>
                <Button
                  size="icon"
                  variant="outline"
                  aria-label={`Move ${langName(code)} down`}
                  disabled={i === langs.length - 1}
                  onClick={() => move(i, 1)}
                >
                  <ArrowDown className="h-3.5 w-3.5" />
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className={DESTRUCTIVE_ACTION}
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
      </div>

      <div className="flex items-center gap-2">
        <Input
          data-testid="transcript-language-input"
          value={input}
          aria-label="Language code"
          placeholder="Language code, e.g. pl"
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") add();
          }}
          className={cn(FIELD, "flex-1")}
        />
        <Button
          data-testid="transcript-language-add"
          variant="outline"
          size="lg"
          onClick={add}
        >
          <Plus className="h-4 w-4" />
          Add
        </Button>
      </div>
      <SettingsHint>
        Two-letter ISO codes — a region suffix like “pt-BR” is trimmed to “pt”.
      </SettingsHint>
      {error && <SettingsError>{error}</SettingsError>}
    </div>
  );
}
