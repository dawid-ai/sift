import type { BinaryUpdatePolicy } from "@sift/ipc-contract";

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
