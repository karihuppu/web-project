// Integration tests for writing reviews. They need a migrated PostgreSQL database (DB_* variables).
// Run from the api folder: npm test
// Test users use @reviews-test.example, test movies use tmdb_id >= 990000000; all are removed afterwards.
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import process from 'node:process'
import { randomBytes, randomInt } from 'node:crypto'
import jwt from 'jsonwebtoken'

process.env.JWT_SECRET ??= randomBytes(48).toString('base64')

const { default: app } = await import('../app.js')
const { pool } = await import('../models/db.js')

const DOMAIN = '@reviews-test.example'
const run = randomBytes(3).toString('hex')

let server
let base
let movieId
let otherMovieId
const users = {} // name -> { id, token }

const call = async (method, path, { body, token } = {}) => {
  const headers = { 'Content-Type': 'application/json' }
  if (token) headers.Authorization = `Bearer ${token}`
  const response = await fetch(base + path, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const text = await response.text()
  return { status: response.status, body: text ? JSON.parse(text) : null }
}

const register = async (name) => {
  const res = await call('POST', '/api/auth/register', {
    body: { email: `${name}-${run}${DOMAIN}`, nickname: `${name}_${run}`, password: 'review test password' },
  })
  assert.equal(res.status, 201)
  users[name] = { id: res.body.user.id, token: res.body.token }
}

const reviewCount = async (id) => (await call('GET', `/api/movies/${id}`)).body.review_count

before(async () => {
  server = app.listen(0)
  await new Promise((resolve) => server.once('listening', resolve))
  base = `http://127.0.0.1:${server.address().port}`

  const tmdb = 990000000 + randomInt(1000000)
  const movies = await pool.query(
    `INSERT INTO movies (tmdb_id, title) VALUES ($1, 'Review Test Movie'), ($2, 'Review Test Movie 2')
     RETURNING id`,
    [tmdb, tmdb + 1],
  )
  movieId = movies.rows[0].id
  otherMovieId = movies.rows[1].id

  await register('alice')
  await register('bob')
  await register('carol')
})

after(async () => {
  // Reviews first: movies with reviews cannot be deleted (RESTRICT).
  await pool.query('DELETE FROM reviews WHERE movie_id IN ($1, $2)', [movieId, otherMovieId])
  await pool.query('DELETE FROM movies WHERE id IN ($1, $2)', [movieId, otherMovieId])
  await pool.query('DELETE FROM users WHERE email LIKE $1', [`%${DOMAIN}`])
  await new Promise((resolve) => server.close(resolve))
  await pool.end()
})

test('writing requires a valid token (missing, malformed, expired)', async () => {
  const path = `/api/movies/${movieId}/reviews`
  assert.equal((await call('POST', path, { body: { rating: 4 } })).status, 401)
  assert.equal((await call('POST', path, { body: { rating: 4 }, token: 'not.a.token' })).status, 401)
  const expired = jwt.sign({}, process.env.JWT_SECRET, { subject: String(users.alice.id), expiresIn: -10 })
  assert.equal((await call('POST', path, { body: { rating: 4 }, token: expired })).status, 401)
  assert.equal((await call('PUT', `/api/movies/${movieId}/review`, { body: { rating: 4 } })).status, 401)
  assert.equal((await call('DELETE', `/api/movies/${movieId}/review`)).status, 401)
  assert.equal((await call('GET', `/api/movies/${movieId}/review`)).status, 401)
})

test('invalid rating, id, comment and unknown movie are rejected', async () => {
  const { token } = users.alice
  for (const rating of [0, 6, 3.5, '5', null, undefined, true]) {
    const res = await call('POST', `/api/movies/${movieId}/reviews`, { body: { rating }, token })
    assert.equal(res.status, 400, `rating ${JSON.stringify(rating)}`)
    assert.ok(res.body.error.fields.rating)
  }
  const long = await call('POST', `/api/movies/${movieId}/reviews`, { body: { rating: 4, comment: 'x'.repeat(2001) }, token })
  assert.equal(long.status, 400)
  assert.ok(long.body.error.fields.comment)
  const notText = await call('POST', `/api/movies/${movieId}/reviews`, { body: { rating: 4, comment: 42 }, token })
  assert.equal(notText.status, 400)

  assert.equal((await call('POST', '/api/movies/abc/reviews', { body: { rating: 4 }, token })).status, 400)
  assert.equal((await call('POST', '/api/movies/0/reviews', { body: { rating: 4 }, token })).status, 400)
  assert.equal((await call('POST', '/api/movies/2147483000/reviews', { body: { rating: 4 }, token })).status, 404)
  assert.equal((await call('GET', '/api/movies/2147483000/review', { token })).status, 404)

  assert.equal(await reviewCount(movieId), 0, 'nothing was stored')
})

test('GET own review before writing -> review: null', async () => {
  const res = await call('GET', `/api/movies/${movieId}/review`, { token: users.alice.token })
  assert.equal(res.status, 200)
  assert.deepEqual(res.body, { review: null })
})

test('create: 201, author from the token (user_id in body ignored), blank comment -> null', async () => {
  const res = await call('POST', `/api/movies/${movieId}/reviews`, {
    token: users.alice.token,
    body: { rating: 4, comment: '   ', user_id: users.bob.id, author: { id: users.bob.id } },
  })
  assert.equal(res.status, 201)
  assert.equal(res.body.rating, 4)
  assert.equal(res.body.comment, null)
  assert.equal(res.body.author.id, users.alice.id)
  assert.equal(res.body.author.email, undefined)
  assert.equal(res.body.author.password_hash, undefined)

  const { rows } = await pool.query('SELECT user_id, comment FROM reviews WHERE movie_id = $1', [movieId])
  assert.deepEqual(rows, [{ user_id: users.alice.id, comment: null }])
  assert.equal(await reviewCount(movieId), 1)
})

test('second create for the same movie -> 409, existing review untouched', async () => {
  const res = await call('POST', `/api/movies/${movieId}/reviews`, { token: users.alice.token, body: { rating: 1, comment: 'overwrite?' } })
  assert.equal(res.status, 409)
  const own = await call('GET', `/api/movies/${movieId}/review`, { token: users.alice.token })
  assert.equal(own.body.review.rating, 4)
  assert.equal(own.body.review.comment, null)
})

test('update own review: trims comment, accepts exactly 2000 characters, bumps updated_at', async () => {
  const before = (await call('GET', `/api/movies/${movieId}/review`, { token: users.alice.token })).body.review
  const res = await call('PUT', `/api/movies/${movieId}/review`, {
    token: users.alice.token,
    body: { rating: 5, comment: '  Hieno elokuva!  ' },
  })
  assert.equal(res.status, 200)
  assert.equal(res.body.rating, 5)
  assert.equal(res.body.comment, 'Hieno elokuva!')
  assert.ok(new Date(res.body.updated_at) > new Date(before.updated_at))

  const max = await call('PUT', `/api/movies/${movieId}/review`, { token: users.alice.token, body: { rating: 5, comment: 'ä'.repeat(2000) } })
  assert.equal(max.status, 200)
  assert.equal(max.body.comment.length, 2000)
})

test('nobody can change or delete someone else\'s review', async () => {
  // Bob has no review on this movie: his PUT/DELETE only target his own row -> 404.
  const put = await call('PUT', `/api/movies/${movieId}/review`, {
    token: users.bob.token,
    body: { rating: 1, comment: 'hijack', user_id: users.alice.id },
  })
  assert.equal(put.status, 404)
  assert.equal((await call('DELETE', `/api/movies/${movieId}/review`, { token: users.bob.token })).status, 404)

  const own = await call('GET', `/api/movies/${movieId}/review`, { token: users.alice.token })
  assert.equal(own.body.review.rating, 5)
  assert.equal(await reviewCount(movieId), 1)
})

test('own review is found even when it is not on the first public page', async () => {
  // Bob writes later -> newest first -> Bob on page 1, Alice on page 2 (limit=1).
  assert.equal((await call('POST', `/api/movies/${movieId}/reviews`, { token: users.bob.token, body: { rating: 2 } })).status, 201)
  const page1 = await call('GET', `/api/movies/${movieId}/reviews?limit=1&offset=0`)
  assert.equal(page1.body.items[0].author.id, users.bob.id)

  const own = await call('GET', `/api/movies/${movieId}/review`, { token: users.alice.token })
  assert.equal(own.body.review.author.id, users.alice.id)
  assert.equal(await reviewCount(movieId), 2)
})

test('reviews of different movies are independent', async () => {
  const other = await call('GET', `/api/movies/${otherMovieId}/review`, { token: users.alice.token })
  assert.deepEqual(other.body, { review: null })
  assert.equal((await call('PUT', `/api/movies/${otherMovieId}/review`, { token: users.alice.token, body: { rating: 3 } })).status, 404)
})

test('delete own review: 204, count drops, second delete -> 404, can write again', async () => {
  const del = await call('DELETE', `/api/movies/${movieId}/review`, { token: users.alice.token })
  assert.equal(del.status, 204)
  assert.equal(await reviewCount(movieId), 1)
  assert.deepEqual((await call('GET', `/api/movies/${movieId}/review`, { token: users.alice.token })).body, { review: null })
  assert.equal((await call('DELETE', `/api/movies/${movieId}/review`, { token: users.alice.token })).status, 404)
  assert.equal((await call('POST', `/api/movies/${movieId}/reviews`, { token: users.alice.token, body: { rating: 3 } })).status, 201)
})

test('deleted account: review stays anonymous in the public list, old token cannot write', async () => {
  const { token, id } = users.carol
  assert.equal((await call('POST', `/api/movies/${movieId}/reviews`, { token, body: { rating: 5, comment: 'Carol was here' } })).status, 201)
  await pool.query('DELETE FROM users WHERE id = $1', [id])

  const list = await call('GET', `/api/movies/${movieId}/reviews?limit=50`)
  const anonymous = list.body.items.filter((r) => r.author === null)
  assert.equal(anonymous.length, 1)
  assert.equal(anonymous[0].comment, null)

  const res = await call('POST', `/api/movies/${otherMovieId}/reviews`, { token, body: { rating: 4 } })
  assert.equal(res.status, 401)
})
