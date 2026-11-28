// Tests for TMDB search, external movie details and adding a TMDB movie to a list.
// A local HTTP server plays TMDB, so no real token or network is needed.
// Needs a migrated PostgreSQL test database (DB_* variables). Test users use @tmdb-search-test.example.
import { test, before, after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import process from 'node:process'
import { randomBytes, randomInt } from 'node:crypto'

process.env.JWT_SECRET ??= randomBytes(48).toString('base64')

const { default: app } = await import('../app.js')
const { pool } = await import('../models/db.js')
const { createTmdbClient } = await import('../services/tmdbClient.js')
const { setTmdbClient, clearTmdbCache } = await import('../services/tmdbMovies.js')

const DOMAIN = '@tmdb-search-test.example'
const PASSWORD = 'tmdb search test password'
const TOKEN = 'test-token-not-real'
const run = randomBytes(3).toString('hex')
const base = 980000000 + randomInt(900000) * 10
const ids = { local: base, external: base + 1, englishOnly: base + 2, race: base + 3, adult: base + 4, broken: base + 5 }

// The movie that is already in our database (with a review), and a genre we know.
let localMovieId
let actionGenreId

const details = {
  [`${ids.external}:fi-FI`]: {
    id: ids.external, title: 'Ulkoinen elokuva', original_title: 'External Movie', overview: 'Suomenkielinen kuvaus.',
    release_date: '2021-05-07', runtime: 118, poster_path: '/external.jpg', backdrop_path: '/external-bd.jpg',
    vote_average: 7.46, vote_count: 1234, adult: false, genres: [{ id: 28, name: 'Toiminta' }, { id: 999999, name: 'Tuntematon' }],
  },
  [`${ids.englishOnly}:fi-FI`]: {
    id: ids.englishOnly, title: 'English Only', original_title: 'English Only', overview: '', release_date: '',
    runtime: 0, poster_path: 'https://evil.example/x.jpg', vote_average: 11, vote_count: -1, adult: false, genres: [],
  },
  [`${ids.englishOnly}:en-US`]: { id: ids.englishOnly, title: 'English Only', overview: 'English overview.' },
  [`${ids.race}:fi-FI`]: { id: ids.race, title: 'Kilpajuoksu', original_title: 'Race', overview: 'Rinnakkain.', genres: [] },
  [`${ids.adult}:fi-FI`]: { id: ids.adult, title: 'Aikuisille', adult: true },
}

const searchResults = (language) => [
  { id: ids.local, title: 'Matrix Testi', original_title: 'Matrix Test', overview: 'Paikallinen.', poster_path: '/local.jpg', release_date: '1999-03-31', vote_average: 8.2, vote_count: 100, adult: false },
  { id: ids.external, title: 'Ulkoinen elokuva', original_title: 'External Movie', overview: 'Suomenkielinen kuvaus.', poster_path: '/external.jpg', release_date: '2021-05-07', vote_average: 7.46, vote_count: 1234, adult: false },
  { id: ids.englishOnly, title: 'English Only', overview: language === 'en-US' ? 'English overview.' : '', poster_path: null, release_date: '', adult: false },
  { id: ids.adult, title: 'Aikuisille', overview: 'x', adult: true },
]

let tmdbDown = false
let detailDelay = 0
const seen = []
const tmdbServer = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://mock')
  seen.push({ path: url.pathname, params: Object.fromEntries(url.searchParams), auth: req.headers.authorization })
  if (tmdbDown) {
    res.writeHead(500, { 'Content-Type': 'application/json' }).end('{"status_message":"down"}')
    return
  }
  if (req.headers.authorization !== `Bearer ${TOKEN}`) {
    res.writeHead(401).end()
    return
  }
  const language = url.searchParams.get('language')
  if (url.pathname === '/search/movie') {
    const query = (url.searchParams.get('query') || '').toLowerCase()
    // Partial match like TMDB: "ulkoi" finds "Ulkoinen elokuva".
    const results = searchResults(language).filter((m) => m.title.toLowerCase().includes(query) || query === 'kaikki')
    res.writeHead(200, { 'Content-Type': 'application/json' })
      .end(JSON.stringify({ page: Number(url.searchParams.get('page')), results, total_pages: 1, total_results: results.length }))
    return
  }
  const match = /^\/movie\/(\d+)$/.exec(url.pathname)
  const answer = match && details[`${match[1]}:${language}`]
  if (!answer) {
    res.writeHead(404, { 'Content-Type': 'application/json' }).end('{}')
    return
  }
  setTimeout(() => res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify(answer)), detailDelay)
})

