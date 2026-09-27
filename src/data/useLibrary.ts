import { useCallback, useEffect, useState } from 'react'
import type { Child, Edition, ReadingSession } from '../types'
import { withTimeout, errorMessage } from '../lib/errors'
import * as storage from './storage'

// The cover to show for an edition, or undefined for the text placeholder.
export type CoverLookup = (edition: Edition | undefined) => string | undefined

/**
 * Everything the screens show, loaded from storage into React state. Screens
 * write through storage.ts and then call `reload`.
 */
export function useLibrary() {
  const [children, setChildren] = useState<Child[]>([])
  const [editions, setEditions] = useState<Edition[]>([])
  const [sessions, setSessions] = useState<ReadingSession[]>([])
  // Object URLs for locally stored covers, by edition id.
  const [coverUrls, setCoverUrls] = useState<Map<string, string>>(new Map())
  // If the very first load hangs (the blocked-connection failure db.ts's
  // versionchange handler guards against), the screen would otherwise just
  // look permanently blank with nothing to explain why.
  const [slowLoad, setSlowLoad] = useState(false)
  const [loadError, setLoadError] = useState('')

  const reload = useCallback(async () => {
    const [c, e, s, photos, cachedCovers] = await Promise.all([
      storage.listChildren(),
      storage.listEditions(),
      storage.listSessions(),
      storage.listCoverPhotos(),
      storage.listCachedCovers(),
    ])
    setChildren(c)
    setEditions(e)
    setSessions(s)
    // A parent-photographed cover always wins over a catalogue one: it's their
    // own copy, and the only option for a book the catalogue has no cover for.
    // Next comes the local cache of a catalogue cover, so display doesn't
    // depend on that CDN being reachable right now; the live URL comes last.
    const blobs = new Map<string, Blob>()
    for (const cover of [...cachedCovers, ...photos]) blobs.set(cover.editionId, cover.blob)
    // Object URLs hold browser memory until revoked, so the whole set is
    // replaced on every reload rather than accumulating.
    setCoverUrls((prev) => {
      prev.forEach((url) => URL.revokeObjectURL(url))
      return new Map([...blobs].map(([id, blob]) => [id, URL.createObjectURL(blob)]))
    })
    // Backfill for editions added before the cache existed, or restored from a
    // backup (which never carries it): not awaited, and each one no-ops if
    // already cached, so this is cheap to run on every load.
    for (const edition of e) {
      if (edition.coverUrl && !blobs.has(edition.id)) storage.cacheCoverIfMissing(edition.id, edition.coverUrl)
    }
  }, [])

  // Guarded by a timeout (unlike later reloads) because nothing else can work
  // without this one: a hang ends in a clear, retryable error.
  const load = useCallback(() => {
    setLoadError('')
    const timer = window.setTimeout(() => setSlowLoad(true), 6000)
    withTimeout(reload(), 25_000, "Couldn't load. If another tab or window of this app is open, close it and try again.")
      // After the first paint, not before it: brings covers stored before the
      // size limits (coverImage.ts) down to size. Same pictures, so no reload.
      .then(() => storage.shrinkOversizedCovers().catch((err) => console.warn('cover shrink failed', err)))
      .catch((err) => setLoadError(errorMessage(err)))
      .finally(() => {
        window.clearTimeout(timer)
        setSlowLoad(false)
      })
  }, [reload])

  useEffect(load, [load])

  const coverFor: CoverLookup = (edition) => edition && (coverUrls.get(edition.id) ?? edition.coverUrl)

  return { children, editions, sessions, coverFor, reload, slowLoad, loadError, retry: load }
}
