import { pool } from './db.js'
import { findGroup } from './Group.js'
import { findOwned, moviesOf } from './Watchlist.js' 


const SHARED_LISTS = `
  FROM watchlist_shares s
  JOIN watchlists w ON w.id = s.watchlist_id
  JOIN users u ON u.id = w.user_id
  JOIN group_members m ON m.group_id = s.group_id AND m.user_id = w.user_id`

const LIST_COLUMNS = `
  w.id, w.name, s.shared_at,
  json_build_object('id', u.id, 'nickname', u.nickname) AS owner,
  (SELECT count(*)::int FROM watchlist_movies wm WHERE wm.watchlist_id = w.id) AS movie_count`


export async function shareList(watchlistId, userId, groupId) {
  const list = await findOwned(watchlistId, userId) 
  if (!list) return { status: 'list_not_found' }

  const group = await findGroup(groupId, userId)
  if (!group) return { status: 'group_not_found' }
  if (!group.my_role) {
    return { status: group.visibility === 'public' ? 'forbidden' : 'group_not_found' }
  }

  const { rows } = await pool.query(
    `INSERT INTO watchlist_shares (watchlist_id, group_id) VALUES ($1, $2)
     ON CONFLICT (watchlist_id, group_id) DO NOTHING
     RETURNING watchlist_id, group_id, shared_at`,
    [watchlistId, groupId]
  )
  if (rows.length === 0) return { status: 'already' }
  return { status: 'shared', share: rows[0] }
}


export async function unshare(watchlistId, userId, groupId) {
  const list = await findOwned(watchlistId, userId)
  if (!list) return false
  const { rowCount } = await pool.query(
    'DELETE FROM watchlist_shares WHERE watchlist_id = $1 AND group_id = $2',
    [watchlistId, groupId]
  )
  return rowCount > 0
}

export async function sharesOf(watchlistId, userId) {
  const list = await findOwned(watchlistId, userId)
  if (!list) return null
  const { rows } = await pool.query(
    `SELECT g.id, g.name, g.visibility, s.shared_at
     FROM watchlist_shares s
     JOIN groups g ON g.id = s.group_id
     WHERE s.watchlist_id = $1
     ORDER BY s.shared_at DESC`,
    [watchlistId]
  )
  return rows
}


export async function listForGroup(groupId) {
  const { rows } = await pool.query(
    `SELECT ${LIST_COLUMNS} ${SHARED_LISTS}
     WHERE s.group_id = $1
     ORDER BY s.shared_at DESC, w.id DESC`,
    [groupId]
  )
  return rows
}

async function findShared(groupId, watchlistId) {
  const { rows } = await pool.query(
    `SELECT ${LIST_COLUMNS} ${SHARED_LISTS}
     WHERE s.group_id = $1 AND w.id = $2`,
    [groupId, watchlistId]
  )
  return rows[0] ?? null
}


export async function findSharedList(groupId, watchlistId) {
  const list = await findShared(groupId, watchlistId)
  if (!list) return null
  return { ...list, movies: await moviesOf(watchlistId) }
}


async function freeName(userId, base) {
  for (let n = 1; ; n++) {
    const suffix = n === 1 ? ' (kopio)' : ` (kopio ${n})`
    const name = base.slice(0, 100 - suffix.length).trimEnd() + suffix
    const taken = await pool.query(
      'SELECT 1 FROM watchlists WHERE user_id = $1 AND lower(name) = lower($2)',
      [userId, name]
    )
    if (taken.rowCount === 0) return name
  }
}


export async function copySharedList(groupId, watchlistId, userId) {
  const source = await findShared(groupId, watchlistId)
  if (!source) return null
  const name = await freeName(userId, source.name)

  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const created = await client.query(
      `INSERT INTO watchlists (user_id, name) VALUES ($1, $2)
       RETURNING id, name, created_at, updated_at`,
      [userId, name]
    )
    await client.query(
      `INSERT INTO watchlist_movies (watchlist_id, movie_id)
       SELECT $1, movie_id FROM watchlist_movies WHERE watchlist_id = $2`,
      [created.rows[0].id, watchlistId]
    )
    await client.query('COMMIT')
    return { ...created.rows[0], movie_count: source.movie_count }
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {})
    throw error
  } finally {
    client.release()
  }
}