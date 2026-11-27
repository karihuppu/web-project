import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import process from 'node:process'
import { randomBytes } from 'node:crypto'

process.env.JWT_SECRET ??= randomBytes(48).toString('base64')

const { default: app } = await import('../app.js')
const { pool } = await import('../models/db.js')

const DOMAIN = '@wl-share-test.example'
const run = randomBytes(3).toString('hex')
const PASSWORD = 'share test password'
let server
let base
let seq = 0
let movies

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

const newUser = async (name) => {
  seq += 1
  const nickname = `${name}${seq}_${run}`
  const res = await call('POST', '/api/auth/register', {
    body: { email: `${name}${seq}-${run}${DOMAIN}`, nickname, password: PASSWORD },
  })
  assert.equal(res.status, 201)
  return { id: res.body.user.id, token: res.body.token, nickname }
}

const createGroup = async (owner, body) => {
  const res = await call('POST', '/api/groups', {
    token: owner.token,
    body: { name: `G ${run} ${++seq}`, visibility: 'public', ...body },
  })
  assert.equal(res.status, 201, JSON.stringify(res.body))
  return res.body.group.id
}

const newList = async (user, name = `List ${run} ${++seq}`) => {
  const res = await call('POST', '/api/watchlists', { token: user.token, body: { name } })
  assert.equal(res.status, 201, JSON.stringify(res.body))
  return res.body.watchlist.id
}

const addMovie = async (user, listId, movieId) => {
  const res = await call('POST', `/api/watchlists/${listId}/movies`, { token: user.token, body: { movie_id: movieId } })
  assert.equal(res.status, 201, JSON.stringify(res.body))
}

const share = (user, listId, groupId) =>
  call('POST', `/api/watchlists/${listId}/shares`, { token: user.token, body: { group_id: groupId } })

const join = (user, groupId) => call('POST', `/api/groups/${groupId}/join`, { token: user.token })
const sharedIn = async (groupId, token) => (await call('GET', `/api/groups/${groupId}/watchlists`, { token })).body
const ids = (items) => items.map((m) => m.id).sort((a, b) => a - b)

let A, B, C

before(async () => {
  server = app.listen(0)
  await new Promise((resolve) => server.once('listening', resolve))
  base = `http://127.0.0.1:${server.address().port}`
  movies = (await pool.query('SELECT id FROM movies ORDER BY id LIMIT 2')).rows.map((r) => r.id)
  assert.equal(movies.length, 2, 'the test database needs at least two movies (npm run db:seed)')
  A = await newUser('aa')
  B = await newUser('bb')
  C = await newUser('cc')
})

after(async () => {
  await pool.query('DELETE FROM users WHERE email LIKE $1', [`%${DOMAIN}`])
  await new Promise((resolve) => server.close(resolve))
  await pool.end()
})

test('sharing needs login, valid ids and a list of your own', async () => {
  const listId = await newList(A)
  const groupId = await createGroup(A)
  assert.equal((await call('POST', `/api/watchlists/${listId}/shares`, { body: { group_id: groupId } })).status, 401)
  assert.equal((await share(A, listId, 'abc')).status, 400)
  assert.equal((await share(A, 'abc', groupId)).status, 400)
  assert.equal((await share(A, listId, 2147483000)).status, 404)
  // B cannot share A's list, even to a group B belongs to
  const bGroup = await createGroup(B)
  assert.equal((await share(B, listId, bGroup)).status, 404)
  assert.equal((await call('GET', `/api/watchlists/${listId}/shares`, { token: B.token })).status, 404)
})

test('owner shares to groups they belong to; twice -> 409; foreign groups are refused', async () => {
  const listId = await newList(A)
  const pub = await createGroup(A)
  const priv = await createGroup(A, { visibility: 'private' })
  assert.equal((await share(A, listId, pub)).status, 201)
  assert.equal((await share(A, listId, pub)).status, 409)
  assert.equal((await share(A, listId, priv)).status, 201)

  const shares = await call('GET', `/api/watchlists/${listId}/shares`, { token: A.token })
  assert.deepEqual(ids(shares.body.shares), [pub, priv].sort((a, b) => a - b))

  // B is in neither group: public -> 403, private stays hidden -> 404
  const bList = await newList(B)
  assert.equal((await share(B, bList, pub)).status, 403)
  assert.equal((await share(B, bList, priv)).status, 404)
})

test('public group: guests see the live list; a movie added later shows up right away', async () => {
  const listId = await newList(A)
  await addMovie(A, listId, movies[0])
  const groupId = await createGroup(A)
  await share(A, listId, groupId)

  const list = await sharedIn(groupId)
  assert.deepEqual(list.watchlists.map((l) => [l.id, l.movie_count, l.owner.id]), [[listId, 1, A.id]])
  assert.equal(list.watchlists[0].owner.email, undefined)

  const detail = await call('GET', `/api/groups/${groupId}/watchlists/${listId}`)
  assert.equal(detail.status, 200)
  assert.deepEqual(ids(detail.body.watchlist.movies), [movies[0]])

  await addMovie(A, listId, movies[1])
  const live = await call('GET', `/api/groups/${groupId}/watchlists/${listId}`)
  assert.deepEqual(ids(live.body.watchlist.movies), movies)
})

