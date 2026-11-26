// Integration tests for /api/watchlists (FR-05). Need a migrated PostgreSQL test database.
// Run: npm test (api folder). Test users use @watchlists-test.example and are removed afterwards.
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import process from 'node:process'
import { randomBytes, randomInt } from 'node:crypto'

process.env.JWT_SECRET ??= randomBytes(48).toString('base64')

const { default: app } = await import('../app.js')
const { pool } = await import('../models/db.js')

const DOMAIN = '@watchlists-test.example'
const PASSWORD = 'watchlists test password'
const run = randomBytes(3).toString('hex')
let server
let base
let movieId
let A
let B

const call = async (method, path, { body, token } = {}) => {
  const headers = { 'Content-Type': 'application/json' }
  if (token) headers.Authorization = `Bearer ${token}`
  const response = await fetch(base + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) })
  const text = await response.text()
  return { status: response.status, body: text ? JSON.parse(text) : null }
}

const newUser = async (name) => {
  const res = await call('POST', '/api/auth/register', {
    body: { email: `${name}-${run}${DOMAIN}`, nickname: `${name}_${run}`, password: PASSWORD },
  })
  assert.equal(res.status, 201)
  return { id: res.body.user.id, token: res.body.token }
}

const createList = async (user, name) => {
  const res = await call('POST', '/api/watchlists', { token: user.token, body: { name } })
  assert.equal(res.status, 201, JSON.stringify(res.body))
  return res.body.watchlist.id
}

before(async () => {
  server = app.listen(0)
  await new Promise((resolve) => server.once('listening', resolve))
  base = `http://127.0.0.1:${server.address().port}`
  movieId = (await pool.query(
    "INSERT INTO movies (tmdb_id, title, release_date) VALUES ($1, 'Watchlist Test Movie', DATE '1999-01-01') RETURNING id",
    [990000000 + randomInt(900000)],
  )).rows[0].id
  A = await newUser('wla')
  B = await newUser('wlb')
})

after(async () => {
  await pool.query('DELETE FROM users WHERE email LIKE $1', [`%${DOMAIN}`])
  await pool.query('DELETE FROM watchlist_movies WHERE movie_id = $1', [movieId])
  await pool.query('DELETE FROM movies WHERE id = $1', [movieId])
  await new Promise((resolve) => server.close(resolve))
  await pool.end()
})

test('lists require login', async () => {
  assert.equal((await call('GET', '/api/watchlists')).status, 401)
  assert.equal((await call('POST', '/api/watchlists', { body: { name: 'x' } })).status, 401)
})

test('create: name trimmed, 1-100 characters, unique per user (any letter case), user_id in body ignored', async () => {
  const res = await call('POST', '/api/watchlists', { token: A.token, body: { name: '  Viikonloppu  ', user_id: B.id } })
  assert.equal(res.status, 201)
  assert.equal(res.body.watchlist.name, 'Viikonloppu')
  assert.equal((await pool.query('SELECT user_id FROM watchlists WHERE id = $1', [res.body.watchlist.id])).rows[0].user_id, A.id)
  assert.equal((await call('POST', '/api/watchlists', { token: A.token, body: { name: 'VIIKONLOPPU' } })).status, 409)
  assert.equal((await call('POST', '/api/watchlists', { token: A.token, body: { name: '   ' } })).status, 400)
  assert.equal((await call('POST', '/api/watchlists', { token: A.token, body: { name: 'x'.repeat(101) } })).status, 400)
  assert.equal((await call('POST', '/api/watchlists', { token: B.token, body: { name: 'Viikonloppu' } })).status, 201)
})

