// Integration tests for private group search and join requests (issue #13, migration 004).
// Need a migrated PostgreSQL test database (migrations 001-004). Run: npm test (api folder).
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import process from 'node:process'
import { randomBytes } from 'node:crypto'

process.env.JWT_SECRET ??= randomBytes(48).toString('base64')

const { default: app } = await import('../app.js')
const { pool } = await import('../models/db.js')

const DOMAIN = '@requests-test.example'
const run = randomBytes(3).toString('hex')
const PASSWORD = 'requests test password'
let server
let base
let seq = 0

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

const createGroup = async (owner, name, visibility) => {
  const res = await call('POST', '/api/groups', { token: owner.token, body: { name, visibility, description: 'Salainen kuvaus' } })
  assert.equal(res.status, 201, JSON.stringify(res.body))
  return res.body.group.id
}

const search = (token, name) => call('GET', `/api/groups/private?name=${encodeURIComponent(name)}`, { token })
const pendingCount = async (groupId, userId) =>
  Number((await pool.query("SELECT count(*) FROM group_join_requests WHERE group_id = $1 AND user_id = $2 AND status = 'pending'", [groupId, userId])).rows[0].count)
const memberships = async (groupId, userId) =>
  (await pool.query('SELECT role FROM group_members WHERE group_id = $1 AND user_id = $2', [groupId, userId])).rows

let admin, outsider, member
const name = `Leffakerho ${run}`
let privateId
let publicId

before(async () => {
  server = app.listen(0)
  await new Promise((resolve) => server.once('listening', resolve))
  base = `http://127.0.0.1:${server.address().port}`
  admin = await newUser('adm')
  outsider = await newUser('out')
  member = await newUser('mem')
  privateId = await createGroup(admin, name, 'private')
  publicId = await createGroup(admin, name, 'public') // same name, public: allowed
  await call('POST', `/api/groups/${privateId}/members`, { token: admin.token, body: { nickname: member.nickname } })
})

after(async () => {
  await pool.query('DELETE FROM users WHERE email LIKE $1', [`%${DOMAIN}`])
  await new Promise((resolve) => server.close(resolve))
  await pool.end()
})

test('private group name is unique (case and spaces ignored); a public group may share it', async () => {
  const dup = await call('POST', '/api/groups', { token: outsider.token, body: { name: `  ${name.toUpperCase()} `, visibility: 'private' } })
  assert.equal(dup.status, 409)
  assert.ok(dup.body.error.fields.name)
  const otherPublic = await call('POST', '/api/groups', { token: outsider.token, body: { name, visibility: 'public' } })
  assert.equal(otherPublic.status, 201)
})

test('each search finds its own group: public list never shows the private one', async () => {
  const pub = await call('GET', `/api/groups?q=${encodeURIComponent(name)}&limit=50`)
  const ids = pub.body.items.map((g) => g.id)
  assert.ok(ids.includes(publicId))
  assert.ok(!ids.includes(privateId))

  const priv = await search(outsider.token, `  ${name.toUpperCase()}  `)
  assert.equal(priv.status, 200)
  assert.deepEqual(priv.body.match, { id: privateId, name, visibility: 'private', my_role: null, request_status: null })
})

test('private search: exact name only, login required, no description or members leaked', async () => {
  assert.equal((await search(outsider.token, name.slice(0, -2))).body.match, null)
  assert.equal((await search(outsider.token, `${name} x`)).body.match, null)
  assert.equal((await call('GET', `/api/groups/private?name=${encodeURIComponent(name)}`)).status, 401)
  assert.equal((await search(outsider.token, '   ')).status, 400)
  const match = (await search(outsider.token, name)).body.match
  assert.equal(match.description, undefined)
  assert.equal(match.members, undefined)
  assert.equal(match.member_count, undefined)
})

test('outsider requests to join; repeated request keeps one pending request; page stays closed', async () => {
  const first = await call('POST', `/api/groups/${privateId}/requests`, { token: outsider.token, body: { user_id: admin.id } })
  assert.equal(first.status, 201)
  assert.equal(first.body.request.status, 'pending')
  const again = await call('POST', `/api/groups/${privateId}/requests`, { token: outsider.token })
  assert.equal(again.status, 200)
  assert.equal(again.body.request.id, first.body.request.id)
  assert.equal(await pendingCount(privateId, outsider.id), 1)

  assert.equal((await search(outsider.token, name)).body.match.request_status, 'pending')
  assert.equal((await call('GET', `/api/groups/${privateId}`, { token: outsider.token })).status, 404)
  assert.equal((await call('POST', `/api/groups/${privateId}/join`, { token: outsider.token })).status, 404)
  assert.equal((await call('POST', `/api/groups/${privateId}/requests`)).status, 401)
})

test('requests only for private groups and only for non-members', async () => {
  assert.equal((await call('POST', `/api/groups/${publicId}/requests`, { token: outsider.token })).status, 400)
  assert.equal((await call('POST', `/api/groups/${privateId}/requests`, { token: member.token })).status, 409)
  assert.equal((await call('POST', '/api/groups/2147483000/requests', { token: outsider.token })).status, 404)
  const asMember = (await search(member.token, name)).body.match
  assert.equal(asMember.my_role, 'member')
})

