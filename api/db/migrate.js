// Minimal SQL migration runner for PostgreSQL.
//
// Commands (run from the api folder, see docs/tietokanta.md):
//   node db/migrate.js status   - list applied and pending migrations (read-only)
//   node db/migrate.js migrate  - apply pending migrations from db/migrations
//   node db/migrate.js seed     - load demo data from db/seeds (idempotent)
//   node db/migrate.js check    - run db/checks inside a transaction, always ROLLBACK
//
// Rules:
//   * Migration files are named NNN_description.sql and applied in order.
//   * Each migration runs in its own transaction together with its row in
//     schema_migrations, so it is applied completely or not at all.
//   * An applied migration is never re-run. If its file content changes,
//     the runner stops (checksum mismatch): write a new migration instead.
//   * Non-local databases (e.g. Azure) require --confirm=<DB_NAME>
//     for every command that writes.

import process from 'node:process'
import { readdir, readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import dotenv from 'dotenv'
import pkg from 'pg'

// Same .env as the application. Variables already set in the shell win.
dotenv.config({
  path: fileURLToPath(new URL('../../.env', import.meta.url)),
  quiet: true,
})

const { Client } = pkg

const MIGRATIONS_DIR = new URL('./migrations/', import.meta.url)
const SEEDS_DIR = new URL('./seeds/', import.meta.url)
const CHECKS_DIR = new URL('./checks/', import.meta.url)
const MIGRATION_FILE = /^(\d{3})_[a-z0-9_]+\.sql$/
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', 'database'])
// Arbitrary constant: prevents two runners from migrating at the same time.
const ADVISORY_LOCK_ID = 7421093

const USAGE = 'Usage: node db/migrate.js <status|migrate|seed|check> [--confirm=<DB_NAME>]'

const readSql = async (dirUrl, fileName) => {
  const raw = await readFile(new URL(fileName, dirUrl), 'utf8')
  // Normalise BOM and line endings so the checksum is the same on Windows,
  // macOS, Linux and inside Docker.
  const text = raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw
  return text.replace(/\r\n/g, '\n')
}

const checksumOf = (sql) => createHash('sha256').update(sql).digest('hex')

const listSqlFiles = async (dirUrl) => {
  const names = await readdir(dirUrl)
  return names.filter((name) => name.endsWith('.sql')).sort()
}

const loadMigrations = async () => {
  const names = await listSqlFiles(MIGRATIONS_DIR)
  const seenNumbers = new Set()
  const migrations = []

  for (const name of names) {
    const match = MIGRATION_FILE.exec(name)
    if (!match) {
      throw new Error(`Invalid migration file name "${name}" (expected NNN_description.sql)`)
    }
    if (seenNumbers.has(match[1])) {
      throw new Error(`Duplicate migration number ${match[1]}`)
    }
    seenNumbers.add(match[1])

    const sql = await readSql(MIGRATIONS_DIR, name)
    migrations.push({ version: name.replace(/\.sql$/, ''), sql, checksum: checksumOf(sql) })
  }

  return migrations
}

const getConfig = () => {
  const { DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD, DB_SSL } = process.env
  if (!DB_HOST || !DB_NAME || !DB_USER) {
    throw new Error('DB_HOST, DB_NAME and DB_USER must be set (.env or shell environment)')
  }
  return {
    host: DB_HOST,
    port: Number(DB_PORT || 5432),
    database: DB_NAME,
    user: DB_USER,
    password: DB_PASSWORD,
    ssl: DB_SSL === 'true' ? { rejectUnauthorized: true } : false,
    connectionTimeoutMillis: 10000,
    application_name: 'cinema-migrate',
  }
}

const requireConfirmation = (config, flags) => {
  if (LOCAL_HOSTS.has(config.host)) return
  const confirm = flags.find((flag) => flag.startsWith('--confirm='))?.slice('--confirm='.length)
  if (confirm !== config.database) {
    throw new Error(
      `Refusing to write to non-local database "${config.database}" on ${config.host}. ` +
      `Re-run with --confirm=${config.database} if this is intended.`,
    )
  }
}

const getApplied = async (client) => {
  const { rows } = await client.query(
    "SELECT to_regclass('public.schema_migrations') IS NOT NULL AS exists",
  )
  if (!rows[0].exists) return new Map()

  const result = await client.query(
    'SELECT version, checksum, applied_at FROM public.schema_migrations ORDER BY version',
  )
  return new Map(result.rows.map((row) => [row.version, row]))
}

// Compares files with history. Throws on modified or missing applied migrations.
const planMigrations = (migrations, applied) => {
  const known = new Set(migrations.map((m) => m.version))
  for (const version of applied.keys()) {
    if (!known.has(version)) {
      throw new Error(`Migration ${version} is recorded in the database but its file is missing`)
    }
  }

  const pending = []
  for (const migration of migrations) {
    const row = applied.get(migration.version)
    if (!row) {
      pending.push(migration)
    } else if (row.checksum !== migration.checksum) {
      throw new Error(
        `Migration ${migration.version} was changed after it was applied (checksum mismatch). ` +
        'Restore the original file and put the change in a new migration.',
      )
    }
  }
  return pending
}

const assertMigrated = async (client) => {
  const pending = planMigrations(await loadMigrations(), await getApplied(client))
  if (pending.length > 0) {
    throw new Error(`Pending migrations: ${pending.map((m) => m.version).join(', ')}. Run "migrate" first.`)
  }
}

const status = async (client) => {
  const migrations = await loadMigrations()
  const applied = await getApplied(client)
  const pending = new Set(planMigrations(migrations, applied).map((m) => m.version))

  for (const migration of migrations) {
    const row = applied.get(migration.version)
    console.log(pending.has(migration.version)
      ? `  pending  ${migration.version}`
      : `  applied  ${migration.version}  (${row.applied_at.toISOString()})`)
  }
  console.log(`${migrations.length - pending.size} applied, ${pending.size} pending`)
}

const migrate = async (client) => {
  await client.query('SELECT pg_advisory_lock($1)', [ADVISORY_LOCK_ID])
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS public.schema_migrations (
        version    TEXT PRIMARY KEY,
        checksum   TEXT        NOT NULL,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )`)

    const pending = planMigrations(await loadMigrations(), await getApplied(client))
    if (pending.length === 0) {
      console.log('Database is up to date, nothing to apply.')
      return
    }

    for (const migration of pending) {
      console.log(`Applying ${migration.version} ...`)
      await client.query('BEGIN')
      try {
        await client.query("SET LOCAL lock_timeout = '10s'")
        await client.query("SET LOCAL statement_timeout = '60s'")
        await client.query(migration.sql)
        await client.query(
          'INSERT INTO public.schema_migrations (version, checksum) VALUES ($1, $2)',
          [migration.version, migration.checksum],
        )
        await client.query('COMMIT')
      } catch (error) {
        await client.query('ROLLBACK')
        error.message = `${migration.version}: ${error.message}`
        throw error
      }
      console.log(`Applied  ${migration.version}`)
    }
  } finally {
    await client.query('SELECT pg_advisory_unlock($1)', [ADVISORY_LOCK_ID])
  }
}

const runFilesInTransaction = async (client, dirUrl, { rollback }) => {
  const names = await listSqlFiles(dirUrl)
  await client.query('BEGIN')
  try {
    for (const name of names) {
      console.log(`Running ${name} ...`)
      await client.query(await readSql(dirUrl, name))
    }
    await client.query(rollback ? 'ROLLBACK' : 'COMMIT')
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  }
}

const seed = async (client) => {
  await assertMigrated(client)
  await runFilesInTransaction(client, SEEDS_DIR, { rollback: false })

  const { rows } = await client.query(`
    SELECT 'users' AS table_name, count(*) AS rows FROM users
    UNION ALL SELECT 'movies', count(*) FROM movies
    UNION ALL SELECT 'genres', count(*) FROM genres
    UNION ALL SELECT 'reviews', count(*) FROM reviews
    UNION ALL SELECT 'watchlists', count(*) FROM watchlists
    UNION ALL SELECT 'groups', count(*) FROM groups
    UNION ALL SELECT 'group_members', count(*) FROM group_members`)
  console.table(rows)
}

const check = async (client) => {
  await assertMigrated(client)
  client.on('notice', (notice) => console.log(`  ${notice.message}`))
  await runFilesInTransaction(client, CHECKS_DIR, { rollback: true })
  console.log('All checks passed (changes rolled back).')
}

const COMMANDS = {
  status: { run: status, writes: false },
  migrate: { run: migrate, writes: true },
  seed: { run: seed, writes: true },
  check: { run: check, writes: true },
}

const main = async () => {
  const [commandName, ...flags] = process.argv.slice(2)
  const command = COMMANDS[commandName]
  if (!command) {
    console.error(USAGE)
    process.exitCode = 2
    return
  }

  const config = getConfig()
  console.log(
    `Target: ${config.user}@${config.host}:${config.port}/${config.database} ` +
    `(ssl ${config.ssl ? 'on' : 'off'})`,
  )
  if (command.writes) requireConfirmation(config, flags)

  const client = new Client(config)
  await client.connect()
  try {
    await command.run(client)
  } finally {
    await client.end()
  }
}

main().catch((error) => {
  console.error(`ERROR: ${error.message}`)
  if (error.detail) console.error(`DETAIL: ${error.detail}`)
  if (error.where) console.error(`WHERE: ${error.where}`)
  process.exitCode = 1
})
