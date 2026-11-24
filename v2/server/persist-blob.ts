// Cloud persistence on a private Vercel Blob store for Medicub v2 (needs BLOB_READ_WRITE_TOKEN).
import { BlobPreconditionFailedError, get, put } from '@vercel/blob'
import type { Persist, Snapshot } from './persist'

const PATH = 'medicub-v2/snapshot.json'

export function blobPersist(): Persist {
  return {
    name: 'vercel-blob',
    async load() {
      const r = await get(PATH, { access: 'private', useCache: false })
      if (!r || r.statusCode !== 200) return { snap: null, version: null }
      const text = await new Response(r.stream).text()
      // Compressed reads report a weak ETag (W/"...") for the same content; conditional writes need the strong form.
      return { snap: JSON.parse(text) as Snapshot, version: r.blob.etag.replace(/^W\//, '') }
    },
    async save(snap: Snapshot, version: string | null) {
      try {
        const r = await put(PATH, JSON.stringify(snap), {
          access: 'private',
          allowOverwrite: true,
          addRandomSuffix: false,
          contentType: 'application/json',
          cacheControlMaxAge: 60,
          ...(version ? { ifMatch: version } : {}),
        })
        return r.etag
      } catch (e) {
        if (e instanceof BlobPreconditionFailedError) return null
        throw e
      }
    },
    async changed(version: string | null) {
      if (!version) return true
      const r = await get(PATH, { access: 'private', useCache: false, ifNoneMatch: version })
      return !r || r.statusCode !== 304
    },
  }
}
