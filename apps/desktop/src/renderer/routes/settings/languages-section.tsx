import { useEffect, useState } from "react";
import type { WhisperConfig, WhisperModelInfo } from "@sift/ipc-contract";
import { Button } from "@/components/ui/button";
import { FilterSelect } from "@/components/ui/filter-select";
import { Input } from "@/components/ui/input";
import { SettingsError, SettingsHint } from "./settings-page";

/** Whisper is multilingual; these are the codes worth offering as a shortcut. Anything else
 * can be typed — the field accepts any ISO-639-1 code. */
const LANGUAGES = [
  { value: "auto", label: "Detect automatically" },
  { value: "en", label: "English" },
  { value: "pl", label: "Polish" },
  { value: "de", label: "German" },
  { value: "fr", label: "French" },
  { value: "es", label: "Spanish" },
  { value: "pt", label: "Portuguese" },
  { value: "it", label: "Italian" },
  { value: "nl", label: "Dutch" },
  { value: "ja", label: "Japanese" },
  { value: "zh", label: "Chinese" },
  { value: "uk", label: "Ukrainian" },
];

function gb(bytes: number): string {
  return bytes >= 1024 ** 3
    ? `${(bytes / 1024 ** 3).toFixed(1)} GB`
    : `${Math.round(bytes / 1024 ** 2)} MB`;
}

/**
 * Whisper model, transcription language, and slide-OCR language.
 *
 * Model and language are separate settings because they solve different problems: a bigger
 * model transcribes accents and noise better, while the language setting is for content the
 * source metadata mislabels. Both are saved together on one button — switching model means
 * a download, so this is not a save-on-change surface.
 */
export function LanguagesSection() {
  const [models, setModels] = useState<WhisperModelInfo[]>([]);
  const [saved, setSaved] = useState<WhisperConfig | null>(null);
  const [draft, setDraft] = useState<WhisperConfig | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void Promise.all([
      window.sift.whisper.models(),
      window.sift.whisper.getConfig(),
    ])
      .then(([m, c]) => {
        setModels(m);
        setSaved(c);
        setDraft(c);
      })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, []);

  if (!draft || !saved) return null;

  const dirty =
    draft.modelName !== saved.modelName ||
    draft.language !== saved.language ||
    draft.ocrLanguage !== saved.ocrLanguage;
  const modelChanged = draft.modelName !== saved.modelName;

  async function save() {
    if (!draft) return;
    setBusy(true);
    setError(null);
    try {
      const stored = await window.sift.whisper.setConfig(draft);
      setSaved(stored);
      setDraft(stored);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-3" data-testid="languages-section">
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1 text-[11px] text-foreground/55">
          Whisper model
          <FilterSelect
            value={draft.modelName}
            onChange={(v) =>
              setDraft({ ...draft, modelName: v ?? saved.modelName })
            }
            options={models.map((m) => ({
              value: m.name,
              label: `${m.label} · ${gb(m.approxBytes)}`,
            }))}
            allLabel="Default"
            testId="whisper-model"
          />
        </label>
        <label className="flex flex-col gap-1 text-[11px] text-foreground/55">
          Transcription language
          <FilterSelect
            value={draft.language}
            onChange={(v) => setDraft({ ...draft, language: v ?? "auto" })}
            options={LANGUAGES}
            allLabel="Detect automatically"
            testId="whisper-language"
          />
        </label>
        <label className="flex flex-col gap-1 text-[11px] text-foreground/55">
          Slide OCR language
          <Input
            data-testid="ocr-language"
            aria-label="Slide OCR language"
            className="h-9 w-[10rem] text-[12px]"
            placeholder="eng"
            value={draft.ocrLanguage}
            onChange={(e) =>
              setDraft({ ...draft, ocrLanguage: e.target.value.trim() })
            }
          />
        </label>
        <Button
          className="h-9 px-3 text-[12px]"
          data-testid="languages-save"
          disabled={!dirty || busy}
          onClick={() => void save()}
        >
          {busy ? "Saving…" : "Save"}
        </Button>
      </div>

      <SettingsHint>
        Every model listed is multilingual — the English-only variants are left
        out because they cannot transcribe anything else. A bigger model handles
        accents and noise better and takes longer per video.
      </SettingsHint>
      {modelChanged && (
        <SettingsHint data-testid="model-change-note">
          Saving this does not download the model. Install it under
          Transcription → Whisper, which verifies it against the checksum the
          source publishes.
        </SettingsHint>
      )}
      <SettingsHint>
        OCR uses Tesseract codes: <code className="font-mono">eng</code>,{" "}
        <code className="font-mono">deu</code>, or several at once as{" "}
        <code className="font-mono">eng+deu</code>. English ships with the app
        and works offline; any other language is downloaded once and cached.
      </SettingsHint>
      {error && <SettingsError>{error}</SettingsError>}
    </div>
  );
}
