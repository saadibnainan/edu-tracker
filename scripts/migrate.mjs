// Applies db/migrations/*.sql in name order, once each, in a transaction per file.
// Run: npm run db:migrate
// Uses DATABASE_URL_UNPOOLED when set (the Neon integration provides it), else DATABASE_URL.

import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import pg from 'pg'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
if (!process.env.DATABASE_URL && existsSync(resolve(root, '.env.local'))) process.loadEnvFile(resolve(root, '.env.local'))

const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL
if (!url) {
  console.error('Set DATABASE_URL (or DATABASE_URL_UNPOOLED) first.')
  process.exit(1)
}

const client = new pg.Client({ connectionString: url })
await client.connect()
try {
  await client.query('create table if not exists _migrations (name text primary key, applied_at timestamptz not null default now())')
  const done = new Set((await client.query('select name from _migrations')).rows.map((r) => r.name))
  const dir = resolve(root, 'db/migrations')
  const files = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()
  let applied = 0
  for (const file of files) {
    if (done.has(file)) continue
    const sql = readFileSync(resolve(dir, file), 'utf8')
    await client.query('begin')
    try {
      await client.query(sql)
      await client.query('insert into _migrations (name) values ($1)', [file])
      await client.query('commit')
      console.log(`applied ${file}`)
      applied++
    } catch (err) {
      await client.query('rollback')
      console.error(`failed ${file}: ${err.message}`)
      process.exitCode = 1
      break
    }
  }
  if (applied === 0 && !process.exitCode) console.log('database is up to date')
} finally {
  await client.end()
}
