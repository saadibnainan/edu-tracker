import { lookup } from 'node:dns/promises'
import { isBlockedAddress } from './guard'

const MAX_BYTES = 2 * 1024 * 1024
const MAX_REDIRECTS = 3
const TIMEOUT_MS = 8_000

export class IcsFetchError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message)
  }
}

async function assertPublicHttps(url: URL): Promise<void> {
  if (url.protocol !== 'https:') throw new IcsFetchError('Only https calendar links are supported.', 400)
  if (url.port && url.port !== '443') throw new IcsFetchError('Calendar links must use the standard https port.', 400)
  if (url.username || url.password) throw new IcsFetchError('Calendar links with credentials are not supported.', 400)
  const host = url.hostname.replace(/^\[|\]$/g, '')
  let addresses: { address: string }[]
  try {
    addresses = await lookup(host, { all: true, verbatim: true })
  } catch {
    throw new IcsFetchError('Calendar host could not be resolved.', 502)
  }
  if (addresses.length === 0 || addresses.some((a) => isBlockedAddress(a.address))) {
    throw new IcsFetchError('Calendar host is not a public address.', 400)
  }
}

async function readCapped(res: Response): Promise<string> {
  const declared = Number(res.headers.get('content-length') ?? 0)
  if (declared > MAX_BYTES) throw new IcsFetchError('Calendar file is larger than 2 MB.', 413)
  if (!res.body) return ''
  const reader = res.body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    size += value.byteLength
    if (size > MAX_BYTES) {
      await reader.cancel()
      throw new IcsFetchError('Calendar file is larger than 2 MB.', 413)
    }
    chunks.push(value)
  }
  const all = new Uint8Array(size)
  let offset = 0
  for (const c of chunks) {
    all.set(c, offset)
    offset += c.byteLength
  }
  return new TextDecoder('utf-8').decode(all)
}

/** Fetches a calendar feed, re-checking the target address on every redirect hop. */
export async function fetchIcs(rawUrl: string): Promise<string> {
  let url: URL
  try {
    url = new URL(rawUrl)
  } catch {
    throw new IcsFetchError('Calendar link is not a valid URL.', 400)
  }
  const signal = AbortSignal.timeout(TIMEOUT_MS)
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    await assertPublicHttps(url)
    let res: Response
    try {
      res = await fetch(url, {
        redirect: 'manual',
        signal,
        cache: 'no-store',
        headers: { accept: 'text/calendar, text/plain;q=0.9, */*;q=0.1', 'user-agent': 'EDU-Tracker calendar fetch' },
      })
    } catch (err) {
      if (err instanceof Error && err.name === 'TimeoutError') throw new IcsFetchError('Calendar host did not respond in time.', 504)
      throw new IcsFetchError('Calendar could not be loaded.', 502)
    }
    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get('location')
      if (!location) throw new IcsFetchError('Calendar host sent a broken redirect.', 502)
      url = new URL(location, url)
      continue
    }
    if (!res.ok) throw new IcsFetchError(`Calendar host answered ${res.status}.`, 502)
    return readCapped(res)
  }
  throw new IcsFetchError('Calendar link redirects too many times.', 502)
}
