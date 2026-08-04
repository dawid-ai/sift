import { useEffect, useReducer } from "react";
import type { BinaryKind } from "@sift/ipc-contract";
import {
  binaryUpdateReducer,
  initialBinaryUpdateState,
  type BinaryUpdateState,
} from "@/lib/binary-update-state";

/** Subscribes to binary maintenance events, replaying any that fired before mount. */
export function useBinaryUpdates(): { state: BinaryUpdateState; dismiss: (kind: BinaryKind) => void } {
  const [state, dispatch] = useReducer(binaryUpdateReducer, initialBinaryUpdateState);
  useEffect(() => {
    void window.sift.binaries.currentUpdateEvents().then((events) => {
      for (const e of events) dispatch(e);
    });
    return window.sift.binaries.onUpdateEvent((e) => dispatch(e));
  }, []);
  return { state, dismiss: (kind) => dispatch({ type: "dismiss", kind }) };
}
