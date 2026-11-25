import { pool } from './db.js'

// Group rules live in the database (migrations 002 + 003):
//   * the creator is added as admin by a trigger (groups_add_creator_as_admin),
//   * a group with members always keeps an admin; when the last admin leaves, the longest
//     member (joined_at, then user_id) becomes admin; an empty group is deleted
//     (trigger group_members_keep_admin).
// Every membership change below runs in one transaction that FIRST locks the group row
// (lock order groups -> users -> group_members, see docs/ryhmat-kehittajalle.md) and then
// checks the caller's role inside the same transaction.

const GROUP_COLUMNS = `
  g.id,
  g.name,
  g.description,
  g.visibility,
  g.created_at,
  (SELECT count(*)::int FROM group_members c WHERE c.group_id = g.id) AS member_count`

const escapeLike = (value) => value.replace(/[\\%_]/g, (char) => `\\${char}`)

// Runs fn(client, group) with the group row locked. Returns { notFound: true } if it does not exist.
const withGroupLock = async (groupId, fn) => {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    await client.query("SET LOCAL lock_timeout = '5s'")
    const locked = await client.query(
      'SELECT id, visibility FROM groups WHERE id = $1 FOR UPDATE',
      [groupId],
    )
    if (locked.rowCount === 0) {
      await client.query('ROLLBACK')
      return { notFound: true }
    }
    const result = await fn(client, locked.rows[0])
    await client.query('COMMIT')
    return result
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {})
    throw error
  } finally {
    client.release()
  }
}

const roleOf = async (client, groupId, userId) => {
  const result = await client.query(
    'SELECT role FROM group_members WHERE group_id = $1 AND user_id = $2',
    [groupId, userId],
  )
  return result.rows[0]?.role ?? null
}

// One INSERT; the trigger adds the creator as admin in the same statement.
const createGroup = async ({ name, description, visibility, userId }) => {
  const result = await pool.query(
    `INSERT INTO groups (name, description, visibility, created_by)
     VALUES ($1, $2, $3, $4)
     RETURNING id`,
    [name, description, visibility, userId],
  )
  return result.rows[0].id
}

// Group with the caller's role (null for guests and non-members).
const findGroup = async (groupId, userId) => {
  const result = await pool.query(
    `SELECT ${GROUP_COLUMNS},
            (SELECT role FROM group_members m WHERE m.group_id = g.id AND m.user_id = $2) AS my_role
     FROM groups g
     WHERE g.id = $1`,
    [groupId, userId ?? null],
  )
  return result.rows[0] ?? null
}

// Public account fields only (no email).
const listMembers = async (groupId) => {
  const result = await pool.query(
    `SELECT u.id, u.nickname, m.role, m.joined_at
     FROM group_members m
     JOIN users u ON u.id = m.user_id
     WHERE m.group_id = $1
     ORDER BY (m.role = 'admin') DESC, m.joined_at, m.user_id`,
    [groupId],
  )
  return result.rows
}

const listMyGroups = async (userId) => {
  const result = await pool.query(
    `SELECT ${GROUP_COLUMNS}, m.role AS my_role, m.joined_at
     FROM group_members m
     JOIN groups g ON g.id = m.group_id
     WHERE m.user_id = $1
     ORDER BY lower(g.name), g.id`,
    [userId],
  )
  return result.rows
}

const listPublicGroups = async ({ search, limit, offset }) => {
  const result = await pool.query(
    `SELECT ${GROUP_COLUMNS}
     FROM groups g
     WHERE g.visibility = 'public'
       AND ($1::text IS NULL OR g.name ILIKE '%' || $1 || '%')
     ORDER BY g.created_at DESC, g.id DESC
     LIMIT $2 OFFSET $3`,
    [search === null ? null : escapeLike(search), limit, offset],
  )
  return result.rows
}

