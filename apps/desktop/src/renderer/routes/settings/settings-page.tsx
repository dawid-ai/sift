import { useState } from "react";
import type { ReactNode } from "react";
import type { UpdateState } from "@/lib/update-state";
import { AiProvidersSection } from "./ai-providers-section";
import { BinariesSection } from "./binaries-section";
import { DownloadsSection } from "./downloads-section";
import { PlatformsSection } from "./platforms-section";
import { PromptsSection } from "./prompts-section";
import { PromptPlaygroundSection } from "./prompt-playground-section";
import { SigninSection } from "./signin-section";
import { TranscriptLanguageSection } from "./transcript-language-section";
import { TranscriptMethodSection } from "./transcript-method-section";
import { AutoTranscriptSection } from "./auto-transcript-section";
import { UpdatesSection } from "./updates-section";
import { WhisperSection } from "./whisper-section";

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-4">
      <h3 className="text-lg font-semibold">{title}</h3>
      {children}
    </section>
  );
}

type TabId = "general" | "transcription" | "ai" | "system";
const TABS: { id: TabId; label: string }[] = [
  { id: "general", label: "General" },
  { id: "transcription", label: "Transcription" },
  { id: "ai", label: "AI" },
  { id: "system", label: "System" },
];

export function SettingsPage({ updateState }: { updateState: UpdateState }) {
  const [tab, setTab] = useState<TabId>("general");

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 p-8">
      <h2 className="text-2xl font-bold tracking-tight">Settings</h2>

      <div className="flex gap-5 border-b border-border">
        {TABS.map((t) => {
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              data-testid={`settings-tab-${t.id}`}
              onClick={() => setTab(t.id)}
              className={`-mb-px border-b-2 pb-2.5 pt-1 text-sm font-medium transition-colors ${
                active ? "border-primary text-foreground" : "border-transparent text-foreground/45 hover:text-foreground/75"
              }`}
            >
              {t.label}
            </button>
          );
        })}
      </div>

      {tab === "general" && (
        <>
          <Group title="Downloads">
            <DownloadsSection />
          </Group>
          <Group title="Platforms">
            <PlatformsSection />
          </Group>
          <Group title="Sign-in browser">
            <SigninSection />
          </Group>
        </>
      )}

      {tab === "transcription" && (
        <>
          <Group title="Transcript method">
            <TranscriptMethodSection />
            <AutoTranscriptSection />
          </Group>
          <Group title="Transcript language">
            <TranscriptLanguageSection />
          </Group>
          <Group title="Whisper (local transcription)">
            <WhisperSection />
          </Group>
        </>
      )}

      {tab === "ai" && (
        <>
          <Group title="AI providers">
            <AiProvidersSection />
          </Group>
          <Group title="Prompts">
            <PromptsSection />
          </Group>
          <Group title="Prompt playground">
            <PromptPlaygroundSection />
          </Group>
        </>
      )}

      {tab === "system" && (
        <>
          <Group title="Binaries">
            <BinariesSection />
          </Group>
          <Group title="Updates">
            <UpdatesSection updateState={updateState} />
          </Group>
        </>
      )}
    </div>
  );
}