test('only the admin of the group can list and decide requests', async () => {
  const requestId = (await call('POST', `/api/groups/${privateId}/requests`, { token: outsider.token })).body.request.id
  assert.equal((await call('GET', `/api/groups/${privateId}/requests`, { token: member.token })).status, 403)
  assert.equal((await call('GET', `/api/groups/${privateId}/requests`, { token: outsider.token })).status, 404)
  assert.equal((await call('POST', `/api/groups/${privateId}/requests/${requestId}/approve`, { token: member.token })).status, 403)
  assert.equal((await call('POST', `/api/groups/${privateId}/requests/${requestId}/approve`, { token: outsider.token })).status, 404)
  // Admin of another group cannot decide this group's requests through their own group id.
  const otherAdmin = await newUser('oth')
  const otherGroup = await createGroup(otherAdmin, `Muu ${run}`, 'private')
  assert.equal((await call('POST', `/api/groups/${otherGroup}/requests/${requestId}/approve`, { token: otherAdmin.token })).status, 404)

  const list = await call('GET', `/api/groups/${privateId}/requests`, { token: admin.token })
  assert.equal(list.status, 200)
  assert.deepEqual(list.body.items.map((r) => [r.id, r.user.nickname]), [[requestId, outsider.nickname]])
  assert.equal(list.body.items[0].user.email, undefined)
})

test('reject: no membership, request leaves the pending list, user may ask again', async () => {
  const requestId = (await call('POST', `/api/groups/${privateId}/requests`, { token: outsider.token })).body.request.id
  const res = await call('POST', `/api/groups/${privateId}/requests/${requestId}/reject`, { token: admin.token })
  assert.equal(res.status, 200)
  assert.deepEqual(await memberships(privateId, outsider.id), [])
  assert.equal((await call('GET', `/api/groups/${privateId}/requests`, { token: admin.token })).body.items.length, 0)
  assert.equal((await call('POST', `/api/groups/${privateId}/requests/${requestId}/approve`, { token: admin.token })).status, 409)
  assert.equal((await search(outsider.token, name)).body.match.request_status, 'rejected')
  assert.equal((await call('POST', `/api/groups/${privateId}/requests`, { token: outsider.token })).status, 201)
})

test('approve: membership with role member, group in "Omat ryhmät", page opens', async () => {
  const requestId = (await call('POST', `/api/groups/${privateId}/requests`, { token: outsider.token })).body.request.id
  const res = await call('POST', `/api/groups/${privateId}/requests/${requestId}/approve`, { token: admin.token, body: { role: 'admin' } })
  assert.equal(res.status, 200)
  assert.equal(res.body.member.role, 'member')
  assert.deepEqual(await memberships(privateId, outsider.id), [{ role: 'member' }])
  assert.equal(await pendingCount(privateId, outsider.id), 0)
  const mine = await call('GET', '/api/groups/mine', { token: outsider.token })
  assert.ok(mine.body.items.some((g) => g.id === privateId && g.my_role === 'member'))
  const page = await call('GET', `/api/groups/${privateId}`, { token: outsider.token })
  assert.equal(page.status, 200)
  assert.equal(page.body.group.description, 'Salainen kuvaus')
  assert.equal((await call('POST', `/api/groups/${privateId}/requests/${requestId}/approve`, { token: admin.token })).status, 409)
})

test('adding by nickname closes a pending request of the same user', async () => {
  const user = await newUser('nik')
  await call('POST', `/api/groups/${privateId}/requests`, { token: user.token })
  assert.equal(await pendingCount(privateId, user.id), 1)
  assert.equal((await call('POST', `/api/groups/${privateId}/members`, { token: admin.token, body: { nickname: user.nickname } })).status, 201)
  assert.equal(await pendingCount(privateId, user.id), 0)
  assert.deepEqual(await memberships(privateId, user.id), [{ role: 'member' }])
})

test('parallel: approve and add-by-nickname at the same time -> one membership, no pending request (10 rounds)', async () => {
  for (let i = 0; i < 10; i++) {
    const user = await newUser('par')
    const requestId = (await call('POST', `/api/groups/${privateId}/requests`, { token: user.token })).body.request.id
    const [approve, add] = await Promise.all([
      call('POST', `/api/groups/${privateId}/requests/${requestId}/approve`, { token: admin.token }),
      call('POST', `/api/groups/${privateId}/members`, { token: admin.token, body: { nickname: user.nickname } }),
    ])
    // Whichever runs first wins: approve 200 + add 409, or add 201 + approve 409.
    assert.deepEqual([approve.status, add.status].sort(), approve.status === 200 ? [200, 409] : [201, 409], `round ${i}`)
    assert.deepEqual(await memberships(privateId, user.id), [{ role: 'member' }], `round ${i}`)
    assert.equal(await pendingCount(privateId, user.id), 0, `round ${i}`)
  }
})

test('deleting the requesting account removes its requests', async () => {
  const user = await newUser('del')
  await call('POST', `/api/groups/${privateId}/requests`, { token: user.token })
  assert.equal((await call('DELETE', '/api/auth/me', { token: user.token, body: { password: PASSWORD } })).status, 204)
  assert.equal(Number((await pool.query('SELECT count(*) FROM group_join_requests WHERE user_id = $1', [user.id])).rows[0].count), 0)
  assert.equal((await call('GET', `/api/groups/${privateId}/requests`, { token: admin.token })).body.items.length, 0)
})

test('existing group features still work: public join, add by nickname, leave', async () => {
  const joiner = await newUser('pub')
  assert.equal((await call('POST', `/api/groups/${publicId}/join`, { token: joiner.token })).status, 201)
  assert.equal((await call('DELETE', `/api/groups/${publicId}/membership`, { token: joiner.token })).status, 204)
  assert.equal((await call('DELETE', `/api/groups/${privateId}/membership`, { token: member.token })).status, 204)
  assert.deepEqual(await memberships(privateId, member.id), [])
})
