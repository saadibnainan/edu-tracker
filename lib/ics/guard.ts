// SSRF protection for user-supplied calendar URLs. Only public internet
// addresses on port 443 may be fetched.

import { isIP } from 'node:net'

function v4ToInt(ip: string): number {
  return ip.split('.').reduce((acc, o) => (acc << 8) + Number(o), 0) >>> 0
}

const V4_BLOCKS: [string, number][] = [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.0.2.0', 24],
  ['192.88.99.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['198.51.100.0', 24],
  ['203.0.113.0', 24],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4],
]

function isBlockedV4(ip: string): boolean {
  const n = v4ToInt(ip)
  return V4_BLOCKS.some(([base, bits]) => {
    const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0
    return (n & mask) === (v4ToInt(base) & mask)
  })
}

/** Expands an IPv6 address to 8 hextets. */
function expandV6(ip: string): number[] | null {
  let addr = ip.toLowerCase().split('%')[0] ?? ''
  // Embedded IPv4 tail, e.g. ::ffff:1.2.3.4
  const v4 = addr.match(/(\d+\.\d+\.\d+\.\d+)$/)
  if (v4) {
    const n = v4ToInt(v4[1]!)
    addr = addr.slice(0, -v4[1]!.length) + `${(n >>> 16).toString(16)}:${(n & 0xffff).toString(16)}`
  }
  const halves = addr.split('::')
  if (halves.length > 2) return null
  const head = halves[0] ? halves[0].split(':') : []
  const tail = halves.length === 2 && halves[1] ? halves[1].split(':') : []
  const fill = halves.length === 2 ? 8 - head.length - tail.length : 0
  const parts = [...head, ...Array(fill).fill('0'), ...tail]
  if (parts.length !== 8) return null
  const nums = parts.map((p) => parseInt(p, 16))
  return nums.some((n) => Number.isNaN(n) || n < 0 || n > 0xffff) ? null : nums
}

function isBlockedV6(ip: string): boolean {
  const h = expandV6(ip)
  if (!h) return true
  const [a, b, c, d, e, f, g, last] = h as [number, number, number, number, number, number, number, number]
  if (h.every((x) => x === 0)) return true // ::
  if (a === 0 && b === 0 && c === 0 && d === 0 && e === 0 && f === 0 && g === 0 && last === 1) return true // ::1
  // IPv4-mapped ::ffff:0:0/96 and NAT64 64:ff9b::/96 carry an IPv4 address.
  const embedded = `${g >>> 8}.${g & 0xff}.${last >>> 8}.${last & 0xff}`
  if (a === 0 && b === 0 && c === 0 && d === 0 && e === 0 && f === 0xffff) return isBlockedV4(embedded)
  if (a === 0x64 && b === 0xff9b && c === 0 && d === 0 && e === 0 && f === 0) return isBlockedV4(embedded)
  if ((a & 0xfe00) === 0xfc00) return true // fc00::/7 unique local
  if ((a & 0xffc0) === 0xfe80) return true // fe80::/10 link local
  if ((a & 0xff00) === 0xff00) return true // multicast
  if (a === 0x2001 && b === 0x0db8) return true // documentation
  return false
}

export function isBlockedAddress(ip: string): boolean {
  const kind = isIP(ip)
  if (kind === 4) return isBlockedV4(ip)
  if (kind === 6) return isBlockedV6(ip)
  return true
}
