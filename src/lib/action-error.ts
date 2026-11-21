/**
 * Production builds replace messages thrown from server actions with a generic
 * framework string (plus a digest). Show the caller's contextual fallback instead.
 */
const REDACTED = /Server Components render|digest property is included|An unexpected response was received from the server/i;

export function actionErrorMessage(err: unknown, fallback: string): string {
  if (!(err instanceof Error) || !err.message) return fallback;
  if (REDACTED.test(err.message)) {
    return `${fallback}. The server rejected the request: check required fields, project activation and your permissions, then try again.`;
  }
  return err.message;
}
