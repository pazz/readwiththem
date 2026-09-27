import { useEffect, useMemo, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import type { Edition } from '../types'
import * as storage from './storage'

// The cover to show for an edition, or undefined for the text placeholder.
export type CoverLookup = (edition: Edition | undefined) => string | undefined

const SLOW_AFTER_MS = 6_000
const FAIL_AFTER_MS = 25_000

/**
 * Everything the screens show, kept live: any write through storage.ts, in
 * this tab or another, re-renders the screens that read it. This hook and
 * storage.ts together are the data layer; a future networked adapter would
 * replace the live queries here, not the screens.
 */
export function useLibrary() {
  const children = useLiveQuery(storage.listChildren)
  const editions = useLiveQuery(storage.listEditions)
  const sessions = useLiveQuery(storage.listSessions)
  const photos = useLiveQuery(storage.listCoverPhotos)
  const cachedCovers = useLiveQuery(storage.listCachedCovers)
  const loaded = !!(children && editions && sessions && photos && cachedCovers)

  // A parent-photographed cover always wins over a catalogue one: it's their
  // own copy, and the only option for a book the catalogue has no cover for.
  // Next comes the local cache of a catalogue cover, so display doesn't depend
  // on that CDN being reachable; the live URL comes last.
  const coverUrls = useMemo(() => {
    const blobs = new Map<string, Blob>()
    for (const cover of [...(cachedCovers ?? []), ...(photos ?? [])]) blobs.set(cover.editionId, cover.blob)
    return new Map([...blobs].map(([id, blob]) => [id, URL.createObjectURL(blob)]))
  }, [cachedCovers, photos])
  // Object URLs hold browser memory until revoked, so each set is freed once
  // the next replaces it.
  const previousUrls = useRef<Map<string, string>>(undefined)
  useEffect(() => {
    previousUrls.current?.forEach((url) => URL.revokeObjectURL(url))
    previousUrls.current = coverUrls
  }, [coverUrls])

  // Caches catalogue covers not yet stored locally: editions added before the
  // cache existed, or restored from a backup (which never carries it). Each is
  // tried once per session, however often the data changes meanwhile.
  const tried = useRef(new Set<string>())
  useEffect(() => {
    for (const edition of editions ?? []) {
      if (!edition.coverUrl || coverUrls.has(edition.id) || tried.current.has(edition.id)) continue
      tried.current.add(edition.id)
      storage.cacheCoverIfMissing(edition.id, edition.coverUrl)
    }
  }, [editions, coverUrls])

  // Once loaded, brings covers stored before the size limits (coverImage.ts)
  // down to size.
  useEffect(() => {
    if (loaded) storage.shrinkOversizedCovers().catch((err) => console.warn('cover shrink failed', err))
  }, [loaded])

  // A hung first load (the blocked-connection failure db.ts's versionchange
  // handler guards against) would otherwise look like a permanently blank screen.
  const [delay, setDelay] = useState<'none' | 'slow' | 'failed'>('none')
  useEffect(() => {
    if (loaded) return
    const slow = window.setTimeout(() => setDelay('slow'), SLOW_AFTER_MS)
    const failed = window.setTimeout(() => setDelay('failed'), FAIL_AFTER_MS)
    return () => {
      window.clearTimeout(slow)
      window.clearTimeout(failed)
    }
  }, [loaded])

  const coverFor: CoverLookup = (edition) => edition && (coverUrls.get(edition.id) ?? edition.coverUrl)
  const hasCoverPhoto = (editionId: string) => !!photos?.some((p) => p.editionId === editionId)

  return {
    children: children ?? [],
    editions: editions ?? [],
    sessions: sessions ?? [],
    coverFor,
    hasCoverPhoto,
    loaded,
    loadState: loaded ? 'loaded' : delay,
  }
}
