import type { BinaryKind, BinaryUpdateEvent } from "@sift/ipc-contract";

/** One binary's current notice, or undefined when idle/dismissed. */
export type BinaryNotice = BinaryUpdateEvent;
export type BinaryUpdateState = Partial<Record<BinaryKind, BinaryNotice>>;

export const initialBinaryUpdateState: BinaryUpdateState = {};

export type BinaryUpdateAction =
  BinaryUpdateEvent | { type: "dismiss"; kind: BinaryKind };

export function binaryUpdateReducer(
  state: BinaryUpdateState,
  action: BinaryUpdateAction,
): BinaryUpdateState {
  if (action.type === "dismiss") {
    const next = { ...state };
    delete next[action.kind];
    return next;
  }
  return { ...state, [action.kind]: action };
}