test('add and remove movies; duplicates and unknown movies are refused', async () => {
  const listId = await createList(A, `Lista ${run}`)
  assert.equal((await call('POST', `/api/watchlists/${listId}/movies`, { token: A.token, body: { movie_id: movieId } })).status, 201)
  assert.equal((await call('POST', `/api/watchlists/${listId}/movies`, { token: A.token, body: { movie_id: String(movieId) } })).status, 409)
  assert.equal((await call('POST', `/api/watchlists/${listId}/movies`, { token: A.token, body: { movie_id: 2147483000 } })).status, 404)

  const view = await call('GET', `/api/watchlists/${listId}`, { token: A.token })
  assert.equal(view.status, 200)
  assert.equal(view.body.watchlist.movies.length, 1)
  const movie = view.body.watchlist.movies[0]
  assert.equal(movie.release_date, '1999-01-01', 'date as YYYY-MM-DD, no time zone shift')
  assert.equal(movie.created_at, undefined, 'only public movie fields')

  const lists = await call('GET', '/api/watchlists', { token: A.token })
  assert.equal(lists.body.watchlists.find((l) => l.id === listId).movie_count, 1)

  assert.equal((await call('DELETE', `/api/watchlists/${listId}/movies/${movieId}`, { token: A.token })).status, 204)
  assert.equal((await call('DELETE', `/api/watchlists/${listId}/movies/${movieId}`, { token: A.token })).status, 404)
})

test("another user cannot read, change or delete someone else's list", async () => {
  const listId = await createList(A, `Oma ${run}`)
  await call('POST', `/api/watchlists/${listId}/movies`, { token: A.token, body: { movie_id: movieId } })
  assert.equal((await call('GET', `/api/watchlists/${listId}`, { token: B.token })).status, 404)
  assert.equal((await call('POST', `/api/watchlists/${listId}/movies`, { token: B.token, body: { movie_id: movieId } })).status, 404)
  assert.equal((await call('DELETE', `/api/watchlists/${listId}/movies/${movieId}`, { token: B.token })).status, 404)
  assert.equal((await call('DELETE', `/api/watchlists/${listId}`, { token: B.token })).status, 404)
  const rows = (await pool.query('SELECT count(*)::int AS n FROM watchlist_movies WHERE watchlist_id = $1', [listId])).rows[0].n
  assert.equal(rows, 1)
})

test('invalid ids answer 400, never 500 (also values outside INTEGER)', async () => {
  const listId = await createList(A, `Idt ${run}`)
  for (const id of ['abc', '0', '1.5', '1e3', '-1', '99999999999']) {
    const res = await call('GET', `/api/watchlists/${id}`, { token: A.token })
    assert.equal(res.status, 400, `GET id ${id}`)
  }
  for (const movie of [99999999999, 'abc', 1.5, -1, null]) {
    const res = await call('POST', `/api/watchlists/${listId}/movies`, { token: A.token, body: { movie_id: movie } })
    assert.equal(res.status, 400, `movie_id ${JSON.stringify(movie)}`)
  }
  assert.equal((await call('DELETE', `/api/watchlists/${listId}/movies/99999999999`, { token: A.token })).status, 400)
})

test('deleting a list removes its movies but not the movie; deleting the account removes the lists', async () => {
  const listId = await createList(A, `Poisto ${run}`)
  await call('POST', `/api/watchlists/${listId}/movies`, { token: A.token, body: { movie_id: movieId } })
  assert.equal((await call('DELETE', `/api/watchlists/${listId}`, { token: A.token })).status, 204)
  assert.equal((await pool.query('SELECT count(*)::int AS n FROM watchlist_movies WHERE watchlist_id = $1', [listId])).rows[0].n, 0)
  assert.equal((await pool.query('SELECT count(*)::int AS n FROM movies WHERE id = $1', [movieId])).rows[0].n, 1)

  assert.equal((await call('DELETE', '/api/auth/me', { token: A.token, body: { password: PASSWORD } })).status, 204)
  assert.equal((await pool.query('SELECT count(*)::int AS n FROM watchlists WHERE user_id = $1', [A.id])).rows[0].n, 0)
  assert.equal((await call('GET', '/api/watchlists', { token: A.token })).status, 401)
})
