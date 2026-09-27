import { useEffect, useMemo } from 'react'

// An object URL for a Blob, freed when the Blob changes or the component unmounts.
export function useObjectUrl(blob: Blob | null): string | undefined {
  const url = useMemo(() => (blob ? URL.createObjectURL(blob) : undefined), [blob])
  useEffect(() => () => (url ? URL.revokeObjectURL(url) : undefined), [url])
  return url
}
