import { useEffect, useReducer } from "react";
import { initialUpdateState, updateReducer, type UpdateState } from "@/lib/update-state";

/** Subscribes to main→renderer update events and folds them into UI state.
 * Returns the state plus a `dismiss` action for the toast's "Later" button. */
export function useUpdates(): { state: UpdateState; dismiss: () => void } {
  const [state, dispatch] = useReducer(updateReducer, initialUpdateState);
  useEffect(() => window.sift.updates.onEvent((e) => dispatch(e)), []);
  return { state, dismiss: () => dispatch({ type: "dismiss" }) };
}
