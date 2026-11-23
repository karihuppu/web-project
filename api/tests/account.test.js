// Integration tests for PATCH /api/auth/me (nickname) and DELETE /api/auth/me (account deletion).
// Need a migrated PostgreSQL database (DB_* variables), migrations 001-003. Run: npm test (api folder).
// Test data: users @account-test.example, movies tmdb_id >= 990000000; removed afterwards.
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import process from 'node:process'
import { randomBytes, randomInt } from 'node:crypto'
import jwt from 'jsonwebtoken'

process.env.JWT_SECRET ??= randomBytes(48).toString('base64')

const { default: app } = await import('../app.js')
const { pool } = await import('../models/db.js')

const DOMAIN = '@account-test.example'
const run = randomBytes(3).toString('hex')
const PASSWORD = 'account test password'

let server
let base
let movieId
const users = {} // name -> { id, token, email, nickname }

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
  const email = `${name}-${run}${DOMAIN}`
  const nickname = `${name}_${run}`
  const res = await call('POST', '/api/auth/register', { body: { email, nickname, password: PASSWORD } })
  assert.equal(res.status, 201)
  users[name] = { id: res.body.user.id, token: res.body.token, email, nickname }
}

const count = async (sql, params) => Number((await pool.query(sql, params)).rows[0].count)

before(async () => {
  server = app.listen(0)
  await new Promise((resolve) => server.once('listening', resolve))
  base = `http://127.0.0.1:${server.address().port}`

  const movie = await pool.query(
    "INSERT INTO movies (tmdb_id, title) VALUES ($1, 'Account Test Movie') RETURNING id",
    [990000000 + randomInt(1000000)],
  )
  movieId = movie.rows[0].id
  for (const name of ['anna', 'bert', 'cara', 'dave']) await register(name)
})

after(async () => {
  await pool.query('DELETE FROM reviews WHERE movie_id = $1', [movieId])
  await pool.query('DELETE FROM watchlist_movies WHERE movie_id = $1', [movieId])
  await pool.query('DELETE FROM users WHERE email LIKE $1', [`%${DOMAIN}`])
  await pool.query("DELETE FROM groups WHERE name LIKE $1", [`acct-${run}-%`])
  await pool.query('DELETE FROM movies WHERE id = $1', [movieId])
  await new Promise((resolve) => server.close(resolve))
  await pool.end()
})

// ---------- PATCH /api/auth/me ----------

test('nickname change requires a valid token', async () => {
  assert.equal((await call('PATCH', '/api/auth/me', { body: { nickname: 'whatever' } })).status, 401)
  assert.equal((await call('PATCH', '/api/auth/me', { body: { nickname: 'whatever' }, token: 'x.y.z' })).status, 401)
  const expired = jwt.sign({}, process.env.JWT_SECRET, { subject: String(users.anna.id), expiresIn: -10 })
  assert.equal((await call('PATCH', '/api/auth/me', { body: { nickname: 'whatever' }, token: expired })).status, 401)
})

test('invalid nickname -> 400 with fields.nickname', async () => {
  for (const nickname of ['ab', '  ab  ', 'x'.repeat(21), 123, null, undefined, ['abc']]) {
    const res = await call('PATCH', '/api/auth/me', { token: users.anna.token, body: { nickname } })
    assert.equal(res.status, 400, JSON.stringify(nickname))
    assert.ok(res.body.error.fields.nickname)
  }
})

test('change nickname: trimmed, only nickname changes, other fields and ids in body are ignored', async () => {
  const before = (await pool.query('SELECT email, password_hash, updated_at FROM users WHERE id = $1', [users.anna.id])).rows[0]
  const nickname = `Anni_${run}`
  const res = await call('PATCH', '/api/auth/me', {
    token: users.anna.token,
    body: { nickname: `  ${nickname} `, email: `evil-${run}${DOMAIN}`, id: users.bert.id, user_id: users.bert.id, password: 'x' },
  })
  assert.equal(res.status, 200)
  assert.deepEqual(Object.keys(res.body.user).sort(), ['created_at', 'email', 'id', 'nickname'])
  assert.equal(res.body.user.id, users.anna.id)
  assert.equal(res.body.user.nickname, nickname)

  const after = (await pool.query('SELECT email, password_hash, updated_at FROM users WHERE id = $1', [users.anna.id])).rows[0]
  assert.equal(after.email, before.email)
  assert.equal(after.password_hash, before.password_hash)
  assert.ok(after.updated_at > before.updated_at)

  const bert = (await pool.query('SELECT nickname FROM users WHERE id = $1', [users.bert.id])).rows[0]
  assert.equal(bert.nickname, users.bert.nickname)
  users.anna.nickname = nickname
})