let server
let apiBase
let A
let B

const call = async (method, path, { body, token } = {}) => {
  const headers = { 'Content-Type': 'application/json' }
  if (token) headers.Authorization = `Bearer ${token}`
  const response = await fetch(apiBase + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) })
  const text = await response.text()
  return { status: response.status, body: text ? JSON.parse(text) : null }
}
const newUser = async (name) => {
  const res = await call('POST', '/api/auth/register', {
    body: { email: `${name}-${run}${DOMAIN}`, nickname: `${name}_${run}`, password: PASSWORD },
  })
  assert.equal(res.status, 201)
  return { id: res.body.user.id, token: res.body.token, nickname: `${name}_${run}` }
}
const createList = async (user, name) => {
  const res = await call('POST', '/api/watchlists', { token: user.token, body: { name } })
  assert.equal(res.status, 201, JSON.stringify(res.body))
  return res.body.watchlist.id
}
const movieRows = async (tmdbId) => (await pool.query('SELECT * FROM movies WHERE tmdb_id = $1', [tmdbId])).rows

before(async () => {
  await new Promise((resolve) => tmdbServer.listen(0, '127.0.0.1', resolve))
  setTmdbClient(createTmdbClient({ token: TOKEN, baseUrl: `http://127.0.0.1:${tmdbServer.address().port}`, timeoutMs: 2000 }))
  server = app.listen(0)
  await new Promise((resolve) => server.once('listening', resolve))
  apiBase = `http://127.0.0.1:${server.address().port}`
  A = await newUser('tsa')
  B = await newUser('tsb')
  localMovieId = (await pool.query(
    "INSERT INTO movies (tmdb_id, title, overview) VALUES ($1, 'Matrix Testi', 'Paikallinen.') RETURNING id",
    [ids.local],
  )).rows[0].id
  await pool.query('INSERT INTO reviews (user_id, movie_id, rating, comment) VALUES ($1, $2, 5, $3)', [A.id, localMovieId, 'Hyvä!'])
  actionGenreId = (await pool.query(
    "INSERT INTO genres (tmdb_id, name) VALUES (28, 'Action') ON CONFLICT (tmdb_id) DO UPDATE SET tmdb_id = EXCLUDED.tmdb_id RETURNING id",
  )).rows[0].id
})

beforeEach(() => {
  tmdbDown = false
  detailDelay = 0
  clearTmdbCache()
})

after(async () => {
  setTmdbClient(null)
  const all = Object.values(ids)
  await pool.query('DELETE FROM users WHERE email LIKE $1', [`%${DOMAIN}`])
  await pool.query('DELETE FROM watchlist_movies WHERE movie_id IN (SELECT id FROM movies WHERE tmdb_id = ANY($1::int[]))', [all])
  await pool.query('DELETE FROM reviews WHERE movie_id IN (SELECT id FROM movies WHERE tmdb_id = ANY($1::int[]))', [all])
  await pool.query('DELETE FROM movies WHERE tmdb_id = ANY($1::int[])', [all])
  await new Promise((resolve) => server.close(resolve))
  await new Promise((resolve) => tmdbServer.close(resolve))
  await pool.end()
})