// Returns 'not_found' | 'private' | 'already' | 'joined'.
const joinGroup = async (groupId, userId) => {
  const result = await withGroupLock(groupId, async (client, group) => {
    if (await roleOf(client, groupId, userId)) return 'already'
    if (group.visibility !== 'public') return 'private'
    // role defaults to 'member'; the client can never choose it.
    await client.query('INSERT INTO group_members (group_id, user_id) VALUES ($1, $2)', [groupId, userId])
    return 'joined'
  })
  return result.notFound ? 'not_found' : result
}

// Removes only the caller's own membership. Returns 'not_found' | 'not_member' | 'left'.
const leaveGroup = async (groupId, userId) => {
  const result = await withGroupLock(groupId, async (client) => {
    const deleted = await client.query(
      'DELETE FROM group_members WHERE group_id = $1 AND user_id = $2',
      [groupId, userId],
    )
    return deleted.rowCount > 0 ? 'left' : 'not_member'
  })
  return result.notFound ? 'not_found' : result
}

// Admin adds an existing user by exact nickname (case-insensitive, like the unique index).
// Returns { status: 'not_found' | 'hidden' | 'forbidden' | 'user_not_found' | 'already_member' | 'added', member? }.
const addMemberByNickname = async (groupId, adminId, nickname) => {
  const result = await withGroupLock(groupId, async (client, group) => {
    const role = await roleOf(client, groupId, adminId)
    if (!role) return { status: group.visibility === 'public' ? 'forbidden' : 'hidden' }
    if (role !== 'admin') return { status: 'forbidden' }

    const found = await client.query('SELECT id, nickname FROM users WHERE lower(nickname) = lower($1)', [nickname])
    if (found.rowCount === 0) return { status: 'user_not_found' }
    const user = found.rows[0]

    const inserted = await client.query(
      `INSERT INTO group_members (group_id, user_id) VALUES ($1, $2)
       ON CONFLICT (group_id, user_id) DO NOTHING
       RETURNING role, joined_at`,
      [groupId, user.id],
    )
    if (inserted.rowCount === 0) return { status: 'already_member' }
    return { status: 'added', member: { id: user.id, nickname: user.nickname, ...inserted.rows[0] } }
  })
  return result.notFound ? { status: 'not_found' } : result
}

// Admin removes an ordinary member. Returns
// 'not_found' | 'hidden' | 'forbidden' | 'self' | 'not_member' | 'target_admin' | 'removed'.
const removeMember = async (groupId, adminId, targetId) => {
  const result = await withGroupLock(groupId, async (client, group) => {
    const role = await roleOf(client, groupId, adminId)
    if (!role) return group.visibility === 'public' ? 'forbidden' : 'hidden'
    if (role !== 'admin') return 'forbidden'
    if (targetId === adminId) return 'self'

    const targetRole = await roleOf(client, groupId, targetId)
    if (!targetRole) return 'not_member'
    if (targetRole === 'admin') return 'target_admin'

    await client.query('DELETE FROM group_members WHERE group_id = $1 AND user_id = $2', [groupId, targetId])
    return 'removed'
  })
  return result.notFound ? 'not_found' : result
}

// ---------- Private groups: search by full name and join requests (migration 004) ----------

// Same normalisation as the unique index groups_private_name_uq: lower(btrim(name)).
// Only the id and name are returned; description and members stay hidden until the user is a member.
const findPrivateGroupByName = async (name, userId) => {
  const result = await pool.query(
    `SELECT g.id,
            g.name,
            g.visibility,
            (SELECT m.role FROM group_members m WHERE m.group_id = g.id AND m.user_id = $2) AS my_role,
            (SELECT r.status FROM group_join_requests r
             WHERE r.group_id = g.id AND r.user_id = $2
             ORDER BY r.created_at DESC, r.id DESC
             LIMIT 1) AS request_status
     FROM groups g
     WHERE g.visibility = 'private'
       AND lower(btrim(g.name)) = lower(btrim($1))`,
    [name, userId],
  )
  return result.rows[0] ?? null
}

const OWN_REQUEST = 'id, status, created_at, decided_at'

