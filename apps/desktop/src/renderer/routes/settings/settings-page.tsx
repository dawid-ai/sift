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

export function SettingsPage({ updateState }: { updateState: UpdateState }) {
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 p-8">
      <h2 className="text-2xl font-bold tracking-tight">Settings</h2>
      <section className="flex flex-col gap-4">
        <h3 className="text-lg font-semibold">Updates</h3>
        <UpdatesSection updateState={updateState} />
      </section>
      <section className="flex flex-col gap-4">
        <h3 className="text-lg font-semibold">Binaries</h3>
        <BinariesSection />
        <WhisperSection />
      </section>
      <section className="flex flex-col gap-4">
        <h3 className="text-lg font-semibold">Sign-in browser</h3>
        <SigninSection />
      </section>
      <section className="flex flex-col gap-4">
        <h3 className="text-lg font-semibold">Platforms</h3>
        <PlatformsSection />
      </section>
      <section className="flex flex-col gap-4">
        <h3 className="text-lg font-semibold">AI providers</h3>
        <AiProvidersSection />
      </section>
      <section className="flex flex-col gap-4">
        <h3 className="text-lg font-semibold">Transcript language</h3>
        <TranscriptLanguageSection />
      </section>
      <section className="flex flex-col gap-4">
        <h3 className="text-lg font-semibold">Transcript method</h3>
        <TranscriptMethodSection />
        <AutoTranscriptSection />
      </section>
      <section className="flex flex-col gap-4">
        <h3 className="text-lg font-semibold">Downloads</h3>
        <DownloadsSection />
      </section>
      <section className="flex flex-col gap-4">
        <h3 className="text-lg font-semibold">Prompts</h3>
        <PromptsSection />
      </section>
      <section className="flex flex-col gap-4">
        <h3 className="text-lg font-semibold">Prompt playground</h3>
        <PromptPlaygroundSection />
      </section>
    </div>
  );
}
