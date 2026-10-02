// Generates every raster icon from design/favicon.svg.
// Run: npm run icons   (needs `npx playwright install chromium` once)
//
// Outputs (committed):
//   app/icon.svg                     SVG favicon
//   app/favicon.ico                  16, 32, 48 (PNG-in-ICO)
//   app/apple-icon.png               180
//   public/icons/icon-192.png        192
//   public/icons/icon-512.png        512
//   public/icons/icon-maskable-512.png  512, mark inside the 80% safe zone

import { chromium } from '@playwright/test'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { crc32, deflateSync } from 'node:zlib'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const BG = '#0C0C0C'
const svg = await readFile(resolve(root, 'design/favicon.svg'), 'utf8')
const dataUri = `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`

/**
 * Renders the mark at `markSize` centered on a `canvas` square filled with BG
 * and returns RGBA pixels. The maskable icon uses a smaller mark: the safe zone
 * is a circle with a radius of 40% of the icon, and the square mark must fit
 * inside that circle, so its side is at most 0.8 * 512 / sqrt(2) = 289.6 px.
 * 288 = 9 x 32 keeps every edge on the pixel grid.
 */
async function render(page, canvas, markSize = canvas) {
  const pixels = await page.evaluate(
    async ({ src, canvas, markSize, bg }) => {
      const img = new Image()
      img.src = src
      await img.decode()
      const c = document.createElement('canvas')
      c.width = canvas
      c.height = canvas
      const ctx = c.getContext('2d')
      ctx.imageSmoothingEnabled = false
      ctx.fillStyle = bg
      ctx.fillRect(0, 0, canvas, canvas)
      const offset = (canvas - markSize) / 2
      ctx.drawImage(img, offset, offset, markSize, markSize)
      return Array.from(ctx.getImageData(0, 0, canvas, canvas).data)
    },
    { src: dataUri, canvas, markSize, bg: BG },
  )
  return png(canvas, canvas, Buffer.from(pixels))
}

/** Minimal PNG encoder: 8-bit RGBA (color type 6), which ICO entries require. */
function png(width, height, rgba) {
  const chunk = (type, data) => {
    const len = Buffer.alloc(4)
    len.writeUInt32BE(data.length)
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
    const crc = Buffer.alloc(4)
    crc.writeUInt32BE(crc32(body))
    return Buffer.concat([len, body, crc])
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // RGBA
  const stride = width * 4
  const raw = Buffer.alloc((stride + 1) * height)
  for (let y = 0; y < height; y++) rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride)
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

/** Packs PNG images into an .ico container (PNG entries, supported since Windows Vista). */
function ico(images) {
  const header = Buffer.alloc(6)
  header.writeUInt16LE(0, 0)
  header.writeUInt16LE(1, 2)
  header.writeUInt16LE(images.length, 4)
  const entries = []
  let offset = 6 + 16 * images.length
  for (const { size, png } of images) {
    const e = Buffer.alloc(16)
    e.writeUInt8(size >= 256 ? 0 : size, 0)
    e.writeUInt8(size >= 256 ? 0 : size, 1)
    e.writeUInt8(0, 2)
    e.writeUInt8(0, 3)
    e.writeUInt16LE(1, 4)
    e.writeUInt16LE(32, 6)
    e.writeUInt32LE(png.length, 8)
    e.writeUInt32LE(offset, 12)
    entries.push(e)
    offset += png.length
  }
  return Buffer.concat([header, ...entries, ...images.map((i) => i.png)])
}

async function out(path, data) {
  const full = resolve(root, path)
  await mkdir(dirname(full), { recursive: true })
  await writeFile(full, data)
  console.log(`wrote ${path} (${data.length} bytes)`)
}

const browser = await chromium.launch()
try {
  const page = await browser.newPage({ deviceScaleFactor: 1 })
  const icoImages = []
  for (const size of [16, 32, 48]) icoImages.push({ size, png: await render(page, size) })
  await out('app/icon.svg', svg)
  await out('app/favicon.ico', ico(icoImages))
  await out('app/apple-icon.png', await render(page, 180))
  await out('public/icons/icon-192.png', await render(page, 192))
  await out('public/icons/icon-512.png', await render(page, 512))
  await out('public/icons/icon-maskable-512.png', await render(page, 512, 288))
} finally {
  await browser.close()
}
