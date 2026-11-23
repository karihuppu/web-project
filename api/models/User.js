import { pool } from './db.js'

// Columns that are safe to send to the client (never password_hash).
const PUBLIC_COLUMNS = 'id, email, nickname, created_at'

const findUserByEmail = async (email) => {
  const result = await pool.query(
    `SELECT ${PUBLIC_COLUMNS}, password_hash FROM users WHERE lower(email) = lower($1)`,
    [email],
  )
  return result.rows[0] ?? null
}

const findUserById = async (id) => {
  const result = await pool.query(`SELECT ${PUBLIC_COLUMNS} FROM users WHERE id = $1`, [id])
  return result.rows[0] ?? null
}

// Only for password confirmation; the hash never leaves the backend.
const findPasswordHashById = async (id) => {
  const result = await pool.query('SELECT password_hash FROM users WHERE id = $1', [id])
  return result.rows[0]?.password_hash ?? null
}

const userExists = async (id) => {
  const result = await pool.query('SELECT 1 FROM users WHERE id = $1', [id])
  return result.rowCount > 0
}

// Unique violations (email / nickname, case-insensitive) are raised by the database
// and turned into 409 responses by errorHandler.
const createUser = async ({ email, nickname, passwordHash }) => {
  const result = await pool.query(
    `INSERT INTO users (email, nickname, password_hash)
     VALUES ($1, $2, $3)
     RETURNING ${PUBLIC_COLUMNS}`,
    [email, nickname, passwordHash],
  )
  return result.rows[0]
}

// Changes only the nickname of the given user. updated_at changes only when the value changes
// (also a change of letter case counts as a change). Returns null if the user no longer exists.
const updateNickname = async (id, nickname) => {
  const result = await pool.query(
    `UPDATE users
     SET nickname = $2,
         updated_at = CASE WHEN nickname IS DISTINCT FROM $2 THEN now() ELSE updated_at END
     WHERE id = $1
     RETURNING ${PUBLIC_COLUMNS}`,
    [id, nickname],
  )
  return result.rows[0] ?? null
}

// Deletes the account in one transaction. The database rules then:
//   * delete watchlists (+ their movies) and group memberships (CASCADE),
//   * keep ratings but clear comments (trigger users_anonymize_reviews + SET NULL),
//   * give groups a new admin or delete empty groups (trigger, migration 003).
//
// Lock order is groups (ascending id) -> users -> group_members, the same order the group
// triggers use, so a concurrent change in the same group waits instead of deadlocking.
// expectedHash: the hash that was checked with bcrypt before this call (outside the
// transaction, so no connection is held during the slow bcrypt comparison). If it changed
// meanwhile, nothing is deleted.
// Returns 'deleted' | 'not_found' | 'changed'.
const deleteUserAccount = async (id, expectedHash) => {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    await client.query("SET LOCAL lock_timeout = '5s'")
    await client.query(
      `SELECT g.id
       FROM groups g
       WHERE g.id IN (SELECT group_id FROM group_members WHERE user_id = $1)
       ORDER BY g.id
       FOR UPDATE OF g`,
      [id],
    )
    const user = await client.query('SELECT password_hash FROM users WHERE id = $1 FOR UPDATE', [id])
    if (user.rowCount === 0) {
      await client.query('ROLLBACK')
      return 'not_found'
    }
    if (user.rows[0].password_hash !== expectedHash) {
      await client.query('ROLLBACK')
      return 'changed'
    }
    await client.query('DELETE FROM users WHERE id = $1', [id])
    await client.query('COMMIT')
    return 'deleted'
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {})
    throw error
  } finally {
    client.release()
  }
}

export {
  findUserByEmail,
  findUserById,
  findPasswordHashById,
  userExists,
  createUser,
  updateNickname,
  deleteUserAccount,
}
