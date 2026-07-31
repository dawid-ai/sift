import type { AiProvider } from "./types";

export class AiRegistry {
  private readonly providers: AiProvider[] = [];

  register(provider: AiProvider): void {
    const i = this.providers.findIndex((p) => p.id === provider.id);
    if (i >= 0) this.providers[i] = provider;
    else this.providers.push(provider);
  }

  /** Removes a provider by id. No-op (does not throw) if the id was never registered. */
  unregister(id: string): void {
    const i = this.providers.findIndex((p) => p.id === id);
    if (i >= 0) this.providers.splice(i, 1);
  }

  get(id: string): AiProvider | undefined {
    return this.providers.find((p) => p.id === id);
  }

  list(): AiProvider[] {
    return [...this.providers];
  }
}