// Returns { status: 'not_found' | 'public' | 'member' | 'existing' | 'created', request? }.
// A second request while one is pending returns that pending request.
const createJoinRequest = async (groupId, userId) => {
  const result = await withGroupLock(groupId, async (client, group) => {
    if (group.visibility !== 'private') return { status: 'public' }
    if (await roleOf(client, groupId, userId)) return { status: 'member' }

    const pending = await client.query(
      `SELECT ${OWN_REQUEST} FROM group_join_requests
       WHERE group_id = $1 AND user_id = $2 AND status = 'pending'`,
      [groupId, userId],
    )
    if (pending.rowCount > 0) return { status: 'existing', request: pending.rows[0] }

    const inserted = await client.query(
      `INSERT INTO group_join_requests (group_id, user_id) VALUES ($1, $2)
       RETURNING ${OWN_REQUEST}`,
      [groupId, userId],
    )
    return { status: 'created', request: inserted.rows[0] }
  })
  return result.notFound ? { status: 'not_found' } : result
}

// Admin view of pending requests. Returns { status: 'not_found' | 'hidden' | 'forbidden' | 'ok', items? }.
const listPendingRequests = async (groupId, adminId) => {
  const group = await findGroup(groupId, adminId)
  if (!group) return { status: 'not_found' }
  if (!group.my_role) return { status: group.visibility === 'public' ? 'forbidden' : 'hidden' }
  if (group.my_role !== 'admin') return { status: 'forbidden' }
  const result = await pool.query(
    `SELECT r.id, r.created_at, json_build_object('id', u.id, 'nickname', u.nickname) AS user
     FROM group_join_requests r
     JOIN users u ON u.id = r.user_id
     WHERE r.group_id = $1 AND r.status = 'pending'
     ORDER BY r.created_at, r.id`,
    [groupId],
  )
  return { status: 'ok', items: result.rows }
}

// Admin approves or rejects one pending request. Approval creates the membership (role member)
// and closes the request in the same transaction; the group row is locked first, so a parallel
// "add by nickname" for the same user waits and then sees the membership (one row only).
// Returns { status: 'not_found' | 'hidden' | 'forbidden' | 'request_not_found' | 'already_decided'
//           | 'approved' | 'rejected', member? }.
const decideJoinRequest = async (groupId, adminId, requestId, approve) => {
  const result = await withGroupLock(groupId, async (client, group) => {
    const role = await roleOf(client, groupId, adminId)
    if (!role) return { status: group.visibility === 'public' ? 'forbidden' : 'hidden' }
    if (role !== 'admin') return { status: 'forbidden' }

    const request = await client.query(
      'SELECT user_id, status FROM group_join_requests WHERE id = $1 AND group_id = $2 FOR UPDATE',
      [requestId, groupId],
    )
    if (request.rowCount === 0) return { status: 'request_not_found' }
    if (request.rows[0].status !== 'pending') return { status: 'already_decided' }
    const { user_id: userId } = request.rows[0]

    await client.query(
      `UPDATE group_join_requests
       SET status = $2, decided_at = now(), decided_by = $3
       WHERE id = $1`,
      [requestId, approve ? 'approved' : 'rejected', adminId],
    )
    if (!approve) return { status: 'rejected' }

    await client.query(
      `INSERT INTO group_members (group_id, user_id) VALUES ($1, $2)
       ON CONFLICT (group_id, user_id) DO NOTHING`,
      [groupId, userId],
    )
    const member = await client.query(
      `SELECT u.id, u.nickname, m.role, m.joined_at
       FROM group_members m JOIN users u ON u.id = m.user_id
       WHERE m.group_id = $1 AND m.user_id = $2`,
      [groupId, userId],
    )
    return { status: 'approved', member: member.rows[0] }
  })
  return result.notFound ? { status: 'not_found' } : result
}

export {
  findPrivateGroupByName,
  createJoinRequest,
  listPendingRequests,
  decideJoinRequest,
  createGroup,
  findGroup,
  listMembers,
  listMyGroups,
  listPublicGroups,
  joinGroup,
  leaveGroup,
  addMemberByNickname,
  removeMember,
}
