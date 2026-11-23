// Two-connection tests for the group triggers (migration 003) and for account deletion racing
// with review writes. Need a migrated PostgreSQL database (DB_* variables), migrations 001-003.
// Every scenario uses two independent connections; the order is forced with an open transaction
// in the first connection, and the test checks that the second one really waits.
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { randomBytes, randomInt } from 'node:crypto'

const { pool } = await import('../models/db.js')
const { deleteUserAccount } = await import('../models/User.js')

const DOMAIN = '@concurrency-test.example'
const run = randomBytes(3).toString('hex')
let movieId
let seq = 0

const user = async (name) => {
  seq += 1
  const res = await pool.query(
    "INSERT INTO users (email, nickname, password_hash) VALUES ($1, $2, '!x') RETURNING id",
    [`${name}${seq}-${run}${DOMAIN}`, `c${seq}_${run}`],
  )
  return res.rows[0].id
}

// Group with the creator as admin and extra members; offsets in minutes keep joined_at ordered.
const group = async (creator, members = [], extraAdmins = []) => {
  const g = (await pool.query('INSERT INTO groups (name, created_by) VALUES ($1, $2) RETURNING id', [`conc-${run}-${seq}`, creator])).rows[0].id
  let minute = 1
  for (const m of members) {
    await pool.query(
      "INSERT INTO group_members (group_id, user_id, joined_at) VALUES ($1, $2, now() + make_interval(mins => $3))",
      [g, m, minute++],
    )
  }
  for (const a of extraAdmins) {
    await pool.query(
      "INSERT INTO group_members (group_id, user_id, role, joined_at) VALUES ($1, $2, 'admin', now() + make_interval(mins => $3))",
      [g, a, minute++],
    )
  }
  return g
}

const members = async (g) =>
  (await pool.query('SELECT user_id, role FROM group_members WHERE group_id = $1 ORDER BY user_id', [g])).rows
const groupExists = async (g) => (await pool.query('SELECT 1 FROM groups WHERE id = $1', [g])).rowCount === 1
const leave = (client, g, u) => client.query('DELETE FROM group_members WHERE group_id = $1 AND user_id = $2', [g, u])

// Resolves to 'pending' if the promise is still waiting after ms milliseconds.
const stillWaiting = (promise, ms = 300) =>
  Promise.race([promise.then(() => 'done', () => 'done'), new Promise((r) => setTimeout(() => r('pending'), ms))])

const withTwoConnections = async (fn) => {
  const c1 = await pool.connect()
  const c2 = await pool.connect()
  try {
    await fn(c1, c2)
  } finally {
    await c1.query('ROLLBACK').catch(() => {})
    await c2.query('ROLLBACK').catch(() => {})
    c1.release()
    c2.release()
  }
}

before(async () => {
  movieId = (await pool.query("INSERT INTO movies (tmdb_id, title) VALUES ($1, 'Concurrency Movie') RETURNING id", [990000000 + randomInt(1000000)])).rows[0].id
})

after(async () => {
  await pool.query('DELETE FROM reviews WHERE movie_id = $1', [movieId])
  await pool.query('DELETE FROM users WHERE email LIKE $1', [`%${DOMAIN}`])
  await pool.query('DELETE FROM groups WHERE name LIKE $1', [`conc-${run}-%`])
  await pool.query('DELETE FROM movies WHERE id = $1', [movieId])
  await pool.end()
})

test('S1a: ordinary member leaves (open) while the last admin leaves -> remaining member becomes admin', async () => {
  const [a, s, o] = [await user('a'), await user('s'), await user('o')]
  const g = await group(a, [s, o]) // s is the longest member after a
  await withTwoConnections(async (c1, c2) => {
    await c1.query('BEGIN')
    await leave(c1, g, s) // trigger locks the group row
    const second = leave(c2, g, a)
    assert.equal(await stillWaiting(second), 'pending')
    await c1.query('COMMIT')
    await second
  })
  assert.deepEqual(await members(g), [{ user_id: o, role: 'admin' }])
})

test('S1b: last admin leaves (open, promotes the oldest member) while that member leaves', async () => {
  const [a, s, o] = [await user('a'), await user('s'), await user('o')]
  const g = await group(a, [s, o])
  await withTwoConnections(async (c1, c2) => {
    await c1.query('BEGIN')
    await leave(c1, g, a) // promotes s and keeps the lock
    const second = leave(c2, g, s)
    assert.equal(await stillWaiting(second), 'pending')
    await c1.query('COMMIT')
    await second
  })
  assert.deepEqual(await members(g), [{ user_id: o, role: 'admin' }])
})

test('S2: last ordinary member and last admin leave at the same time (both orders) -> group deleted', async () => {
  for (const firstLeaves of ['member', 'admin']) {
    const [a, s] = [await user('a'), await user('s')]
    const g = await group(a, [s])
    await withTwoConnections(async (c1, c2) => {
      await c1.query('BEGIN')
      await leave(c1, g, firstLeaves === 'member' ? s : a)
      const second = leave(c2, g, firstLeaves === 'member' ? a : s)
      assert.equal(await stillWaiting(second), 'pending')
      await c1.query('COMMIT')
      await second
    })
    assert.equal(await groupExists(g), false, `${firstLeaves} first`)
  }
})