test('search by full and partial title goes through the server with the bearer token', async () => {
  seen.length = 0
  const full = await call('GET', `/api/tmdb/search?q=${encodeURIComponent('Ulkoinen elokuva')}`)
  assert.equal(full.status, 200)
  assert.deepEqual(full.body.items.map((m) => m.tmdb_id), [ids.external])

  const partial = await call('GET', '/api/tmdb/search?q=ulkoi')
  assert.equal(partial.status, 200)
  assert.equal(partial.body.items[0].title, 'Ulkoinen elokuva')
  assert.equal(partial.body.items[0].local_id, null)
  assert.equal(partial.body.page, 1)

  const request = seen.find((s) => s.path === '/search/movie')
  assert.equal(request.auth, `Bearer ${TOKEN}`)
  assert.equal(request.params.language, 'fi-FI')
  assert.equal(request.params.include_adult, 'false')
  // The token is never in the response.
  assert.ok(!JSON.stringify(partial.body).includes(TOKEN))
})

test('search marks movies that are already ours, drops adult titles and falls back to English overviews', async () => {
  const res = await call('GET', '/api/tmdb/search?q=kaikki&page=1')
  assert.equal(res.status, 200)
  const byId = Object.fromEntries(res.body.items.map((m) => [m.tmdb_id, m]))
  assert.equal(byId[ids.local].local_id, localMovieId)
  assert.equal(byId[ids.adult], undefined)
  assert.equal(byId[ids.englishOnly].overview, 'English overview.')
  assert.equal(byId[ids.englishOnly].overview_language, 'en')
  assert.equal(byId[ids.englishOnly].release_date, null)
  assert.equal(byId[ids.external].tmdb_vote_average, 7.5)
})

test('search validates q and page', async () => {
  assert.equal((await call('GET', '/api/tmdb/search')).status, 400)
  assert.equal((await call('GET', '/api/tmdb/search?q=%20%20')).status, 400)
  assert.equal((await call('GET', `/api/tmdb/search?q=${'a'.repeat(101)}`)).status, 400)
  assert.equal((await call('GET', '/api/tmdb/search?q=a&page=0')).status, 400)
  assert.equal((await call('GET', '/api/tmdb/search?q=a&page=501')).status, 400)
  assert.equal((await call('GET', '/api/tmdb/search?q=a&page=99999999999')).status, 400)
})

test('TMDB down: search answers 503 in Finnish, our catalogue keeps working', async () => {
  tmdbDown = true
  const res = await call('GET', '/api/tmdb/search?q=ulkoi')
  assert.equal(res.status, 503)
  assert.match(res.body.error.message, /ei ole juuri nyt käytettävissä/)
  assert.equal((await call('GET', `/api/tmdb/movies/${ids.external}`)).status, 503)

  const catalogue = await call('GET', '/api/movies?q=Matrix%20Testi')
  assert.equal(catalogue.status, 200)
  assert.ok(catalogue.body.items.some((m) => m.id === localMovieId))
  // A local movie opens without TMDB.
  assert.deepEqual((await call('GET', `/api/tmdb/movies/${ids.local}`)).body, { tmdb_id: ids.local, local_id: localMovieId })
  assert.equal((await call('GET', `/api/movies/${localMovieId}`)).body.review_count, 1)
})

test('external movie details: Finnish texts, English fallback, invalid values dropped, 404s', async () => {
  const ext = await call('GET', `/api/tmdb/movies/${ids.external}`)
  assert.equal(ext.status, 200)
  assert.equal(ext.body.local_id, null)
  assert.equal(ext.body.title, 'Ulkoinen elokuva')
  assert.equal(ext.body.overview, 'Suomenkielinen kuvaus.')
  assert.equal(ext.body.runtime_minutes, 118)
  assert.deepEqual(ext.body.genres.map((g) => g.name), ['Toiminta', 'Tuntematon'])

  const en = await call('GET', `/api/tmdb/movies/${ids.englishOnly}`)
  assert.equal(en.body.overview, 'English overview.')
  assert.equal(en.body.poster_path, null)
  assert.equal(en.body.runtime_minutes, null)
  assert.equal(en.body.tmdb_vote_average, null)
  assert.equal(en.body.tmdb_vote_count, null)

  assert.equal((await call('GET', `/api/tmdb/movies/${ids.adult}`)).status, 404)
  assert.equal((await call('GET', `/api/tmdb/movies/${ids.broken}`)).status, 404)
  assert.equal((await call('GET', '/api/tmdb/movies/abc')).status, 400)
  assert.equal((await call('GET', '/api/tmdb/movies/99999999999')).status, 400)
})

