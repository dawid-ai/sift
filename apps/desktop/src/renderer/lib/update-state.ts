import type { UpdateEvent } from "@sift/ipc-contract";

export type UpdateState =
  | { kind: "idle" }
  | { kind: "checking" }
  | { kind: "not-available" }
  | { kind: "available"; version: string; releaseNotes: string }
  | { kind: "downloading"; percent: number }
  | { kind: "downloaded"; version: string }
  | { kind: "error"; message: string };

export const initialUpdateState: UpdateState = { kind: "idle" };

/** Reducer actions: every UpdateEvent, plus the local "Later" dismissal. */
export type UpdateAction = UpdateEvent | { type: "dismiss" };

export function updateReducer(
  state: UpdateState,
  action: UpdateAction,
): UpdateState {
  switch (action.type) {
    case "dismiss":
      return { kind: "idle" };
    case "checking":
      return { kind: "checking" };
    case "not-available":
      return { kind: "not-available" };
    case "available":
      return {
        kind: "available",
        version: action.version,
        releaseNotes: action.releaseNotes,
      };
    case "downloading":
      // A late progress tick after the download already finished must not undo "downloaded".
      if (state.kind === "downloaded") return state;
      return { kind: "downloading", percent: action.percent };
    case "downloaded":
      return { kind: "downloaded", version: action.version };
    case "error":
      return { kind: "error", message: action.message };
  }
}
