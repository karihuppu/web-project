// Integration tests for /api/groups. Need a migrated PostgreSQL test database (migrations 001-003).
// Run: npm test (api folder). Test users use @groups-test.example and are removed afterwards
// (deleting them also deletes the test groups, which become empty).
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import process from 'node:process'
import { randomBytes } from 'node:crypto'

process.env.JWT_SECRET ??= randomBytes(48).toString('base64')

const { default: app } = await import('../app.js')
const { pool } = await import('../models/db.js')

const DOMAIN = '@groups-test.example'
const run = randomBytes(3).toString('hex')
const PASSWORD = 'groups test password'
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

const createGroup = async (owner, body) => {
  const res = await call('POST', '/api/groups', { token: owner.token, body: { name: `G ${run} ${++seq}`, visibility: 'public', ...body } })
  assert.equal(res.status, 201, JSON.stringify(res.body))
  return res.body.group.id
}

const membersOf = async (groupId) =>
  (await pool.query('SELECT user_id, role FROM group_members WHERE group_id = $1 ORDER BY joined_at, user_id', [groupId])).rows
const exists = async (groupId) => (await pool.query('SELECT 1 FROM groups WHERE id = $1', [groupId])).rowCount === 1

let A, B, C

before(async () => {
  server = app.listen(0)
  await new Promise((resolve) => server.once('listening', resolve))
  base = `http://127.0.0.1:${server.address().port}`
  A = await newUser('aa')
  B = await newUser('bb')
  C = await newUser('cc')
})

after(async () => {
  await pool.query('DELETE FROM users WHERE email LIKE $1', [`%${DOMAIN}`])
  await new Promise((resolve) => server.close(resolve))
  await pool.end()
})

test('creating requires login and valid data', async () => {
  assert.equal((await call('POST', '/api/groups', { body: { name: 'Guest group' } })).status, 401)
  for (const body of [
    { name: 'x' },
    { name: 42 },
    { name: 'Valid', visibility: 'secret' },
    { name: 'Valid', description: 'x'.repeat(1001) },
    { name: 'Valid', description: 5 },
  ]) {
    const res = await call('POST', '/api/groups', { token: A.token, body })
    assert.equal(res.status, 400, JSON.stringify(body))
    assert.ok(Object.keys(res.body.error.fields).length > 0)
  }
})

test('A creates a public group and is admin right away; role/owner in the body are ignored', async () => {
  const res = await call('POST', '/api/groups', {
    token: A.token,
    body: { name: `  Scifi ${run}  `, description: '  Avaruus  ', visibility: 'public', created_by: B.id, role: 'member', members: [B.id] },
  })
  assert.equal(res.status, 201)
  assert.equal(res.body.group.name, `Scifi ${run}`)
  assert.equal(res.body.group.description, 'Avaruus')
  assert.equal(res.body.my_role, 'admin')
  assert.deepEqual(res.body.members.map((m) => [m.id, m.role]), [[A.id, 'admin']])
  assert.equal(res.body.members[0].email, undefined)

  const mine = await call('GET', '/api/groups/mine', { token: A.token })
  assert.ok(mine.body.items.some((g) => g.id === res.body.group.id && g.my_role === 'admin'))
  assert.equal((await call('GET', '/api/groups/mine', { token: B.token })).body.items.length, 0)
})

test('guests see public groups (list + page with members) but cannot join', async () => {
  const groupId = await createGroup(A)
  const list = await call('GET', `/api/groups?q=${encodeURIComponent(run)}&limit=50`)
  assert.equal(list.status, 200)
  assert.ok(list.body.items.some((g) => g.id === groupId))

  const page = await call('GET', `/api/groups/${groupId}`)
  assert.equal(page.status, 200)
  assert.equal(page.body.my_role, null)
  assert.equal(page.body.members.length, 1)

  assert.equal((await call('POST', `/api/groups/${groupId}/join`)).status, 401)
  assert.equal((await call('GET', '/api/groups/abc')).status, 400)
  assert.equal((await call('GET', '/api/groups/2147483000')).status, 404)
  assert.equal((await call('GET', `/api/groups/${groupId}`, { token: 'not.a.token' })).status, 401)
})

