import type { BinaryStatus, BinaryUpdateEvent, BinaryKind, BinaryUpdatePolicy } from "@sift/ipc-contract";

export type UpdateAction = "install-required" | "auto-update" | "notify" | "none";

/** Pure decision — no network, no db, no side effects. */
export function decideUpdateAction(input: {
  installed: boolean;
  updateAvailable: boolean;
  policy: BinaryUpdatePolicy;
}): UpdateAction {
  if (!input.installed) return "install-required";
  if (!input.updateAvailable) return "none";
  return input.policy === "auto" ? "auto-update" : "notify";
}

const DEFAULT_THROTTLE_MS = 24 * 60 * 60 * 1000;

export interface BinaryMaintenanceDeps {
  kinds: BinaryKind[];
  list(): Promise<BinaryStatus[]>;
  getLastChecked(kind: BinaryKind): number | null;
  check(kind: BinaryKind): Promise<BinaryStatus>;
  install(kind: BinaryKind): Promise<BinaryStatus>;
  policy(): BinaryUpdatePolicy;
  emit(e: BinaryUpdateEvent): void;
  now(): number;
  throttleMs?: number;
}

function errText(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/** Runs once at startup. Never throws — a per-kind failure emits `error` and moves on. */
export async function runStartupBinaryMaintenance(deps: BinaryMaintenanceDeps): Promise<void> {
  const throttleMs = deps.throttleMs ?? DEFAULT_THROTTLE_MS;

  // Startup maintenance is best-effort. If list() itself rejects there's no
  // per-kind context to attach an error event to, so do nothing rather than
  // crashing startup.
  let statuses: BinaryStatus[];
  try {
    statuses = await deps.list();
  } catch {
    return;
  }
  const byKind = new Map(statuses.map((s) => [s.kind, s]));

  for (const kind of deps.kinds) {
    const s = byKind.get(kind);
    if (!s) continue;

    // First-run: install regardless of policy.
    if (!s.installed) {
      deps.emit({ type: "installing", kind });
      try {
        const r = await deps.install(kind);
        deps.emit({ type: "ready", kind, version: r.installedVersion ?? "", reason: "installed" });
      } catch (e) {
        deps.emit({ type: "error", kind, message: errText(e) });
      }
      continue;
    }

    // Installed: throttle the network check. A falsy lastChecked (null, or 0 —
    // e.g. a DB column that defaults to 0) means "never checked": always proceed.
    const lastChecked = deps.getLastChecked(kind);
    if (lastChecked && deps.now() - lastChecked < throttleMs) continue;

    let checked: BinaryStatus;
    try {
      checked = await deps.check(kind);
    } catch (e) {
      deps.emit({ type: "error", kind, message: errText(e) });
      continue;
    }
    if (!checked.updateAvailable) continue;

    if (decideUpdateAction({ installed: true, updateAvailable: true, policy: deps.policy() }) === "auto-update") {
      deps.emit({ type: "installing", kind });
      try {
        const r = await deps.install(kind);
        deps.emit({ type: "ready", kind, version: r.installedVersion ?? "", reason: "updated" });
      } catch (e) {
        deps.emit({ type: "error", kind, message: errText(e) });
      }
    } else {
      deps.emit({
        type: "available",
        kind,
        installedVersion: checked.installedVersion ?? "",
        latestVersion: checked.latestVersion ?? "",
      });
    }
  }
}