test('private group: hidden from outsiders, visible to members', async () => {
  const listId = await newList(A)
  await addMovie(A, listId, movies[0])
  const groupId = await createGroup(A, { visibility: 'private' })
  await share(A, listId, groupId)

  assert.equal((await call('GET', `/api/groups/${groupId}/watchlists`)).status, 404)
  assert.equal((await call('GET', `/api/groups/${groupId}/watchlists`, { token: C.token })).status, 404)
  assert.equal((await call('GET', `/api/groups/${groupId}/watchlists/${listId}`, { token: C.token })).status, 404)
  assert.equal((await call('POST', `/api/groups/${groupId}/watchlists/${listId}/copy`, { token: C.token })).status, 404)

  await call('POST', `/api/groups/${groupId}/members`, { token: A.token, body: { nickname: C.nickname } })
  const asMember = await call('GET', `/api/groups/${groupId}/watchlists/${listId}`, { token: C.token })
  assert.equal(asMember.status, 200)
  assert.deepEqual(ids(asMember.body.watchlist.movies), [movies[0]])
})

test('a list shows only in the groups it was shared to; bad ids -> 400', async () => {
  const listId = await newList(A)
  const privateList = await newList(A)
  const g1 = await createGroup(A)
  const g2 = await createGroup(A)
  await share(A, listId, g1)

  assert.equal((await call('GET', `/api/groups/${g2}/watchlists/${listId}`)).status, 404)
  assert.deepEqual((await sharedIn(g2)).watchlists, [])
  assert.ok(!(await sharedIn(g1)).watchlists.some((l) => l.id === privateList))
  assert.equal((await call('GET', '/api/groups/abc/watchlists')).status, 400)
  assert.equal((await call('GET', `/api/groups/${g1}/watchlists/abc`)).status, 400)
})

test('only the owner can remove a share', async () => {
  const listId = await newList(A)
  const groupId = await createGroup(A)
  await share(A, listId, groupId)
  await join(B, groupId)

  assert.equal((await call('DELETE', `/api/watchlists/${listId}/shares/${groupId}`)).status, 401)
  assert.equal((await call('DELETE', `/api/watchlists/${listId}/shares/${groupId}`, { token: B.token })).status, 404)
  assert.equal((await call('DELETE', `/api/watchlists/${listId}/shares/${groupId}`, { token: A.token })).status, 204)
  assert.equal((await call('DELETE', `/api/watchlists/${listId}/shares/${groupId}`, { token: A.token })).status, 404)
  assert.equal((await call('GET', `/api/groups/${groupId}/watchlists/${listId}`)).status, 404)
})

test('copy: own editable copy, original and group version stay unchanged', async () => {
  const listId = await newList(A, `Scifi ${run}`)
  await addMovie(A, listId, movies[0])
  const groupId = await createGroup(A)
  await share(A, listId, groupId)
  await join(B, groupId)
  const copyPath = `/api/groups/${groupId}/watchlists/${listId}/copy`

  assert.equal((await call('POST', copyPath)).status, 401)
  const copy = await call('POST', copyPath, { token: B.token })
  assert.equal(copy.status, 201)
  assert.equal(copy.body.watchlist.name, `Scifi ${run} (kopio)`)
  const copyId = copy.body.watchlist.id

  const mine = await call('GET', `/api/watchlists/${copyId}`, { token: B.token })
  assert.equal(mine.status, 200)
  assert.deepEqual(ids(mine.body.watchlist.movies), [movies[0]])
  assert.equal((await call('GET', `/api/watchlists/${copyId}`, { token: A.token })).status, 404)

  // B edits the copy; the original is untouched
  await addMovie(B, copyId, movies[1])
  const original = await call('GET', `/api/groups/${groupId}/watchlists/${listId}`)
  assert.deepEqual(ids(original.body.watchlist.movies), [movies[0]])

  // a second copy gets a free name, and copies are not shared anywhere
  const second = await call('POST', copyPath, { token: B.token })
  assert.equal(second.body.watchlist.name, `Scifi ${run} (kopio 2)`)
  assert.deepEqual((await call('GET', `/api/watchlists/${copyId}/shares`, { token: B.token })).body.shares, [])
})

test('owner leaves the group -> share stops showing; deleting the list removes the shares', async () => {
  const listId = await newList(A)
  const groupId = await createGroup(A)
  await join(B, groupId) // so the group survives A leaving
  await share(A, listId, groupId)
  assert.equal((await sharedIn(groupId)).watchlists.length, 1)

  await call('DELETE', `/api/groups/${groupId}/membership`, { token: A.token })
  assert.deepEqual((await sharedIn(groupId)).watchlists, [])
  assert.equal((await call('GET', `/api/groups/${groupId}/watchlists/${listId}`)).status, 404)
  assert.equal((await share(A, listId, groupId)).status, 403) // no longer a member

  const list2 = await newList(B)
  await share(B, list2, groupId)
  assert.equal((await call('DELETE', `/api/watchlists/${list2}`, { token: B.token })).status, 204)
  assert.deepEqual((await sharedIn(groupId)).watchlists, [])
  assert.equal((await pool.query('SELECT 1 FROM watchlist_shares WHERE watchlist_id = $1', [list2])).rowCount, 0)
})