test('saving the current nickname works and does not touch updated_at; letter-case change is allowed', async () => {
  const before = (await pool.query('SELECT updated_at FROM users WHERE id = $1', [users.anna.id])).rows[0].updated_at
  const same = await call('PATCH', '/api/auth/me', { token: users.anna.token, body: { nickname: users.anna.nickname } })
  assert.equal(same.status, 200)
  const unchanged = (await pool.query('SELECT updated_at FROM users WHERE id = $1', [users.anna.id])).rows[0].updated_at
  assert.equal(unchanged.getTime(), before.getTime())

  const upper = users.anna.nickname.toUpperCase()
  const caseOnly = await call('PATCH', '/api/auth/me', { token: users.anna.token, body: { nickname: upper } })
  assert.equal(caseOnly.status, 200)
  assert.equal(caseOnly.body.user.nickname, upper)
  users.anna.nickname = upper
})

test("someone else's nickname (any letter case) -> 409 with fields.nickname", async () => {
  const res = await call('PATCH', '/api/auth/me', { token: users.anna.token, body: { nickname: users.bert.nickname.toUpperCase() } })
  assert.equal(res.status, 409)
  assert.equal(res.body.error.fields.nickname, 'Nimimerkki on jo käytössä.')
})

test('new nickname is shown in public reviews (joined from users, not copied)', async () => {
  assert.equal((await call('POST', `/api/movies/${movieId}/reviews`, { token: users.anna.token, body: { rating: 4, comment: 'Ennen' } })).status, 201)
  const nickname = `Renamed_${run}`
  assert.equal((await call('PATCH', '/api/auth/me', { token: users.anna.token, body: { nickname } })).status, 200)
  const list = await call('GET', `/api/movies/${movieId}/reviews?limit=50`)
  const mine = list.body.items.find((r) => r.author?.id === users.anna.id)
  assert.equal(mine.author.nickname, nickname)
  users.anna.nickname = nickname
  const me = await call('GET', '/api/auth/me', { token: users.anna.token })
  assert.equal(me.body.user.nickname, nickname)
})

// ---------- DELETE /api/auth/me ----------

test('delete requires a token; body must contain the password', async () => {
  assert.equal((await call('DELETE', '/api/auth/me', { body: { password: PASSWORD } })).status, 401)
  for (const body of [{}, { password: '' }, { password: 12345678 }, undefined]) {
    const res = await call('DELETE', '/api/auth/me', { token: users.cara.token, body })
    assert.equal(res.status, 400, JSON.stringify(body))
    assert.ok(res.body.error.fields.password)
  }
})

test('wrong password -> 403, account and session stay', async () => {
  const res = await call('DELETE', '/api/auth/me', { token: users.cara.token, body: { password: 'wrong password!' } })
  assert.equal(res.status, 403)
  assert.ok(res.body.error.fields.password)
  assert.equal((await call('GET', '/api/auth/me', { token: users.cara.token })).status, 200)
})

test("ids in the body cannot select another account: own password deletes only the caller", async () => {
  // A throw-away user sends Cara's id/email with its own correct password:
  // the token decides the account, so only the throw-away user is deleted.
  await register('temp')
  const res = await call('DELETE', '/api/auth/me', {
    token: users.temp.token,
    body: { password: PASSWORD, id: users.cara.id, user_id: users.cara.id, email: users.cara.email },
  })
  assert.equal(res.status, 204)
  assert.equal(await count('SELECT count(*) FROM users WHERE id = $1', [users.temp.id]), 0)
  assert.equal(await count('SELECT count(*) FROM users WHERE id = $1', [users.cara.id]), 1)
})

