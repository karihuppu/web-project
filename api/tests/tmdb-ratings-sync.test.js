// Tests for `tmdb:sync-movie-details --ratings-only` (refresh of tmdb_vote_average / tmdb_vote_count).
// A local HTTP server plays TMDB, so no real token or network is needed.
// Needs a migrated PostgreSQL test database (DB_* variables).
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { randomInt } from 'node:crypto'

const { pool } = await import('../models/db.js')
const { createTmdbClient } = await import('../services/tmdbClient.js')
const { syncMovieRatings } = await import('../services/movieDetailsSync.js')

const TOKEN = 'test-token-not-real'
const base = 970000000 + randomInt(900000) * 10
const ids = {
  changed: base, same: base + 1, fromNull: base + 2, badAverage: base + 3, badCount: base + 4,
  missing: base + 5, broken: base + 6, slow: base + 7, gone: base + 8,
}

// Database values before the run: [tmdb_vote_average, tmdb_vote_count]
const start = {
  changed: [7.1, 100], same: [8.2, 500], fromNull: [null, null], badAverage: [6.0, 10], badCount: [5.5, 20],
  missing: [4.4, 40], broken: [3.3, 30], slow: [2.2, 22], gone: [1.1, 11],
}

// TMDB answers per tmdb id
const answers = {
  [ids.changed]: { body: { vote_average: 7.46, vote_count: 1234, poster_path: '/new.jpg', overview: 'Uusi kuvaus' } },
  [ids.same]: { body: { vote_average: 8.2, vote_count: 500 } },
  [ids.fromNull]: { body: { vote_average: 0, vote_count: 0 } },
  [ids.badAverage]: { body: { vote_average: 11, vote_count: 99 } },
  [ids.badCount]: { body: { vote_average: 5.9, vote_count: 1.5 } },
  [ids.missing]: { body: { title: 'No ratings at all' } },
  [ids.broken]: { status: 500, body: { status_message: 'boom' } },
  [ids.slow]: { delay: 1500, body: { vote_average: 9.9, vote_count: 9 } },
  // ids.gone: 404
}

const seen = []
const server = http.createServer((req, res) => {
  const match = /^\/movie\/(\d+)\?language=([a-zA-Z-]+)$/.exec(req.url)
  seen.push({ url: req.url, auth: req.headers.authorization })
  if (req.headers.authorization !== `Bearer ${TOKEN}`) {
    res.writeHead(401).end()
    return
  }
  const answer = match && answers[match[1]]
  if (!answer) {
    res.writeHead(404, { 'Content-Type': 'application/json' }).end('{}')
    return
  }
  setTimeout(() => {
    if (res.destroyed) return
    res.writeHead(answer.status ?? 200, { 'Content-Type': 'application/json' }).end(JSON.stringify(answer.body))
  }, answer.delay ?? 0)
})

let tmdb
const allIds = Object.values(ids)
const rows = async () => {
  const { rows: list } = await pool.query(
    `SELECT tmdb_id, tmdb_vote_average::float8 AS avg, tmdb_vote_count AS cnt, poster_path, overview, tmdb_synced_at
     FROM movies WHERE tmdb_id = ANY($1::int[])`,
    [allIds],
  )
  return Object.fromEntries(list.map((r) => [Object.keys(ids).find((k) => ids[k] === r.tmdb_id), r]))
}
const run = (options = {}) => {
  const lines = []
  return syncMovieRatings({ db: pool, tmdb, onlyTmdbIds: allIds, log: (l) => lines.push(l), ...options })
    .then((summary) => ({ summary, lines }))
}
const lineFor = (lines, key) => lines.find((l) => l.includes(`(tmdb ${ids[key]})`))

before(async () => {
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  tmdb = createTmdbClient({ token: TOKEN, baseUrl: `http://127.0.0.1:${server.address().port}`, timeoutMs: 400 })
  for (const [key, [avg, cnt]] of Object.entries(start)) {
    await pool.query(
      `INSERT INTO movies (tmdb_id, title, tmdb_vote_average, tmdb_vote_count, poster_path, overview)
       VALUES ($1, $2, $3, $4, '/old.jpg', 'Vanha kuvaus')`,
      [ids[key], `Ratings ${key}`, avg, cnt],
    )
  }
})

after(async () => {
  await pool.query('DELETE FROM movies WHERE tmdb_id = ANY($1::int[])', [allIds])
  await new Promise((resolve) => server.close(resolve))
  await pool.end()
})

test('a rejected token (401) stops the run and writes nothing', async () => {
  const wrong = createTmdbClient({ token: 'eyJwrong.token.value', baseUrl: `http://127.0.0.1:${server.address().port}` })
  const beforeRun = await rows()
  await assert.rejects(
    syncMovieRatings({ db: pool, tmdb: wrong, onlyTmdbIds: allIds, log: () => {} }),
    (error) => error.kind === 'unauthorized',
  )
  assert.deepEqual(await rows(), beforeRun)
})

