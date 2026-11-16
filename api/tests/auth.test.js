// Integration tests for /api/auth. They need a migrated PostgreSQL database (DB_* variables).
// Run from the api folder: npm test
// Test users use the domain @auth-test.example and are deleted afterwards.
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import process from 'node:process'
import { randomBytes } from 'node:crypto'
import jwt from 'jsonwebtoken'

process.env.JWT_SECRET ??= randomBytes(48).toString('base64')

const { default: app } = await import('../app.js')
const { pool } = await import('../models/db.js')

const DOMAIN = '@auth-test.example'
const run = randomBytes(3).toString('hex')
const email = `user-${run}${DOMAIN}`
const nickname = `tester_${run}`
const password = 'correct horse battery'

let server
let base

const call = async (method, path, body, headers = {}) => {
  const response = await fetch(base + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const text = await response.text()
  return { status: response.status, body: text ? JSON.parse(text) : null }
}

before(async () => {
  server = app.listen(0)
  await new Promise((resolve) => server.once('listening', resolve))
  base = `http://127.0.0.1:${server.address().port}`
})

after(async () => {
  await pool.query('DELETE FROM users WHERE email LIKE $1', [`%${DOMAIN}`])
  await new Promise((resolve) => server.close(resolve))
  await pool.end()
})

test('register creates an account, returns a token and stores only a bcrypt hash', async () => {
  const res = await call('POST', '/api/auth/register', { email: `  ${email.toUpperCase()} `, nickname: ` ${nickname} `, password })
  assert.equal(res.status, 201)
  assert.equal(typeof res.body.token, 'string')
  assert.deepEqual(Object.keys(res.body.user).sort(), ['created_at', 'email', 'id', 'nickname'])
  assert.equal(res.body.user.email, email) // trimmed and lower-cased
  assert.equal(res.body.user.nickname, nickname) // trimmed

  const { rows } = await pool.query('SELECT password_hash FROM users WHERE email = $1', [email])
  assert.match(rows[0].password_hash, /^\$2[aby]\$10\$/)
  assert.notEqual(rows[0].password_hash, password)
})

test('duplicate email (other letter case) -> 409 with field email', async () => {
  const res = await call('POST', '/api/auth/register', { email: email.toUpperCase(), nickname: `other_${run}`, password })
  assert.equal(res.status, 409)
  assert.equal(res.body.error.fields.email, 'Tällä sähköpostilla on jo tili.')
})

test('duplicate nickname (other letter case) -> 409 with field nickname', async () => {
  const res = await call('POST', '/api/auth/register', { email: `second-${run}${DOMAIN}`, nickname: nickname.toUpperCase(), password })
  assert.equal(res.status, 409)
  assert.equal(res.body.error.fields.nickname, 'Nimimerkki on jo käytössä.')
})

test('invalid registration data -> 400 with field messages, nothing stored', async () => {
  const res = await call('POST', '/api/auth/register', { email: 'not-an-email', nickname: 'ab', password: 'short' })
  assert.equal(res.status, 400)
  assert.deepEqual(Object.keys(res.body.error.fields).sort(), ['email', 'nickname', 'password'])

  const tooLong = await call('POST', '/api/auth/register', {
    email: `long-${run}${DOMAIN}`, nickname: `long_${run}`, password: 'ä'.repeat(40), // 80 bytes
  })
  assert.equal(tooLong.status, 400)
  assert.ok(tooLong.body.error.fields.password)

  const longNick = await call('POST', '/api/auth/register', { email: `nick-${run}${DOMAIN}`, nickname: 'x'.repeat(21), password })
  assert.equal(longNick.status, 400)
  assert.ok(longNick.body.error.fields.nickname)
})

test('login: wrong password and unknown email give the same 401', async () => {
  const wrong = await call('POST', '/api/auth/login', { email, password: 'wrong password' })
  const unknown = await call('POST', '/api/auth/login', { email: `nobody-${run}${DOMAIN}`, password })
  assert.equal(wrong.status, 401)
  assert.equal(unknown.status, 401)
  assert.equal(wrong.body.error.message, unknown.body.error.message)
})

test('login with correct password (any email case) -> token that works for /me', async () => {
  const res = await call('POST', '/api/auth/login', { email: email.toUpperCase(), password })
  assert.equal(res.status, 200)
  const me = await call('GET', '/api/auth/me', undefined, { Authorization: `Bearer ${res.body.token}` })
  assert.equal(me.status, 200)
  assert.equal(me.body.user.email, email)
  assert.equal(me.body.user.password_hash, undefined)
})

test('/me rejects missing, malformed, foreign and expired tokens', async () => {
  assert.equal((await call('GET', '/api/auth/me')).status, 401)
  assert.equal((await call('GET', '/api/auth/me', undefined, { Authorization: 'Bearer not.a.token' })).status, 401)

  const foreign = jwt.sign({}, 'another-secret-another-secret-123', { subject: '1' })
  assert.equal((await call('GET', '/api/auth/me', undefined, { Authorization: `Bearer ${foreign}` })).status, 401)

  const expired = jwt.sign({}, process.env.JWT_SECRET, { subject: '1', expiresIn: -10 })
  assert.equal((await call('GET', '/api/auth/me', undefined, { Authorization: `Bearer ${expired}` })).status, 401)

  const unsigned = jwt.sign({}, '', { subject: '1', algorithm: 'none' })
  assert.equal((await call('GET', '/api/auth/me', undefined, { Authorization: `Bearer ${unsigned}` })).status, 401)
})

test('account with a placeholder hash (demo seed style) can never log in', async () => {
  const demo = `demo-${run}${DOMAIN}`
  await pool.query("INSERT INTO users (email, nickname, password_hash) VALUES ($1, $2, '!demo-account-login-disabled')", [demo, `demo_${run}`])
  const res = await call('POST', '/api/auth/login', { email: demo, password: '!demo-account-login-disabled' })
  assert.equal(res.status, 401)
})