test('S3: two admins leave at the same time; with a third member left, that member becomes admin', async () => {
  const [a, b, m] = [await user('a'), await user('b'), await user('m')]
  const g = await group(a, [m], [b])
  await withTwoConnections(async (c1, c2) => {
    await c1.query('BEGIN')
    await leave(c1, g, a)
    const second = leave(c2, g, b)
    assert.equal(await stillWaiting(second), 'pending')
    await c1.query('COMMIT')
    await second
  })
  assert.deepEqual(await members(g), [{ user_id: m, role: 'admin' }])
})

test('S4: two admins demote each other at the same time -> second one fails, one admin remains', async () => {
  const [a, b] = [await user('a'), await user('b')]
  const g = await group(a, [], [b])
  await withTwoConnections(async (c1, c2) => {
    await c1.query('BEGIN')
    await c1.query("UPDATE group_members SET role = 'member' WHERE group_id = $1 AND user_id = $2", [g, a])
    const second = c2.query("UPDATE group_members SET role = 'member' WHERE group_id = $1 AND user_id = $2", [g, b])
    assert.equal(await stillWaiting(second), 'pending')
    await c1.query('COMMIT')
    await assert.rejects(second, { code: '23514' })
  })
  const rows = await members(g)
  assert.equal(rows.filter((r) => r.role === 'admin').length, 1)
})

test('S5: equal joined_at -> smaller user_id becomes admin', async () => {
  const [a, x, y] = [await user('a'), await user('x'), await user('y')]
  const g = (await pool.query('INSERT INTO groups (name, created_by) VALUES ($1, $2) RETURNING id', [`conc-${run}-tie`, a])).rows[0].id
  await pool.query("INSERT INTO group_members (group_id, user_id, joined_at) VALUES ($1, $2, now() + interval '1 hour'), ($1, $3, now() + interval '1 hour')", [g, y, x])
  await pool.query('DELETE FROM group_members WHERE group_id = $1 AND user_id = $2', [g, a])
  const rows = await members(g)
  assert.equal(rows.find((r) => r.role === 'admin').user_id, Math.min(x, y))
})

test('S6: membership changes outside READ COMMITTED are refused (40001) instead of breaking the rules', async () => {
  const [a, s] = [await user('a'), await user('s')]
  const g = await group(a, [s])
  await withTwoConnections(async (c1) => {
    await c1.query('BEGIN ISOLATION LEVEL REPEATABLE READ')
    await assert.rejects(leave(c1, g, a), { code: '40001' })
  })
  assert.equal((await members(g)).length, 2)
})

test('S7: account deletion and a member leaving the same group -> no deadlock, rules hold', async () => {
  const [a, m] = [await user('a'), await user('m')]
  const g = await group(a, [m])
  const hash = '!x'
  await withTwoConnections(async (c1) => {
    await c1.query('BEGIN')
    await leave(c1, g, m) // holds the group lock
    const deletion = deleteUserAccount(a, hash) // locks groups first -> waits
    assert.equal(await stillWaiting(deletion), 'pending')
    await c1.query('COMMIT')
    assert.equal(await deletion, 'deleted')
  })
  assert.equal(await groupExists(g), false)
})

test('R1: review written before the account deletion commits -> rating kept, comment cleared', async () => {
  const x = await user('x')
  await withTwoConnections(async (c1) => {
    await c1.query('BEGIN')
    await c1.query("INSERT INTO reviews (movie_id, user_id, rating, comment) VALUES ($1, $2, 5, 'just in time')", [movieId, x])
    const deletion = deleteUserAccount(x, '!x') // waits for the FK lock of the insert
    assert.equal(await stillWaiting(deletion), 'pending')
    await c1.query('COMMIT')
    assert.equal(await deletion, 'deleted')
  })
  const rows = (await pool.query("SELECT user_id, rating, comment, author_deleted_at FROM reviews WHERE movie_id = $1 AND rating = 5 AND user_id IS NULL", [movieId])).rows
  assert.equal(rows.length, 1)
  assert.equal(rows[0].comment, null)
  assert.ok(rows[0].author_deleted_at)
})

test('R2: review written after the deletion started -> refused by the foreign key, nothing stored', async () => {
  const x = await user('x')
  await withTwoConnections(async (c1, c2) => {
    await c1.query('BEGIN')
    await c1.query('DELETE FROM users WHERE id = $1', [x])
    const insert = c2.query("INSERT INTO reviews (movie_id, user_id, rating, comment) VALUES ($1, $2, 3, 'too late')", [movieId, x])
    assert.equal(await stillWaiting(insert), 'pending')
    await c1.query('COMMIT')
    await assert.rejects(insert, { code: '23503', constraint: 'reviews_user_id_fkey' })
  })
  assert.equal((await pool.query("SELECT 1 FROM reviews WHERE comment = 'too late'")).rowCount, 0)
})

test('existing data never violates the rules after the scenarios', async () => {
  const bad = await pool.query(`
    SELECT g.id FROM groups g
    WHERE NOT EXISTS (SELECT 1 FROM group_members m WHERE m.group_id = g.id)
       OR NOT EXISTS (SELECT 1 FROM group_members m WHERE m.group_id = g.id AND m.role = 'admin')`)
  assert.equal(bad.rowCount, 0)
})