test('adding an external movie imports it once, with genres, and links it to the list', async () => {
  const list = await createList(A, 'TMDB-lista')
  const added = await call('POST', `/api/watchlists/${list}/movies`, { token: A.token, body: { tmdb_id: ids.external } })
  assert.equal(added.status, 201, JSON.stringify(added.body))
  assert.equal(added.body.imported, true)

  const rows = await movieRows(ids.external)
  assert.equal(rows.length, 1)
  assert.equal(added.body.movie_id, rows[0].id)
  assert.equal(rows[0].title, 'Ulkoinen elokuva')
  assert.equal(rows[0].poster_path, '/external.jpg')
  assert.ok(rows[0].tmdb_synced_at)
  const genres = (await pool.query('SELECT genre_id FROM movie_genres WHERE movie_id = $1', [rows[0].id])).rows
  assert.deepEqual(genres.map((g) => g.genre_id), [actionGenreId])

  // Now part of our catalogue: search marks it, the genre filter finds it, the list shows it.
  const search = await call('GET', '/api/tmdb/search?q=ulkoi')
  assert.equal(search.body.items[0].local_id, rows[0].id)
  const byGenre = await call('GET', `/api/movies?genre=${actionGenreId}&q=Ulkoinen`)
  assert.ok(byGenre.body.items.some((m) => m.id === rows[0].id))
  const shown = await call('GET', `/api/watchlists/${list}`, { token: A.token })
  assert.deepEqual(shown.body.watchlist.movies.map((m) => m.tmdb_id), [ids.external])

  // Again: 409, nothing new.
  const again = await call('POST', `/api/watchlists/${list}/movies`, { token: A.token, body: { tmdb_id: ids.external } })
  assert.equal(again.status, 409)
  assert.equal(again.body.movie_id, rows[0].id)
  assert.equal((await movieRows(ids.external)).length, 1)

  // Second list of another user: no TMDB request, the existing row is reused.
  seen.length = 0
  const otherList = await createList(B, 'Toinen')
  const reused = await call('POST', `/api/watchlists/${otherList}/movies`, { token: B.token, body: { tmdb_id: ids.external } })
  assert.equal(reused.status, 201)
  assert.equal(reused.body.imported, false)
  assert.equal(seen.length, 0)
})

test('adding a movie that is ours by tmdb_id works even when TMDB is down', async () => {
  tmdbDown = true
  const list = await createList(A, 'Ilman TMDB:tä')
  const res = await call('POST', `/api/watchlists/${list}/movies`, { token: A.token, body: { tmdb_id: ids.local } })
  assert.equal(res.status, 201)
  assert.equal(res.body.movie_id, localMovieId)
})

