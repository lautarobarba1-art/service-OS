import type { ActionState } from "@/lib/action-state";

export function OperationFormFeedback({ state, clientError }: { state: ActionState; clientError?: string }) {
  const error = clientError || state.error;
  return (
    <>
      {error ? <p className="form-error" role="alert">{error}</p> : null}
      {state.message ? <p className="form-success" role="status">{state.message}</p> : null}
    </>
  );
}