test('deleting an account: lists and memberships go, ratings stay anonymous, groups get a new admin or vanish, others untouched', async () => {
  const { anna, bert, cara } = users

  // Watchlists: Anna's will be deleted, Bert's stays.
  const annaList = (await pool.query("INSERT INTO watchlists (user_id, name) VALUES ($1, 'Anna list') RETURNING id", [anna.id])).rows[0].id
  const bertList = (await pool.query("INSERT INTO watchlists (user_id, name) VALUES ($1, 'Bert list') RETURNING id", [bert.id])).rows[0].id
  await pool.query('INSERT INTO watchlist_movies (watchlist_id, movie_id) VALUES ($1, $3), ($2, $3)', [annaList, bertList, movieId])

  // Groups: A1 created by Anna (Bert joins later) -> Bert becomes admin.
  //         A2 only Anna -> deleted.
  //         B1 created by Bert, Anna member -> unchanged except Anna leaves.
  const group = async (name, creator) =>
    (await pool.query('INSERT INTO groups (name, created_by) VALUES ($1, $2) RETURNING id', [`acct-${run}-${name}`, creator])).rows[0].id
  const a1 = await group('a1', anna.id)
  const a2 = await group('a2', anna.id)
  const b1 = await group('b1', bert.id)
  await pool.query("INSERT INTO group_members (group_id, user_id, joined_at) VALUES ($1, $2, now() + interval '1 minute')", [a1, bert.id])
  await pool.query('INSERT INTO group_members (group_id, user_id) VALUES ($1, $2)', [b1, anna.id])

  // Reviews: Anna has one with a comment (from the nickname test); Bert writes one.
  assert.equal((await call('POST', `/api/movies/${movieId}/reviews`, { token: bert.token, body: { rating: 3, comment: 'Bert says' } })).status, 201)

  const res = await call('DELETE', '/api/auth/me', { token: anna.token, body: { password: PASSWORD } })
  assert.equal(res.status, 204)
  assert.equal(res.body, null)

  assert.equal(await count('SELECT count(*) FROM users WHERE id = $1', [anna.id]), 0)
  assert.equal(await count('SELECT count(*) FROM watchlists WHERE id = $1', [annaList]), 0)
  assert.equal(await count('SELECT count(*) FROM watchlist_movies WHERE watchlist_id = $1', [annaList]), 0)
  assert.equal(await count('SELECT count(*) FROM watchlist_movies WHERE watchlist_id = $1', [bertList]), 1)
  assert.equal(await count('SELECT count(*) FROM group_members WHERE user_id = $1', [anna.id]), 0)

  const reviews = (await pool.query('SELECT user_id, rating, comment, author_deleted_at FROM reviews WHERE movie_id = $1 ORDER BY id', [movieId])).rows
  const anonymous = reviews.filter((r) => r.user_id === null)
  assert.equal(anonymous.length, 1)
  assert.equal(anonymous[0].rating, 4)
  assert.equal(anonymous[0].comment, null)
  assert.ok(anonymous[0].author_deleted_at)
  assert.ok(reviews.some((r) => r.user_id === bert.id && r.comment === 'Bert says'))

  const role = async (g, u) => (await pool.query('SELECT role FROM group_members WHERE group_id = $1 AND user_id = $2', [g, u])).rows[0]?.role
  assert.equal(await role(a1, bert.id), 'admin')
  assert.equal(await count('SELECT count(*) FROM groups WHERE id = $1 AND created_by IS NULL', [a1]), 1)
  assert.equal(await count('SELECT count(*) FROM groups WHERE id = $1', [a2]), 0)
  assert.equal(await role(b1, bert.id), 'admin')
  assert.equal(await count('SELECT count(*) FROM group_members WHERE group_id = $1', [b1]), 1)

  const list = await call('GET', `/api/movies/${movieId}/reviews?limit=50`)
  const shown = list.body.items.find((r) => r.author === null)
  assert.equal(shown.comment, null)
  assert.equal(shown.rating, 4)

  assert.equal(await count('SELECT count(*) FROM users WHERE id = $1', [cara.id]), 1)
})

test('old token of a deleted account is refused everywhere; login fails', async () => {
  const { token, email } = users.anna
  assert.equal((await call('GET', '/api/auth/me', { token })).status, 401)
  assert.equal((await call('PATCH', '/api/auth/me', { token, body: { nickname: `ghost_${run}` } })).status, 401)
  assert.equal((await call('DELETE', '/api/auth/me', { token, body: { password: PASSWORD } })).status, 401)
  assert.equal((await call('GET', `/api/movies/${movieId}/review`, { token })).status, 401)
  assert.equal((await call('POST', `/api/movies/${movieId}/reviews`, { token, body: { rating: 5 } })).status, 401)
  assert.equal((await call('PUT', `/api/movies/${movieId}/review`, { token, body: { rating: 5 } })).status, 401)
  assert.equal((await call('DELETE', `/api/movies/${movieId}/review`, { token })).status, 401)
  assert.equal((await call('POST', '/api/auth/login', { body: { email, password: PASSWORD } })).status, 401)
  // The freed nickname and email can be used again.
  assert.equal((await call('POST', '/api/auth/register', { body: { email, nickname: users.anna.nickname, password: PASSWORD } })).status, 201)
})

test('a database failure in requireAuth is not reported as an invalid token', async () => {
  const original = pool.query.bind(pool)
  pool.query = async () => {
    throw Object.assign(new Error('simulated outage'), { code: '57P01' })
  }
  const originalError = console.error
  console.error = () => {}
  try {
    const res = await call('GET', '/api/auth/me', { token: users.dave.token })
    assert.equal(res.status, 500)
  } finally {
    pool.query = original
    console.error = originalError
  }
})
