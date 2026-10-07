// Every catalogue request gives up after a few seconds, body included: a
// server that hangs must not leave the person staring at "Looking up…".
// A lookup that runs out of time simply counts as finding nothing there.
export const CATALOGUE_TIMEOUT_MS = 6000

export async function fetchWithin<T>(url: string, read: (res: Response) => Promise<T>, ms = CATALOGUE_TIMEOUT_MS): Promise<T> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), ms)
  try {
    return await read(await fetch(url, { signal: controller.signal }))
  } finally {
    clearTimeout(timer)
  }
}