test('--dry-run shows old and new values for every movie and writes nothing', async () => {
  const beforeRun = await rows()
  const { summary, lines } = await run({ dryRun: true })
  assert.deepEqual(summary, { checked: 9, updated: 2, unchanged: 1, errors: 6 })
  assert.equal(lines.length, 9, 'one line per movie')
  assert.match(lineFor(lines, 'changed'), /would set .*: 7\.1 \/ 100 votes -> 7\.5 \/ 1234 votes$/)
  assert.match(lineFor(lines, 'fromNull'), /would set .*: null \/ null votes -> 0\.0 \/ 0 votes$/)
  assert.match(lineFor(lines, 'same'), /unchanged .*: 8\.2 \/ 500 votes$/)
  assert.match(lineFor(lines, 'badAverage'), /ERROR .*vote_average=11.*kept 6\.0 \/ 10 votes$/)
  assert.match(lineFor(lines, 'badCount'), /ERROR .*vote_count=1\.5.*kept 5\.5 \/ 20 votes$/)
  assert.match(lineFor(lines, 'missing'), /ERROR .*vote_average=undefined.*kept 4\.4 \/ 40 votes$/)
  assert.match(lineFor(lines, 'broken'), /ERROR .*HTTP 500.*kept 3\.3 \/ 30 votes$/)
  assert.match(lineFor(lines, 'slow'), /ERROR .*did not answer.*kept 2\.2 \/ 22 votes$/)
  assert.match(lineFor(lines, 'gone'), /ERROR .*no movie.*kept 1\.1 \/ 11 votes$/)
  assert.deepEqual(await rows(), beforeRun)
})

test('--only limits the run to the given tmdb ids', async () => {
  const { summary, lines } = await run({ dryRun: true, onlyTmdbIds: [ids.changed, ids.same] })
  assert.deepEqual(summary, { checked: 2, updated: 1, unchanged: 1, errors: 0 })
  assert.equal(lines.length, 2)
})

test('write: valid ratings are saved, errors and invalid values keep both old values, nothing else changes', async () => {
  const { summary } = await run()
  assert.deepEqual(summary, { checked: 9, updated: 2, unchanged: 1, errors: 6 })
  const after = await rows()

  assert.deepEqual([after.changed.avg, after.changed.cnt], [7.5, 1234], 'rounded like the import of new movies')
  assert.ok(after.changed.tmdb_synced_at)
  assert.deepEqual([after.fromNull.avg, after.fromNull.cnt], [0, 0])

  assert.deepEqual([after.same.avg, after.same.cnt], [8.2, 500])
  assert.equal(after.same.tmdb_synced_at, null, 'unchanged movie is not written')

  for (const key of ['badAverage', 'badCount', 'missing', 'broken', 'slow', 'gone']) {
    assert.deepEqual([after[key].avg, after[key].cnt], start[key], `${key}: old values kept`)
    assert.equal(after[key].tmdb_synced_at, null, `${key}: not written`)
  }
  // --ratings-only never touches posters or overviews, even when TMDB sends them.
  for (const row of Object.values(after)) {
    assert.equal(row.poster_path, '/old.jpg')
    assert.equal(row.overview, 'Vanha kuvaus')
  }
})

test('second run changes nothing (idempotent)', async () => {
  const beforeRun = await rows()
  const { summary } = await run()
  assert.equal(summary.updated, 0)
  assert.equal(summary.unchanged, 3)
  assert.deepEqual(await rows(), beforeRun)
})

test('only existing movies are read: no movie is inserted', async () => {
  const { summary } = await run({ dryRun: true, onlyTmdbIds: [base + 9] })
  assert.equal(summary.checked, 0)
  assert.equal((await pool.query('SELECT 1 FROM movies WHERE tmdb_id = $1', [base + 9])).rowCount, 0)
})

test('the token is sent as Bearer and never printed', async () => {
  seen.length = 0
  const { lines } = await run({ dryRun: true })
  assert.ok(seen.length > 0 && seen.every((s) => s.auth === `Bearer ${TOKEN}`))
  assert.ok(!lines.join('\n').includes(TOKEN))
})

test('command line: --ratings-only is accepted, remote write still needs --confirm, bad --only is refused', () => {
  const script = fileURLToPath(new URL('../scripts/tmdb-sync-movie-details.js', import.meta.url))
  const runCli = (args, env) =>
    spawnSync(process.execPath, [script, ...args], { env: { ...process.env, ...env }, encoding: 'utf8' })

  const remote = runCli(['--ratings-only'], { DB_HOST: 'example-db.postgres.database.azure.com', DB_NAME: 'cinema_db', TMDB_READ_TOKEN: TOKEN })
  assert.notEqual(remote.status, 0)
  assert.match(remote.stderr, /--confirm=cinema_db/)
  assert.match(remote.stdout, /Fields: tmdb_vote_average, tmdb_vote_count \(--ratings-only\)/)

  const noToken = runCli(['--ratings-only', '--dry-run'], { TMDB_READ_TOKEN: '' })
  assert.notEqual(noToken.status, 0)
  assert.doesNotMatch(noToken.stderr, /Unknown option/)
  assert.match(noToken.stderr, /TMDB_READ_TOKEN/)

  const badOnly = runCli(['--ratings-only', '--dry-run', '--only=99999999999'], {})
  assert.notEqual(badOnly.status, 0)
  assert.match(badOnly.stderr, /--only expects/)

  const typo = runCli(['--rating-only'], {})
  assert.match(typo.stderr, /Unknown option.*--ratings-only/)
})