test('B joins a public group as member; joining again keeps one membership; role in body ignored', async () => {
  const groupId = await createGroup(A)
  const first = await call('POST', `/api/groups/${groupId}/join`, { token: B.token, body: { role: 'admin' } })
  assert.equal(first.status, 201)
  assert.equal(first.body.my_role, 'member')
  const again = await call('POST', `/api/groups/${groupId}/join`, { token: B.token })
  assert.equal(again.status, 200)
  assert.equal(again.body.my_role, 'member')
  assert.deepEqual(await membersOf(groupId), [{ user_id: A.id, role: 'admin' }, { user_id: B.id, role: 'member' }])

  const mine = await call('GET', '/api/groups/mine', { token: B.token })
  assert.ok(mine.body.items.some((g) => g.id === groupId && g.my_role === 'member'))
})

test('an ordinary member cannot manage the membership of others', async () => {
  const groupId = await createGroup(A)
  await call('POST', `/api/groups/${groupId}/join`, { token: B.token })
  assert.equal((await call('POST', `/api/groups/${groupId}/members`, { token: B.token, body: { nickname: C.nickname } })).status, 403)
  assert.equal((await call('DELETE', `/api/groups/${groupId}/members/${A.id}`, { token: B.token })).status, 403)
  // C is not a member at all
  assert.equal((await call('DELETE', `/api/groups/${groupId}/members/${B.id}`, { token: C.token })).status, 403)
  assert.deepEqual(await membersOf(groupId), [{ user_id: A.id, role: 'admin' }, { user_id: B.id, role: 'member' }])
})

test('private group: hidden from outsiders, no direct join; admin adds by exact nickname', async () => {
  const groupId = await createGroup(A, { visibility: 'private' })
  assert.equal((await call('GET', `/api/groups/${groupId}`)).status, 404)
  assert.equal((await call('GET', `/api/groups/${groupId}`, { token: C.token })).status, 404)
  assert.equal((await call('POST', `/api/groups/${groupId}/join`, { token: C.token })).status, 404)
  assert.equal((await call('POST', `/api/groups/${groupId}/members`, { token: C.token, body: { nickname: C.nickname } })).status, 404)
  const list = await call('GET', `/api/groups?q=${encodeURIComponent(run)}&limit=50`)
  assert.ok(!list.body.items.some((g) => g.id === groupId))

  const partial = await call('POST', `/api/groups/${groupId}/members`, { token: A.token, body: { nickname: B.nickname.slice(0, 4) } })
  assert.equal(partial.status, 404)
  assert.ok(partial.body.error.fields.nickname)
  assert.equal((await call('POST', `/api/groups/${groupId}/members`, { token: A.token, body: { nickname: '' } })).status, 400)

  const added = await call('POST', `/api/groups/${groupId}/members`, { token: A.token, body: { nickname: B.nickname.toUpperCase(), role: 'admin' } })
  assert.equal(added.status, 201)
  assert.deepEqual([added.body.member.id, added.body.member.role], [B.id, 'member'])
  assert.equal(added.body.member.email, undefined)
  const dup = await call('POST', `/api/groups/${groupId}/members`, { token: A.token, body: { nickname: B.nickname } })
  assert.equal(dup.status, 409)

  const asMember = await call('GET', `/api/groups/${groupId}`, { token: B.token })
  assert.equal(asMember.status, 200)
  assert.equal(asMember.body.my_role, 'member')
  assert.equal(asMember.body.members.length, 2)
  assert.equal((await call('GET', `/api/groups/${groupId}`, { token: C.token })).status, 404)
})

test('admin removes an ordinary member, not themselves and not a non-member', async () => {
  const groupId = await createGroup(A, { visibility: 'private' })
  await call('POST', `/api/groups/${groupId}/members`, { token: A.token, body: { nickname: B.nickname } })
  assert.equal((await call('DELETE', `/api/groups/${groupId}/members/${A.id}`, { token: A.token })).status, 400)
  assert.equal((await call('DELETE', `/api/groups/${groupId}/members/${C.id}`, { token: A.token })).status, 404)
  assert.equal((await call('DELETE', `/api/groups/${groupId}/members/${B.id}`, { token: A.token })).status, 204)
  assert.equal((await call('GET', `/api/groups/${groupId}`, { token: B.token })).status, 404)
  assert.deepEqual(await membersOf(groupId), [{ user_id: A.id, role: 'admin' }])
})