test("someone else's list, missing list, bad input and TMDB errors are refused without importing", async () => {
  const bList = await createList(B, 'Bn lista')
  seen.length = 0
  const foreign = await call('POST', `/api/watchlists/${bList}/movies`, { token: A.token, body: { tmdb_id: ids.race } })
  assert.equal(foreign.status, 404)
  assert.equal(seen.length, 0, 'no TMDB request for a list that is not yours')
  assert.equal((await movieRows(ids.race)).length, 0)

  const aList = await createList(A, 'Virheet')
  const post = (body, token = A.token) => call('POST', `/api/watchlists/${aList}/movies`, { token, body })
  assert.equal((await call('POST', `/api/watchlists/${aList}/movies`, { body: { tmdb_id: ids.race } })).status, 401)
  assert.equal((await post({ tmdb_id: 'abc' })).status, 400)
  assert.equal((await post({ tmdb_id: 99999999999 })).status, 400)
  assert.equal((await post({ tmdb_id: ids.race, movie_id: localMovieId })).status, 400)
  assert.equal((await call('POST', '/api/watchlists/99999999999/movies', { token: A.token, body: { tmdb_id: ids.race } })).status, 400)
  assert.equal((await post({ tmdb_id: ids.adult })).status, 404)
  assert.equal((await post({ tmdb_id: ids.broken })).status, 404)
  assert.equal((await movieRows(ids.broken)).length, 0)

  tmdbDown = true
  const down = await post({ tmdb_id: ids.englishOnly })
  assert.equal(down.status, 503)
  assert.match(down.body.error.message, /TMDB/)
  assert.equal((await movieRows(ids.englishOnly)).length, 0)
})

test('parallel adds: one movies row, one list entry per list', async () => {
  await pool.query('DELETE FROM watchlist_movies WHERE movie_id IN (SELECT id FROM movies WHERE tmdb_id = $1)', [ids.race])
  await pool.query('DELETE FROM movies WHERE tmdb_id = $1', [ids.race])
  detailDelay = 150 // every request has fetched the details before any transaction starts
  const sameList = await createList(A, 'Rinnakkain A')
  const otherList = await createList(B, 'Rinnakkain B')
  const requests = [
    ...Array.from({ length: 4 }, () => call('POST', `/api/watchlists/${sameList}/movies`, { token: A.token, body: { tmdb_id: ids.race } })),
    ...Array.from({ length: 2 }, () => call('POST', `/api/watchlists/${otherList}/movies`, { token: B.token, body: { tmdb_id: ids.race } })),
  ]
  const results = await Promise.all(requests)
  const statuses = results.map((r) => r.status)
  assert.deepEqual(statuses.slice(0, 4).sort(), [201, 409, 409, 409])
  assert.deepEqual(statuses.slice(4).sort(), [201, 409])
  assert.equal((await movieRows(ids.race)).length, 1)
  const links = (await pool.query(
    'SELECT watchlist_id FROM watchlist_movies wm JOIN movies m ON m.id = wm.movie_id WHERE m.tmdb_id = $1 ORDER BY 1',
    [ids.race],
  )).rows.map((r) => r.watchlist_id)
  assert.deepEqual(links, [sameList, otherList].sort((x, y) => x - y))
  assert.equal(results.filter((r) => r.body?.imported === true).length, 1)
})

test('an imported movie in a shared list follows the existing group rules', async () => {
  const list = await createList(A, 'Jaettu TMDB')
  assert.equal((await call('POST', `/api/watchlists/${list}/movies`, { token: A.token, body: { tmdb_id: ids.external } })).status, 201)
  const make = async (visibility) => {
    const res = await call('POST', '/api/groups', { token: A.token, body: { name: `TS ${run} ${visibility}`, visibility } })
    assert.equal(res.status, 201, JSON.stringify(res.body))
    return res.body.group.id
  }
  const pub = await make('public')
  const priv = await make('private')
  for (const group of [pub, priv]) {
    assert.equal((await call('POST', `/api/watchlists/${list}/shares`, { token: A.token, body: { group_id: group } })).status, 201)
  }
  const guestPublic = await call('GET', `/api/groups/${pub}/watchlists/${list}`)
  assert.equal(guestPublic.status, 200)
  assert.deepEqual(guestPublic.body.watchlist.movies.map((m) => m.tmdb_id), [ids.external])
  assert.equal((await call('GET', `/api/groups/${priv}/watchlists/${list}`)).status, 404)
  assert.equal((await call('GET', `/api/groups/${priv}/watchlists/${list}`, { token: B.token })).status, 404)
  assert.equal((await call('GET', `/api/groups/${priv}/watchlists/${list}`, { token: A.token })).status, 200)
})
