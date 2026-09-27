// A stuck IndexedDB connection (see db.ts's versionchange handler, which is
// what that guards against) has no error and no native timeout: it just never
// resolves. This turns "never" into a clear, retryable failure rather than a
// silent, permanent spinner on whatever action triggered it.
export function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => window.setTimeout(() => reject(new Error(message)), ms)),
  ])
}

export const BLOCKED_TAB_HINT =
  "Timed out. If another tab or window of this app is open, close it and try again — that's the most common cause."

export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}
