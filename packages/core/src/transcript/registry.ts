import type { TranscriptProvider, TranscriptContext } from "./types";

export class TranscriptRegistry {
  private readonly providers: TranscriptProvider[] = [];

  register(provider: TranscriptProvider): void {
    const i = this.providers.findIndex((p) => p.id === provider.id);
    if (i >= 0) this.providers[i] = provider;
    else this.providers.push(provider);
  }

  list(): TranscriptProvider[] {
    return [...this.providers];
  }

  resolve(ctx: TranscriptContext): TranscriptProvider | null {
    return this.providers.find((p) => p.canHandle(ctx)) ?? null;
  }
}