test('leaving removes only the own membership; leaving twice -> 404', async () => {
  const groupId = await createGroup(A)
  await call('POST', `/api/groups/${groupId}/join`, { token: B.token })
  assert.equal((await call('DELETE', `/api/groups/${groupId}/membership`, { token: B.token, body: { user_id: A.id } })).status, 204)
  assert.equal((await call('DELETE', `/api/groups/${groupId}/membership`, { token: B.token })).status, 404)
  assert.deepEqual(await membersOf(groupId), [{ user_id: A.id, role: 'admin' }])
  assert.equal((await call('DELETE', `/api/groups/${groupId}/membership`)).status, 401)
})

test('last admin leaves -> longest member becomes admin; last member leaves -> group deleted', async () => {
  const D = await newUser('dd')
  const groupId = await createGroup(A)
  await call('POST', `/api/groups/${groupId}/join`, { token: B.token })
  await call('POST', `/api/groups/${groupId}/join`, { token: D.token })

  await call('DELETE', `/api/groups/${groupId}/membership`, { token: A.token })
  assert.deepEqual(await membersOf(groupId), [{ user_id: B.id, role: 'admin' }, { user_id: D.id, role: 'member' }])
  assert.equal((await call('GET', `/api/groups/${groupId}`, { token: B.token })).body.my_role, 'admin')

  await call('DELETE', `/api/groups/${groupId}/membership`, { token: B.token })
  assert.deepEqual(await membersOf(groupId), [{ user_id: D.id, role: 'admin' }])

  assert.equal((await call('DELETE', `/api/groups/${groupId}/membership`, { token: D.token })).status, 204)
  assert.equal(await exists(groupId), false)
  assert.equal((await call('GET', `/api/groups/${groupId}`)).status, 404)
  assert.ok(!(await call('GET', '/api/groups/mine', { token: D.token })).body.items.some((g) => g.id === groupId))
})

test('parallel: last admin and last member leave at the same time -> group deleted (10 rounds)', async () => {
  for (let i = 0; i < 10; i++) {
    const groupId = await createGroup(A)
    await call('POST', `/api/groups/${groupId}/join`, { token: B.token })
    const [ra, rb] = await Promise.all([
      call('DELETE', `/api/groups/${groupId}/membership`, { token: A.token }),
      call('DELETE', `/api/groups/${groupId}/membership`, { token: B.token }),
    ])
    assert.deepEqual([ra.status, rb.status], [204, 204])
    assert.equal(await exists(groupId), false, `round ${i}`)
  }
})

test('parallel: admin and a member leave, a third stays -> the third is admin (10 rounds)', async () => {
  const D = await newUser('dd')
  for (let i = 0; i < 10; i++) {
    const groupId = await createGroup(A)
    await call('POST', `/api/groups/${groupId}/join`, { token: B.token })
    await call('POST', `/api/groups/${groupId}/join`, { token: D.token })
    await Promise.all([
      call('DELETE', `/api/groups/${groupId}/membership`, { token: A.token }),
      call('DELETE', `/api/groups/${groupId}/membership`, { token: B.token }),
    ])
    assert.deepEqual(await membersOf(groupId), [{ user_id: D.id, role: 'admin' }], `round ${i}`)
  }
})

test('parallel: admin deletes the account while a member leaves -> remaining member is admin', async () => {
  for (let i = 0; i < 5; i++) {
    const admin = await newUser('adm')
    const D = await newUser('dd')
    const groupId = await createGroup(admin)
    await call('POST', `/api/groups/${groupId}/join`, { token: B.token })
    await call('POST', `/api/groups/${groupId}/join`, { token: D.token })
    const [del, left] = await Promise.all([
      call('DELETE', '/api/auth/me', { token: admin.token, body: { password: PASSWORD } }),
      call('DELETE', `/api/groups/${groupId}/membership`, { token: B.token }),
    ])
    assert.deepEqual([del.status, left.status], [204, 204])
    assert.deepEqual(await membersOf(groupId), [{ user_id: D.id, role: 'admin' }], `round ${i}`)
    // The deleted admin's old token no longer works for groups.
    assert.equal((await call('GET', '/api/groups/mine', { token: admin.token })).status, 401)
  }
})

test('rules hold for every group after all scenarios', async () => {
  const bad = await pool.query(`
    SELECT g.id FROM groups g
    WHERE NOT EXISTS (SELECT 1 FROM group_members m WHERE m.group_id = g.id)
       OR NOT EXISTS (SELECT 1 FROM group_members m WHERE m.group_id = g.id AND m.role = 'admin')`)
  assert.equal(bad.rowCount, 0)
})
